"""
portfolio_engine.py — Portfolio State & Weight Optimization
============================================================
Exposes portfolio state and weighting utilities to user strategies.

Accessed via `self.portfolio` inside a Strategy subclass.

    holdings = self.portfolio.holdings          # {symbol: Holding}
    cash     = self.portfolio.cash              # float
    equity   = self.portfolio.total_value       # float

    # Weight generation
    w = self.portfolio.equal_weights(symbols)
    w = self.portfolio.correlation_weights(symbols, window=60, max_weight=0.08)
    w = self.portfolio.risk_parity_weights(symbols, window=60)
    w = self.portfolio.momentum_weights(symbols, lookback=90)

All weight methods return a dict {symbol: weight} where weights sum to ≤ 1.0.
"""

from __future__ import annotations

import logging
import math
import statistics
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# ── Holding ───────────────────────────────────────────────────────────────────

@dataclass
class Holding:
    symbol      : str
    qty         : int
    entry_price : float
    current_price: float = 0.0

    @property
    def value(self) -> float:
        return self.qty * (self.current_price or self.entry_price)

    @property
    def unrealised_pnl(self) -> float:
        return (self.current_price - self.entry_price) * self.qty

    @property
    def unrealised_pnl_pct(self) -> float:
        if self.entry_price == 0:
            return 0.0
        return (self.current_price - self.entry_price) / self.entry_price * 100.0


# ── PortfolioEngine ───────────────────────────────────────────────────────────

class PortfolioEngine:
    """
    User-facing portfolio state and weight optimizer.

    The engine holds a reference to the execution engine's internal state
    (positions dict and cash), updated per-bar by the Strategy adapter.

    Parameters
    ----------
    candle_registry : dict[str, list[Candle]]
        Same registry as IndicatorFacade — needed for weight computation.
    """

    def __init__(self) -> None:
        # Injected by the adapter
        self._positions_ref: dict = {}       # {symbol: {qty, entry_price}}
        self._cash_ref      : list = [0.0]   # single-element list for mutability
        self._candle_registry: dict = {}

    # ── Internal wiring (called by adapter, not by user) ─────────────────────

    def _bind(
        self,
        positions_ref   : dict,
        cash_ref        : list,
        candle_registry : dict,
    ) -> None:
        self._positions_ref  = positions_ref
        self._cash_ref       = cash_ref
        self._candle_registry = candle_registry

    def _update_cash(self, cash: float) -> None:
        self._cash_ref[0] = cash

    # ── State accessors ───────────────────────────────────────────────────────

    @property
    def cash(self) -> float:
        """Available cash."""
        return self._cash_ref[0]

    @property
    def holdings(self) -> dict[str, Holding]:
        """
        Current open positions as {symbol: Holding}.

        current_price is set to the last known candle close if available.
        """
        result = {}
        for sym, pos in self._positions_ref.items():
            candles = self._candle_registry.get(sym, [])
            current = candles[-1].close if candles else pos.get("entry_price", 0.0)
            result[sym] = Holding(
                symbol       = sym,
                qty          = pos.get("qty", 0),
                entry_price  = pos.get("entry_price", 0.0),
                current_price= current,
            )
        return result

    @property
    def total_value(self) -> float:
        """Total portfolio value = cash + mark-to-market positions."""
        pos_value = sum(h.value for h in self.holdings.values())
        return self.cash + pos_value

    # ── Risk metrics ──────────────────────────────────────────────────────────

    def drawdown(self) -> float:
        """
        Simple drawdown proxy: percentage of holdings currently below entry.
        Full equity-curve drawdown is available on BacktestReport.
        """
        holdings = self.holdings.values()
        if not holdings:
            return 0.0
        losses = [h.unrealised_pnl for h in holdings if h.unrealised_pnl < 0]
        total  = self.total_value
        return abs(sum(losses)) / total * 100.0 if total > 0 else 0.0

    def sharpe(self, window: int = 252) -> float | None:
        """
        Approximate Sharpe from any available symbol's return series.
        A proper Sharpe is on BacktestReport. This is a live approximation.
        """
        if not self._candle_registry:
            return None
        sym     = next(iter(self._candle_registry))
        candles = self._candle_registry[sym]
        closes  = [c.close for c in candles[-window:]]
        if len(closes) < 2:
            return None
        returns = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]
        avg = statistics.mean(returns)
        std = statistics.stdev(returns) if len(returns) > 1 else 0
        if std == 0:
            return None
        return (avg / std) * math.sqrt(252)

    # ── Weight Generation ─────────────────────────────────────────────────────

    def equal_weights(self, symbols: list[str]) -> dict[str, float]:
        """
        Assign equal weight to each symbol.

        Returns {symbol: 1/n} for n symbols.
        """
        if not symbols:
            return {}
        w = 1.0 / len(symbols)
        return {s: round(w, 6) for s in symbols}

    def momentum_weights(
        self,
        symbols  : list[str],
        lookback : int   = 90,
        max_weight: float = 0.25,
    ) -> dict[str, float]:
        """
        Weight symbols proportionally to their momentum (positive returns only).

        Symbols with negative momentum over `lookback` bars receive zero weight.
        Weights are normalised to sum to 1.0 and capped at `max_weight`.

        Parameters
        ----------
        symbols    : List of symbol strings
        lookback   : Bars to look back for momentum (default 90 = ~3 months daily)
        max_weight : Maximum weight for any single symbol (default 0.25)

        Returns
        -------
        dict[str, float]
        """
        momentums: dict[str, float] = {}
        for sym in symbols:
            candles = self._candle_registry.get(sym, [])
            closes  = [c.close for c in candles]
            if len(closes) < lookback + 1:
                continue
            past = closes[-(lookback + 1)]
            if past > 0:
                mom = (closes[-1] - past) / past
                if mom > 0:
                    momentums[sym] = mom

        if not momentums:
            logger.warning("[PortfolioEngine] momentum_weights: no positive-momentum symbols found — using equal weights.")
            return self.equal_weights(symbols)

        total = sum(momentums.values())
        raw   = {s: m / total for s, m in momentums.items()}

        # Iterative capping
        return self._cap_and_normalise(raw, max_weight)

    def correlation_weights(
        self,
        symbols    : list[str],
        window     : int   = 60,
        max_weight : float = 0.10,
    ) -> dict[str, float]:
        """
        Inverse-correlation weighting: under-weight symbols that move together.

        Symbols with lower average correlation to the rest of the universe
        receive higher weights (more diversification value).

        Parameters
        ----------
        symbols    : Universe symbol list
        window     : Rolling window in bars for return computation
        max_weight : Per-symbol cap

        Returns
        -------
        dict[str, float]
        """
        if len(symbols) < 2:
            return self.equal_weights(symbols)

        # Build returns matrix
        returns_matrix: dict[str, list[float]] = {}
        for sym in symbols:
            candles = self._candle_registry.get(sym, [])
            closes  = [c.close for c in candles[-window - 1:]]
            if len(closes) < 2:
                continue
            rets = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]
            returns_matrix[sym] = rets

        valid = list(returns_matrix.keys())
        if len(valid) < 2:
            return self.equal_weights(symbols)

        # Align lengths
        min_len = min(len(r) for r in returns_matrix.values())
        for sym in valid:
            returns_matrix[sym] = returns_matrix[sym][-min_len:]

        # Compute average correlation for each symbol vs others
        avg_corr: dict[str, float] = {}
        for i, sym_a in enumerate(valid):
            corrs = []
            for j, sym_b in enumerate(valid):
                if i == j:
                    continue
                corr = _pearson(returns_matrix[sym_a], returns_matrix[sym_b])
                if corr is not None:
                    corrs.append(abs(corr))
            avg_corr[sym_a] = statistics.mean(corrs) if corrs else 0.5

        # Inverse-correlation weight: lower correlation → higher weight
        inv = {s: 1.0 - c for s, c in avg_corr.items()}
        total = sum(inv.values())
        if total == 0:
            return self.equal_weights(valid)

        raw = {s: v / total for s, v in inv.items()}
        return self._cap_and_normalise(raw, max_weight)

    def risk_parity_weights(
        self,
        symbols    : list[str],
        window     : int   = 60,
        max_weight : float = 0.20,
    ) -> dict[str, float]:
        """
        Risk-parity weighting: allocate inversely proportional to volatility.

        Lower volatility symbols get higher weights so each contributes
        equal risk to the portfolio.

        Parameters
        ----------
        symbols    : Universe symbol list
        window     : Lookback window for volatility computation
        max_weight : Per-symbol weight cap

        Returns
        -------
        dict[str, float]
        """
        vols: dict[str, float] = {}
        for sym in symbols:
            candles = self._candle_registry.get(sym, [])
            closes  = [c.close for c in candles[-(window + 1):]]
            if len(closes) < 2:
                continue
            rets = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]
            if len(rets) >= 2:
                vols[sym] = statistics.stdev(rets)

        if not vols:
            return self.equal_weights(symbols)

        # Inverse-volatility weights
        inv = {s: 1.0 / v for s, v in vols.items() if v > 0}
        total = sum(inv.values())
        if total == 0:
            return self.equal_weights(list(vols.keys()))

        raw = {s: v / total for s, v in inv.items()}
        return self._cap_and_normalise(raw, max_weight)

    def min_variance_weights(
        self,
        symbols    : list[str],
        window     : int   = 60,
        max_weight : float = 0.25,
    ) -> dict[str, float]:
        """
        Minimum variance weights (simplified: risk-parity as proxy).

        Full Markowitz optimisation requires scipy — Phase 2 upgrade.
        Phase 1 uses risk-parity as the closest approximation.
        """
        logger.info(
            "[PortfolioEngine] min_variance_weights: using risk-parity as Phase 1 proxy. "
            "Full Markowitz optimisation available in Phase 2."
        )
        return self.risk_parity_weights(symbols, window=window, max_weight=max_weight)

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _cap_and_normalise(
        weights    : dict[str, float],
        max_weight : float,
    ) -> dict[str, float]:
        """
        Iteratively cap each weight at max_weight and re-normalise until stable.
        """
        w = dict(weights)
        for _ in range(20):  # max iterations
            capped  = {s: min(v, max_weight) for s, v in w.items()}
            total   = sum(capped.values())
            if total == 0:
                break
            normed  = {s: v / total for s, v in capped.items()}
            if all(abs(normed[s] - w.get(s, 0)) < 1e-6 for s in normed):
                w = normed
                break
            w = normed
        return {s: round(v, 6) for s, v in w.items()}

    def __repr__(self) -> str:
        return (
            f"<PortfolioEngine cash=₹{self.cash:,.0f} "
            f"positions={list(self._positions_ref.keys())} "
            f"equity=₹{self.total_value:,.0f}>"
        )


# ── Utility ───────────────────────────────────────────────────────────────────

def _pearson(xs: list[float], ys: list[float]) -> float | None:
    """Pearson correlation coefficient between two equal-length series."""
    n = len(xs)
    if n < 2 or len(ys) != n:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    cov    = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    std_x  = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    std_y  = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    if std_x == 0 or std_y == 0:
        return None
    return cov / (std_x * std_y)

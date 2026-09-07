"""
stock_list.py — PaperBull Universe / Stock Screener
=====================================================
The `StockList` object is passed to `Strategy.universe()`.

Supports 3 Universe Selection Paradigms:
1. Manual Universe: Fixed list of symbols
2. Rule-Based Universe: Filtering & Sorting by fundamental/technical metrics
3. Algorithmic Universe: Multi-factor custom scoring (Momentum, Volatility, Volume, etc.)

Examples:
---------
1. Rule-Based:
    def universe(self, stocks: StockList) -> StockList:
        return (
            stocks
            .filter(min_price=50, max_price=5000, min_volume=1_000_000)
            .sort_by("momentum_3m")
            .top(15)
        )

2. Algorithmic Multi-Factor Scoring:
    def universe(self, stocks: StockList) -> StockList:
        # High momentum + low volatility composite score
        def composite_score(stock: StockMeta) -> float:
            mom = stock.momentum_3m or 0.0
            vol = stock.volatility or 100.0
            return (mom * 0.7) - (vol * 0.3)

        return (
            stocks
            .filter(min_price=100, min_volume=2_000_000)
            .score_by(composite_score)
            .top(10)
        )
"""

from __future__ import annotations

import logging
import math
import statistics
from dataclasses import dataclass, field
from typing import Callable, Any

logger = logging.getLogger(__name__)


# ── Built-in Market Presets / Indices ─────────────────────────────────────────

MARKET_PRESETS: dict[str, list[str]] = {
    "NIFTY50": [
        "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
        "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "KOTAKBANK.NS",
        "LT.NS", "AXISBANK.NS", "BAJFINANCE.NS", "ASIANPAINT.NS", "MARUTI.NS",
        "TITAN.NS", "SUNPHARMA.NS", "ULTRACEMCO.NS", "TATASTEEL.NS", "NTPC.NS",
        "M&M.NS", "POWERGRID.NS", "TATAMOTORS.NS", "ADANIENT.NS", "JSWSTEEL.NS",
        "BAJAJFINSV.NS", "HCLTECH.NS", "ONGC.NS", "COALINDIA.NS", "WIPRO.NS",
        "GRASIM.NS", "NESTLEIND.NS", "TECHM.NS", "CIPLA.NS", "HDFCLIFE.NS",
        "SBILIFE.NS", "DRREDDY.NS", "EICHERMOT.NS", "BPCL.NS", "TATACONSUM.NS",
        "BRITANNIA.NS", "INDUSINDBK.NS", "HEROMOTOCO.NS", "DIVISLAB.NS", "APOLLOHOSP.NS",
        "ADANIPORTS.NS", "HINDALCO.NS", "LTIM.NS", "SHRIRAMFIN.NS", "BEL.NS"
    ],
    "NIFTY_BANK": [
        "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS",
        "INDUSINDBK.NS", "BANKBARODA.NS", "PNB.NS", "AUBANK.NS", "FEDERALBNK.NS",
        "IDFCFIRSTB.NS", "BANDHANBNK.NS"
    ],
    "NIFTY_IT": [
        "TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "LTIM.NS",
        "TECHM.NS", "PERSISTENT.NS", "COFORGE.NS", "MPHASIS.NS", "LTTS.NS"
    ],
    "US_TECH": [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
        "META", "TSLA", "NFLX", "AMD", "INTC"
    ]
}


# ── StockMeta ─────────────────────────────────────────────────────────────────

@dataclass
class StockMeta:
    """
    Metadata record for a single symbol evaluated in the universe screener.
    """
    symbol     : str
    last_close : float = 0.0
    avg_volume : float = 0.0          # average daily volume (shares)
    market_cap : float | None = None  # ₹ — estimated or live
    sector     : str | None = None
    index_membership: list[str] = field(default_factory=list)

    # Momentum metrics (computed from candle history)
    momentum_1m : float | None = None   # 1-month price return % (~21 bars)
    momentum_3m : float | None = None   # 3-month price return % (~63 bars)
    momentum_6m : float | None = None   # 6-month price return % (~126 bars)
    momentum_1y : float | None = None   # 1-year  price return % (~252 bars)
    volatility  : float | None = None   # annualised std dev of daily log returns (%)
    
    # Custom score computed by .score_by()
    score       : float | None = None

    def summary(self) -> str:
        mom_str = f"{self.momentum_3m:+.1f}%" if self.momentum_3m is not None else "N/A"
        vol_str = f"{self.volatility:.1f}%" if self.volatility is not None else "N/A"
        score_str = f" score={self.score:.2f}" if self.score is not None else ""
        return (
            f"{self.symbol:<15} Close=Rs.{self.last_close:<8.2f} "
            f"Vol={self.avg_volume:>10,.0f} Mom3M={mom_str:>7} Volatility={vol_str:>6}{score_str}"
        )


# ── StockList ─────────────────────────────────────────────────────────────────

class StockList:
    """
    A filterable, sortable, scoreable universe screener list.

    All methods return a **new** StockList — the original is never mutated.
    """

    def __init__(self, stocks: list[StockMeta]) -> None:
        self._stocks: list[StockMeta] = list(stocks)

    # ── Chainable Filters ─────────────────────────────────────────────────────

    def filter(
        self,
        *,
        min_price          : float | None = None,
        max_price          : float | None = None,
        min_volume         : float | None = None,   # avg daily volume (shares)
        max_volatility     : float | None = None,   # maximum allowable annualised volatility %
        min_momentum_3m    : float | None = None,   # minimum 3-month momentum %
        market_cap_between : tuple | None = None,   # (min_₹, max_₹)
        sector             : str | list | None = None,
        index              : str | list | None = None,
    ) -> "StockList":
        """
        Filter stocks based on numerical criteria or classification.
        """
        result = list(self._stocks)

        if min_price is not None:
            result = [s for s in result if s.last_close >= min_price]

        if max_price is not None:
            result = [s for s in result if s.last_close <= max_price]

        if min_volume is not None:
            result = [s for s in result if s.avg_volume >= min_volume]

        if max_volatility is not None:
            result = [s for s in result if s.volatility is not None and s.volatility <= max_volatility]

        if min_momentum_3m is not None:
            result = [s for s in result if s.momentum_3m is not None and s.momentum_3m >= min_momentum_3m]

        if market_cap_between is not None:
            lo, hi = market_cap_between
            result = [s for s in result if s.market_cap is not None and lo <= s.market_cap <= hi]

        if sector is not None:
            sectors = [sector] if isinstance(sector, str) else list(sector)
            result = [s for s in result if s.sector in sectors]

        if index is not None:
            indices = [index] if isinstance(index, str) else list(index)
            result = [s for s in result if any(i in s.index_membership for i in indices)]

        return StockList(result)

    # ── Sorting & Ranking ─────────────────────────────────────────────────────

    def sort_by(
        self,
        metric    : str,
        ascending : bool = False,
    ) -> "StockList":
        """
        Sort by a StockMeta attribute.

        Metrics: "momentum_3m", "momentum_1m", "momentum_6m", "momentum_1y",
                 "volatility", "avg_volume", "last_close", "score"
        """
        _VALID = {
            "momentum_1m", "momentum_3m", "momentum_6m", "momentum_1y",
            "volatility", "avg_volume", "last_close", "market_cap", "score",
        }
        if metric not in _VALID:
            logger.warning(
                "[StockList] sort_by: unknown metric '%s'. Valid: %s. Returning unsorted.",
                metric, ", ".join(_VALID),
            )
            return StockList(list(self._stocks))

        def _key(s: StockMeta) -> float:
            v = getattr(s, metric, None)
            if v is None:
                return float("-inf") if not ascending else float("inf")
            return v

        return StockList(sorted(self._stocks, key=_key, reverse=not ascending))

    def score_by(
        self,
        scorer_fn : Callable[[StockMeta], float],
        ascending : bool = False,
    ) -> "StockList":
        """
        Algorithmic Multi-Factor Universe Selection.

        Computes a composite score for each stock using the supplied scoring function,
        attaches the score to StockMeta.score, and sorts by that score.

        Example:
        --------
        def my_rank(stock: StockMeta) -> float:
            mom = stock.momentum_3m or 0.0
            vol = stock.volatility or 50.0
            # Reward high momentum, penalize high volatility:
            return mom - (vol * 0.5)

        universe = stocks.score_by(my_rank).top(10)
        """
        scored_stocks = []
        for s in self._stocks:
            # Clone to keep immutable
            new_meta = StockMeta(
                symbol           = s.symbol,
                last_close       = s.last_close,
                avg_volume       = s.avg_volume,
                market_cap       = s.market_cap,
                sector           = s.sector,
                index_membership = list(s.index_membership),
                momentum_1m      = s.momentum_1m,
                momentum_3m      = s.momentum_3m,
                momentum_6m      = s.momentum_6m,
                momentum_1y      = s.momentum_1y,
                volatility       = s.volatility,
            )
            try:
                new_meta.score = float(scorer_fn(new_meta))
            except Exception as exc:
                logger.warning("[StockList] score_by error for %s: %s", s.symbol, exc)
                new_meta.score = float("-inf") if not ascending else float("inf")
            scored_stocks.append(new_meta)

        def _key(s: StockMeta) -> float:
            if s.score is None:
                return float("-inf") if not ascending else float("inf")
            return s.score

        return StockList(sorted(scored_stocks, key=_key, reverse=not ascending))

    def top(self, n: int) -> "StockList":
        """Return the first n symbols. Returns a new StockList."""
        return StockList(self._stocks[:n])

    def bottom(self, n: int) -> "StockList":
        """Return the last n symbols. Returns a new StockList."""
        return StockList(self._stocks[-n:])

    # ── Output & Inspection ───────────────────────────────────────────────────

    def symbols(self) -> list[str]:
        """Return list of symbol strings."""
        return [s.symbol for s in self._stocks]

    def metadata(self) -> list[StockMeta]:
        """Return raw StockMeta records."""
        return list(self._stocks)

    def preview(self) -> None:
        """Pretty-print the universe ranking preview to console."""
        print("\n" + "═"*75)
        print(f"  PaperBull Universe Preview — {len(self._stocks)} Stocks Selected")
        print("═"*75)
        for i, s in enumerate(self._stocks, 1):
            print(f"  {i:>2}. {s.summary()}")
        print("═"*75 + "\n")

    def __len__(self) -> int:
        return len(self._stocks)

    def __repr__(self) -> str:
        syms = [s.symbol for s in self._stocks[:5]]
        suffix = f"... +{len(self._stocks) - 5}" if len(self._stocks) > 5 else ""
        return f"<StockList [{', '.join(syms)}{suffix}] n={len(self._stocks)}>"


# ── Builder ───────────────────────────────────────────────────────────────────

def build_stock_list_from_candles(
    symbol_candles: dict,  # {symbol: list[Candle]}
) -> StockList:
    """
    Build a StockList from a mapping of symbol → candle list.
    """
    stocks: list[StockMeta] = []

    for symbol, candles in symbol_candles.items():
        if not candles:
            stocks.append(StockMeta(symbol=symbol))
            continue

        closes  = [c.close  for c in candles]
        volumes = [c.volume for c in candles]
        last_close = closes[-1]

        # Detect intraday timestamps (e.g. '2026-08-14 09:15:00') vs daily ('2026-08-14')
        is_intraday = any(len(str(c.timestamp)) > 10 for c in candles[:5])

        if is_intraday:
            # Sum volume per date to calculate true daily average volume
            daily_vols: dict[str, float] = {}
            for c in candles:
                d = str(c.timestamp)[:10]
                daily_vols[d] = daily_vols.get(d, 0.0) + float(c.volume or 0)
            avg_volume = statistics.mean(daily_vols.values()) if daily_vols else 0.0

            # Approximate bars per day for intraday momentum lookback
            dates_count = max(len(daily_vols), 1)
            bars_per_day = max(int(len(candles) / dates_count), 1)

            def _momentum(lookback_days: int) -> float | None:
                needed_bars = lookback_days * bars_per_day
                if len(closes) < needed_bars + 1:
                    # Fallback to total available history return if shorter than lookback
                    if len(closes) >= 2 and closes[0] > 0:
                        return (closes[-1] - closes[0]) / closes[0] * 100.0
                    return None
                past = closes[-(needed_bars + 1)]
                if past == 0:
                    return None
                return (closes[-1] - past) / past * 100.0
        else:
            avg_volume = statistics.mean(volumes) if volumes else 0.0

            def _momentum(lookback_days: int) -> float | None:
                if len(closes) < lookback_days + 1:
                    if len(closes) >= 2 and closes[0] > 0:
                        return (closes[-1] - closes[0]) / closes[0] * 100.0
                    return None
                past = closes[-(lookback_days + 1)]
                if past == 0:
                    return None
                return (closes[-1] - past) / past * 100.0

        # Log returns for volatility
        log_returns = []
        for i in range(1, len(closes)):
            if closes[i - 1] > 0 and closes[i] > 0:
                log_returns.append(math.log(closes[i] / closes[i - 1]))

        volatility: float | None = None
        if len(log_returns) >= 2:
            std_ret = statistics.stdev(log_returns)
            ann_factor = math.sqrt(252 * (bars_per_day if is_intraday else 1))
            volatility = std_ret * ann_factor * 100.0  # annualised %

        # Check membership in presets
        indices = [idx_name for idx_name, syms in MARKET_PRESETS.items() if symbol in syms]

        stocks.append(StockMeta(
            symbol           = symbol,
            last_close       = last_close,
            avg_volume       = avg_volume,
            index_membership = indices,
            momentum_1m      = _momentum(21),
            momentum_3m      = _momentum(63),
            momentum_6m      = _momentum(126),
            momentum_1y      = _momentum(252),
            volatility       = volatility,
        ))

    return StockList(stocks)

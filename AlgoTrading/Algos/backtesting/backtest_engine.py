"""
backtest_engine.py — Historical Strategy Backtester
=====================================================
Replays a historical OHLCV candle series through the full strategy lifecycle:
  Indicator Calculation → Condition Evaluation → Signal Generation
  → Risk Management → Position Sizing → Paper Execution → Trade Recording

Returns a BacktestReport with:
  total_return, win_rate, profit_factor, max_drawdown, sharpe_ratio, equity_curve
"""

from __future__ import annotations

import math
import logging
from dataclasses import dataclass, field
from typing import Any

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import SignalType
from ..execution.execution_engine import ExecutionEngineClass, ExecutionMode
from ..risk.risk_engine import RiskEngineClass, RiskConfig
from ..sizing.position_sizing_engine import PositionSizingEngineClass, SizingMode

logger = logging.getLogger(__name__)


# ── Backtest Report ───────────────────────────────────────────────────────────

@dataclass
class BacktestReport:
    strategy_name   : str
    symbol          : str
    period_from     : str
    period_to       : str
    n_candles       : int
    initial_capital : float
    final_equity    : float
    total_return_pct: float
    total_trades    : int
    wins            : int
    losses          : int
    win_rate_pct    : float
    gross_profit    : float
    gross_loss      : float
    profit_factor   : float
    max_drawdown_pct: float
    sharpe_ratio    : float
    signals         : list[dict] = field(default_factory=list)
    equity_curve    : list[dict] = field(default_factory=list)
    trades          : list[dict] = field(default_factory=list)
    price_data      : list[dict] = field(default_factory=list)

    def print_summary(self) -> None:
        """Pretty-print a backtest summary to stdout."""
        print(f"\n{'='*54}")
        print(f"  [BACKTEST REPORT] {self.strategy_name} on {self.symbol}")
        print(f"{'='*54}")
        print(f"  Period       : {self.period_from}  to  {self.period_to}")
        print(f"  Candles      : {self.n_candles}")
        print(f"  Initial      : Rs.{self.initial_capital:,.2f}")
        print(f"  Final Equity : Rs.{self.final_equity:,.2f}")
        print(f"  Total Return : {self.total_return_pct:+.2f}%")
        print(f"  Total Trades : {self.total_trades}")
        print(f"  Win Rate     : {self.win_rate_pct:.1f}%  ({self.wins}W / {self.losses}L)")
        print(f"  Gross Profit : Rs.{self.gross_profit:,.2f}")
        print(f"  Gross Loss   : Rs.{self.gross_loss:,.2f}")
        print(f"  Profit Factor: {self.profit_factor:.3f}")
        print(f"  Max Drawdown : {self.max_drawdown_pct:.2f}%")
        print(f"  Sharpe Ratio : {self.sharpe_ratio:.3f}")
        print(f"{'='*54}\n")


# -- BacktestEngine ------------------------------------------------------------

class BacktestEngine:
    """
    Historical strategy backtester.

    Usage
    -----
    engine = BacktestEngine(initial_capital=100_000)
    report = engine.run(strategy=EMAStrategy(), candles=candles, symbol="RELIANCE")
    report.print_summary()
    """

    def __init__(
        self,
        initial_capital : float      = 100_000.0,
        warm_up_period  : int        = 50,
        risk_config     : RiskConfig | None = None,
        sizing_mode     : SizingMode = SizingMode.PERCENT_EQUITY,
        sizing_kwargs   : dict | None = None,
    ) -> None:
        self.initial_capital = initial_capital
        self.warm_up_period  = warm_up_period

        # Isolated instances per backtest — no shared state pollution
        self._risk    = RiskEngineClass(risk_config or RiskConfig())
        self._sizing  = PositionSizingEngineClass(mode=sizing_mode, **(sizing_kwargs or {}))
        self._executor = ExecutionEngineClass(
            mode=ExecutionMode.BACKTEST, initial_capital=initial_capital
        )

    def run(
        self,
        strategy      : BaseStrategy,
        candles       : list[Candle],
        symbol        : str,
        instrument_key: str = "",
        target_start_str: str = "",
        target_end_str: str = "",
    ) -> BacktestReport:
        """
        Run a full backtest.

        Parameters
        ----------
        strategy         : Any BaseStrategy subclass instance
        candles          : Historical OHLCV list (oldest first) including warmup lookback
        symbol           : Stock symbol (e.g. "RELIANCE")
        instrument_key   : Upstox instrument key (optional)
        target_start_str : Start date for trading execution & report slice (e.g. "2026-08-13")
        target_end_str   : End date for trading execution & report slice (e.g. "2026-08-13")

        Returns
        -------
        BacktestReport
        """
        actual_warm_up = min(self.warm_up_period, max(5, len(candles) // 4)) if len(candles) < self.warm_up_period + 1 else self.warm_up_period
        if len(candles) < actual_warm_up + 1:
            raise ValueError(
                f"[BacktestEngine] Not enough candles. "
                f"Need >{actual_warm_up}, got {len(candles)}"
            )

        # Calculate strategy indicators across the full candle series including previous warmup
        if hasattr(strategy, "calculate_indicators"):
            try:
                strategy.calculate_indicators(candles)
            except Exception as e:
                logger.warning(f"[BacktestEngine] Indicator precomputation error: {e}")

        # Reset all state for this run
        self._executor.reset()
        self._risk.initialize_session(capital=self.initial_capital)

        # Determine target execution window
        start_idx = actual_warm_up
        end_idx = len(candles) - 1

        if target_start_str:
            clean_target_start = target_start_str[:10]
            for idx, c in enumerate(candles):
                if c.timestamp[:10] >= clean_target_start:
                    start_idx = idx
                    break

        if target_end_str:
            clean_target_end = target_end_str[:10]
            for idx in range(len(candles) - 1, -1, -1):
                if candles[idx].timestamp[:10] <= clean_target_end:
                    end_idx = idx
                    break

        start_idx = max(0, min(start_idx, len(candles) - 1))
        end_idx = max(start_idx, min(end_idx, len(candles) - 1))

        signals: list[dict]      = []
        equity_curve: list[dict] = [{"i": 0, "equity": self.initial_capital}]
        open_position: dict | None = None
        instr_key = instrument_key or symbol

        logger.info("[BacktestEngine] Running %s on %s (%d total candles, target window %d..%d)", 
                    strategy.name, symbol, len(candles), start_idx, end_idx)
        print(f"[BacktestEngine] Running {strategy.name} on {symbol} (Target window: {candles[start_idx].timestamp} to {candles[end_idx].timestamp})...")

        for i in range(start_idx, end_idx + 1):
            candle_slice  = candles[:i + 1]
            current_price = candles[i].close

            # Run full strategy pipeline for this slice
            try:
                result = strategy.process(candle_slice, current_price, open_position)
            except Exception as exc:
                logger.warning("[BacktestEngine] Strategy error at candle %d: %s", i, exc)
                continue

            entry_signal = result.get("entry")
            exit_signal  = result.get("exit")

            # 1. Process exit first (if position is open)
            if open_position and exit_signal and exit_signal.type == SignalType.SELL:
                risk_result = self._risk.evaluate(exit_signal)
                if risk_result.approved:
                    receipt = self._executor.execute(exit_signal, qty=open_position["qty"])
                    if receipt.success and receipt.trade:
                        pnl = receipt.trade.get("pnl") or 0.0
                        self._risk.on_pnl_recorded(pnl)
                        self._risk.on_trade_executed(
                            symbol=symbol, side="SELL",
                            qty=open_position["qty"], price=current_price
                        )
                        strategy.on_position_closed(receipt.trade)
                        open_position = None
                        signals.append({"i": i, "type": "SELL", "price": current_price,
                                        "reason": exit_signal.reason, "executed_at": candles[i].timestamp, "pnl": pnl})

            # 2. Process entry (only if no open position)
            if not open_position and entry_signal and entry_signal.type == SignalType.BUY:
                risk_result = self._risk.evaluate(entry_signal)
                if risk_result.approved:
                    max_cap = self._risk.get_position_limit()
                    # Try to get ATR from cache for ATR-based sizing
                    atr_series = strategy._indicator_cache.get("ATR", [])
                    atr_val    = next(
                        (v for v in reversed(atr_series) if isinstance(v, float) and math.isfinite(v)),
                        None,
                    )
                    sizing = self._sizing.calculate(
                        capital     = self._executor._cash,
                        entry_price = current_price,
                        atr         = atr_val,
                        max_capital = max_cap,
                    )
                    if sizing.qty > 0:
                        receipt = self._executor.execute(entry_signal, qty=sizing.qty)
                        if receipt.success and receipt.trade:
                            self._risk.on_trade_executed(
                                symbol=symbol, side="BUY",
                                qty=sizing.qty, price=current_price
                            )
                            strategy.on_position_opened(receipt.trade)
                            open_position = {
                                "qty"        : sizing.qty,
                                "entry_price": current_price,
                                "entry_time" : candles[i].timestamp,
                            }
                            signals.append({"i": i, "type": "BUY", "price": current_price,
                                            "reason": entry_signal.reason, "executed_at": candles[i].timestamp, "pnl": None})

            # Track equity curve (cash + mark-to-market position)
            pos_value = open_position["qty"] * current_price if open_position else 0.0
            equity_curve.append({"i": i, "equity": self._executor._cash + pos_value})

        # Force-close any remaining position at final candle price of target window
        if open_position:
            last_price = candles[end_idx].close
            pnl = (last_price - open_position["entry_price"]) * open_position["qty"]
            self._executor._cash += open_position["qty"] * last_price
            signals.append({"i": end_idx, "type": "SELL", "price": last_price,
                            "reason": "Session End Close", "executed_at": candles[end_idx].timestamp, "pnl": pnl})
            self._executor._positions.clear()

        visible_candles = candles[start_idx : end_idx + 1]
        price_data = [{"x": c.timestamp, "y": c.close} for c in visible_candles]

        return self._build_report(strategy, symbol, visible_candles, signals, equity_curve, price_data)

    # ── Report Builder ────────────────────────────────────────────────────────

    def _build_report(
        self,
        strategy    : BaseStrategy,
        symbol      : str,
        candles     : list[Candle],
        signals     : list[dict],
        equity_curve: list[dict],
        price_data  : list[dict],
    ) -> BacktestReport:
        trades       = self._executor.get_trade_history()
        final_equity = equity_curve[-1]["equity"] if equity_curve else self.initial_capital
        total_return = (final_equity - self.initial_capital) / self.initial_capital * 100

        # Win / loss stats from SELL trades
        sells        = [t for t in trades if t["type"] == "SELL" and t.get("pnl") is not None]
        wins         = [t for t in sells if t["pnl"] > 0]
        losses       = [t for t in sells if t["pnl"] <= 0]
        win_rate     = len(wins) / len(sells) * 100 if sells else 0.0
        gross_profit = sum(t["pnl"] for t in wins)
        gross_loss   = abs(sum(t["pnl"] for t in losses))
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (999.99 if gross_profit > 0 else 0.0)

        # Max drawdown
        peak, max_dd = self.initial_capital, 0.0
        for pt in equity_curve:
            e = pt["equity"]
            if e > peak:
                peak = e
            dd = (peak - e) / peak * 100 if peak > 0 else 0.0
            if dd > max_dd:
                max_dd = dd

        # Sharpe ratio (annualized, assumes daily candles)
        returns   = [
            (equity_curve[j]["equity"] - equity_curve[j - 1]["equity"]) / equity_curve[j - 1]["equity"]
            for j in range(1, len(equity_curve))
            if equity_curve[j - 1]["equity"] > 0
        ]
        avg_r = sum(returns) / len(returns) if returns else 0.0
        std_r = math.sqrt(sum((r - avg_r) ** 2 for r in returns) / len(returns)) if returns else 0.0
        sharpe = (avg_r / std_r) * math.sqrt(252) if std_r > 0 else 0.0

        report = BacktestReport(
            strategy_name    = strategy.name,
            symbol           = symbol,
            period_from      = candles[0].timestamp,
            period_to        = candles[-1].timestamp,
            n_candles        = len(candles),
            initial_capital  = self.initial_capital,
            final_equity     = round(final_equity, 2),
            total_return_pct = round(total_return, 2),
            total_trades     = len(sells),
            wins             = len(wins),
            losses           = len(losses),
            win_rate_pct     = round(win_rate, 2),
            gross_profit     = round(gross_profit, 2),
            gross_loss       = round(gross_loss, 2),
            profit_factor    = round(profit_factor, 3),
            max_drawdown_pct = round(max_dd, 2),
            sharpe_ratio     = round(sharpe, 3),
            signals          = signals,
            equity_curve     = equity_curve,
            trades           = trades,
            price_data       = price_data,
        )
        report.print_summary()
        return report

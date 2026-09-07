"""
risk_engine.py — Pre-Execution Risk Management
===============================================
The RiskEngine sits between Signal generation and ExecutionEngine.
Every signal MUST pass risk checks before being executed.

Risk Checks
-----------
1. Signal confidence threshold  (ignore low-quality signals)
2. Max daily loss limit         (stop trading after -X% day P&L)
3. Portfolio max drawdown       (halt if portfolio is down > X% from peak)
4. Max open positions           (don't over-leverage with too many positions)
5. Max position exposure        (no single trade > X% of capital)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from ..core.signal import Signal, SignalType

logger = logging.getLogger(__name__)


# ── Risk Configuration ────────────────────────────────────────────────────────

@dataclass
class RiskConfig:
    max_daily_loss_pct      : float = 2.0    # Stop trading if day P&L < -2%
    max_position_exposure_pct: float = 10.0  # Max 10% of capital per trade
    max_open_positions      : int   = 10     # Max concurrent open positions
    max_drawdown_pct        : float = 15.0   # Halt if portfolio down > 15% from peak
    min_confidence          : float = 0.5    # Ignore signals with confidence < 50%


@dataclass(frozen=True)
class RiskResult:
    approved: bool
    reason  : str
    checks  : list[dict] = field(default_factory=list)


# ── RiskEngine ────────────────────────────────────────────────────────────────

class RiskEngineClass:
    """
    Singleton risk management engine.

    Usage
    -----
    from algos.risk.risk_engine import risk_engine

    risk_engine.initialize_session(capital=100_000)
    result = risk_engine.evaluate(signal)
    if result.approved:
        ...
    """

    def __init__(self, config: RiskConfig | None = None) -> None:
        self.config          = config or RiskConfig()
        self._open_positions : list[dict] = []
        self._daily_pnl      : float = 0.0
        self._capital        : float = 0.0
        self._peak_capital   : float = 0.0

    # ── Session Initialization ────────────────────────────────────────────────

    def initialize_session(
        self,
        capital       : float,
        open_positions: list[dict] | None = None,
        daily_pnl     : float = 0.0,
    ) -> None:
        """
        Must be called at the start of each trading session.

        Parameters
        ----------
        capital        : Current available capital
        open_positions : Existing positions carried over (optional)
        daily_pnl      : Realized P&L so far today (optional)
        """
        self._capital       = capital
        self._peak_capital  = max(capital, self._peak_capital or capital)
        self._open_positions = list(open_positions or [])
        self._daily_pnl     = daily_pnl

    def on_trade_executed(self, *, symbol: str, side: str, qty: int, price: float) -> None:
        """Update internal state when a trade is executed."""
        if side == "BUY":
            self._open_positions.append({
                "symbol": symbol, "qty": qty, "entry_price": price, "side": "LONG"
            })
        elif side == "SELL":
            self._open_positions = [p for p in self._open_positions if p["symbol"] != symbol]

    def on_pnl_recorded(self, pnl: float) -> None:
        """Update state when realized P&L is recorded."""
        self._daily_pnl   += pnl
        self._capital     += pnl
        self._peak_capital = max(self._capital, self._peak_capital)

    def reset_daily_state(self) -> None:
        """Call at the start of each trading day."""
        self._daily_pnl = 0.0
        logger.info("[RiskEngine] Daily state reset.")

    # ── Core Risk Evaluation ──────────────────────────────────────────────────

    def evaluate(self, signal: Signal) -> RiskResult:
        """
        Evaluate a signal against all risk rules.

        Parameters
        ----------
        signal : Signal to evaluate

        Returns
        -------
        RiskResult with approved=True/False and human-readable reason.
        """
        checks: list[dict] = []

        # 1. Confidence threshold
        if signal.confidence < self.config.min_confidence:
            reason = (
                f"Signal confidence {signal.confidence*100:.0f}% < "
                f"minimum {self.config.min_confidence*100:.0f}%"
            )
            return RiskResult(approved=False, reason=reason, checks=checks)

        # 2. Daily loss limit (only block BUY)
        if signal.type == SignalType.BUY and self._capital > 0:
            day_loss_pct = (self._daily_pnl / self._capital) * 100
            if day_loss_pct <= -self.config.max_daily_loss_pct:
                reason = (
                    f"Daily loss limit reached: {day_loss_pct:.2f}% "
                    f"(limit: -{self.config.max_daily_loss_pct}%)"
                )
                checks.append({"rule": "max_daily_loss", "passed": False, "reason": reason})
                return RiskResult(approved=False, reason=reason, checks=checks)
            checks.append({"rule": "max_daily_loss", "passed": True,
                           "reason": f"Day P&L: {day_loss_pct:.2f}%"})

        # 3. Portfolio drawdown
        if self._peak_capital > 0 and self._capital > 0:
            drawdown_pct = (self._peak_capital - self._capital) / self._peak_capital * 100
            if drawdown_pct >= self.config.max_drawdown_pct:
                reason = (
                    f"Portfolio drawdown {drawdown_pct:.2f}% exceeds limit "
                    f"of {self.config.max_drawdown_pct}%"
                )
                checks.append({"rule": "max_drawdown", "passed": False, "reason": reason})
                return RiskResult(approved=False, reason=reason, checks=checks)
            checks.append({"rule": "max_drawdown", "passed": True,
                           "reason": f"Drawdown: {drawdown_pct:.2f}%"})

        # 4. Max open positions (only block BUY)
        if signal.type == SignalType.BUY:
            if len(self._open_positions) >= self.config.max_open_positions:
                reason = f"Max open positions ({self.config.max_open_positions}) reached"
                checks.append({"rule": "max_open_positions", "passed": False, "reason": reason})
                return RiskResult(approved=False, reason=reason, checks=checks)
            checks.append({"rule": "max_open_positions", "passed": True,
                           "reason": f"Open positions: {len(self._open_positions)}"})

        reason = "All risk checks passed ✅"
        checks.append({"rule": "summary", "passed": True, "reason": reason})
        return RiskResult(approved=True, reason=reason, checks=checks)

    def get_position_limit(self) -> float:
        """
        Returns the maximum capital that can be allocated to a single trade,
        based on the max_position_exposure_pct risk config.
        """
        return self._capital * (self.config.max_position_exposure_pct / 100.0)

    def get_state(self) -> dict:
        """Returns a summary of current risk state."""
        drawdown = (
            (self._peak_capital - self._capital) / self._peak_capital * 100
            if self._peak_capital > 0 else 0.0
        )
        return {
            "capital"       : self._capital,
            "peak_capital"  : self._peak_capital,
            "daily_pnl"     : self._daily_pnl,
            "open_positions": len(self._open_positions),
            "drawdown_pct"  : round(drawdown, 2),
        }


# ── Singleton ─────────────────────────────────────────────────────────────────

risk_engine = RiskEngineClass()

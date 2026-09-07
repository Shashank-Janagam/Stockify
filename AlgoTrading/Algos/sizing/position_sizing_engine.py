"""
position_sizing_engine.py — Position Sizing
============================================
Calculates trade quantity based on risk parameters.

Supported Modes
---------------
FIXED_QTY      : Always trade a fixed number of shares.
PERCENT_EQUITY : Allocate X% of available capital per trade.
ATR_BASED      : Risk a fixed % of capital per trade; quantity derived from
                 ATR stop distance (volatility-adjusted sizing, Kelly-adjacent).
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


# ── Sizing Mode ───────────────────────────────────────────────────────────────

class SizingMode(str, Enum):
    FIXED_QTY      = "FIXED_QTY"
    PERCENT_EQUITY = "PERCENT_EQUITY"
    ATR_BASED      = "ATR_BASED"


@dataclass(frozen=True)
class SizingResult:
    qty              : int
    capital_required : float
    mode             : str


# ── PositionSizingEngine ──────────────────────────────────────────────────────

class PositionSizingEngineClass:
    """
    Singleton sizing engine.

    Usage
    -----
    from algos.sizing.position_sizing_engine import position_sizing_engine

    result = position_sizing_engine.calculate(
        capital=100_000, entry_price=2450.0, atr=45.0
    )
    print(result.qty)  # → e.g. 45
    """

    def __init__(
        self,
        mode            : SizingMode = SizingMode.PERCENT_EQUITY,
        fixed_qty       : int   = 1,
        percent_equity  : float = 5.0,   # 5% of capital per trade
        risk_per_trade_pct: float = 1.0, # Risk 1% of capital per trade (ATR mode)
        atr_multiplier  : float = 1.5,   # Stop = 1.5 × ATR below entry
    ) -> None:
        self.mode              = mode
        self.fixed_qty         = fixed_qty
        self.percent_equity    = percent_equity
        self.risk_per_trade_pct = risk_per_trade_pct
        self.atr_multiplier    = atr_multiplier

    def calculate(
        self,
        capital     : float,
        entry_price : float,
        atr         : float | None = None,
        max_capital : float = float("inf"),
    ) -> SizingResult:
        """
        Calculate the trade quantity for a given signal.

        Parameters
        ----------
        capital     : Available cash
        entry_price : Signal price (per share)
        atr         : Current ATR value (required for ATR_BASED mode)
        max_capital : Upper bound from RiskEngine.get_position_limit()

        Returns
        -------
        SizingResult with qty, capital_required, mode
        """
        mode_str = self.mode.value if hasattr(self.mode, "value") else str(self.mode)
        if capital <= 0 or entry_price <= 0:
            return SizingResult(qty=0, capital_required=0.0, mode=mode_str)

        qty = 0

        if self.mode == SizingMode.FIXED_QTY:
            qty = self.fixed_qty

        elif self.mode == SizingMode.PERCENT_EQUITY:
            allocated = min(capital * (self.percent_equity / 100.0), max_capital)
            qty = int(allocated / entry_price)

        elif self.mode == SizingMode.ATR_BASED:
            if atr and atr > 0:
                risk_amount   = capital * (self.risk_per_trade_pct / 100.0)
                stop_distance = atr * self.atr_multiplier
                qty           = int(risk_amount / stop_distance)
            else:
                # Fallback: percent equity
                allocated = min(capital * (self.percent_equity / 100.0), max_capital)
                qty       = int(allocated / entry_price)
                logger.warning("[PositionSizingEngine] ATR not available — falling back to PERCENT_EQUITY.")

        # Safety: never exceed max_capital
        capital_required = qty * entry_price
        if capital_required > max_capital:
            qty              = int(max_capital / entry_price)
            capital_required = qty * entry_price

        qty = max(0, qty)
        return SizingResult(
            qty=qty,
            capital_required=float(qty * entry_price),
            mode=mode_str,
        )

    def set_mode(self, mode: SizingMode | str) -> None:
        """Update sizing mode at runtime (for user config changes)."""
        if isinstance(mode, str):
            mode = SizingMode(mode)
        self.mode = mode


# ── Singleton ─────────────────────────────────────────────────────────────────

position_sizing_engine = PositionSizingEngineClass()

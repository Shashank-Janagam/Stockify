"""
signal.py
=========
Immutable Signal dataclass representing a trading decision.

A Signal is the single output of a strategy's decision process.
It flows: SignalEngine → RiskEngine → PositionSizingEngine → ExecutionEngine.
Signals are frozen dataclass instances — they cannot be mutated after creation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


# ── Signal Type Enum ──────────────────────────────────────────────────────────

class SignalType(str, Enum):
    """Possible signal directions."""
    BUY  = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


# ── Signal Dataclass ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Signal:
    """
    Immutable value object representing a trading signal.

    Attributes
    ----------
    type          : SignalType — BUY, SELL, or HOLD
    symbol        : str        — Stock symbol (e.g. "RELIANCE")
    instrument_key: str        — Upstox instrument key
    price         : float      — Price at signal generation time
    strategy_name : str        — Name of strategy that produced this signal
    reason        : str        — Human-readable explanation
    confidence    : float      — 0.0 to 1.0 confidence score
    timestamp     : str        — ISO-8601 timestamp
    meta          : dict       — Optional extra data (indicator values, etc.)
    """
    type          : SignalType
    symbol        : str
    instrument_key: str
    price         : float
    strategy_name : str
    reason        : str
    confidence    : float = field(default=1.0)
    timestamp     : str   = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    meta          : dict  = field(default_factory=dict)

    def __post_init__(self) -> None:
        # Validate type
        if not isinstance(self.type, SignalType):
            object.__setattr__(self, "type", SignalType(self.type))
        # Clamp confidence
        object.__setattr__(self, "confidence", max(0.0, min(1.0, self.confidence)))
        if not isinstance(self.price, (int, float)) or self.price != self.price:  # NaN check
            raise ValueError(f"[Signal] price must be a finite number. Got: {self.price}")

    @property
    def is_actionable(self) -> bool:
        """Returns True if this signal requires an order (BUY or SELL)."""
        return self.type != SignalType.HOLD

    def __str__(self) -> str:
        return (
            f"Signal({self.type.value} {self.symbol} @ ₹{self.price:.2f} "
            f"| {self.strategy_name} | {self.confidence*100:.0f}% | {self.reason})"
        )


# ── Convenience Factories ──────────────────────────────────────────────────────

def buy_signal(
    symbol: str,
    instrument_key: str,
    price: float,
    strategy_name: str,
    reason: str,
    confidence: float = 0.75,
    meta: dict | None = None,
) -> Signal:
    """Create a BUY signal."""
    return Signal(
        type=SignalType.BUY,
        symbol=symbol,
        instrument_key=instrument_key,
        price=price,
        strategy_name=strategy_name,
        reason=reason,
        confidence=confidence,
        meta=meta or {},
    )


def sell_signal(
    symbol: str,
    instrument_key: str,
    price: float,
    strategy_name: str,
    reason: str,
    confidence: float = 0.75,
    meta: dict | None = None,
) -> Signal:
    """Create a SELL signal."""
    return Signal(
        type=SignalType.SELL,
        symbol=symbol,
        instrument_key=instrument_key,
        price=price,
        strategy_name=strategy_name,
        reason=reason,
        confidence=confidence,
        meta=meta or {},
    )


def hold_signal(
    symbol: str,
    instrument_key: str,
    price: float,
    strategy_name: str,
    reason: str = "No signal conditions met",
    meta: dict | None = None,
) -> Signal:
    """Create a HOLD signal."""
    return Signal(
        type=SignalType.HOLD,
        symbol=symbol,
        instrument_key=instrument_key,
        price=price,
        strategy_name=strategy_name,
        reason=reason,
        confidence=0.0,
        meta=meta or {},
    )

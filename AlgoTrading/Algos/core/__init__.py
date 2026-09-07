"""core/__init__.py — Public API for the core package."""

from .signal import Signal, SignalType, buy_signal, sell_signal, hold_signal
from .base_strategy import BaseStrategy, Candle

__all__ = [
    "Signal", "SignalType",
    "buy_signal", "sell_signal", "hold_signal",
    "BaseStrategy", "Candle",
]

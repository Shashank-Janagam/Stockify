"""strategies/__init__.py — Imports all strategies to trigger self-registration."""

from .ema_strategy           import EMAStrategy
from .rsi_strategy           import RSIStrategy
from .macd_strategy          import MACDStrategy
from .bollinger_bands_strategy import BollingerBandsStrategy
from .supertrend_strategy    import SuperTrendStrategy
from .vwap_strategy          import VWAPStrategy
from .momentum_strategy      import MomentumStrategy
from .breakout_strategy      import BreakoutStrategy
from .json_strategy          import JsonStrategy
from .hybrid_pullback_strategy import SmartPullbackStrategy

__all__ = [
    "EMAStrategy",
    "RSIStrategy",
    "MACDStrategy",
    "BollingerBandsStrategy",
    "SuperTrendStrategy",
    "VWAPStrategy",
    "MomentumStrategy",
    "BreakoutStrategy",
    "JsonStrategy",
    "SmartPullbackStrategy",
]

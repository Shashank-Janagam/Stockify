"""
ema_strategy.py — EMA Crossover Strategy
==========================================
Logic:
  Entry: Fast EMA crosses ABOVE Slow EMA  (golden cross)
  Exit : Fast EMA crosses BELOW Slow EMA  (death cross)

Default params: fast_period=9, slow_period=21
"""

from __future__ import annotations

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal
from ..conditions.comparators import CrossAbove, CrossBelow
from ..signals.signal_engine import signal_engine
from ..conditions.condition_engine import condition_engine
from ..registry.strategy_registry import strategy_registry


class EMAStrategy(BaseStrategy):

    def initialize(self) -> None:
        self.fast_period = self.params.get("fast_period", 9)
        self.slow_period = self.params.get("slow_period", 21)

    def calculate_indicators(self, candles: list[Candle]) -> None:
        self._indicator_cache["EMA_fast"] = self.indicators.calculate(
            "EMA", candles, period=self.fast_period
        )
        self._indicator_cache["EMA_slow"] = self.indicators.calculate(
            "EMA", candles, period=self.slow_period
        )

    def generate_entry_signal(self, candles: list[Candle], current_price: float) -> Signal:
        fast = self._indicator_cache["EMA_fast"]
        slow = self._indicator_cache["EMA_slow"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        result = condition_engine.evaluate(CrossAbove(), fast, slow, label="EMA CrossAbove")
        return signal_engine.resolve_entry(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
            meta={"ema_fast": fast[-1] if fast else None, "ema_slow": slow[-1] if slow else None},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None) -> Signal:
        fast = self._indicator_cache["EMA_fast"]
        slow = self._indicator_cache["EMA_slow"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        result = condition_engine.evaluate(CrossBelow(), fast, slow, label="EMA CrossBelow")
        return signal_engine.resolve_exit(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : "EMA Crossover: fast EMA crosses above/below slow EMA",
            "version"        : "1.0",
            "author"         : "PaperBull",
            "indicators_used": ["EMA"],
            "best_for"       : "Trending markets",
            "risk_level"     : "LOW",
        }


# ── Self-Registration ─────────────────────────────────────────────────────────
strategy_registry.register("EMA", EMAStrategy)

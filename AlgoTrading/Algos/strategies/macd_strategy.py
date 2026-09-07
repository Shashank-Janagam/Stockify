"""
macd_strategy.py — MACD Signal-Line Crossover Strategy
=======================================================
Logic:
  Entry: MACD line crosses ABOVE the signal line  (bullish momentum)
  Exit : MACD line crosses BELOW the signal line  (momentum fading)

Default params: fast=12, slow=26, signal=9
"""

from __future__ import annotations

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal
from ..conditions.comparators import CrossAbove, CrossBelow
from ..signals.signal_engine import signal_engine
from ..conditions.condition_engine import condition_engine
from ..registry.strategy_registry import strategy_registry


class MACDStrategy(BaseStrategy):

    def initialize(self) -> None:
        self.fast_period   = self.params.get("fast_period",   12)
        self.slow_period   = self.params.get("slow_period",   26)
        self.signal_period = self.params.get("signal_period",  9)

    def calculate_indicators(self, candles: list[Candle]) -> None:
        result = self.indicators.calculate(
            "MACD", candles,
            fast_period=self.fast_period,
            slow_period=self.slow_period,
            signal_period=self.signal_period,
        )
        self._indicator_cache["MACD_line"]  = result.macd
        self._indicator_cache["MACD_signal"] = result.signal
        self._indicator_cache["MACD_hist"]   = result.histogram

    def generate_entry_signal(self, candles: list[Candle], current_price: float) -> Signal:
        macd   = self._indicator_cache["MACD_line"]
        sig    = self._indicator_cache["MACD_signal"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        result = condition_engine.evaluate(CrossAbove(), macd, sig, label="MACD CrossAbove Signal")
        return signal_engine.resolve_entry(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
            meta={"macd": macd[-1] if macd else None, "signal": sig[-1] if sig else None},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None) -> Signal:
        macd   = self._indicator_cache["MACD_line"]
        sig    = self._indicator_cache["MACD_signal"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        result = condition_engine.evaluate(CrossBelow(), macd, sig, label="MACD CrossBelow Signal")
        return signal_engine.resolve_exit(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : "MACD signal-line crossover for momentum trading",
            "version"        : "1.0",
            "author"         : "PaperBull",
            "indicators_used": ["MACD", "EMA"],
            "best_for"       : "Trending markets with clear momentum",
            "risk_level"     : "MEDIUM",
        }


# ── Self-Registration ─────────────────────────────────────────────────────────
strategy_registry.register("MACD", MACDStrategy)

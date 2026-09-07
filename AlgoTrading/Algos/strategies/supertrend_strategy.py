"""
supertrend_strategy.py — SuperTrend Trend-Following Strategy
=============================================================
Logic:
  Entry: SuperTrend trend flips to BULLISH (+1)  (prev trend was -1)
  Exit : SuperTrend trend flips to BEARISH (-1)  (prev trend was +1)

Default params: period=10, multiplier=3.0
"""

from __future__ import annotations

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal
from ..signals.signal_engine import signal_engine
from ..conditions.condition_engine import ConditionResult
from ..registry.strategy_registry import strategy_registry


class SuperTrendStrategy(BaseStrategy):

    def initialize(self) -> None:
        self.period     = self.params.get("period",     10)
        self.multiplier = self.params.get("multiplier", 3.0)

    def calculate_indicators(self, candles: list[Candle]) -> None:
        st = self.indicators.calculate(
            "SuperTrend", candles, period=self.period, multiplier=self.multiplier
        )
        self._indicator_cache["ST_trend"] = st.trend
        self._indicator_cache["ST_line"]  = st.supertrend
        # Also compute ATR (used by PositionSizingEngine if ATR_BASED mode)
        self._indicator_cache["ATR"] = self.indicators.calculate(
            "ATR", candles, period=self.period
        )

    def generate_entry_signal(self, candles: list[Candle], current_price: float) -> Signal:
        trend  = self._indicator_cache["ST_trend"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        # Trend flipped from -1 to +1 on last bar
        met    = len(trend) >= 2 and trend[-1] == 1 and trend[-2] == -1
        result = ConditionResult(
            met=met,
            reason="✅ SuperTrend flipped BULLISH" if met else "❌ No bullish SuperTrend flip",
        )
        return signal_engine.resolve_entry(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
            confidence=0.8,
            meta={"trend": trend[-1] if trend else None},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None) -> Signal:
        trend  = self._indicator_cache["ST_trend"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        # Trend flipped from +1 to -1
        met    = len(trend) >= 2 and trend[-1] == -1 and trend[-2] == 1
        result = ConditionResult(
            met=met,
            reason="✅ SuperTrend flipped BEARISH" if met else "❌ Still bullish",
        )
        return signal_engine.resolve_exit(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : "SuperTrend trend-following: trade each bullish/bearish flip",
            "version"        : "1.0",
            "author"         : "PaperBull",
            "indicators_used": ["SuperTrend", "ATR"],
            "best_for"       : "Strong trending markets (crypto, momentum stocks)",
            "risk_level"     : "MEDIUM",
        }


# ── Self-Registration ─────────────────────────────────────────────────────────
strategy_registry.register("SuperTrend", SuperTrendStrategy)

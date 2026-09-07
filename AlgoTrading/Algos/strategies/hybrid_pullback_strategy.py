"""
hybrid_pullback_strategy.py — Smart Pullback Strategy
======================================================
Logic:
  Entry: Price > 50 EMA (Uptrend filter) AND RSI(4) < 30 (Oversold pullback)
  Exit : RSI(4) > 70 (Overbought / Take profit) OR Price < 50 EMA (Trend Broken)

Default params: ema_period=50, rsi_period=4, rsi_oversold=30, rsi_overbought=70
"""

from __future__ import annotations

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal
from ..signals.signal_engine import signal_engine
from ..conditions.condition_engine import ConditionResult
from ..registry.strategy_registry import strategy_registry


class SmartPullbackStrategy(BaseStrategy):

    def initialize(self) -> None:
        self.ema_period     = self.params.get("ema_period",     50)
        self.rsi_period     = self.params.get("rsi_period",     4)
        self.rsi_oversold   = self.params.get("rsi_oversold",   30)
        self.rsi_overbought = self.params.get("rsi_overbought", 70)

    def calculate_indicators(self, candles: list[Candle]) -> None:
        self._indicator_cache["EMA_50"] = self.indicators.calculate(
            "EMA", candles, period=self.ema_period
        )
        self._indicator_cache["RSI_4"] = self.indicators.calculate(
            "RSI", candles, period=self.rsi_period
        )

    def generate_entry_signal(self, candles: list[Candle], current_price: float) -> Signal:
        ema = self._indicator_cache["EMA_50"]
        rsi = self._indicator_cache["RSI_4"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        if not ema or not rsi or len(ema) < 1 or len(rsi) < 1 or ema[-1] is None or rsi[-1] is None:
            return signal_engine.resolve_entry(
                result=ConditionResult(met=False, reason="Warming up indicators"),
                symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
            )

        # Condition 1: Price is strictly above the 50 EMA (Trend is UP)
        trend_up = current_price > ema[-1]
        
        # Condition 2: 4-period RSI is below 30 (Short-term pullback)
        oversold = rsi[-1] < self.rsi_oversold

        met = trend_up and oversold
        reason = "❌ Trend down or not oversold"
        if met:
            reason = f"✅ Price > EMA ({current_price} > {ema[-1]:.2f}) AND RSI < {self.rsi_oversold} ({rsi[-1]:.1f})"

        return signal_engine.resolve_entry(
            result=ConditionResult(met=met, reason=reason),
            symbol=symbol, 
            instrument_key=symbol,
            price=current_price, 
            strategy_name=self.name,
            confidence=0.85,
            meta={"ema": ema[-1], "rsi": rsi[-1]},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None) -> Signal:
        ema = self._indicator_cache["EMA_50"]
        rsi = self._indicator_cache["RSI_4"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        if not ema or not rsi or len(ema) < 1 or len(rsi) < 1 or ema[-1] is None or rsi[-1] is None:
            return signal_engine.resolve_exit(
                result=ConditionResult(met=False, reason="Warming up indicators"),
                symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
            )

        # Exit 1: RSI pops above 70 (Take quick profits on the bounce)
        overbought = rsi[-1] > self.rsi_overbought
        
        # Exit 2: Price closes below 50 EMA (The uptrend is broken, cut losses)
        trend_broken = current_price < ema[-1]

        met = overbought or trend_broken
        reason = "❌ Trade still active"
        if overbought:
            reason = f"✅ Take Profit: RSI > {self.rsi_overbought} ({rsi[-1]:.1f})"
        elif trend_broken:
            reason = f"✅ Stop Loss: Price < EMA ({current_price} < {ema[-1]:.2f})"

        return signal_engine.resolve_exit(
            result=ConditionResult(met=met, reason=reason),
            symbol=symbol, 
            instrument_key=symbol,
            price=current_price, 
            strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : "Hybrid Pullback: Buy oversold pullbacks (RSI<30) only when in a larger uptrend (Price>50 EMA).",
            "version"        : "1.0",
            "author"         : "PaperBull",
            "indicators_used": ["EMA", "RSI"],
            "best_for"       : "Choppy but upward drifting markets",
            "risk_level"     : "LOW",
        }


# ── Self-Registration ─────────────────────────────────────────────────────────
strategy_registry.register("SmartPullback", SmartPullbackStrategy)

"""
breakout_strategy.py — Volume-Confirmed Price Breakout Strategy
================================================================
Logic:
  Entry: Price breaks ABOVE N-period high (resistance breakout)
         AND current volume > volume_multiplier × avg volume
         (volume spike confirms the breakout is genuine)
  Exit : Price falls below N-period high (breakout fails / trail stop)
         OR RSI > overbought (overextended)

Default params: lookback=20, vol_multiplier=1.5, rsi_period=14, overbought=75
"""

from __future__ import annotations

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal
from ..conditions.comparators import GreaterThan
from ..signals.signal_engine import signal_engine
from ..conditions.condition_engine import condition_engine, ConditionResult
from ..registry.strategy_registry import strategy_registry


class BreakoutStrategy(BaseStrategy):

    def initialize(self) -> None:
        self.lookback       = self.params.get("lookback",       20)
        self.vol_multiplier = self.params.get("vol_multiplier", 1.5)
        self.rsi_period     = self.params.get("rsi_period",     14)
        self.overbought     = self.params.get("overbought",     75)

    def calculate_indicators(self, candles: list[Candle]) -> None:
        self._indicator_cache["VolumeSMA"] = self.indicators.calculate(
            "VolumeSMA", candles, period=self.lookback
        )
        self._indicator_cache["RSI"] = self.indicators.calculate(
            "RSI", candles, period=self.rsi_period
        )

    def generate_entry_signal(self, candles: list[Candle], current_price: float) -> Signal:
        symbol   = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"
        vol_sma  = self._indicator_cache["VolumeSMA"]
        n = len(candles)

        if n < self.lookback + 1:
            result = ConditionResult(met=False, reason="❌ Not enough candles for breakout")
            return signal_engine.resolve_entry(
                result=result, symbol=symbol, instrument_key=symbol,
                price=current_price, strategy_name=self.name,
            )

        # N-period resistance high (excluding current bar)
        recent_highs = [candles[i].high for i in range(n - self.lookback - 1, n - 1)]
        resistance   = max(recent_highs) if recent_highs else float("inf")

        # Price breakout above resistance
        price_breaks_out = current_price > resistance

        # Volume spike confirmation
        avg_vol     = vol_sma[-1] if vol_sma and vol_sma[-1] == vol_sma[-1] else 0
        current_vol = candles[-1].volume
        vol_spike   = avg_vol > 0 and current_vol > (self.vol_multiplier * avg_vol)

        met    = price_breaks_out and vol_spike
        reason = (
            f"✅ Breakout above ₹{resistance:.2f} with volume spike "
            f"({current_vol:.0f} > {self.vol_multiplier}× avg {avg_vol:.0f})"
            if met else
            f"❌ No breakout | Price: ₹{current_price:.2f} Resistance: ₹{resistance:.2f} "
            f"Vol spike: {vol_spike}"
        )
        result = ConditionResult(met=met, reason=reason)

        return signal_engine.resolve_entry(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name, confidence=0.85,
            meta={"resistance": resistance, "avg_vol": avg_vol, "current_vol": current_vol},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None) -> Signal:
        rsi      = self._indicator_cache["RSI"]
        symbol   = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"
        n        = len(candles)

        if n < self.lookback + 1:
            result = ConditionResult(met=False, reason="❌ Not enough candles")
            return signal_engine.resolve_exit(
                result=result, symbol=symbol, instrument_key=symbol,
                price=current_price, strategy_name=self.name,
            )

        recent_highs = [candles[i].high for i in range(n - self.lookback - 1, n - 1)]
        resistance   = max(recent_highs) if recent_highs else float("inf")

        # Exit if price falls back below resistance (breakout failed) OR RSI overbought
        combined = condition_engine.evaluate_any([
            {"condition": GreaterThan(), "args": [[resistance], [current_price]],
             "label": "Price fell back below resistance"},
            {"condition": GreaterThan(), "args": [rsi, [self.overbought]],
             "label": f"RSI > {self.overbought} (overextended)"},
        ])
        return signal_engine.resolve_exit(
            result=combined, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : f"Volume-confirmed {self.lookback}-bar breakout above resistance",
            "version"        : "1.0",
            "author"         : "PaperBull",
            "indicators_used": ["VolumeSMA", "RSI"],
            "best_for"       : "Consolidation breakouts in high-momentum stocks",
            "risk_level"     : "HIGH",
        }


# ── Self-Registration ─────────────────────────────────────────────────────────
strategy_registry.register("Breakout", BreakoutStrategy)

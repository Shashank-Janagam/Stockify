"""
momentum_strategy.py — Dual EMA + RSI Momentum Strategy
=========================================================
Logic:
  Entry: Price above long EMA (uptrend confirmed)
         AND EMA9 > EMA21 (short-term momentum bullish)
         AND RSI > 55 (momentum gaining)
  Exit : RSI < 45 OR EMA9 < EMA21

Uses AT_LEAST for a confidence-scored entry: needs 3 of 3 conditions.
This reduces false signals compared to a single-indicator strategy.

Default params: ema_short=9, ema_long=21, ema_trend=50, rsi_period=14
"""

from __future__ import annotations

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal
from ..conditions.comparators import GreaterThan, LessThan, CrossBelow
from ..conditions.logical_operators import AND, OR
from ..signals.signal_engine import signal_engine
from ..conditions.condition_engine import condition_engine
from ..registry.strategy_registry import strategy_registry


class MomentumStrategy(BaseStrategy):

    def initialize(self) -> None:
        self.ema_short  = self.params.get("ema_short",  9)
        self.ema_long   = self.params.get("ema_long",   21)
        self.ema_trend  = self.params.get("ema_trend",  50)
        self.rsi_period = self.params.get("rsi_period", 14)

    def calculate_indicators(self, candles: list[Candle]) -> None:
        self._indicator_cache["EMA_short"] = self.indicators.calculate(
            "EMA", candles, period=self.ema_short
        )
        self._indicator_cache["EMA_long"] = self.indicators.calculate(
            "EMA", candles, period=self.ema_long
        )
        self._indicator_cache["EMA_trend"] = self.indicators.calculate(
            "EMA", candles, period=self.ema_trend
        )
        self._indicator_cache["RSI"] = self.indicators.calculate(
            "RSI", candles, period=self.rsi_period
        )

    def generate_entry_signal(self, candles: list[Candle], current_price: float) -> Signal:
        prices     = [c.close for c in candles]
        ema_short  = self._indicator_cache["EMA_short"]
        ema_long   = self._indicator_cache["EMA_long"]
        ema_trend  = self._indicator_cache["EMA_trend"]
        rsi        = self._indicator_cache["RSI"]
        symbol     = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        combined = condition_engine.evaluate_all([
            {"condition": GreaterThan(), "args": [prices, ema_trend], "label": "Price > EMA50 (uptrend)"},
            {"condition": GreaterThan(), "args": [ema_short, ema_long], "label": "EMA9 > EMA21"},
            {"condition": GreaterThan(), "args": [rsi, [55]],          "label": "RSI > 55"},
        ])

        # Confidence proportional to how many conditions met
        confidence = 0.5 + (sum(r.met for r in combined.results) / len(combined.results)) * 0.5 if hasattr(combined, 'results') else 0.75

        return signal_engine.resolve_entry(
            result=combined, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name, confidence=0.8,
            meta={"ema_short": ema_short[-1] if ema_short else None, "rsi": rsi[-1] if rsi else None},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None) -> Signal:
        ema_short = self._indicator_cache["EMA_short"]
        ema_long  = self._indicator_cache["EMA_long"]
        rsi       = self._indicator_cache["RSI"]
        symbol    = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        combined = condition_engine.evaluate_any([
            {"condition": LessThan(),   "args": [rsi, [45]],            "label": "RSI < 45 (momentum lost)"},
            {"condition": CrossBelow(), "args": [ema_short, ema_long],  "label": "EMA9 < EMA21 (bearish)"},
        ])
        return signal_engine.resolve_exit(
            result=combined, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : "3-factor momentum: uptrend + EMA alignment + RSI strength",
            "version"        : "1.0",
            "author"         : "PaperBull",
            "indicators_used": ["EMA", "RSI"],
            "best_for"       : "Strong trending markets with clear momentum",
            "risk_level"     : "MEDIUM",
        }


# ── Self-Registration ─────────────────────────────────────────────────────────
strategy_registry.register("Momentum", MomentumStrategy)

"""
bollinger_bands_strategy.py — Bollinger Bands Mean Reversion
=============================================================
Logic:
  Entry: Price touches or crosses BELOW lower band  (oversold squeeze)
         AND RSI < 40 (confirms oversold)
  Exit : Price reaches or crosses ABOVE upper band  OR RSI > 60

Default params: period=20, multiplier=2.0, rsi_period=14
"""

from __future__ import annotations

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal
from ..conditions.comparators import LessThan, GreaterThan, AtOrBelow, AtOrAbove
from ..conditions.logical_operators import AND, OR
from ..signals.signal_engine import signal_engine
from ..conditions.condition_engine import condition_engine
from ..registry.strategy_registry import strategy_registry


class BollingerBandsStrategy(BaseStrategy):

    def initialize(self) -> None:
        self.period     = self.params.get("period",     20)
        self.multiplier = self.params.get("multiplier", 2.0)
        self.rsi_period = self.params.get("rsi_period", 14)

    def calculate_indicators(self, candles: list[Candle]) -> None:
        bb = self.indicators.calculate(
            "BollingerBands", candles, period=self.period, multiplier=self.multiplier
        )
        self._indicator_cache["BB_upper"]  = bb.upper
        self._indicator_cache["BB_middle"] = bb.middle
        self._indicator_cache["BB_lower"]  = bb.lower
        self._indicator_cache["RSI"] = self.indicators.calculate(
            "RSI", candles, period=self.rsi_period
        )

    def generate_entry_signal(self, candles: list[Candle], current_price: float) -> Signal:
        prices = [c.close for c in candles]
        lower  = self._indicator_cache["BB_lower"]
        rsi    = self._indicator_cache["RSI"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        # Price at or below lower band AND RSI < 40
        entry_rule = AND([
            AtOrBelow(),   # price <= lower band
            LessThan(),    # rsi < 40
        ])

        # Evaluate manually since AND needs different args per condition
        price_below = condition_engine.evaluate(AtOrBelow(), prices, lower, label="Price ≤ BB Lower")
        rsi_confirm = condition_engine.evaluate(LessThan(),  rsi, [40],    label="RSI < 40")
        combined    = condition_engine.evaluate_all([
            {"condition": AtOrBelow(), "args": [prices, lower], "label": "Price ≤ BB Lower"},
            {"condition": LessThan(),  "args": [rsi, [40]],    "label": "RSI < 40"},
        ])

        return signal_engine.resolve_entry(
            result=combined, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
            meta={"bb_lower": lower[-1] if lower else None, "rsi": rsi[-1] if rsi else None},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None) -> Signal:
        prices = [c.close for c in candles]
        upper  = self._indicator_cache["BB_upper"]
        rsi    = self._indicator_cache["RSI"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        # Price at or above upper band OR RSI > 60
        combined = condition_engine.evaluate_any([
            {"condition": AtOrAbove(), "args": [prices, upper], "label": "Price ≥ BB Upper"},
            {"condition": GreaterThan(), "args": [rsi, [60]],   "label": "RSI > 60"},
        ])
        return signal_engine.resolve_exit(
            result=combined, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : "Bollinger Bands mean-reversion with RSI confirmation",
            "version"        : "1.0",
            "author"         : "PaperBull",
            "indicators_used": ["BollingerBands", "RSI"],
            "best_for"       : "Range-bound / low-volatility markets",
            "risk_level"     : "MEDIUM",
        }


# ── Self-Registration ─────────────────────────────────────────────────────────
strategy_registry.register("BollingerBands", BollingerBandsStrategy)

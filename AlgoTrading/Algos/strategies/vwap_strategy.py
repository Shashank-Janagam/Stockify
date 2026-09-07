"""
vwap_strategy.py — VWAP Intraday Mean-Reversion Strategy
=========================================================
Logic:
  Entry: Price dips BELOW VWAP (intraday pullback) AND RSI < 45
         Expect a snap-back to VWAP
  Exit : Price crosses ABOVE VWAP (reverted to mean) OR RSI > 60

Best suited for intraday candles (1min, 5min, 15min) with daily VWAP reset.

Default params: rsi_period=14
"""

from __future__ import annotations

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal
from ..conditions.comparators import LessThan, GreaterThan, CrossAbove
from ..signals.signal_engine import signal_engine
from ..conditions.condition_engine import condition_engine
from ..registry.strategy_registry import strategy_registry


class VWAPStrategy(BaseStrategy):

    def initialize(self) -> None:
        self.rsi_period  = self.params.get("rsi_period", 14)
        self.reset_daily = self.params.get("reset_daily", True)

    def calculate_indicators(self, candles: list[Candle]) -> None:
        self._indicator_cache["VWAP"] = self.indicators.calculate(
            "VWAP", candles, reset_daily=self.reset_daily
        )
        self._indicator_cache["RSI"] = self.indicators.calculate(
            "RSI", candles, period=self.rsi_period
        )

    def generate_entry_signal(self, candles: list[Candle], current_price: float) -> Signal:
        prices = [c.close for c in candles]
        vwap   = self._indicator_cache["VWAP"]
        rsi    = self._indicator_cache["RSI"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        combined = condition_engine.evaluate_all([
            {"condition": LessThan(),  "args": [prices, vwap], "label": "Price < VWAP"},
            {"condition": LessThan(),  "args": [rsi, [45]],   "label": "RSI < 45"},
        ])
        return signal_engine.resolve_entry(
            result=combined, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
            meta={"vwap": vwap[-1] if vwap else None, "rsi": rsi[-1] if rsi else None},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None) -> Signal:
        prices = [c.close for c in candles]
        vwap   = self._indicator_cache["VWAP"]
        rsi    = self._indicator_cache["RSI"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        combined = condition_engine.evaluate_any([
            {"condition": CrossAbove(),  "args": [prices, vwap], "label": "Price CrossAbove VWAP"},
            {"condition": GreaterThan(), "args": [rsi, [60]],    "label": "RSI > 60"},
        ])
        return signal_engine.resolve_exit(
            result=combined, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : "VWAP intraday mean-reversion: buy below VWAP, sell at VWAP",
            "version"        : "1.0",
            "author"         : "PaperBull",
            "indicators_used": ["VWAP", "RSI"],
            "best_for"       : "Intraday 5-min / 15-min candles",
            "risk_level"     : "MEDIUM",
        }


# ── Self-Registration ─────────────────────────────────────────────────────────
strategy_registry.register("VWAP", VWAPStrategy)

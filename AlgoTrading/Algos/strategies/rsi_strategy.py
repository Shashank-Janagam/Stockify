"""
rsi_strategy.py — RSI Oversold/Overbought Strategy
====================================================
Logic:
  Entry: RSI < oversold_threshold (default 30) — potential reversal up
  Exit : RSI > overbought_threshold (default 70) — take profit

Default params: period=14, oversold=30, overbought=70
"""

from __future__ import annotations

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal
from ..conditions.comparators import LessThan, GreaterThan
from ..signals.signal_engine import signal_engine
from ..conditions.condition_engine import condition_engine
from ..registry.strategy_registry import strategy_registry


class RSIStrategy(BaseStrategy):

    def initialize(self) -> None:
        self.period     = self.params.get("period",     14)
        self.oversold   = self.params.get("oversold",   30)
        self.overbought = self.params.get("overbought", 70)

    def calculate_indicators(self, candles: list[Candle]) -> None:
        self._indicator_cache["RSI"] = self.indicators.calculate(
            "RSI", candles, period=self.period
        )

    def generate_entry_signal(self, candles: list[Candle], current_price: float) -> Signal:
        rsi    = self._indicator_cache["RSI"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        result = condition_engine.evaluate(
            LessThan(), rsi, [self.oversold], label=f"RSI < {self.oversold}"
        )
        return signal_engine.resolve_entry(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
            meta={"rsi": rsi[-1] if rsi else None},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None) -> Signal:
        rsi    = self._indicator_cache["RSI"]
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"

        result = condition_engine.evaluate(
            GreaterThan(), rsi, [self.overbought], label=f"RSI > {self.overbought}"
        )
        return signal_engine.resolve_exit(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
            meta={"rsi": rsi[-1] if rsi else None},
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : f"RSI mean-reversion: BUY when RSI<{self.oversold}, SELL when RSI>{self.overbought}",
            "version"        : "1.0",
            "author"         : "PaperBull",
            "indicators_used": ["RSI"],
            "best_for"       : "Range-bound / mean-reverting markets",
            "risk_level"     : "MEDIUM",
        }


# ── Self-Registration ─────────────────────────────────────────────────────────
strategy_registry.register("RSI", RSIStrategy)

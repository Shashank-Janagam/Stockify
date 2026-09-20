"""
rsi.py — Relative Strength Index
==================================
Algorithm : Wilder's RSI (standard implementation)
Seed      : Simple average gain/loss over first `period` changes.
Smoothing : Wilder's EMA — avgGain = (prev * (p-1) + gain) / p
Returns   : list[float] — 0–100; NaN until period + 1 filled.

Interpretation:
  > 70  → Overbought
  < 30  → Oversold
"""

from __future__ import annotations
import math
from typing import Literal

from ..core.base_strategy import Candle

Source = Literal["close", "open", "high", "low"]


class RSI:
    name = "RSI"

    @staticmethod
    def calculate(
        candles: list[Candle],
        period: int = 14,
        source: Source = "close",
    ) -> list[float]:
        """
        Parameters
        ----------
        candles : list of Candle
        period  : RSI period (default 14)
        source  : Price field (default "close")

        Returns
        -------
        list[float] — RSI values 0–100; NaN until period+1 candles are available.
        """
        n = len(candles)
        result = [float("nan")] * n
        if n < period + 1 or period < 1:
            return result

        prices  = [getattr(c, source) for c in candles]
        changes = [prices[i] - prices[i - 1] for i in range(1, n)]

        # Seed: simple average of first `period` gains and losses
        avg_gain = sum(max(ch, 0) for ch in changes[:period]) / period
        avg_loss = sum(abs(min(ch, 0)) for ch in changes[:period]) / period

        rs = avg_gain / avg_loss if avg_loss != 0 else math.inf
        result[period] = 100 - (100 / (1 + rs))

        # Wilder's smoothing for the remainder
        for i in range(period + 1, n):
            change   = changes[i - 1]
            gain     = max(change, 0)
            loss     = abs(min(change, 0))
            avg_gain = (avg_gain * (period - 1) + gain) / period
            avg_loss = (avg_loss * (period - 1) + loss) / period
            rs       = avg_gain / avg_loss if avg_loss != 0 else math.inf
            result[i] = 100 - (100 / (1 + rs))

        return result

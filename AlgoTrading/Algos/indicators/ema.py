"""
ema.py — Exponential Moving Average
=====================================
Formula  : EMA(t) = price(t) * k + EMA(t-1) * (1 - k)
           k = 2 / (period + 1)
Seed     : Simple average of first `period` prices.
Returns  : list[float] — same length as candles; float('nan') until period filled.
"""

from __future__ import annotations
import math
from typing import Literal

from ..core.base_strategy import Candle

Source = Literal["close", "open", "high", "low"]


class EMA:
    name = "EMA"

    @staticmethod
    def calculate(
        candles: list[Candle],
        period: int = 9,
        source: Source = "close",
    ) -> list[float]:
        """
        Parameters
        ----------
        candles : list of Candle
        period  : EMA period (default 9)
        source  : Price field to use (default "close")

        Returns
        -------
        list[float] — EMA values; NaN until period is filled.
        """
        n = len(candles)
        result = [float("nan")] * n
        if n < period or period < 1:
            return result

        k = 2.0 / (period + 1)
        prices = [getattr(c, source) for c in candles]

        # Seed: SMA of first `period` values
        result[period - 1] = sum(prices[:period]) / period

        for i in range(period, n):
            result[i] = prices[i] * k + result[i - 1] * (1 - k)

        return result

"""
sma.py — Simple Moving Average
================================
Formula : SMA(t) = mean(prices[t-period+1 .. t])
Returns : list[float] — same length as candles; NaN until period filled.
"""

from __future__ import annotations
from typing import Literal

from ..core.base_strategy import Candle

Source = Literal["close", "open", "high", "low"]


class SMA:
    name = "SMA"

    @staticmethod
    def calculate(
        candles: list[Candle],
        period: int = 20,
        source: Source = "close",
    ) -> list[float]:
        """
        Parameters
        ----------
        candles : list of Candle
        period  : SMA period (default 20)
        source  : Price field to use (default "close")

        Returns
        -------
        list[float] — SMA values; NaN until period is filled.
        """
        n = len(candles)
        result = [float("nan")] * n
        if period < 1 or n < period:
            return result

        prices = [getattr(c, source) for c in candles]

        for i in range(period - 1, n):
            result[i] = sum(prices[i - period + 1 : i + 1]) / period

        return result

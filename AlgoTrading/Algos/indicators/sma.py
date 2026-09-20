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
        if period < 1 or n < period:
            return [float("nan")] * n

        import pandas as pd
        prices = [getattr(c, source) for c in candles]
        
        # Pandas vectorized SMA
        series = pd.Series(prices)
        sma = series.rolling(window=period).mean()
        
        return sma.fillna(float("nan")).tolist()

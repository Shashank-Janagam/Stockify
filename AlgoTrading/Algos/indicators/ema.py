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
        if n < period or period < 1:
            return [float("nan")] * n

        import pandas as pd
        prices = [getattr(c, source) for c in candles]
        
        # Pandas vectorized EMA
        series = pd.Series(prices)
        
        # The exact formula used previously was EMA seed = SMA(period), then k = 2/(p+1).
        # We can replicate standard financial EMA precisely using adjust=False and min_periods=period
        ema = series.ewm(span=period, adjust=False, min_periods=period).mean()
        
        return ema.fillna(float("nan")).tolist()

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
        if n < period + 1 or period < 1:
            return [float("nan")] * n

        import pandas as pd
        import numpy as np
        
        prices  = [getattr(c, source) for c in candles]
        series = pd.Series(prices)
        
        # Calculate daily returns
        delta = series.diff()
        
        # Make two series: one for lower closes and one for higher closes
        up = delta.clip(lower=0)
        down = -1 * delta.clip(upper=0)
        
        # Wilder's smoothing uses alpha = 1 / period
        roll_up = up.ewm(alpha=1/period, adjust=False, min_periods=period).mean()
        roll_down = down.ewm(alpha=1/period, adjust=False, min_periods=period).mean()
        
        # Calculate RS and RSI
        rs = roll_up / roll_down
        rsi = 100.0 - (100.0 / (1.0 + rs))
        
        # Fill inf cases where roll_down is 0
        rsi = rsi.replace([np.inf, -np.inf], 100.0)

        return rsi.fillna(float("nan")).tolist()

"""
atr.py — Average True Range
=============================
True Range  = max(high-low, |high-prevClose|, |low-prevClose|)
ATR         = Wilder's EMA of True Range over `period` candles.

Standard period: 14
Used by: SuperTrend, PositionSizingEngine (ATR-based mode), stop-loss placement.
"""

from __future__ import annotations
import math

from ..core.base_strategy import Candle


class ATR:
    name = "ATR"

    @staticmethod
    def calculate(
        candles: list[Candle],
        period: int = 14,
    ) -> list[float]:
        """
        Parameters
        ----------
        candles : list of Candle
        period  : ATR period (default 14)

        Returns
        -------
        list[float] — ATR values; NaN until period+1 candles are available.
        """
        n = len(candles)
        if n < period + 1 or period < 1:
            return [float("nan")] * n

        import pandas as pd
        import numpy as np

        # Extract vectors
        high = np.array([c.high for c in candles])
        low = np.array([c.low for c in candles])
        close = np.array([c.close for c in candles])

        # Shift close by 1 for prev_close (first element will be NaN)
        prev_close = np.roll(close, 1)
        prev_close[0] = np.nan

        # Calculate True Range components
        tr1 = high - low
        tr2 = np.abs(high - prev_close)
        tr3 = np.abs(low - prev_close)

        # True Range is the element-wise maximum
        tr = np.maximum(np.maximum(tr1, tr2), tr3)

        # Convert to Pandas Series to use Wilder's smoothing (EMA with alpha=1/period)
        tr_series = pd.Series(tr)
        atr = tr_series.ewm(alpha=1/period, adjust=False, min_periods=period).mean()

        return atr.fillna(float("nan")).tolist()

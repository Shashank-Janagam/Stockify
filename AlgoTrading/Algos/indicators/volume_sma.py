"""
volume_sma.py — Volume Simple Moving Average
=============================================
Same algorithm as SMA but operates on `candle.volume`.
Used to detect high-volume breakouts: volume > N × avg_volume.

Standard period: 20
"""

from __future__ import annotations

from ..core.base_strategy import Candle


class VolumeSMA:
    name = "VolumeSMA"

    @staticmethod
    def calculate(
        candles: list[Candle],
        period : int = 20,
    ) -> list[float]:
        """
        Parameters
        ----------
        candles : list of Candle
        period  : SMA period over volume (default 20)

        Returns
        -------
        list[float] — Volume SMA values; NaN until period is filled.
        """
        n = len(candles)
        if period < 1 or n < period:
            return [float("nan")] * n

        import pandas as pd
        import numpy as np
        
        volumes = np.array([c.volume for c in candles])
        volumes = np.maximum(volumes, 0.0) # ensure positive
        
        # Pandas vectorized SMA
        series = pd.Series(volumes)
        sma = series.rolling(window=period).mean()
        
        return sma.fillna(float("nan")).tolist()

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
        result = [float("nan")] * n
        if period < 1 or n < period:
            return result

        volumes = [max(c.volume, 0.0) for c in candles]
        for i in range(period - 1, n):
            result[i] = sum(volumes[i - period + 1 : i + 1]) / period

        return result

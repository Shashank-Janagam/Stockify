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
        result = [float("nan")] * n
        if n < period + 1 or period < 1:
            return result

        # True Range (index 0 has no prevClose, so TR starts at index 1)
        tr = [float("nan")] * n
        for i in range(1, n):
            h, l       = candles[i].high, candles[i].low
            prev_close = candles[i - 1].close
            tr[i] = max(h - l, abs(h - prev_close), abs(l - prev_close))

        # Seed: simple average of first `period` TR values (indices 1..period)
        result[period] = sum(tr[1 : period + 1]) / period

        # Wilder's smoothing
        for i in range(period + 1, n):
            result[i] = (result[i - 1] * (period - 1) + tr[i]) / period

        return result

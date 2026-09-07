"""
bollinger_bands.py — Bollinger Bands
=======================================
Components:
  middle    = SMA(period)
  upper     = middle + (multiplier × std_dev)
  lower     = middle - (multiplier × std_dev)
  bandwidth = (upper - lower) / middle
  percent_b = (price - lower) / (upper - lower)

Defaults: period=20, multiplier=2.0
"""

from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Literal

from ..core.base_strategy import Candle
from .sma import SMA

Source = Literal["close", "open", "high", "low"]


@dataclass(frozen=True)
class BBResult:
    upper    : list[float]
    middle   : list[float]
    lower    : list[float]
    bandwidth: list[float]
    percent_b: list[float]


class BollingerBands:
    name = "BollingerBands"

    @staticmethod
    def calculate(
        candles   : list[Candle],
        period    : int    = 20,
        multiplier: float  = 2.0,
        source    : Source = "close",
    ) -> BBResult:
        """
        Returns
        -------
        BBResult with five parallel lists: upper, middle, lower, bandwidth, percent_b.
        """
        n = len(candles)
        if n == 0:
            return BBResult([], [], [], [], [])

        nan    = float("nan")
        middle = SMA.calculate(candles, period=period, source=source)
        prices = [getattr(c, source) for c in candles]

        upper     = [nan] * n
        lower     = [nan] * n
        bandwidth = [nan] * n
        percent_b = [nan] * n

        for i in range(period - 1, n):
            mid = middle[i]
            if mid != mid:  # NaN check
                continue

            window   = prices[i - period + 1 : i + 1]
            variance = sum((p - mid) ** 2 for p in window) / period
            std_dev  = math.sqrt(variance)

            upper[i] = mid + multiplier * std_dev
            lower[i] = mid - multiplier * std_dev
            rng      = upper[i] - lower[i]

            bandwidth[i] = rng / mid if mid != 0 else nan
            percent_b[i] = (prices[i] - lower[i]) / rng if rng != 0 else 0.5

        return BBResult(
            upper=upper, middle=middle, lower=lower,
            bandwidth=bandwidth, percent_b=percent_b,
        )

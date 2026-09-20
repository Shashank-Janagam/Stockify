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

        import pandas as pd
        import numpy as np

        prices = [getattr(c, source) for c in candles]
        series = pd.Series(prices)

        middle = series.rolling(window=period).mean()
        # original code used population standard deviation: variance = sum(...) / period
        # pandas uses sample standard deviation by default (ddof=1). We set ddof=0 for population std_dev.
        std_dev = series.rolling(window=period).std(ddof=0)

        upper = middle + (multiplier * std_dev)
        lower = middle - (multiplier * std_dev)
        
        rng = upper - lower
        bandwidth = np.where(middle != 0, rng / middle, np.nan)
        percent_b = np.where(rng != 0, (series - lower) / rng, 0.5)

        return BBResult(
            upper=upper.fillna(float("nan")).tolist(),
            middle=middle.fillna(float("nan")).tolist(),
            lower=lower.fillna(float("nan")).tolist(),
            bandwidth=pd.Series(bandwidth).fillna(float("nan")).tolist(),
            percent_b=pd.Series(percent_b).fillna(float("nan")).tolist(),
        )

"""
macd.py — Moving Average Convergence Divergence
================================================
Components:
  macd_line  = EMA(fast) - EMA(slow)
  signal     = EMA(macd_line, signal_period)
  histogram  = macd_line - signal

Defaults: fast=12, slow=26, signal=9

Returns a MACDResult namedtuple with three parallel lists.
"""

from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Literal

from ..core.base_strategy import Candle
from .ema import EMA

Source = Literal["close", "open", "high", "low"]


@dataclass(frozen=True)
class MACDResult:
    macd     : list[float]
    signal   : list[float]
    histogram: list[float]


class MACD:
    name = "MACD"

    @staticmethod
    def calculate(
        candles: list[Candle],
        fast_period  : int    = 12,
        slow_period  : int    = 26,
        signal_period: int    = 9,
        source       : Source = "close",
    ) -> MACDResult:
        """
        Parameters
        ----------
        candles       : list of Candle
        fast_period   : Fast EMA period (default 12)
        slow_period   : Slow EMA period (default 26)
        signal_period : Signal EMA period (default 9)
        source        : Price field (default "close")

        Returns
        -------
        MACDResult with .macd, .signal, .histogram lists.
        """
        n = len(candles)
        if n == 0:
            return MACDResult([], [], [])

        import pandas as pd
        import numpy as np

        prices = [getattr(c, source) for c in candles]
        series = pd.Series(prices)

        # MACD line = fast EMA - slow EMA
        fast_ema = series.ewm(span=fast_period, adjust=False, min_periods=fast_period).mean()
        slow_ema = series.ewm(span=slow_period, adjust=False, min_periods=slow_period).mean()
        macd_line = fast_ema - slow_ema

        # Signal line = EMA of MACD line
        signal_line = macd_line.ewm(span=signal_period, adjust=False, min_periods=signal_period).mean()

        # Histogram
        histogram = macd_line - signal_line

        return MACDResult(
            macd=macd_line.fillna(float("nan")).tolist(),
            signal=signal_line.fillna(float("nan")).tolist(),
            histogram=histogram.fillna(float("nan")).tolist()
        )

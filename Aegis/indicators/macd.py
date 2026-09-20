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

        nan = float("nan")
        fast_ema = EMA.calculate(candles, period=fast_period,  source=source)
        slow_ema = EMA.calculate(candles, period=slow_period,  source=source)

        # MACD line = fast EMA - slow EMA
        macd_line = [
            (f - s) if (f == f and s == s) else nan
            for f, s in zip(fast_ema, slow_ema)
        ]

        # Build synthetic Candle objects from MACD values for EMA calculation
        from datetime import datetime
        synthetic = [
            Candle(timestamp=str(i), open=v, high=v, low=v, close=v, volume=0)
            for i, v in enumerate(macd_line)
        ]
        signal_line = EMA.calculate(synthetic, period=signal_period, source="close")

        histogram = [
            (m - s) if (m == m and s == s) else nan
            for m, s in zip(macd_line, signal_line)
        ]

        return MACDResult(macd=macd_line, signal=signal_line, histogram=histogram)

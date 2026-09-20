"""
supertrend.py — SuperTrend
============================
SuperTrend uses ATR to dynamically set trailing upper/lower bands.
Trend flips BULLISH when close > upper band; BEARISH when close < lower band.

Components per index:
  supertrend : trailing stop line value
  trend      : +1 (bullish) or -1 (bearish)
  upper_band : raw upper band
  lower_band : raw lower band

Defaults: period=10, multiplier=3.0
"""

from __future__ import annotations
import math
from dataclasses import dataclass

from ..core.base_strategy import Candle
from .atr import ATR


@dataclass(frozen=True)
class SuperTrendResult:
    supertrend: list[float]
    trend     : list[int]
    upper_band: list[float]
    lower_band: list[float]


class SuperTrend:
    name = "SuperTrend"

    @staticmethod
    def calculate(
        candles   : list[Candle],
        period    : int   = 10,
        multiplier: float = 3.0,
    ) -> SuperTrendResult:
        """
        Returns
        -------
        SuperTrendResult with four parallel lists.
        """
        n = len(candles)
        nan = float("nan")

        supertrend = [nan] * n
        trend      = [0]  * n
        upper_band = [nan] * n
        lower_band = [nan] * n

        if n == 0:
            return SuperTrendResult(supertrend, trend, upper_band, lower_band)

        atr = ATR.calculate(candles, period=period)

        prev_upper = nan
        prev_lower = nan
        prev_st    = nan

        for i in range(1, n):
            atr_val = atr[i]
            if atr_val != atr_val:  # NaN
                continue

            hl2     = (candles[i].high + candles[i].low) / 2.0
            raw_up  = hl2 + multiplier * atr_val
            raw_dn  = hl2 - multiplier * atr_val

            # Upper band: can only decrease (tightens in bullish trend)
            upper_band[i] = (
                min(raw_up, prev_upper)
                if (prev_upper == prev_upper and raw_up > prev_upper)
                else raw_up
            )

            # Lower band: can only increase (tightens in bearish trend)
            lower_band[i] = (
                max(raw_dn, prev_lower)
                if (prev_lower == prev_lower and raw_dn < prev_lower)
                else raw_dn
            )

            close = candles[i].close

            if prev_st != prev_st:  # First valid ATR — initialize bullish
                trend[i]      = 1
                supertrend[i] = lower_band[i]
            elif prev_st == prev_upper:  # Was bearish
                if close > upper_band[i]:
                    trend[i] = 1
                else:
                    trend[i] = -1
                supertrend[i] = lower_band[i] if trend[i] == 1 else upper_band[i]
            else:                         # Was bullish
                if close < lower_band[i]:
                    trend[i] = -1
                else:
                    trend[i] = 1
                supertrend[i] = lower_band[i] if trend[i] == 1 else upper_band[i]

            prev_upper = upper_band[i]
            prev_lower = lower_band[i]
            prev_st    = supertrend[i]

        return SuperTrendResult(
            supertrend=supertrend,
            trend=trend,
            upper_band=upper_band,
            lower_band=lower_band,
        )

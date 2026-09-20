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

        if n == 0:
            return SuperTrendResult([], [], [], [])

        import pandas as pd
        import numpy as np
        
        atr = ATR.calculate(candles, period=period)
        atr_arr = np.array(atr)
        
        high = np.array([c.high for c in candles])
        low = np.array([c.low for c in candles])
        close = np.array([c.close for c in candles])
        
        hl2 = (high + low) / 2.0
        
        raw_up = hl2 + (multiplier * atr_arr)
        raw_dn = hl2 - (multiplier * atr_arr)
        
        upper_band = np.full(n, nan)
        lower_band = np.full(n, nan)
        supertrend = np.full(n, nan)
        trend = np.zeros(n, dtype=int)
        
        # SuperTrend is inherently path-dependent, so we use a fast numpy loop
        prev_upper = nan
        prev_lower = nan
        prev_st = nan
        
        for i in range(1, n):
            if np.isnan(atr_arr[i]):
                continue
                
            r_up = raw_up[i]
            r_dn = raw_dn[i]
            c = close[i]
            
            # Upper band logic
            if not np.isnan(prev_upper) and prev_upper < r_up and close[i-1] < prev_upper:
                upper_band[i] = prev_upper
            else:
                upper_band[i] = r_up
                
            # Lower band logic
            if not np.isnan(prev_lower) and prev_lower > r_dn and close[i-1] > prev_lower:
                lower_band[i] = prev_lower
            else:
                lower_band[i] = r_dn
                
            # Trend logic
            if np.isnan(prev_st):
                trend[i] = 1
                supertrend[i] = lower_band[i]
            elif prev_st == prev_upper: # Was bearish
                if c > upper_band[i]:
                    trend[i] = 1
                    supertrend[i] = lower_band[i]
                else:
                    trend[i] = -1
                    supertrend[i] = upper_band[i]
            else: # Was bullish
                if c < lower_band[i]:
                    trend[i] = -1
                    supertrend[i] = upper_band[i]
                else:
                    trend[i] = 1
                    supertrend[i] = lower_band[i]
                    
            prev_upper = upper_band[i]
            prev_lower = lower_band[i]
            prev_st = supertrend[i]
            
        # Convert NaN to float("nan") for JSON serialization compatibility
        return SuperTrendResult(
            supertrend=pd.Series(supertrend).fillna(float("nan")).tolist(),
            trend=trend.tolist(),
            upper_band=pd.Series(upper_band).fillna(float("nan")).tolist(),
            lower_band=pd.Series(lower_band).fillna(float("nan")).tolist(),
        )

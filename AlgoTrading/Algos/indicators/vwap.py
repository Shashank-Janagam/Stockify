"""
vwap.py — Volume Weighted Average Price
=========================================
VWAP = Σ(typical_price × volume) / Σ(volume)
Typical Price = (high + low + close) / 3

IMPORTANT: VWAP resets each trading session.
Set reset_daily=True (default) when processing multi-day candle arrays.
"""

from __future__ import annotations
from datetime import datetime

from ..core.base_strategy import Candle


class VWAP:
    name = "VWAP"

    @staticmethod
    def calculate(
        candles: list[Candle],
        reset_daily: bool = True,
    ) -> list[float]:
        """
        Parameters
        ----------
        candles     : list of Candle
        reset_daily : If True, resets VWAP accumulation at each new calendar day.

        Returns
        -------
        list[float] — VWAP values; valid from index 0.
        """
        n = len(candles)
        if n == 0:
            return []

        import pandas as pd
        import numpy as np
        
        high = np.array([c.high for c in candles])
        low = np.array([c.low for c in candles])
        close = np.array([c.close for c in candles])
        volume = np.array([c.volume for c in candles])
        volume = np.maximum(volume, 0.0) # ensure positive volume
        
        typical_price = (high + low + close) / 3.0
        tpv = typical_price * volume
        
        if reset_daily:
            # Extract just the date string (first 10 chars "YYYY-MM-DD")
            dates = [c.timestamp[:10] if c.timestamp else "1970-01-01" for c in candles]
            
            df = pd.DataFrame({'tpv': tpv, 'vol': volume, 'date': dates})
            cum_tpv = df.groupby('date')['tpv'].cumsum()
            cum_vol = df.groupby('date')['vol'].cumsum()
            
            vwap = np.where(cum_vol > 0, cum_tpv / cum_vol, typical_price)
        else:
            cum_tpv = np.cumsum(tpv)
            cum_vol = np.cumsum(volume)
            vwap = np.where(cum_vol > 0, cum_tpv / cum_vol, typical_price)

        return pd.Series(vwap).fillna(float("nan")).tolist()

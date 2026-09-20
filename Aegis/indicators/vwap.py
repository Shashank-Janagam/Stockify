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
        result = [float("nan")] * n
        cum_tpv   = 0.0  # cumulative (typical price × volume)
        cum_vol   = 0.0  # cumulative volume
        current_day = None

        for i, c in enumerate(candles):
            # Detect new day and reset accumulators
            if reset_daily and c.timestamp:
                try:
                    day = datetime.fromisoformat(
                        c.timestamp.replace("Z", "+00:00")
                    ).date().isoformat()
                except (ValueError, AttributeError):
                    day = c.timestamp[:10]  # fallback: first 10 chars

                if day != current_day:
                    cum_tpv     = 0.0
                    cum_vol     = 0.0
                    current_day = day

            typical_price = (c.high + c.low + c.close) / 3.0
            vol           = max(c.volume, 0.0)
            cum_tpv      += typical_price * vol
            cum_vol      += vol
            result[i]     = cum_tpv / cum_vol if cum_vol > 0 else typical_price

        return result

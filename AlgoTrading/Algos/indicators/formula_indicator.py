"""
formula_indicator.py — Custom Formula & Mathematical Indicator Evaluator
========================================================================
Allows users to define custom indicators on the fly using mathematical formulas
and standard rolling calculations without writing Python class files.

Examples of supported formulas:
  - "(high + low) / 2"
  - "(high + low + close) / 3"
  - "(close - open) / open * 100"
  - "sma(close, 20) + 2 * std(close, 20)"
  - "ema(close, 9) - ema(close, 21)"
  - "roc(close, 10)"
  - "highest(high, 20)"
  - "lowest(low, 20)"
"""

from __future__ import annotations
import math
import numpy as np
import pandas as pd
from typing import Any, List
from ..core.base_strategy import Candle

# Safe math functions mapping
MATH_FUNCTIONS = {
    "abs": np.abs,
    "sqrt": np.sqrt,
    "log": np.log,
    "exp": np.exp,
    "sin": np.sin,
    "cos": np.cos,
    "tan": np.tan,
    "maximum": np.maximum,
    "minimum": np.minimum,
}

def _sma(series: pd.Series, period: int = 14) -> pd.Series:
    return series.rolling(window=int(period), min_periods=1).mean()

def _ema(series: pd.Series, period: int = 14) -> pd.Series:
    return series.ewm(span=int(period), adjust=False).mean()

def _std(series: pd.Series, period: int = 14) -> pd.Series:
    return series.rolling(window=int(period), min_periods=1).std().fillna(0.0)

def _highest(series: pd.Series, period: int = 14) -> pd.Series:
    return series.rolling(window=int(period), min_periods=1).max()

def _lowest(series: pd.Series, period: int = 14) -> pd.Series:
    return series.rolling(window=int(period), min_periods=1).min()

def _shift(series: pd.Series, periods: int = 1) -> pd.Series:
    return series.shift(int(periods)).bfill()

def _diff(series: pd.Series, periods: int = 1) -> pd.Series:
    return series.diff(int(periods)).fillna(0.0)

def _roc(series: pd.Series, period: int = 10) -> pd.Series:
    p = int(period)
    prev = series.shift(p)
    return ((series - prev) / prev.replace(0, np.nan) * 100.0).fillna(0.0)

def _atr_simple(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1).bfill()
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(window=int(period), min_periods=1).mean()

class FormulaIndicator:
    """
    Evaluates dynamic mathematical expressions against candles.
    """
    name = "Formula"

    @classmethod
    def calculate(cls, candles: list[Candle], formula: str = "close", **kwargs) -> list[float]:
        """
        Calculates custom formula values for the given candle list.
        """
        if not candles:
            return []

        # Convert candles to pandas DataFrame
        df = pd.DataFrame([
            {
                "open": float(c.open),
                "high": float(c.high),
                "low": float(c.low),
                "close": float(c.close),
                "volume": float(c.volume),
            }
            for c in candles
        ])

        # Built-in derived series
        df["hl2"] = (df["high"] + df["low"]) / 2.0
        df["hlc3"] = (df["high"] + df["low"] + df["close"]) / 3.0
        df["ohlc4"] = (df["open"] + df["high"] + df["low"] + df["close"]) / 4.0

        # Build execution namespace
        eval_namespace = {
            # Base variables
            "open": df["open"],
            "high": df["high"],
            "low": df["low"],
            "close": df["close"],
            "volume": df["volume"],
            "hl2": df["hl2"],
            "hlc3": df["hlc3"],
            "ohlc4": df["ohlc4"],
            # Functions
            "sma": _sma,
            "ema": _ema,
            "std": _std,
            "highest": _highest,
            "lowest": _lowest,
            "shift": _shift,
            "diff": _diff,
            "roc": _roc,
            "atr": lambda p=14: _atr_simple(df["high"], df["low"], df["close"], p),
            **MATH_FUNCTIONS
        }

        # Also inject any custom parameters provided
        for k, v in kwargs.items():
            if k not in eval_namespace:
                eval_namespace[k] = v

        try:
            # Safely evaluate formula with only math names allowed
            result = eval(formula, {"__builtins__": {}}, eval_namespace)
            
            if isinstance(result, (pd.Series, np.ndarray)):
                # Clean up NaN / Inf
                res_series = pd.Series(result).fillna(0.0).replace([np.inf, -np.inf], 0.0)
                return [round(float(v), 4) for v in res_series.tolist()]
            elif isinstance(result, (int, float)):
                return [float(result)] * len(candles)
            else:
                return [0.0] * len(candles)

        except Exception as e:
            # Fallback on evaluation error
            raise ValueError(f"Failed to evaluate formula '{formula}': {str(e)}")

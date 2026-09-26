import pandas as pd

def calculate_sma(close: pd.Series, period: int) -> pd.Series:
    """
    Calculate Simple Moving Average (SMA).
    """
    return close.rolling(window=period).mean()

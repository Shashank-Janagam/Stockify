import pandas as pd

def calculate_sma(close: pd.Series, period: int = 20) -> pd.Series:
    """
    Calculate Simple Moving Average (SMA).
    """
    return close.rolling(window=period).mean()

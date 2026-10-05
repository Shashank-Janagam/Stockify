import pandas as pd

def calculate_ema(close: pd.Series, period: int = 20) -> pd.Series:
    """
    Calculate Exponential Moving Average (EMA).
    """
    return close.ewm(span=period, adjust=False).mean()

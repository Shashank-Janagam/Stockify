import pandas as pd

def calculate_bollinger_bands(close: pd.Series, period: int = 20, std_dev: float = 2.0) -> pd.DataFrame:
    """
    Calculate Bollinger Bands. Returns a DataFrame with upper, middle, and lower bands.
    """
    middle_band = close.rolling(window=period).mean()
    std = close.rolling(window=period).std()
    upper_band = middle_band + (std * std_dev)
    lower_band = middle_band - (std * std_dev)
    
    return pd.DataFrame({
        'upper': upper_band,
        'mid': middle_band,
        'lower': lower_band
    })

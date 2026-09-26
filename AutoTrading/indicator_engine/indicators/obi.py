import pandas as pd

def calculate_obi(bid_volume: pd.Series, ask_volume: pd.Series) -> pd.Series:
    """
    Calculate Order Book Imbalance (OBI).
    """
    total_volume = bid_volume + ask_volume
    # Avoid division by zero
    obi = (bid_volume - ask_volume) / total_volume.replace(0, pd.NA)
    return obi.fillna(0)

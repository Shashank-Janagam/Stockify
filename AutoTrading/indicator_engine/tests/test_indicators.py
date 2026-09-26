import pytest
import pandas as pd
import numpy as np
from indicator_engine.indicators import (
    calculate_sma,
    calculate_ema,
    calculate_rsi,
    calculate_macd,
    calculate_bollinger_bands,
    calculate_obi
)

@pytest.fixture
def sample_close():
    # 10 periods of prices 1..10
    return pd.Series(range(1, 11), dtype=float)

@pytest.fixture
def sample_volumes():
    bid = pd.Series([100, 150, 200, 50, 0])
    ask = pd.Series([50, 150, 100, 100, 0])
    return bid, ask

def test_sma(sample_close):
    result = calculate_sma(sample_close, period=3)
    # index 0,1 are NaN
    assert pd.isna(result.iloc[0])
    assert pd.isna(result.iloc[1])
    assert result.iloc[2] == 2.0  # (1+2+3)/3
    assert result.iloc[9] == 9.0  # (8+9+10)/3

def test_ema(sample_close):
    result = calculate_ema(sample_close, period=3)
    # EMA starts with the first value
    assert result.iloc[0] == 1.0
    # Next is 2.0 * 2/4 + 1.0 * 2/4 = 1.5
    assert result.iloc[1] == 1.5

def test_rsi():
    # Create a simple trend for RSI
    close = pd.Series([10, 11, 12, 13, 14, 13, 12, 11, 10])
    result = calculate_rsi(close, period=2)
    # After strong uptrend, RSI should be high
    assert result.iloc[4] > 70
    # After strong downtrend, RSI should be low
    assert result.iloc[8] < 30

def test_macd(sample_close):
    result = calculate_macd(sample_close, fast=3, slow=5, signal=2)
    assert 'macd' in result.columns
    assert 'macd_signal' in result.columns
    assert 'macd_hist' in result.columns
    assert len(result) == len(sample_close)

def test_bollinger():
    close = pd.Series([10, 10, 10, 10, 10])
    result = calculate_bollinger_bands(close, period=3, std_dev=2.0)
    # With constant prices, std is 0, so upper=middle=lower
    assert result['upper_band'].iloc[-1] == 10.0
    assert result['lower_band'].iloc[-1] == 10.0
    assert result['middle_band'].iloc[-1] == 10.0

def test_obi(sample_volumes):
    bid, ask = sample_volumes
    result = calculate_obi(bid, ask)
    assert result.iloc[0] == (100-50)/(150) # 1/3 ~ 0.333
    assert result.iloc[1] == 0.0 # 150-150
    assert result.iloc[2] == 100/300 # 1/3
    assert result.iloc[3] == -50/150 # -1/3
    assert result.iloc[4] == 0.0 # 0/0 replaced by 0

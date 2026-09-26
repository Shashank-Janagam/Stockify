import pytest
import pandas as pd
from indicator_engine.dsl import (
    ComparisonCondition,
    LogicalCondition,
    IndicatorRef,
    DSLEvaluator
)
from pydantic import ValidationError

@pytest.fixture
def evaluator():
    return DSLEvaluator()

@pytest.fixture
def market_data():
    return pd.DataFrame({
        'close': [10, 12, 14, 16, 18, 16, 14, 12, 10]
    })

def test_greater_than(evaluator, market_data):
    cond = ComparisonCondition(
        indicator='SMA',
        params={'period': 3},
        comparison='>',
        value=13
    )
    result = evaluator.evaluate(cond, market_data)
    # SMAs: NaN, NaN, 12, 14, 16, 16.66, 16, 14, 12
    # > 13: False, False, False, True, True, True, True, True, False
    assert result.iloc[3] == True
    assert result.iloc[8] == False

def test_less_than(evaluator, market_data):
    cond = ComparisonCondition(
        indicator='SMA',
        params={'period': 3},
        comparison='<',
        value=15
    )
    result = evaluator.evaluate(cond, market_data)
    assert result.iloc[2] == True # 12 < 15
    assert result.iloc[4] == False # 16 < 15 is False

def test_indicator_vs_indicator(evaluator, market_data):
    cond = ComparisonCondition(
        indicator='SMA',
        params={'period': 3},
        comparison='>',
        value=IndicatorRef(indicator='SMA', params={'period': 5})
    )
    result = evaluator.evaluate(cond, market_data)
    # When fast SMA > slow SMA
    assert len(result) == len(market_data)

def test_and(evaluator, market_data):
    cond = LogicalCondition(
        operator='AND',
        conditions=[
            ComparisonCondition(indicator='SMA', params={'period': 3}, comparison='>', value=13),
            ComparisonCondition(indicator='SMA', params={'period': 3}, comparison='<', value=16)
        ]
    )
    result = evaluator.evaluate(cond, market_data)
    assert result.iloc[3] == True # 14 is between 13 and 16
    assert result.iloc[4] == False # 16 is not < 16

def test_or(evaluator, market_data):
    cond = LogicalCondition(
        operator='OR',
        conditions=[
            ComparisonCondition(indicator='SMA', params={'period': 3}, comparison='>', value=15),
            ComparisonCondition(indicator='SMA', params={'period': 3}, comparison='<', value=13)
        ]
    )
    result = evaluator.evaluate(cond, market_data)
    assert result.iloc[2] == True # 12 < 13
    assert result.iloc[4] == True # 16 > 15
    assert result.iloc[3] == False # 14 is not < 13 or > 15

def test_nested_conditions(evaluator, market_data):
    cond = LogicalCondition(
        operator='AND',
        conditions=[
            LogicalCondition(
                operator='OR',
                conditions=[
                    ComparisonCondition(indicator='SMA', params={'period': 3}, comparison='>', value=15),
                    ComparisonCondition(indicator='SMA', params={'period': 3}, comparison='<', value=13)
                ]
            ),
            ComparisonCondition(indicator='SMA', params={'period': 3}, comparison='!=', value=12)
        ]
    )
    result = evaluator.evaluate(cond, market_data)
    assert result.iloc[2] == False # 12 < 13 is True, but 12 != 12 is False
    assert result.iloc[4] == True # 16 > 15 is True, 16 != 12 is True

def test_invalid_dsl():
    with pytest.raises(ValidationError):
        ComparisonCondition(
            indicator='SMA',
            comparison='INVALID',
            value=10
        )

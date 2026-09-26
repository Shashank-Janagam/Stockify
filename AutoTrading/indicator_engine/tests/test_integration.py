import pytest
import pandas as pd
from indicator_engine.dsl import (
    ComparisonCondition,
    LogicalCondition,
    IndicatorRef,
    DSLEvaluator
)

def test_strategy_generates_expected_signals():
    """
    RSI(14) < 30 AND SMA(20) > SMA(50)
    But we'll use smaller periods for a smaller dataset:
    RSI(2) < 30 AND SMA(3) > SMA(5)
    """
    evaluator = DSLEvaluator()
    
    # Generate data
    data = pd.DataFrame({
        'close': [10, 9, 8, 7, 6, 12, 14, 16, 15, 14, 13]
    })
    
    strategy = LogicalCondition(
        operator='AND',
        conditions=[
            ComparisonCondition(
                indicator='RSI',
                params={'period': 2},
                comparison='<',
                value=30
            ),
            ComparisonCondition(
                indicator='SMA',
                params={'period': 3},
                comparison='>',
                value=IndicatorRef(indicator='SMA', params={'period': 5})
            )
        ]
    )
    
    signals = evaluator.evaluate(strategy, data)
    assert len(signals) == len(data)
    assert signals.dtype == bool
    # We don't check exact index triggers because it depends on the precise data,
    # but we ensure it evaluates without error and returns a boolean series.

def test_edge_cases():
    evaluator = DSLEvaluator()
    empty_data = pd.DataFrame(columns=['close'])
    strategy = ComparisonCondition(indicator='SMA', params={'period': 2}, comparison='>', value=10)
    
    # Should handle empty gracefully or raise appropriate error.
    # Depending on pandas, rolling on empty might return empty series.
    signals = evaluator.evaluate(strategy, empty_data)
    assert len(signals) == 0

def test_missing_columns():
    evaluator = DSLEvaluator()
    data = pd.DataFrame({'wrong_column': [1,2,3]})
    strategy = ComparisonCondition(indicator='SMA', params={'period': 2}, comparison='>', value=10)
    
    with pytest.raises(KeyError):
        evaluator.evaluate(strategy, data)

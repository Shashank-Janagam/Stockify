import pandas as pd
from typing import Union, Any
from .models import Strategy, ComparisonCondition, LogicalCondition, IndicatorRef
from ..registry import registry

class DSLEvaluator:
    def __init__(self, registry=registry):
        self.registry = registry

    def evaluate(self, strategy: Strategy, market_data: pd.DataFrame) -> pd.DataFrame:
        if isinstance(strategy, LogicalCondition):
            return self._evaluate_logical(strategy, market_data)
        elif isinstance(strategy, ComparisonCondition):
            return self._evaluate_comparison(strategy, market_data)
        else:
            raise ValueError(f"Unknown strategy type: {type(strategy)}")

    def _evaluate_logical(self, condition: LogicalCondition, market_data: pd.DataFrame) -> pd.DataFrame:
        if not condition.conditions:
            raise ValueError("Logical condition must have at least one sub-condition.")
            
        results = [self.evaluate(cond, market_data) for cond in condition.conditions]
        
        import numpy as np
        combined_signal = results[0]['signal']
        combined_reason = results[0]['reason'].copy()
        
        for res in results[1:]:
            if condition.operator == 'AND':
                combined_signal = combined_signal & res['signal']
                combined_reason = combined_reason + " AND " + res['reason']
            elif condition.operator == 'OR':
                new_signal = combined_signal | res['signal']
                # If already true, keep old reason. If newly true from this res, use new reason.
                combined_reason = np.where(
                    combined_signal, 
                    combined_reason, 
                    res['reason']
                )
                combined_signal = new_signal
                
        return pd.DataFrame({'signal': combined_signal, 'reason': pd.Series(combined_reason, index=market_data.index)})

    def _evaluate_comparison(self, condition: ComparisonCondition, market_data: pd.DataFrame) -> pd.Series:
        # Calculate LHS
        lhs_series = self.registry.calculate(condition.indicator, market_data, condition.params)
        
        # Handle DataFrame return types (like MACD, Bollinger Bands)
        # We need to extract the relevant Series based on standard naming or user input.
        # But wait, how do we know which column? 
        # Typically, a single value is expected for comparison. 
        # For simplicity, if it's a DataFrame, maybe we just use it directly, but comparison with scalar won't work well without column specification.
        # Let's assume the indicator returns a Series, or the user passes a specific series.
        # If DataFrame, we might need a way to select the column. Let's add a quick hack to pick a column if specified in params, else error if DataFrame.
        if isinstance(lhs_series, pd.DataFrame):
            if 'column' in condition.params:
                lhs_series = lhs_series[condition.params['column']]
            else:
                # default to the first column if not specified, though it's risky
                lhs_series = lhs_series.iloc[:, 0]

        # Calculate RHS
        if isinstance(condition.value, IndicatorRef):
            rhs_value = self.registry.calculate(condition.value.indicator, market_data, condition.value.params)
            if isinstance(rhs_value, pd.DataFrame):
                if 'column' in condition.value.params:
                    rhs_value = rhs_value[condition.value.params['column']]
                else:
                    rhs_value = rhs_value.iloc[:, 0]
        else:
            rhs_value = condition.value
            
        # Ensure lengths match if RHS is a Series
        # But pandas aligns by index naturally
        
        # Perform comparison
        if condition.comparison == '>':
            signal = lhs_series > rhs_value
        elif condition.comparison == '<':
            signal = lhs_series < rhs_value
        elif condition.comparison == '>=':
            signal = lhs_series >= rhs_value
        elif condition.comparison == '<=':
            signal = lhs_series <= rhs_value
        elif condition.comparison == '==':
            signal = lhs_series == rhs_value
        elif condition.comparison == '!=':
            signal = lhs_series != rhs_value
        else:
            raise ValueError(f"Unknown comparison operator: {condition.comparison}")

        # Build reason string
        param_str = ','.join(f'{k}={v}' for k,v in (condition.params or {}).items())
        indicator_str = f"{condition.indicator}({param_str})"
        
        lhs_rounded = lhs_series.round(2).astype(str)
        
        if isinstance(condition.value, IndicatorRef):
            r_param_str = ','.join(f'{k}={v}' for k,v in (condition.value.params or {}).items())
            rhs_str = f"{condition.value.indicator}({r_param_str})"
            rhs_rounded = rhs_value.round(2).astype(str)
            reason_series = indicator_str + "=" + lhs_rounded + " " + condition.comparison + " " + rhs_str + "=" + rhs_rounded
        else:
            rhs_str = str(condition.value)
            reason_series = indicator_str + "=" + lhs_rounded + " " + condition.comparison + " " + rhs_str
            
        return pd.DataFrame({'signal': signal, 'reason': reason_series})

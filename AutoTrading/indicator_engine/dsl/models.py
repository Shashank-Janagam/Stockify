from typing import List, Dict, Any, Union, Literal
from pydantic import BaseModel, Field

class IndicatorRef(BaseModel):
    indicator: str
    params: Dict[str, Any] = Field(default_factory=dict)

class ComparisonCondition(BaseModel):
    indicator: str
    params: Dict[str, Any] = Field(default_factory=dict)
    comparison: Literal['>', '<', '>=', '<=', '==', '!=']
    value: Union[float, int, IndicatorRef]

class LogicalCondition(BaseModel):
    operator: Literal['AND', 'OR']
    conditions: List[Union['ComparisonCondition', 'LogicalCondition']]

# This allows for nested recursive definitions
LogicalCondition.model_rebuild()

ConditionNode = Union[ComparisonCondition, LogicalCondition]
Strategy = ConditionNode

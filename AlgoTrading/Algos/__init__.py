"""
algos/__init__.py — PaperBull Strategy Framework Public API
============================================================
Import everything you need from this single entry point:

    from algos import StrategyManager, BacktestEngine, Candle

Quick Start
-----------
    from algos import StrategyManager, Candle
    from algos.strategies import EMAStrategy   # triggers self-registration

    mgr = StrategyManager(capital=100_000)
    mgr.load("EMA", params={"fast_period": 9, "slow_period": 21})

    candles = [Candle(...), ...]
    results = mgr.run_all(candles, symbol="RELIANCE")
"""

# Core
from .core.signal        import Signal, SignalType, buy_signal, sell_signal, hold_signal
from .core.base_strategy import BaseStrategy, Candle

# Engines (singletons)
from .indicators.indicator_engine     import indicator_engine
from .conditions.condition_engine     import condition_engine
from .signals.signal_engine           import signal_engine
from .risk.risk_engine                import risk_engine
from .sizing.position_sizing_engine   import position_sizing_engine
from .registry.strategy_registry      import strategy_registry

# Classes
from .manager.strategy_manager        import StrategyManager, RunResult
from .backtesting.backtest_engine     import BacktestEngine, BacktestReport
from .execution.execution_engine      import ExecutionEngineClass, ExecutionMode
from .sizing.position_sizing_engine   import SizingMode
from .risk.risk_engine                import RiskConfig

# Conditions (commonly used)
from .conditions.comparators          import (
    GreaterThan, LessThan, Equal, CrossAbove, CrossBelow, Between,
    greater_than, less_than, cross_above, cross_below,
)
from .conditions.logical_operators    import AND, OR, NOT, AT_LEAST

__version__ = "1.0.0"
__author__  = "PaperBull"

__all__ = [
    # Core types
    "Signal", "SignalType", "buy_signal", "sell_signal", "hold_signal",
    "BaseStrategy", "Candle",
    # Singleton engines
    "indicator_engine", "condition_engine", "signal_engine",
    "risk_engine", "position_sizing_engine", "strategy_registry",
    # Orchestrators
    "StrategyManager", "RunResult",
    "BacktestEngine", "BacktestReport",
    # Enums / configs
    "ExecutionMode", "SizingMode", "RiskConfig",
    # Conditions
    "GreaterThan", "LessThan", "Equal", "CrossAbove", "CrossBelow", "Between",
    "greater_than", "less_than", "cross_above", "cross_below",
    "AND", "OR", "NOT", "AT_LEAST",
]

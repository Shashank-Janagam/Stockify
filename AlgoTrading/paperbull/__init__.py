"""
paperbull/__init__.py — PaperBull-Native Strategy API
======================================================
Public entry point for the PaperBull user-facing API.

Quick Start
-----------
    from paperbull import Strategy, run_backtest

    class MyStrategy(Strategy):

        def initialize(self):
            self.set_capital(500_000)
            self.set_resolution("daily")

        def universe(self, stocks):
            return stocks.filter(min_price=100, min_volume=1_000_000).top(10)

        def on_data(self, data):
            rsi = self.indicator.RSI(data.symbol, 14)
            if rsi and rsi < 30:
                self.buy(data.symbol, 0.10)
            elif rsi and rsi > 70:
                self.sell(data.symbol)

    report = run_backtest(
        strategy = MyStrategy(),
        symbol   = "RELIANCE.NS",
        start    = "2023-01-01",
        end      = "2024-01-01",
        capital  = 500_000,
    )
    report.print_summary()

Architecture
------------
    User Strategy
        │
        │  paperbull API (this package)
        ▼
    ┌──────────────────────┐
    │  Strategy            │  ← user subclasses this
    │  ├─ indicator        │  ← IndicatorFacade
    │  ├─ portfolio        │  ← PortfolioEngine
    │  └─ buy/sell/...     │  ← order methods
    └──────────┬───────────┘
               │
    ┌──────────▼───────────┐
    │ _PaperBullAdapter    │  ← bridges to internal BaseStrategy
    └──────────┬───────────┘
               │  (internal Algos framework — hidden from user)
    ┌──────────▼───────────┐
    │  BacktestEngine      │
    │  RiskEngine          │
    │  ExecutionEngine     │
    └──────────────────────┘
"""

from .strategy        import Strategy, DataBar
from .runner          import run_backtest, MultiSymbolReport
from .stock_list      import StockList, StockMeta, build_stock_list_from_candles
from .portfolio_engine import PortfolioEngine, Holding
from .indicator_facade import (
    IndicatorFacade,
    MACDResult,
    BBResult,
    SuperTrendResult,
)

__version__ = "1.0.0"
__author__  = "PaperBull"

__all__ = [
    # Core user API
    "Strategy",
    "DataBar",
    "run_backtest",
    "MultiSymbolReport",

    # Universe
    "StockList",
    "StockMeta",
    "build_stock_list_from_candles",

    # Portfolio
    "PortfolioEngine",
    "Holding",

    # Indicators
    "IndicatorFacade",
    "MACDResult",
    "BBResult",
    "SuperTrendResult",
]

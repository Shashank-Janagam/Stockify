"""
tools/ai_analytics.py — AI Behavioral Finance, Portfolio AI Evaluation, Forecasts, and Backtesting Tools
"""

from typing import Any, Dict, Optional
from client import _make_request
from config import mcp

@mcp.tool()
def analyze_portfolio_behavior_ai(session_cookie: Optional[str] = None) -> Any:
    """Perform an in-depth AI Behavioral Finance audit of trading patterns, emotional discipline (FOMO, revenge trading), and risk scores.

    Args:
        session_cookie: Optional session cookie for authenticated user.
    """
    return _make_request(
        "/api/ai/analyze-portfolio",
        method="POST",
        session_cookie=session_cookie,
        timeout=30,
    )


@mcp.tool()
def get_portfolio_ai_eval(session_cookie: Optional[str] = None) -> Any:
    """Get quantitative AI metrics including BullScore (0-100), win rate, Sharpe ratio, and dynamic capital allocation.

    Args:
        session_cookie: Optional session cookie for authenticated user.
    """
    return _make_request("/api/portfolio/ai-eval", session_cookie=session_cookie, timeout=20)


@mcp.tool()
def get_portfolio_forecasts(session_cookie: Optional[str] = None) -> Any:
    """Retrieve deep learning (LSTM) price forecasts (1D, 7D targets, uncertainty, trade signals) for all held stocks.

    Args:
        session_cookie: Optional session cookie for authenticated user.
    """
    return _make_request("/api/portfolio/forecasts", session_cookie=session_cookie, timeout=25)


@mcp.tool()
def run_backtest_strategy(
    symbol: str,
    strategy: str = "SMA_Crossover",
    period: str = "1y",
    config: Optional[Dict[str, Any]] = None,
) -> Any:
    """Execute algorithmic trading backtesting on historical stock candle data.

    Args:
        symbol: Stock ticker symbol (e.g. 'RELIANCE', 'TCS').
        strategy: Strategy name (e.g. 'SMA_Crossover', 'RSI_Oversold_Overbought', 'MACD').
        period: Historical lookback period (e.g. '3mo', '6mo', '1y', '2y').
        config: Optional strategy parameters (e.g. {'fast_period': 10, 'slow_period': 50}).
    """
    body = {
        "symbol": symbol.strip().upper(),
        "strategy": strategy,
        "period": period,
        "config": config or {},
    }
    return _make_request("/api/algo/backtest", method="POST", body=body, timeout=30)


@mcp.tool()
def get_algo_capabilities() -> Any:
    """Get the supported algorithmic backtesting strategies, indicators, and parameter schemas."""
    return _make_request("/api/algo/capabilities")

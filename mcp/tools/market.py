"""
tools/market.py — Market Data, Stock Exploration, Quotes, History, and News MCP Tools
"""

from typing import Any, Optional
from config import mcp
import market_service

@mcp.tool()
def search_stocks(query: str) -> Any:
    """Search for Indian stocks, companies, ETFs, and ticker symbols (sub-millisecond in-memory search).

    Args:
        query: Company name or ticker symbol to search for (minimum 1 character).
    """
    clean_q = query.strip()
    if not clean_q:
        return {"error": "Query cannot be empty."}
    return market_service.search_stocks_direct(clean_q)


@mcp.tool()
def get_stock_quote(symbol: str) -> Any:
    """Get the live market price quote, price change, high/low, and volume for an Indian stock ticker (direct from Yahoo Finance).

    Args:
        symbol: Stock ticker symbol (e.g. 'RELIANCE', 'TCS', 'TATAMOTORS', 'HDFCBANK').
    """
    clean_sym = symbol.strip().upper()
    return market_service.get_live_stock_quote(clean_sym)


@mcp.tool()
def get_stock_history(symbol: str, days: str = "1") -> Any:
    """Get historical candle price data (OHLCV) for a stock ticker (direct from Yahoo Finance).

    Args:
        symbol: Stock ticker symbol (e.g. 'RELIANCE', 'TCS', 'HDFCBANK').
        days: Number of days of historical data (e.g. '1', '7', '30', '365', or 'ALL'). Default is '1'.
    """
    clean_sym = symbol.strip().upper()
    return market_service.get_stock_history_data(clean_sym, days=days)


@mcp.tool()
def get_stock_profile(symbol: str) -> Any:
    """Get fundamental corporate profile, company details, sector, and industry for a stock ticker.

    Args:
        symbol: Stock ticker symbol (e.g. 'RELIANCE', 'TCS', 'INFY').
    """
    clean_sym = symbol.strip().upper()
    return market_service.get_stock_profile_direct(clean_sym)


@mcp.tool()
def get_similar_stocks(symbol: str) -> Any:
    """Get peer and sector-similar stocks for comparison.

    Args:
        symbol: Stock ticker symbol (e.g. 'RELIANCE', 'TCS', 'INFY').
    """
    clean_sym = symbol.strip().upper()
    return market_service.get_similar_stocks_direct(clean_sym)


@mcp.tool()
def get_stock_list() -> Any:
    """Get tradable Indian stocks and tickers from the in-memory instrument catalog."""
    return market_service.get_stock_list_direct()


@mcp.tool()
def get_market_news(category: Optional[str] = None, limit: int = 10) -> Any:
    """Get latest financial and Indian stock market news feeds.

    Args:
        category: Optional category filter (e.g. 'markets', 'economy', 'stocks', 'ipo').
        limit: Number of news articles to retrieve (default 10).
    """
    return market_service.get_market_news_direct(category=category, limit=limit)

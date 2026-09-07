"""
resources.py — MCP Contextual Data Resources for Stockify
"""

import json
from client import _make_request
from config import mcp
import market_service

@mcp.resource("stockify://account/summary")
def get_account_summary_resource() -> str:
    """Resource providing real-time account cash balance and open holdings snapshot."""
    balance = _make_request("/api/getBalance/getBalance")
    portfolio = _make_request("/api/portfolio/summary")
    return json.dumps({
        "balance": balance,
        "portfolio": portfolio,
    }, indent=2)


@mcp.resource("stockify://market/latest-news")
def get_latest_news_resource() -> str:
    """Resource providing the latest market headline stream."""
    news = market_service.get_market_news_direct(limit=5)
    return json.dumps(news, indent=2)

"""
tools/portfolio.py — User Portfolio, Balances, Live Valuation, and Asset Allocation MCP Tools
"""

from typing import Any, Optional
from client import _make_request
from config import DEFAULT_USER_ID, mcp

@mcp.tool()
def get_user_balance(
    user_id: Optional[str] = None,
    session_cookie: Optional[str] = None,
) -> Any:
    """Retrieve the available wallet cash, blocked margin, and total balance for a user.

    Args:
        user_id: Optional user ID or UID to query balance for.
        session_cookie: Optional session cookie for authenticated user.
    """
    uid = user_id or DEFAULT_USER_ID
    params = {"uid": uid} if uid else {}
    return _make_request("/api/getBalance/getBalance", params=params, session_cookie=session_cookie)


@mcp.tool()
def get_user_holdings(session_cookie: Optional[str] = None) -> Any:
    """Retrieve active stock holdings, invested value, current market value, and unrealized P&L.

    Args:
        session_cookie: Optional session cookie for authenticated user.
    """
    data = _make_request("/api/portfolio/summary", session_cookie=session_cookie)
    if isinstance(data, dict) and "holdings" in data:
        return {
            "summary": data.get("summary", {}),
            "holdings": data.get("holdings", []),
        }
    return data


@mcp.tool()
def get_portfolio_summary(fresh: bool = False, session_cookie: Optional[str] = None) -> Any:
    """Retrieve full portfolio summary including total returns, realized/unrealized P&L, holdings, and chart data.

    Args:
        fresh: Set to True to bypass Redis cache and recompute immediately.
        session_cookie: Optional session cookie for authenticated user.
    """
    params = {"fresh": "1"} if fresh else {}
    return _make_request("/api/portfolio/summary", params=params, session_cookie=session_cookie)


@mcp.tool()
def get_portfolio_live_stats(session_cookie: Optional[str] = None) -> Any:
    """Get live, un-cached portfolio valuation (current value, invested amount, day change, total returns).

    Args:
        session_cookie: Optional session cookie for authenticated user.
    """
    return _make_request("/api/portfolio/live-stats", session_cookie=session_cookie)


@mcp.tool()
def get_portfolio_allocation(strategy: str = "equal-weight", session_cookie: Optional[str] = None) -> Any:
    """Get portfolio asset allocation suggestions using quantitative optimization strategies.

    Args:
        strategy: Optimization strategy ('equal-weight', 'mvo' for Mean-Variance Optimization, or 'hrp' for Hierarchical Risk Parity).
        session_cookie: Optional session cookie for authenticated user.
    """
    return _make_request("/api/portfolio/allocation", params={"strategy": strategy}, session_cookie=session_cookie)

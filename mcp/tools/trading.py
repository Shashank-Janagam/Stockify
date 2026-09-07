"""
tools/trading.py — Order Execution (Buy/Sell), Historical Orders, Stop-Loss and Transactions MCP Tools
"""

from typing import Any, Optional
from client import _make_request
from config import mcp

@mcp.tool()
def buy_stock(
    symbol: str,
    quantity: int,
    product_type: str = "Delivery",
    sl_enabled: bool = False,
    sl_price: Optional[float] = None,
    session_cookie: Optional[str] = None,
) -> Any:
    """Execute a BUY order for a specified stock ticker on Stockify.

    Args:
        symbol: Stock ticker symbol (e.g. 'INFY', 'RELIANCE', 'TCS').
        quantity: Number of shares to purchase (must be > 0).
        product_type: 'Delivery' (holding/cash) or 'Intraday'. Default is 'Delivery'.
        sl_enabled: Whether to enable stop-loss trigger order.
        sl_price: Stop-loss trigger price if sl_enabled is True.
        session_cookie: Optional session cookie for authenticated user.
    """
    if quantity <= 0:
        return {"error": "Quantity must be greater than 0."}

    body = {
        "symbol": symbol.strip().upper(),
        "quantity": int(quantity),
        "product_type": product_type,
        "sl_enabled": bool(sl_enabled),
    }
    if sl_price is not None:
        body["sl_price"] = float(sl_price)

    return _make_request(
        "/api/orderExecution/buy",
        method="POST",
        body=body,
        session_cookie=session_cookie,
    )


@mcp.tool()
def sell_stock(
    symbol: str,
    quantity: int,
    product_type: str = "Delivery",
    sl_enabled: bool = False,
    sl_price: Optional[float] = None,
    session_cookie: Optional[str] = None,
) -> Any:
    """Execute a SELL order for a held stock ticker on Stockify.

    Args:
        symbol: Stock ticker symbol (e.g. 'INFY', 'RELIANCE', 'TCS').
        quantity: Number of shares to sell (must be > 0).
        product_type: 'Delivery' (holding/cash) or 'Intraday'. Default is 'Delivery'.
        sl_enabled: Whether to enable stop-loss trigger order.
        sl_price: Stop-loss trigger price if sl_enabled is True.
        session_cookie: Optional session cookie for authenticated user.
    """
    if quantity <= 0:
        return {"error": "Quantity must be greater than 0."}

    body = {
        "symbol": symbol.strip().upper(),
        "quantity": int(quantity),
        "product_type": product_type,
        "sl_enabled": bool(sl_enabled),
    }
    if sl_price is not None:
        body["sl_price"] = float(sl_price)

    return _make_request(
        "/api/sellStock/sell",
        method="POST",
        body=body,
        session_cookie=session_cookie,
    )


@mcp.tool()
def get_user_orders(page: int = 1, limit: int = 20, session_cookie: Optional[str] = None) -> Any:
    """Retrieve historical trade orders (BUY/SELL) executed by the user.

    Args:
        page: Page number for pagination (default 1).
        limit: Number of orders per page (default 20).
        session_cookie: Optional session cookie for authenticated user.
    """
    return _make_request(
        "/api/holdings/orders",
        params={"page": page, "limit": limit},
        session_cookie=session_cookie,
    )


@mcp.tool()
def get_pending_stoploss_orders(session_cookie: Optional[str] = None) -> Any:
    """Retrieve all pending stop-loss orders waiting for trigger price.

    Args:
        session_cookie: Optional session cookie for authenticated user.
    """
    return _make_request("/api/holdings/pending-stoploss", session_cookie=session_cookie)


@mcp.tool()
def cancel_stoploss_order(order_id: int, session_cookie: Optional[str] = None) -> Any:
    """Cancel a pending stop-loss order by ID.

    Args:
        order_id: Numeric ID of the pending stop-loss order.
        session_cookie: Optional session cookie for authenticated user.
    """
    return _make_request(
        f"/api/holdings/cancel-stoploss/{order_id}",
        method="DELETE",
        session_cookie=session_cookie,
    )


@mcp.tool()
def get_user_transactions(session_cookie: Optional[str] = None) -> Any:
    """Retrieve wallet transaction history, deposits, credits, and debits for the user.

    Args:
        session_cookie: Optional session cookie for authenticated user.
    """
    return _make_request("/api/transactions", session_cookie=session_cookie)

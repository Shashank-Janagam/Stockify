import os
import json
import requests
from typing import Optional
from langchain_core.tools import tool
from langchain_core.runnables.config import RunnableConfig

NODE_BACKEND_URL = os.getenv("STOCKIFY_API_URL", "http://localhost:4000")


def _get_headers(uid: str) -> dict:
    """Internal auth headers for Aegis → Node.js backend service calls."""
    return {
        "x-user-uid": uid,
        "x-bypass-auth": "true",
        "Content-Type": "application/json",
    }


def _uid_from_config(config: RunnableConfig) -> Optional[str]:
    return config.get("configurable", {}).get("uid")


# ─────────────────────────────────────────────────────────────
# PORTFOLIO TOOLS
# ─────────────────────────────────────────────────────────────

@tool
def check_portfolio(config: RunnableConfig) -> str:
    """
    Retrieve the user's current live portfolio: summary stats, open holdings/positions, and realized PnL.
    Use this to answer questions about the user's account balance, investments, PnL, or current stocks owned.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found in configuration. Cannot access portfolio."})

    headers = _get_headers(uid)

    try:
        stats_res = requests.get(f"{NODE_BACKEND_URL}/api/portfolio/live-stats", headers=headers, timeout=10)
        stats = stats_res.json() if stats_res.status_code == 200 else {"error": stats_res.text}
    except Exception as e:
        stats = {"error": str(e)}

    try:
        summary_res = requests.get(f"{NODE_BACKEND_URL}/api/portfolio/summary", headers=headers, timeout=10)
        summary = summary_res.json() if summary_res.status_code == 200 else {"error": summary_res.text}
    except Exception as e:
        summary = {"error": str(e)}

    return json.dumps({
        "live_stats": stats,
        "portfolio_summary": summary,
    }, default=str)


@tool
def get_user_balance(config: RunnableConfig) -> str:
    """
    Retrieve the user's available wallet cash, blocked margin, and total account balance.
    Use this when the user asks specifically about their cash, wallet, or available funds.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found in configuration."})
    try:
        res = requests.get(
            f"{NODE_BACKEND_URL}/api/getBalance/getBalance",
            params={"uid": uid},
            headers=_get_headers(uid),
            timeout=10,
        )
        return res.text if res.status_code == 200 else json.dumps({"error": res.text})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_portfolio_allocation(strategy: str = "equal-weight", config: RunnableConfig = None) -> str:
    """
    Get portfolio asset allocation suggestions using quantitative optimization strategies.
    Use this when the user asks how to optimally allocate or rebalance their portfolio.

    Args:
        strategy: 'equal-weight', 'mvo' (Mean-Variance Optimization), or 'hrp' (Hierarchical Risk Parity).
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found."})
    try:
        res = requests.get(
            f"{NODE_BACKEND_URL}/api/portfolio/allocation",
            params={"strategy": strategy},
            headers=_get_headers(uid),
            timeout=15,
        )
        return res.text if res.status_code == 200 else json.dumps({"error": res.text})
    except Exception as e:
        return json.dumps({"error": str(e)})


# ─────────────────────────────────────────────────────────────
# TRADING / ORDER TOOLS
# ─────────────────────────────────────────────────────────────

@tool
def get_user_orders(page: int = 1, limit: int = 20, config: RunnableConfig = None) -> str:
    """
    Retrieve the user's historical trade orders (BUY/SELL) with pagination.
    Use this when the user asks about their trade history, past orders, or previous transactions.

    Args:
        page: Page number (default 1).
        limit: Number of orders per page (default 20).
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found."})
    try:
        res = requests.get(
            f"{NODE_BACKEND_URL}/api/holdings/orders",
            params={"page": page, "limit": limit},
            headers=_get_headers(uid),
            timeout=10,
        )
        return res.text if res.status_code == 200 else json.dumps({"error": res.text})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_pending_stoploss_orders(config: RunnableConfig) -> str:
    """
    Retrieve all pending stop-loss orders waiting for their trigger price.
    Use this when the user asks about their active stop-loss orders or risk controls.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found."})
    try:
        res = requests.get(
            f"{NODE_BACKEND_URL}/api/holdings/pending-stoploss",
            headers=_get_headers(uid),
            timeout=10,
        )
        return res.text if res.status_code == 200 else json.dumps({"error": res.text})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def cancel_stoploss_order(order_id: int, config: RunnableConfig) -> str:
    """
    Cancel a specific pending stop-loss order by its ID.
    Use this ONLY when the user explicitly requests to cancel a stop-loss.

    Args:
        order_id: Numeric ID of the pending stop-loss order to cancel.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found."})
    try:
        res = requests.delete(
            f"{NODE_BACKEND_URL}/api/holdings/cancel-stoploss/{order_id}",
            headers=_get_headers(uid),
            timeout=10,
        )
        return res.text if res.status_code == 200 else json.dumps({"error": res.text})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_user_transactions(config: RunnableConfig) -> str:
    """
    Retrieve the user's wallet transaction history including deposits, credits, debits, and fund transfers.
    Use this when the user asks about money movements, wallet history, or fund activity.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found."})
    try:
        res = requests.get(
            f"{NODE_BACKEND_URL}/api/transactions",
            headers=_get_headers(uid),
            timeout=10,
        )
        return res.text if res.status_code == 200 else json.dumps({"error": res.text})
    except Exception as e:
        return json.dumps({"error": str(e)})


# ─────────────────────────────────────────────────────────────
# TRADE EXECUTION
# ─────────────────────────────────────────────────────────────

@tool
def buy_stock(symbol: str, quantity: int, product_type: str = "Delivery", sl_enabled: bool = False, sl_price: Optional[float] = None, config: RunnableConfig = None) -> str:
    """
    Execute a BUY order for a specified stock ticker on Stockify.

    Args:
        symbol: Stock ticker symbol (e.g. 'INFY', 'RELIANCE', 'TCS').
        quantity: Number of shares to purchase (must be > 0).
        product_type: 'Delivery' (holding/cash) or 'Intraday'. Default is 'Delivery'.
        sl_enabled: Whether to enable stop-loss trigger order.
        sl_price: Stop-loss trigger price if sl_enabled is True.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User authentication required to place trades."})

    if quantity <= 0:
        return json.dumps({"error": "Quantity must be greater than 0."})

    body = {
        "symbol": symbol.strip().upper(),
        "quantity": int(quantity),
        "product_type": product_type,
        "sl_enabled": bool(sl_enabled),
    }
    if sl_price is not None:
        body["sl_price"] = float(sl_price)

    try:
        res = requests.post(
            f"{NODE_BACKEND_URL}/api/orderExecution/buy",
            json=body,
            headers=_get_headers(uid),
            timeout=10,
        )
        return res.text if res.status_code in (200, 201) else json.dumps({"error": res.text})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def sell_stock(symbol: str, quantity: int, product_type: str = "Delivery", sl_enabled: bool = False, sl_price: Optional[float] = None, config: RunnableConfig = None) -> str:
    """
    Execute a SELL order for a held stock ticker on Stockify.

    Args:
        symbol: Stock ticker symbol (e.g. 'INFY', 'RELIANCE', 'TCS').
        quantity: Number of shares to sell (must be > 0).
        product_type: 'Delivery' (holding/cash) or 'Intraday'. Default is 'Delivery'.
        sl_enabled: Whether to enable stop-loss trigger order.
        sl_price: Stop-loss trigger price if sl_enabled is True.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User authentication required to place trades."})

    if quantity <= 0:
        return json.dumps({"error": "Quantity must be greater than 0."})

    body = {
        "symbol": symbol.strip().upper(),
        "quantity": int(quantity),
        "product_type": product_type,
        "sl_enabled": bool(sl_enabled),
    }
    if sl_price is not None:
        body["sl_price"] = float(sl_price)

    try:
        res = requests.post(
            f"{NODE_BACKEND_URL}/api/sellStock/sell",
            json=body,
            headers=_get_headers(uid),
            timeout=10,
        )
        return res.text if res.status_code in (200, 201) else json.dumps({"error": res.text})
    except Exception as e:
        return json.dumps({"error": str(e)})

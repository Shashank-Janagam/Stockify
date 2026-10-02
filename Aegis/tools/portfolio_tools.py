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
        print(uid)
        res = requests.get(
            f"{NODE_BACKEND_URL}/api/getBalance/getBalance",
            params={"uid": uid},
            headers=_get_headers(uid),
            timeout=10,
        )
        if res.status_code == 200:
            data = res.json()
            if "blocked" in data:
                del data["blocked"]
            return json.dumps(data)
        return json.dumps({"error": res.text})
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



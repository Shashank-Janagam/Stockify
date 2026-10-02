import os
import json
import requests
from typing import Optional
from langchain_core.tools import tool
from langchain_core.runnables.config import RunnableConfig

NODE_BACKEND_URL = os.getenv("STOCKIFY_API_URL", "http://localhost:4000")
PYTHON_ALGO_URL = "http://localhost:8000"

def _get_headers(uid: str) -> dict:
    """Internal auth headers for Aegis → Node.js backend service calls."""
    return {
        "x-user-uid": uid,
        "x-bypass-auth": "true",
        "Content-Type": "application/json",
    }

def _uid_from_config(config: RunnableConfig) -> Optional[str]:
    return config.get("configurable", {}).get("uid")

@tool
def get_active_algo_sessions(config: RunnableConfig) -> str:
    """
    Retrieve the user's currently active algorithmic trading sessions.
    Returns a list of running strategies, their symbols, allocated capital, and current PnL.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found in configuration. Cannot access algo sessions."})

    try:
        res = requests.get(f"{PYTHON_ALGO_URL}/live/sessions/{uid}", timeout=10)
        sessions = res.json() if res.status_code == 200 else {"error": res.text}
        return json.dumps(sessions)
    except Exception as e:
        return json.dumps({"error": str(e)})

@tool
def get_saved_strategies(config: RunnableConfig) -> str:
    """
    Fetch the list of custom trading strategies saved by the user (PaperBull strategies).
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found in configuration."})

    headers = _get_headers(uid)
    try:
        # Note: the endpoint is in paperbull.routes.js in Stockify-Backend
        res = requests.get(f"{NODE_BACKEND_URL}/api/paperbull/strategies", headers=headers, timeout=10)
        strategies = res.json() if res.status_code == 200 else {"error": res.text}
        return json.dumps(strategies)
    except Exception as e:
        return json.dumps({"error": str(e)})

@tool
def start_algo_session(config: RunnableConfig, strategy: str, symbol: str = None, capital: float = None, mode: str = "simulate") -> str:
    """
    Start a new algorithmic trading session for a given strategy.
    Args:
        strategy: The name of the saved PaperBull strategy to run.
        symbol: The stock symbol (e.g. 'RELIANCE'). If not provided, it will be automatically inferred from the strategy's saved tickers.
        capital: The amount of money to allocate to this bot. If not provided, it will be automatically inferred from the strategy's saved capital.
        mode: 'simulate' (paper trading) or 'upstox' (live market). Default is 'simulate'.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found."})

    headers = _get_headers(uid)
    
    if not symbol or not capital:
        try:
            res = requests.get(f"{NODE_BACKEND_URL}/api/paperbull/strategies", headers=headers, timeout=10)
            if res.status_code == 200:
                strats = res.json()
                strat = next((s for s in strats if s.get('name', '').lower() == strategy.lower()), None)
                if strat:
                    if not symbol and strat.get('tickers') and len(strat['tickers']) > 0:
                        symbol = strat['tickers'][0]
                    if not capital and strat.get('capital'):
                        capital = float(strat['capital'])
        except Exception:
            pass
            
    if not symbol:
        return json.dumps({"error": "Could not determine symbol to trade. Please provide one."})
    if not capital:
        return json.dumps({"error": "Could not determine capital to allocate. Please provide one."})

    try:
        # 1. Deduct capital from wallet via Node backend
        node_res = requests.post(
            f"{NODE_BACKEND_URL}/api/algo/session/start", 
            json={"capital": capital, "symbol": symbol, "strategyName": strategy}, 
            headers=headers, 
            timeout=10
        )
        if node_res.status_code != 200:
            return json.dumps({"error": f"Failed to allocate capital: {node_res.text}"})

        # 2. Start the algorithm via Python backend
        py_res = requests.post(
            f"{PYTHON_ALGO_URL}/live/start",
            json={
                "symbol": symbol,
                "strategyName": strategy,
                "userId": uid,
                "allocatedCapital": capital,
                "mode": mode
            },
            timeout=10
        )
        if py_res.status_code != 200:
            return json.dumps({"error": f"Capital allocated, but algo start failed: {py_res.text}"})

        return json.dumps(py_res.json())
    except Exception as e:
        return json.dumps({"error": str(e)})

@tool
def stop_algo_session(config: RunnableConfig, session_id: str) -> str:
    """
    Stop an active algorithmic trading session and return its capital and PnL to the wallet.
    Args:
        session_id: The unique ID of the active algo session (fetch this using get_active_algo_sessions).
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found."})

    headers = _get_headers(uid)

    try:
        # 1. Stop the algo in the Python backend
        py_res = requests.post(f"{PYTHON_ALGO_URL}/live/stop", json={"sessionId": session_id}, timeout=10)
        if py_res.status_code != 200:
            return json.dumps({"error": f"Failed to stop python algo: {py_res.text}"})

        py_data = py_res.json()
        if "error" in py_data:
            return json.dumps(py_data)

        stats = py_data.get("stats", {})
        
        # 2. Refund capital to the wallet via Node backend
        node_res = requests.post(
            f"{NODE_BACKEND_URL}/api/algo/session/stop",
            json={
                "returnedCapital": stats.get("current_capital", 0),
                "symbol": stats.get("symbol", ""),
                "strategyName": stats.get("strategy_name", ""),
                "pnl": stats.get("live_pnl", 0),
                "trades": [],  # Background tasks don't maintain trade lists yet
                "sessionId": session_id
            },
            headers=headers,
            timeout=10
        )
        
        if node_res.status_code != 200:
            return json.dumps({"error": f"Algo stopped, but wallet refund failed: {node_res.text}"})

        return json.dumps({"success": True, "message": f"Successfully stopped session {session_id} and refunded capital.", "final_stats": stats})
    except Exception as e:
        return json.dumps({"error": str(e)})

@tool
def save_strategy(config: RunnableConfig, strategy_json: str) -> str:
    """
    Save a developed strategy to the database so it appears in the user's UI.
    
    Args:
        strategy_json: The strategy specification as a JSON string.
                       It MUST include a 'name' field and should match the standard strategy schema 
                       (e.g., buy_strategy, sell_strategy, capital, stopLossPct).
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({"error": "User UID not found. Cannot save strategy."})

    try:
        strategy = json.loads(strategy_json) if isinstance(strategy_json, str) else strategy_json
    except json.JSONDecodeError as e:
        return json.dumps({"error": f"Failed to parse strategy JSON: {e}"})
        
    if "name" not in strategy:
        return json.dumps({"error": "Strategy JSON must include a 'name' field."})

    # Ensure buyDsl and sellDsl are JSON strings as required by the frontend
    if "buyDsl" in strategy and not isinstance(strategy["buyDsl"], str):
        strategy["buyDsl"] = json.dumps(strategy["buyDsl"])
    if "sellDsl" in strategy and not isinstance(strategy["sellDsl"], str):
        strategy["sellDsl"] = json.dumps(strategy["sellDsl"])

    headers = _get_headers(uid)
    try:
        res = requests.post(f"{NODE_BACKEND_URL}/api/paperbull/strategy", json=strategy, headers=headers, timeout=10)
        if res.status_code == 201:
            return json.dumps({"success": True, "message": f"Strategy '{strategy['name']}' saved successfully!"})
        else:
            return json.dumps({"error": f"Failed to save strategy: {res.text}"})
    except Exception as e:
        return json.dumps({"error": str(e)})



@tool
def delete_strategy(config: RunnableConfig, strategy_name: str) -> str:
    """
    Delete a single saved trading strategy by its name.
    Args:
        strategy_name: The exact name of the strategy to delete.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({'error': 'User UID not found.'})

    headers = _get_headers(uid)
    try:
        res = requests.get(f"{NODE_BACKEND_URL}/api/paperbull/strategies", headers=headers, timeout=10)
        if res.status_code != 200:
            return json.dumps({'error': f'Failed to fetch strategies: {res.text}'})

        strategies = res.json()
        match = next((s for s in strategies if s.get('name', '').lower() == strategy_name.lower()), None)
        if not match:
            return json.dumps({'error': f"No strategy named '{strategy_name}' found."})

        strategy_id = str(match['_id'])
        del_res = requests.delete(f"{NODE_BACKEND_URL}/api/paperbull/strategy/{strategy_id}", headers=headers, timeout=10)
        if del_res.status_code == 200:
            return json.dumps({'success': True, 'message': f"Strategy '{strategy_name}' deleted successfully."})
        else:
            return json.dumps({'error': f'Failed to delete strategy: {del_res.text}'})
    except Exception as e:
        return json.dumps({'error': str(e)})


@tool
def delete_all_strategies(config: RunnableConfig) -> str:
    """
    Delete ALL saved trading strategies for the user.
    Only use this when the user explicitly asks to clear or delete all their strategies.
    """
    uid = _uid_from_config(config)
    if not uid:
        return json.dumps({'error': 'User UID not found.'})

    headers = _get_headers(uid)
    try:
        res = requests.delete(f"{NODE_BACKEND_URL}/api/paperbull/strategies/all", headers=headers, timeout=10)
        if res.status_code == 200:
            data = res.json()
            return json.dumps({'success': True, 'message': data.get('message', 'All strategies deleted.'), 'count': data.get('count', 0)})
        else:
            return json.dumps({'error': f'Failed to delete all strategies: {res.text}'})
    except Exception as e:
        return json.dumps({'error': str(e)})

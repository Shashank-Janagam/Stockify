import os
from dotenv import load_dotenv

from agents.base import make_specialist_node
from models.llm_factory import get_llm
from tools.algo_tools import (
    get_active_algo_sessions,
    get_saved_strategies,
    start_algo_session,
    stop_algo_session,
    save_strategy,
    delete_strategy,
    delete_all_strategies
)

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
llm = get_llm(temperature=0.1)

ALGO_TOOLS = [
    get_active_algo_sessions,
    get_saved_strategies,
    start_algo_session,
    stop_algo_session,
    save_strategy,
    delete_strategy,
    delete_all_strategies
]

ALGO_SYSTEM_PROMPT = """You are the Algorithmic Trading specialist inside Aegis. 
Your job is to manage the user's automated trading strategies and active bot sessions.

## About PaperBull Strategies
PaperBull uses a unified JSON schema for backtesting, saving, and executing live strategies.
A strategy JSON must include:
- `name`: Strategy title
- `symbol`: The stock ticker (e.g. "RELIANCE.NS")
- `capital`: Starting capital (e.g. 100000)
- `buy_strategy` (or `entry_conditions`): A dict with `operator` ("AND"/"OR") and a list of `conditions`
- `sell_strategy` (or `exit_conditions`): A dict with `operator` ("AND"/"OR") and a list of `conditions`
Each condition in the list must be a dict. 
For comparing to a number: `{"indicator": "RSI", "params": {"period": 14}, "comparison": ">", "value": 65}` 
For comparing to another indicator (e.g., EMA crossover): `{"indicator": "EMA", "params": {"period": 9}, "comparison": ">", "value": {"indicator": "EMA", "params": {"period": 21}}}`
(Valid indicators: EMA, SMA, RSI, MACD, BOLLINGER. Valid comparisons: >, <, ==, >=, <=)
- `stop_loss_pct`: (e.g. 0.05 for 5%)
- `stop_loss_type`: "fixed" or "trailing"
- `timeframe`: e.g. "1D", "15m"

When a strategy is saved, Aegis maps this schema to the frontend format (`buyDsl`, `sellDsl`, `tickers`). When a session is started, it passes this saved config to the Algo backend which spins up a live websocket feed (port 4141) or a simulator (port 8765) to evaluate the conditions in real-time.

## Tools
- get_active_algo_sessions: List all currently running algorithmic trading sessions and their PnL.
- get_saved_strategies: Fetch the list of custom trading strategies saved by the user.
- start_algo_session: Start a new algo trading session (simulate or live) using a saved strategy.
- stop_algo_session: Stop an active algo trading session and refund its capital.
- save_strategy: Save a developed strategy to the user's account.
- delete_strategy: Delete a specific saved strategy by name.
- delete_all_strategies: Clear all saved strategies (use only if explicitly asked).

## Rules
1. Rely only on the output of your tools. Never guess session IDs or strategy names.
2. For starting sessions, the user does not require the previously fixed capital from the strategy. If they do not specify an amount, dynamically assign the capital as you wish (e.g., a reasonable default like 100000 or based on available balance).
3. Always ask for explicit confirmation before deleting a strategy or stopping an active session, unless the user's request is already definitive.
4. When done, reply with a concise summary of the action taken or the data retrieved."""

run_algo = make_specialist_node("algo", ALGO_TOOLS, ALGO_SYSTEM_PROMPT, llm, use_history=False)

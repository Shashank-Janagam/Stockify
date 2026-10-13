import os
from langchain_core.messages import AIMessage
from models.agent_state import AgentState
from tools.trading_tools import buy_stock, sell_stock, cancel_stoploss_order
from langchain_core.runnables.config import RunnableConfig

def propose(state: AgentState):
    action = state.get("intent", {}).get("action")
    if not action:
        return {"messages": [AIMessage(content="I don't have enough details to propose an action.")]}
    
    kind = action.get("kind")
    summary = f"You are proposing to {kind} {action.get('quantity', '')} shares of {action.get('symbol', '')}."
    pending = {
        "action_id": "act_1",
        "kind": kind,
        "params": action,
        "summary": summary
    }
    msg = f"{summary} Reply 'yes' to confirm or 'no' to cancel."
    return {"pending_action": pending, "messages": [AIMessage(content=msg)]}

def discard(state: AgentState):
    return {"pending_action": None, "messages": [AIMessage(content="Action cancelled.")]}

def no_pending(state: AgentState):
    return {"messages": [AIMessage(content="There is no pending action to confirm or discard.")]}

def execute(state: AgentState, config: RunnableConfig):
    pending = state.get("pending_action")
    if not pending:
        return {"messages": [AIMessage(content="No pending action to execute.")]}
    
    params = pending.get("params", {})
    kind = pending.get("kind")
    try:
        if kind == "buy":
            res = buy_stock.invoke({"symbol": params.get("symbol"), "quantity": params.get("quantity")}, config=config)
        elif kind == "sell":
            res = sell_stock.invoke({"symbol": params.get("symbol"), "quantity": params.get("quantity")}, config=config)
        elif kind == "cancel_stoploss":
            res = cancel_stoploss_order.invoke({"order_id": params.get("order_id")}, config=config)
        else:
            res = "Unknown action kind."
    except Exception as e:
        res = str(e)
        
    import json
    try:
        parsed_res = json.loads(res)
        if parsed_res.get("status") == "EXECUTED":
            parsed_res["status"] = "trade_executed"
        res = json.dumps(parsed_res)
    except:
        pass
        
    msg = f"Execution result: {res}"
    return {"pending_action": None, "messages": [AIMessage(content=msg)]}

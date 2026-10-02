import os
import sys
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.llm_factory import get_llm
from langchain_core.messages import AIMessage
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver
from models.state import MarketState

from tools.algo_tools import (
    get_active_algo_sessions,
    get_saved_strategies,
    start_algo_session,
    stop_algo_session,
    save_strategy
)

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

llm = get_llm(temperature=0.1)

ALGO_TOOLS = [
    get_active_algo_sessions, get_saved_strategies, start_algo_session, stop_algo_session, save_strategy
]

ALGO_SYSTEM_PROMPT = """You are Aegis Algo, an autonomous agent specialized in managing algorithmic trading sessions.

CRITICAL RULES FOR AUTONOMY & ACCURACY:
1. MINIMIZE HUMAN INTERACTION ("HUMAN FREE"): NEVER ask the user for information you can fetch or reasonably infer. Act decisively on the user's intent. Do not ask for confirmation unless absolutely necessary.
2. USE SAVED STRATEGIES: ALWAYS use `get_saved_strategies` first to understand intent when the user wants to start an algo. If their request matches a saved strategy, call `start_algo_session` immediately with inferred parameters.
3. PERSISTENCE & HISTORY: You have access to the conversation history. Always follow the user's most recent instructions closely while keeping context in mind. Do not repeat mistakes.
4. BE DIRECT AND SIMPLE: Do not overcomplicate. If the user says "start my SMA strategy", fetch the strategies, find the SMA one, and start it. Do not guide them to the UI or ask follow-up questions if you have the needed info.
5. MANAGING SESSIONS: Use `get_active_algo_sessions` to check running algos. Use `stop_algo_session` when the user asks to stop one. Mention symbol and strategy name clearly when reporting.
"""

memory = MemorySaver()

algo_agent_executor = create_react_agent(
    model=llm,
    tools=ALGO_TOOLS,
    prompt=ALGO_SYSTEM_PROMPT,
    checkpointer=memory
)

async def algo_agent(state: MarketState) -> dict:
    # Pass all messages so the agent has full context and doesn't forget history
    recent_messages = list(state["messages"])
    uid = state.get("uid")
    # Include thread_id for MemorySaver to persist state properly per user session
    config = {"configurable": {"uid": uid, "thread_id": uid or "default_algo_thread"}}
    try:
        response = await algo_agent_executor.ainvoke({"messages": recent_messages}, config=config)
        final_msg = response["messages"][-1]
        return {"messages": [final_msg]}
    except Exception as e:
        return {"messages": [AIMessage(content=f"⚠️ Algo agent error: {e}")]}


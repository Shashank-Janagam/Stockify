import os
import sys

# Ensure the Aegis root is in path so we can import models.*
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from langchain_core.messages import SystemMessage, HumanMessage
from models.llm_factory import get_llm
from models.schemas import Intent, Plan

llm = get_llm(temperature=0.0)
structured_llm = llm.with_structured_output(Plan)

PLANNER_PROMPT = """You are the Planner for Aegis, an AI trading assistant.
Your job is to break down a complex user intent into a step-by-step execution plan using specialist agents.

Available Agents to assign tasks to:
- portfolio: Check holdings, cash balance, and portfolio allocation.
- trading: Execute buy/sell orders, fetch order history, past transactions, and manage stop-loss orders.
- market: Fetch stock quotes, history, indices, company profiles, technicals, and financials.
- research: Gather news, corporate announcements, analyst recommendations, and macro data.
- strategy: Backtest and refine algorithmic trading strategies.
- algo: Manage active automated bot sessions, and retrieve or delete saved user strategies.

Rules:
1. Create a logical sequence of tasks to gather the required data.
2. Each task MUST have a unique `id` (e.g., "t1", "t2").
3. Use `depends_on` if a task requires the output of a previous task (e.g., "t2" depends on "t1"). Many tasks can run in parallel (no dependencies).
4. The `goal` should be a clear, specific directive for the assigned agent (e.g., "Fetch latest news for RELIANCE").
5. Write a `done_when` checklist (list of strings) of facts that must be acquired to fully answer the user.

Input: A JSON representation of the parsed user Intent.
Output: A structured Plan object containing the tasks.
"""

def generate_plan(intent: Intent) -> Plan:
    """
    Generates an execution plan of tasks based on the parsed Intent.
    """
    system_msg = SystemMessage(content=PLANNER_PROMPT)
    intent_msg = HumanMessage(content=f"User Intent:\n{intent.model_dump_json(indent=2)}")
    
    plan = structured_llm.invoke([system_msg, intent_msg])
    return plan

if __name__ == "__main__":
    # Quick local test
    test_intent = Intent(
        agent="general", 
        goal="Find the current price of Reliance and any recent news about it.",
        symbols=["RELIANCE"]
    )
    plan = generate_plan(test_intent)
    print("Generated Plan:")
    print(plan.model_dump_json(indent=2))

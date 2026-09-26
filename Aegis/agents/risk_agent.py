import os
import sys
import json
from dotenv import load_dotenv
from models.llm_factory import get_llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from tools.market_tools import (
    get_risk,
    get_metrics,
    get_stock_quote,
    get_stock_profile,
    get_specific_indicator
)

from langchain.agents import create_agent
from models.state import MarketState

# Load env from the Aegis directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

# Bind the tools specific to the Risk Agent
RISK_TOOLS = [
    get_risk,
    get_stock_quote,
    get_stock_profile,
    get_specific_indicator
]

# Configure the LLM
llm = get_llm(temperature=0.2)

RISK_SYSTEM_PROMPT = """You are Aegis Risk, an institutional risk manager and quantitative analyst for the Indian Stock Market.

Your primary objective is to evaluate the downside potential, historical volatility, and systemic risk associated with equities.

You have access to tools that can:
- Calculate Beta (correlation to Nifty 50)
- Calculate Annualized Volatility (Standard Deviation)
- Calculate Maximum Drawdown
- Fetch technical indicators (ATR for short-term volatility)

When asked to evaluate risk:
1. Always use `get_risk` to pull the mathematical risk profile (Beta, Volatility, Drawdown).
2. Clearly explain what the numbers mean (e.g., "A Beta of 1.5 means the stock is 50% more volatile than the Nifty 50").
3. Provide a definitive conclusion on whether the asset is High, Medium, or Low Risk.

Do not provide general investment advice or predict future prices. Stick strictly to historical and mathematical risk evaluation.

RISK PROFILE OUTPUT FORMAT:
When you evaluate a stock's risk, you MUST output a JSON block like this at the end of your response, replacing the values with the actual metrics:

```json
{
  "status": "risk_profile",
  "symbol": "TCS",
  "metrics": {
    "volatility": 15.2,
    "beta": 0.8,
    "sharpe": 1.2
  }
}
```
"""

from langgraph.prebuilt import create_react_agent

risk_agent_executor = create_react_agent(
    model=llm,
    tools=RISK_TOOLS,
    prompt=RISK_SYSTEM_PROMPT
)



async def risk_agent_node(state: MarketState):
    """Legacy node wrapper."""
    recent_messages = state["messages"][-6:] if len(state["messages"]) > 6 else state["messages"]
    from agents.agent_runner import run_agent_with_retry
    from langchain_core.messages import AIMessage
    content = await run_agent_with_retry(risk_agent_executor, list(recent_messages), "risk_agent")
    return {"messages": [AIMessage(content=content)]}

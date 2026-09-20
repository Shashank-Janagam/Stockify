import os
import sys
import json
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
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
llm = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    temperature=0.2,
    max_tokens=2048,
    timeout=None,
    max_retries=2,
    api_key=os.getenv("GEMINI_API_KEY")
)

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
"""

from langgraph.prebuilt import create_react_agent

risk_agent_executor = create_react_agent(
    model=llm,
    tools=RISK_TOOLS,
    prompt=RISK_SYSTEM_PROMPT
)



def risk_agent_node(state: MarketState):
    """Executes the risk agent."""
    messages = state.get("messages", [])
    
    # Run the executor and return the new message
    response = risk_agent_executor.invoke({"messages": messages})
    
    return {
        "messages": [response["messages"][-1]]
    }

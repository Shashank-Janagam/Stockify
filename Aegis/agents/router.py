import os
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from typing import Literal

class RouteDecision(BaseModel):
    """Route the user query to the appropriate agent."""
    routes: list[Literal["market", "research", "risk"]] = Field(
        description="The agents required to answer the user's query. Return 'market' for price/technical/fundamentals, 'research' for news/macro, 'risk' for downside/volatility/beta, or a combination."
    )

import os
import sys
from dotenv import load_dotenv

# Load env from the Aegis directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

llm = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    temperature=0,
    api_key=os.getenv("GEMINI_API_KEY")
)

structured_llm = llm.with_structured_output(RouteDecision)

system_prompt = """You are a routing supervisor for Aegis, a financial intelligence system.
You must route the user's query to the appropriate specialized agent.

Agents:
1. "market": Specialized in live/historical stock prices, technical analysis (SMA, RSI, MACD, etc.), options data, fundamental financials (balance sheets, income statements), and analyst recommendations.
2. "research": Specialized in broad market news, company-specific announcements/filings, macroeconomic data (RBI, MOSPI, GDP, Inflation), and general web searches.
3. "risk": Specialized in institutional risk analysis, calculating downside potential, standard deviation, beta against benchmark, and max drawdowns.

If a query requires both, return both. E.g., "Why did TCS fall and what is its RSI?" -> ["market", "research"].
If a query asks about risk, safety, volatility, or beta, include "risk". E.g., "How risky is HDFC compared to its recent news?" -> ["risk", "research"].
Otherwise, return the single most appropriate agent."""

route_prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{user_query}")
])

router = route_prompt | structured_llm

def router_node(state: dict) -> dict:
    """Routing node that decides which agent(s) to call and saves it to state."""
    messages = state.get("messages", [])
    if not messages:
        return {"route_decision": ["market"]}
        
    last_message = messages[-1].content
    try:
        decision = router.invoke({"user_query": last_message})
        return {"route_decision": decision.routes}
    except Exception as e:
        print(f"[Router Error] Defaulting to market. Details: {e}")
        return {"route_decision": ["market"]}

import os
import sys
import re
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import Literal
from langchain_core.prompts import ChatPromptTemplate
from models.llm_factory import get_llm

class RouteDecision(BaseModel):
    """Route the user query to the appropriate agent."""
    routes: list[Literal["market", "research", "risk", "strategy", "portfolio", "casual"]] = Field(
        description="The agents required to answer the user's query. Return 'portfolio' for trading/portfolio/holdings, 'market' for price/technical/fundamentals, 'research' for news/macro, 'risk' for downside/volatility/beta, 'strategy' for trading strategy design/creation, 'casual' for simple conversational greetings, or a combination."
    )

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

llm = get_llm(temperature=0.0)
structured_llm = llm.with_structured_output(RouteDecision)

system_prompt = """You are a routing supervisor for Aegis, a financial intelligence system.
You must route the user's current intent to the appropriate specialized agent based on the provided conversation transcript.

Agents:
1. "market": Specialized in live/historical stock prices, technical analysis (SMA, RSI, MACD, etc.), options data, fundamental financials (balance sheets, income statements), and analyst recommendations.
2. "research": Specialized in broad market news, company-specific announcements/filings, macroeconomic data (RBI, MOSPI, GDP, Inflation), and general web searches.
3. "risk": Specialized in institutional risk analysis, calculating downside potential, standard deviation, beta against benchmark, and max drawdowns.
4. "strategy": Specialized in DESIGNING trading strategies AND running backtests. Route here when the user wants to CREATE, BUILD, or DESIGN a trading strategy or backtest plan.
5. "portfolio": Specialized in user accounts, PnL, open positions, and executing trades (buy/sell orders). Route here when the user says "buy X", "sell Y", or asks "what's in my portfolio?".
6. "casual": Use ONLY for basic conversational greetings (e.g. "Hi", "Hello", "How are you") or simple chat that requires no financial data.

IMPORTANT ROUTING RULES:
- If a query asks to BUY or SELL a stock -> include "portfolio".
- If the user is responding to a previous question about buying, selling, or trading (e.g., answering "which stocks to buy?") -> include "portfolio".
- If a query asks about user holdings/balance/PnL -> include "portfolio".
- If a query asks to CREATE or DESIGN a strategy/plan/backtest -> always include "strategy".
- If a query asks to list, find, or search for stocks in a sector -> include "market".
- If a query asks about risk AND also wants a strategy -> return ["strategy", "risk"].
- If a query requires both price data AND a strategy -> return ["market", "strategy"].
- If a query asks about risk, safety, volatility, or beta -> include "risk".
- E.g., "Why did TCS fall and what is its RSI?" -> ["market", "research"].
- E.g., "How risky is HDFC compared to its recent news?" -> ["risk", "research"].
- If the query is a general greeting, conversational, or doesn't fit any specific category -> return ["casual"]."""

route_prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "Conversation Transcript:\n{transcript}\n\nBased on the user's latest message, which agents should this be routed to?")
])

router = route_prompt | structured_llm

async def router_node(state: dict) -> dict:
    messages = state.get("messages", [])
    if not messages:
        return {"route_decision": ["market"]}
        
    last_message = messages[-1].content.strip()
    last_message_lower = last_message.lower()
    
    cleaned = re.sub(r'[^a-z\s]', '', last_message_lower).strip()
    casual_phrases = {"hi", "hello", "hey", "how are you", "good morning", "good evening", "good afternoon", "sup", "whats up", "hi aegis", "hello aegis"}
    
    if cleaned in casual_phrases:
        return {"route_decision": ["casual"]}
        
    recent_msgs = messages[-4:]
    transcript = "\\n".join([f"{'User' if m.type in ('human', 'user') else 'Agent'}: {m.content}" for m in recent_msgs])
        
    try:
        decision = await router.ainvoke({"transcript": transcript})
        return {"route_decision": decision.routes}
    except Exception as e:
        print(f"[Router Error] Defaulting to market. Details: {e}")
        return {"route_decision": ["market"]}

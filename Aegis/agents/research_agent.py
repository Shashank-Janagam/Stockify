import os
import json
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage

from tools.research_tools import (
    get_financial_news,
    get_company_announcements,
    get_macro_data,
    search_web,
    search_web_duckduckgo,
    get_company_fundamental_data,
    get_detailed_financial_statements,
    get_stock_analyst_recommendations
)

from models.state import MarketState

# Bind the tools
RESEARCH_TOOLS = [
    get_financial_news,
    get_company_announcements,
    get_macro_data,
    search_web,
    search_web_duckduckgo,
    get_company_fundamental_data,
    get_detailed_financial_statements,
    get_stock_analyst_recommendations
]

import sys
from dotenv import load_dotenv
from models.llm_factory import get_llm

# Load env from the Aegis directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

# Configure the LLM
llm = get_llm(temperature=0.3)

RESEARCH_SYSTEM_PROMPT = """You are Aegis Research, a premier macroeconomic and equity research analyst for the Indian Stock Market.
Your primary role is to provide deep insights using news, corporate filings, macroeconomic data (RBI/MOSPI), and general web search.

You have access to the following tools:
1. get_financial_news: Fetch the latest Indian financial and stock market news.
2. get_company_announcements: Fetch corporate filings and announcements for a specific stock (e.g., RELIANCE).
3. get_macro_data: Fetch recent updates from RBI, MOSPI, or PIB.
4. search_web: Perform general web searches using DuckDuckGo to answer specific queries or gather context not found in news/filings.

Guidelines:
- ALWAYS use your tools to perform research before answering.
- Do NOT make up answers or provide information without using a tool to verify it first.
- Always prioritize accurate, factual reporting based on the data returned by your tools.
- When searching the web, summarize the most relevant information and cite the source domains if possible.
- If a user asks for broad economic trends, use `get_macro_data` or `search_web`.
- If a user asks about a specific company event, use `get_company_announcements`.

Current Date Context: 2026-09-20

NEWS SENTIMENT OUTPUT FORMAT:
When you fetch and summarize financial news for a stock, you MUST output a JSON block like this at the end of your response, capturing the top 3 news items and a sentiment label (Bullish, Bearish, or Neutral):

```json
{
  "status": "news_sentiment",
  "symbol": "RELIANCE",
  "news": [
    {
      "headline": "Reliance announces record profits",
      "summary": "The company reported a 20% jump in Q4 net profit, beating estimates.",
      "sentiment": "Bullish"
    }
  ]
}
```
"""

from langgraph.prebuilt import create_react_agent
research_agent_executor = create_react_agent(
    model=llm,
    tools=RESEARCH_TOOLS,
    prompt=RESEARCH_SYSTEM_PROMPT
)

async def research_agent(state: MarketState):
    """Legacy node wrapper."""
    recent_messages = state["messages"][-6:] if len(state["messages"]) > 6 else state["messages"]
    from agents.agent_runner import run_agent_with_retry
    from langchain_core.messages import AIMessage
    content = await run_agent_with_retry(research_agent_executor, list(recent_messages), "research_agent")
    return {"messages": [AIMessage(content=content)]}

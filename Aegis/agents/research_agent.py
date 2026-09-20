import os
import json
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage

from tools.research_tools import (
    get_financial_news,
    get_company_announcements,
    get_macro_data,
    search_web
)

from langchain.agents import create_agent
from models.state import MarketState

# Bind the tools
RESEARCH_TOOLS = [
    get_financial_news,
    get_company_announcements,
    get_macro_data,
    search_web
]

import sys
from dotenv import load_dotenv

# Load env from the Aegis directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

# Configure the LLM
llm = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    temperature=0.3,
    max_tokens=2048,
    timeout=None,
    max_retries=2,
    api_key=os.getenv("GEMINI_API_KEY")
)

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
"""

research_agent_executor = create_agent(
    model=llm,
    tools=RESEARCH_TOOLS,
    system_prompt=RESEARCH_SYSTEM_PROMPT
)

def research_agent(state: MarketState):
    recent_messages = state["messages"][-4:] if len(state["messages"]) > 4 else state["messages"]
    
    messages = [
        SystemMessage(content=RESEARCH_SYSTEM_PROMPT),
        *recent_messages
    ]

    response = research_agent_executor.invoke({"messages": messages})
    return {
        "messages": [response["messages"][-1]]
    }

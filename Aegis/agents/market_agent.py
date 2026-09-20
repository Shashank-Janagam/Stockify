import os
import sys
from dotenv import load_dotenv

# Add the parent directory (Aegis) to the path so 'tools' can be imported when running directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load env from the Aegis directory to get GROQ_API_KEY
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_agent
from langchain_core.messages import SystemMessage
from models.state import MarketState

from tools.market_tools import (
    get_stock_quote,
    get_stock_history,
    search_stocks,
    get_stock_profile,
    get_sector_peers,
    get_financials,
    get_metrics,
    get_analyst_recs,
    get_technicals,
    get_options,
    get_indices,
    get_movers,
)

# Initialize the LLM
# You can toggle between Groq and Gemini depending on your rate limits.

# Option 1: Groq (Fast, but strict token limits on free tier)
# llm = ChatGroq(
#     model="openai/gpt-oss-120b",
#     temperature=0.1,
#     api_key=os.getenv("GROQ_API_KEY")
# )

# Option 2: Google Gemini (Generous free tier: 1M Tokens Per Minute)
llm = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    temperature=0.1,
    api_key=os.getenv("GEMINI_API_KEY")
)

tools = [
    get_stock_quote,
    get_stock_history,
    search_stocks,
    get_stock_profile,
    get_sector_peers,
    get_financials,
    get_analyst_recs,
    get_technicals,
    get_options,
    get_indices,
    get_movers,
]

from datetime import datetime

# 2. Create the system prompt
current_date = datetime.now().strftime("%Y-%m-%d")
system_prompt = (
    f"You are Aegis, a premier AI financial analyst for the Indian Stock Market (NSE/BSE). "
    f"Your mandate is to provide precise, institutional-grade market intelligence. "
    f"CRITICAL: The current date is {current_date}. Keep this in mind when evaluating past vs future dates. "
    "RULES OF ENGAGEMENT: "
    "1. Be ruthless with precision: only answer exactly what is asked. DO NOT call tools for data the user did not explicitly request. For example, if asked for the current price, ONLY call the quote tool; do NOT fetch history, news, or profiles unless specifically asked. "
    "2. Execute multi-tool strategies autonomously ONLY when complex data is explicitly requested. "
    "3. Format outputs with striking clarity using Markdown, sleek tables, and bullet points. "
    "Deliver alpha, cut the noise."
)

# 3. Create the LangGraph React Agent
market_agent_executor = create_agent(
    model=llm,
    tools=tools,
    system_prompt=system_prompt
)



def market_agent(state:MarketState):
    # MEMORY TRUNCATION: Keep only the last 4 messages to prevent token explosions on Groq Free Tier
    recent_messages = state["messages"][-4:] if len(state["messages"]) > 4 else state["messages"]
    
    messages = [
        SystemMessage(content=system_prompt),
        *recent_messages
    ]

    response = market_agent_executor.invoke({"messages": messages})

    return {
        "messages": [response["messages"][-1]]
    }

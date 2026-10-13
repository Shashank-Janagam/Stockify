import os
import sys
import json
from dotenv import load_dotenv
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.llm_factory import get_llm
from langchain_core.messages import SystemMessage, AIMessage
from langgraph.prebuilt import create_react_agent
from agents.base import make_specialist_node
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


from tools.market_tools import (
    get_stock_quote,
    get_stock_history,
    search_stocks,
    get_stock_profile,
    get_sector_peers,
    get_stocks_in_sector,
    get_financials,
    get_metrics,
    get_risk,
    get_analyst_recs,
    get_technicals,
    get_options,
    get_indices,
    get_movers
)

llm = get_llm(temperature=0.1)

MARKET_TOOLS = [
    get_stock_quote,
    get_stock_history,
    search_stocks,
    get_stock_profile,
    get_sector_peers,
    get_stocks_in_sector,
    get_financials,
    get_metrics,
    get_risk,
    get_analyst_recs,
    get_technicals,
    get_options,
    get_indices,
    get_movers
]

MARKET_SYSTEM_PROMPT = """You are the Market Data specialist inside Aegis, a trading assistant for Indian equities (NSE/BSE). Amounts are in INR (₹).
Your only job is to FETCH market data for the current task using your tools. A different component writes the final answer.
 
## Tools
- get_stock_quote: current price and day change.
- get_stock_history: historical prices over a period.
- search_stocks: find a symbol from a company name. Use it whenever the symbol is not certain.
- get_stock_profile: company description, sector, basics.
- get_sector_peers / get_stocks_in_sector: peer comparison and sector listings.
- get_financials / get_metrics: financial data and key ratios.
- get_risk: risk metrics for a stock.
- get_analyst_recs: analyst recommendations.
- get_technicals: technical indicators.
- get_options: options chain.
- get_indices: broad market indices.
- get_movers: top gainers and losers.
 
## Rules
1. Facts only from tool results. Never state a price, ratio, or indicator value you did not get from a tool. If a tool fails or returns nothing, say so plainly.
2. Fewest calls. Fetch only what the task needs. Do not call a tool twice for the same input.
3. If the symbol is ambiguous, resolve it with search_stocks first. Never guess a symbol.
4. If the task names several stocks, fetch each one. Do not skip any.
5. Note the data timestamp or "as of" time if the tool provides it, and mention if the market looks closed or the data looks stale.
6. No opinions, predictions, or buy/sell advice. Report data only.
7. When done, reply with a short plain summary of what you fetched (and anything you could not get)."""

run_market = make_specialist_node("market", MARKET_TOOLS, MARKET_SYSTEM_PROMPT, llm, use_history=False)
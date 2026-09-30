from langchain_core.tools import tool
import json
from typing import Optional

from .research_service import (
    get_financial_news_direct,
    get_company_announcements_direct,
    get_macro_data_direct,
    search_web_serper,
    search_web_direct,
    get_company_fundamentals,
    get_financial_statements,
    get_analyst_recommendations
)

@tool
def get_financial_news(category: Optional[str] = None):
    """Fetch the latest Indian financial and stock market news.
    Optional category: e.g. 'economy', 'IPO', 'banking', 'tech', 'RBI'."""
    return json.dumps(get_financial_news_direct(category))

@tool
def get_company_announcements(symbol: str):
    """Fetch the latest corporate announcements, filings, and news for a specific stock ticker."""
    return json.dumps(get_company_announcements_direct(symbol))

@tool
def get_macro_data(source: Optional[str] = "RBI"):
    """Fetch the latest macroeconomic data and press releases.
    Source can be 'RBI' (Reserve Bank of India), 'MOSPI' (Ministry of Statistics), or 'PIB'."""
    return json.dumps(get_macro_data_direct(source))

@tool
def search_web(query: str):
    """Perform a general web search to find real-time information not covered by other tools."""
    return json.dumps(search_web_serper(query))

@tool
def get_company_fundamental_data(symbol: str):
    """Fetch fundamental data for a specific stock (P/E, market cap, EPS, Debt-to-Equity)."""
    return json.dumps(get_company_fundamentals(symbol))

@tool
def get_detailed_financial_statements(symbol: str):
    """Fetch recent income statement, balance sheet, and cashflow data for a stock."""
    return json.dumps(get_financial_statements(symbol))

@tool
def get_stock_analyst_recommendations(symbol: str):
    """Fetch analyst recommendations (Buy/Hold/Sell) and target prices for a stock."""
    return json.dumps(get_analyst_recommendations(symbol))

@tool
def search_web_duckduckgo(query: str):
    """Perform a web search using DuckDuckGo (Free Tier). Good for general lookups."""
    return json.dumps(search_web_direct(query))

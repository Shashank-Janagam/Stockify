from langchain_core.tools import tool
from typing import Optional, List
import json
from .market_service import (
    get_live_stock_quote,
    get_stock_history_data,
    search_stocks_direct,
    get_stock_profile_direct,
    get_similar_stocks_direct,
    get_financial_statements,
    get_key_metrics,
    get_analyst_recommendations,
    get_risk_metrics,
    get_specific_indicator,
    get_options_chain,
    get_global_indices,
    get_top_movers,
)

@tool
def get_stock_quote(symbol: str):
    """Get the latest available market quote for an Indian stock."""
    return json.dumps(get_live_stock_quote(symbol))

@tool
def get_stock_history(symbol: str, days: Optional[str] = "90", start_date: Optional[str] = None, end_date: Optional[str] = None, interval: Optional[str] = "1d"):
    """Get historical OHLCV data for an Indian stock. 
    Use 'days' (e.g., '90', '1M', '1Y') for a relative timeframe.
    Use 'start_date' and 'end_date' (format: YYYY-MM-DD) to fetch a specific date range.
    Use 'interval' to specify data frequency (e.g., '1m', '5m', '15m', '1h', '1d', '1wk', '1mo')."""
    return json.dumps(get_stock_history_data(symbol, days, start_date, end_date, interval))

@tool
def search_stocks(query: str):
    """Search for Indian stocks using a company name or symbol."""
    return json.dumps(search_stocks_direct(query))

@tool
def get_stock_profile(symbol: str):
    """Get company profile, sector and fundamental information."""
    return json.dumps(get_stock_profile_direct(symbol))

@tool
def get_sector_peers(symbol: str):
    """Get similar stocks or sector peers."""
    return json.dumps(get_similar_stocks_direct(symbol))

@tool
def get_financials(symbol: str):
    """Get financial statements (income statement, balance sheet, cash flow) for a stock."""
    return json.dumps(get_financial_statements(symbol))

@tool
def get_metrics(symbol: str):
    """Get key fundamental metrics (PE, PEG, ROE, margins, etc.) for a stock."""
    return json.dumps(get_key_metrics(symbol))

@tool
def get_risk(symbol: str, period: str = "1y"):
    """Calculate institutional risk metrics (Beta, Annualized Volatility, Max Drawdown)."""
    return json.dumps(get_risk_metrics(symbol, period))

@tool
def get_analyst_recs(symbol: str):
    """Get analyst recommendations and price targets for a stock."""
    return json.dumps(get_analyst_recommendations(symbol))

@tool
def get_technicals(symbol: str, indicator_type: str, period: int = 14):
    """Get a specific technical indicator for a stock.
    Supported indicator_type: 'SMA', 'EMA', 'RSI', 'MACD', 'BB' (Bollinger Bands), 'ATR', 'VWAP', 'SUPERTREND'.
    'period' is the number of days/candles to use for the calculation (default 14)."""
    return json.dumps(get_specific_indicator(symbol, indicator_type, period))

@tool
def get_options(symbol: str, expiry_date: Optional[str] = None):
    """Get the options chain (calls and puts) for a given stock and expiry date."""
    return json.dumps(get_options_chain(symbol, expiry_date))

@tool
def get_indices():
    """Get the latest quotes and performance for global and major Indian market indices."""
    return json.dumps(get_global_indices())

@tool
def get_movers():
    """Get the top gaining and losing stocks among highly traded market movers."""
    return json.dumps(get_top_movers())

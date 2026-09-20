"""
market_service.py — Direct High-Performance Market Data Service for Stockify MCP
================================================================================
Handles market queries, stock quotes, history (OHLCV candles), symbol search,
company profiles, sector peers, and live financial news directly in Python
using yfinance and local instrument databases — completely independent of the Node.js backend.
"""

import json
import os
import re
import time
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional
import urllib.request
import urllib.parse

import yfinance as yf
import pandas as pd
import numpy as np

# Find subscriptions.json path
SUBSCRIPTION_PATHS = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "subscriptions.json")
]

INSTRUMENTS: List[Dict[str, Any]] = []
SYMBOL_INDEX: Dict[str, Dict[str, Any]] = {}

def load_instruments():
    """Load instruments from subscriptions.json into memory for instant lookup and fuzzy search."""
    global INSTRUMENTS, SYMBOL_INDEX
    for path in SUBSCRIPTION_PATHS:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                data = raw if isinstance(raw, list) else raw.get("instruments", raw.get("stocks", []))
                for item in data:
                    sym = (item.get("symbol") or "").strip().upper()
                    if not sym:
                        continue
                    name = (item.get("name") or item.get("company_name") or sym).strip()
                    name_upper = name.upper()
                    if "^" in sym or "NIFTY 50" in name_upper or "SENSEX" in name_upper:
                        cat = "Indices"
                    elif "MUTUAL FUND" in name_upper or "AMC" in name_upper:
                        cat = "Mutual Funds"
                    elif "ETF" in name_upper or "BEES" in sym or "ETF" in sym:
                        cat = "ETF"
                    else:
                        cat = "Stocks"
                    
                    record = {
                        "symbol": sym,
                        "name": name,
                        "instrument_key": item.get("instrument_key", f"NSE_EQ|{sym}"),
                        "category": cat,
                    }
                    INSTRUMENTS.append(record)
                    SYMBOL_INDEX[sym] = record
                print(f"[MarketService] Loaded {len(INSTRUMENTS)} instruments into memory from {os.path.basename(path)}")
                return
            except Exception as e:
                print(f"[MarketService Warning] Failed to load {path}: {e}")
                
    print("[MarketService Warning] No subscriptions.json found. Using built-in fallback stocks.")

load_instruments()

# Dynamic sector mapping for peer comparisons, initialized with some popular stocks
DYNAMIC_SECTOR_MAP = {
    "Technology": {"TCS", "INFY", "HCLTECH", "WIPRO", "TECHM", "LTIM", "PERSISTENT", "COFORGE"},
    "Financial Services": {"HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK", "BANKBARODA", "PNB", "BAJFINANCE", "BAJAJFINSV", "SHRIRAMFIN", "CHOLAFIN", "MUTHOOTFIN", "JIOFIN"},
    "Consumer Cyclical": {"MARUTI", "TATAMOTORS", "M&M", "BAJAJ-AUTO", "EICHERMOT", "HEROMOTOCO", "TVSMOTOR"},
    "Energy": {"RELIANCE", "ONGC", "BPCL", "IOC", "COALINDIA", "NTPC", "POWERGRID", "ADANIGREEN"},
    "Basic Materials": {"TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL", "JINDALSTEL", "NMDC", "NATIONALUM"},
    "Healthcare": {"SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "APOLLOHOSP", "LUPIN", "AUROPHARMA"},
    "Consumer Defensive": {"ITC", "HINDUNILVR", "NESTLEIND", "BRITANNIA", "TATACONSUM", "DABUR", "MARICO", "GODREJCP"},
}

SECTORS_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sectors.json")

def load_dynamic_sectors():
    global DYNAMIC_SECTOR_MAP
    if os.path.exists(SECTORS_JSON_PATH):
        try:
            with open(SECTORS_JSON_PATH, "r", encoding="utf-8") as f:
                saved_sectors = json.load(f)
                for sector, symbols in saved_sectors.items():
                    if sector not in DYNAMIC_SECTOR_MAP:
                        DYNAMIC_SECTOR_MAP[sector] = set()
                    DYNAMIC_SECTOR_MAP[sector].update(symbols)
            print(f"[MarketService] Loaded {len(DYNAMIC_SECTOR_MAP)} sectors from sectors.json")
        except Exception as e:
            print(f"[MarketService Warning] Failed to load sectors.json: {e}")

def save_dynamic_sectors():
    try:
        out_map = {k: list(v) for k, v in DYNAMIC_SECTOR_MAP.items()}
        with open(SECTORS_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(out_map, f, indent=2)
    except Exception as e:
        pass

load_dynamic_sectors()

def _normalize_symbol(symbol: str) -> str:
    """Normalize input symbol to uppercase."""
    return symbol.strip().upper()

def _get_yf_symbol(symbol: str) -> str:
    """Convert symbol to Yahoo Finance ticker (.NS for NSE, fallback to .BO)."""
    sym = _normalize_symbol(symbol)
    if sym.startswith("^") or sym.endswith(".NS") or sym.endswith(".BO"):
        return sym
    return f"{sym}.NS"


# ==============================================================================
# 1. Real-Time Quotes
# ==============================================================================

def get_live_stock_quote(symbol: str) -> Dict[str, Any]:
    """Fetch live stock price quote directly via Yahoo Finance."""
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    t_start = time.time()
    try:
        ticker = yf.Ticker(yf_sym)
        fast_info = ticker.fast_info
        
        last_price = getattr(fast_info, "last_price", None)
        prev_close = getattr(fast_info, "previous_close", None)
        
        # If .NS returns empty, try .BO (BSE) fallback
        if (last_price is None or last_price == 0) and yf_sym.endswith(".NS"):
            bse_sym = yf_sym.replace(".NS", ".BO")
            ticker = yf.Ticker(bse_sym)
            fast_info = ticker.fast_info
            last_price = getattr(fast_info, "last_price", None)
            prev_close = getattr(fast_info, "previous_close", None)
            yf_sym = bse_sym

        if last_price is None:
            # Fallback to history 1d
            hist = ticker.history(period="1d")
            if not hist.empty:
                last_price = float(hist["Close"].iloc[-1])
                prev_close = float(hist["Open"].iloc[0])

        if last_price is None:
            return {"error": f"Quote not available for symbol '{symbol}'."}

        change = round(last_price - prev_close, 2) if (last_price is not None and prev_close is not None) else 0.0
        change_pct = round((change / prev_close) * 100, 2) if (prev_close and prev_close > 0) else 0.0

        open_price = getattr(fast_info, "open", None)
        day_high = getattr(fast_info, "day_high", None)
        day_low = getattr(fast_info, "day_low", None)
        volume = getattr(fast_info, "last_volume", None)
        mcap = getattr(fast_info, "market_cap", None)
        year_high = getattr(fast_info, "year_high", None)
        year_low = getattr(fast_info, "year_low", None)
        currency = getattr(fast_info, "currency", "INR")

        elapsed = int((time.time() - t_start) * 1000)
        print(f"[MarketService] Quote for {clean_sym} -> INR {last_price} ({change_pct}%) in {elapsed}ms", flush=True)

        return {
            "symbol": clean_sym,
            "yf_symbol": yf_sym,
            "current_price": round(float(last_price), 2),
            "regularMarketPrice": round(float(last_price), 2),
            "regularMarketPreviousClose": round(float(prev_close), 2) if prev_close else None,
            "change": change,
            "regularMarketChange": change,
            "change_percent": change_pct,
            "regularMarketChangePercent": change_pct,
            "open": round(float(open_price), 2) if open_price else None,
            "high": round(float(day_high), 2) if day_high else None,
            "low": round(float(day_low), 2) if day_low else None,
            "volume": int(volume) if volume else None,
            "market_cap": mcap,
            "fiftyTwoWeekHigh": round(float(year_high), 2) if year_high else None,
            "fiftyTwoWeekLow": round(float(year_low), 2) if year_low else None,
            "currency": currency,
            "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
    except Exception as e:
        print(f"[MarketService Error] Quote failed for {symbol}: {e}", flush=True)
        return {"error": f"Failed to fetch live quote for {symbol}: {str(e)}"}


# ==============================================================================
# 2. Historical Candle Data (OHLCV)
# ==============================================================================

def get_stock_history_data(symbol: str, days: str = "1", start_date: Optional[str] = None, end_date: Optional[str] = None, interval: str = "1d") -> List[Dict[str, Any]]:
    """Fetch historical candle price data (OHLCV) directly via Yahoo Finance."""
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    t_start = time.time()
    try:
        ticker = yf.Ticker(yf_sym)
        
        if start_date:
            import datetime
            # yfinance 'end' is exclusive. If fetching a single day, add 1 day to end_date.
            if not end_date or start_date == end_date:
                dt = datetime.datetime.strptime(start_date, "%Y-%m-%d")
                end_date = (dt + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
                
            df = ticker.history(start=start_date, end=end_date, interval=interval)
            period = f"{start_date} - {end_date}"
        else:
            # Map timeframe to yfinance period
            d_str = str(days).strip().upper()
            if d_str in ("1", "1D"):
                period = "1d"
            elif d_str in ("5", "5D", "7", "7D"):
                period = "5d"
            elif d_str in ("30", "1M", "1MO"):
                period = "1mo"
            elif d_str in ("90", "3M", "3MO"):
                period = "3mo"
            elif d_str in ("180", "6M", "6MO"):
                period = "6mo"
            elif d_str in ("365", "1Y", "1YR"):
                period = "1y"
            elif d_str in ("ALL", "MAX", "5Y"):
                period = "5y"
            else:
                num = int(re.sub(r"\D", "", d_str) or "1")
                if num <= 2:
                    period = "1d"
                elif num <= 7:
                    period = "5d"
                elif num <= 60:
                    period = "1mo"
                elif num <= 365:
                    period = "1y"
                else:
                    period = "5y"

            df = ticker.history(period=period, interval=interval)
        
        # BSE fallback if empty
        if df.empty and yf_sym.endswith(".NS"):
            bse_sym = yf_sym.replace(".NS", ".BO")
            ticker = yf.Ticker(bse_sym)
            if start_date:
                df = ticker.history(start=start_date, end=end_date, interval=interval)
            else:
                df = ticker.history(period=period, interval=interval)

        if df.empty:
            return []

        candles = []
        for index, row in df.iterrows():
            ts = int(index.timestamp() * 1000)
            candles.append({
                "x": ts,
                "o": round(float(row["Open"]), 2),
                "h": round(float(row["High"]), 2),
                "l": round(float(row["Low"]), 2),
                "c": round(float(row["Close"]), 2),
                "v": int(row.get("Volume", 0)),
            })

        elapsed = int((time.time() - t_start) * 1000)
        print(f"[MarketService] History for {clean_sym} ({period}/{interval}) -> {len(candles)} candles in {elapsed}ms", flush=True)
        return candles

    except Exception as e:
        print(f"[MarketService Error] History failed for {symbol}: {e}", flush=True)
        return []


# ==============================================================================
# 3. Fast In-Memory Stock Search & Catalog
# ==============================================================================

def search_stocks_direct(query: str, limit: int = 15) -> List[Dict[str, Any]]:
    """Ultra-fast in-memory fuzzy and prefix search over Indian stock instruments."""
    q = query.strip().upper()
    if not q:
        return []

    exact_matches = []
    prefix_matches = []
    contains_matches = []

    for item in INSTRUMENTS:
        sym = item["symbol"]
        name = item["name"].upper()

        if sym == q:
            exact_matches.append(item)
        elif sym.startswith(q):
            prefix_matches.append(item)
        elif q in sym or q in name:
            contains_matches.append(item)

    combined = exact_matches + prefix_matches + contains_matches
    
    # If no local instruments matched, query yfinance search
    if not combined:
        try:
            yf_search = yf.Search(query, max_results=limit)
            quotes = getattr(yf_search, "quotes", [])
            for q_item in quotes:
                raw_sym = q_item.get("symbol", "")
                clean = raw_sym.replace(".NS", "").replace(".BO", "")
                combined.append({
                    "symbol": clean,
                    "name": q_item.get("shortname") or q_item.get("longname") or clean,
                    "instrument_key": f"NSE_EQ|{clean}",
                    "category": "Stocks",
                })
        except Exception:
            pass

    return combined[:limit]


def get_stock_list_direct(limit: int = 100) -> List[Dict[str, Any]]:
    """Return top tradable Indian stock symbols, prioritizing highly traded stocks."""
    try:
        limit = int(limit)
    except (ValueError, TypeError):
        limit = 100

    TOP_STOCKS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "top_stocks.json")
    
    top_symbols = [
        "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "ITC", "SBIN", 
        "BHARTIARTL", "KOTAKBANK", "LT", "AXISBANK", "BAJFINANCE", "ASIANPAINT", 
        "MARUTI", "TITAN", "SUNPHARMA", "ULTRACEMCO", "HINDUNILVR", "NTPC", 
        "TATAMOTORS", "M&M", "POWERGRID", "TATASTEEL", "COALINDIA", "BAJAJFINSV"
    ]
    
    if os.path.exists(TOP_STOCKS_PATH):
        try:
            with open(TOP_STOCKS_PATH, "r", encoding="utf-8") as f:
                loaded_symbols = json.load(f)
                if loaded_symbols and isinstance(loaded_symbols, list):
                    top_symbols = loaded_symbols
        except Exception:
            pass
    
    result = []
    
    # 1. Add our predefined top symbols first
    for sym in top_symbols:
        if sym in SYMBOL_INDEX:
            result.append(SYMBOL_INDEX[sym])
            
    # 2. Fill the rest from the dynamic map if we haven't reached the limit
    if len(result) < limit:
        dynamic_symbols = set()
        for peers in DYNAMIC_SECTOR_MAP.values():
            dynamic_symbols.update(peers)
            
        # Add dynamic ones avoiding duplicates
        for sym in list(dynamic_symbols):
            if sym not in top_symbols and sym in SYMBOL_INDEX:
                result.append(SYMBOL_INDEX[sym])
                if len(result) >= limit:
                    break
                    
    # 3. Extreme fallback if map is empty somehow
    if not result and INSTRUMENTS:
        return INSTRUMENTS[:limit]
        
    return result[:limit]


# ==============================================================================
# 4. Company Profile & Sector Peers
# ==============================================================================

def get_stock_profile_direct(symbol: str) -> Dict[str, Any]:
    """Retrieve detailed fundamental profile, sector, and industry for a stock."""
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    try:
        ticker = yf.Ticker(yf_sym)
        info = ticker.info or {}
        
        sector = info.get("sector", "Diversified")
        
        if sector not in DYNAMIC_SECTOR_MAP:
            DYNAMIC_SECTOR_MAP[sector] = set()
            
        if clean_sym not in DYNAMIC_SECTOR_MAP[sector]:
            DYNAMIC_SECTOR_MAP[sector].add(clean_sym)
            save_dynamic_sectors()
        
        return {
            "symbol": clean_sym,
            "company_name": info.get("longName") or info.get("shortName") or clean_sym,
            "sector": sector,
            "industry": info.get("industry", "Diversified"),
            "website": info.get("website", ""),
            "description": info.get("longBusinessSummary", "No company summary available."),
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "dividend_yield": info.get("dividendYield"),
            "beta": info.get("beta"),
            "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
            "currency": info.get("currency", "INR"),
        }
    except Exception as e:
        print(f"[MarketService Error] Profile failed for {symbol}: {e}", flush=True)
        return {
            "symbol": clean_sym,
            "company_name": clean_sym,
            "sector": "Indian Equities",
            "description": f"Details for {clean_sym} listed on NSE/BSE.",
        }


def get_similar_stocks_direct(symbol: str) -> Dict[str, Any]:
    """Find sector peers and similar stocks for comparison."""
    clean_sym = _normalize_symbol(symbol)

    # 1. Fast path: Check if we already have the sector cached
    for sec, peers in DYNAMIC_SECTOR_MAP.items():
        if clean_sym in peers:
            similar = [s for s in peers if s != clean_sym]
            if similar:
                return {
                    "symbol": clean_sym,
                    "sector": sec,
                    "similar_stocks": similar[:6],
                }

    # 2. Slow path: Query yfinance if not cached
    try:
        yf_sym = _get_yf_symbol(clean_sym)
        ticker = yf.Ticker(yf_sym)
        info = ticker.info or {}
        sector = info.get("sector", "General")
        
        # Dynamically add to our sector map
        if sector not in DYNAMIC_SECTOR_MAP:
            DYNAMIC_SECTOR_MAP[sector] = set()
            
        if clean_sym not in DYNAMIC_SECTOR_MAP[sector]:
            DYNAMIC_SECTOR_MAP[sector].add(clean_sym)
            save_dynamic_sectors()
        
        # Find other stocks in the same sector
        similar = [s for s in DYNAMIC_SECTOR_MAP[sector] if s != clean_sym]

        if not similar:
            similar = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"]

        return {
            "symbol": clean_sym,
            "sector": sector,
            "similar_stocks": list(similar)[:6],
        }
    except Exception:
        # Fallback if yfinance lookup fails
        for sec, peers in DYNAMIC_SECTOR_MAP.items():
            if clean_sym in peers:
                return {
                    "symbol": clean_sym,
                    "sector": sec,
                    "similar_stocks": list(peers - {clean_sym})[:6],
                }
        return {
            "symbol": clean_sym,
            "sector": "Equities",
            "similar_stocks": ["RELIANCE", "TCS", "INFY", "HDFCBANK"],
        }



# ==============================================================================
# 6. Fundamental Financials & Statements
# ==============================================================================

def get_financial_statements(symbol: str) -> Dict[str, Any]:
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    try:
        ticker = yf.Ticker(yf_sym)
        inc_stmt = ticker.financials
        bal_sheet = ticker.balance_sheet
        cash_flow = ticker.cashflow
        
        def safe_to_dict(df):
            if df is None or df.empty:
                return {}
            # Convert timestamp columns to strings
            df.columns = [str(c).split()[0] for c in df.columns]
            # Replace NaNs with None for JSON serialization
            df = df.replace({np.nan: None})
            return df.to_dict()

        return {
            "symbol": clean_sym,
            "income_statement": safe_to_dict(inc_stmt),
            "balance_sheet": safe_to_dict(bal_sheet),
            "cash_flow": safe_to_dict(cash_flow)
        }
    except Exception as e:
        print(f"[MarketService Error] Financials failed for {symbol}: {e}")
        return {"error": str(e)}

def get_key_metrics(symbol: str) -> Dict[str, Any]:
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    try:
        ticker = yf.Ticker(yf_sym)
        info = ticker.info or {}
        return {
            "symbol": clean_sym,
            "trailing_pe": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "peg_ratio": info.get("pegRatio"),
            "price_to_book": info.get("priceToBook"),
            "debt_to_equity": info.get("debtToEquity"),
            "profit_margins": info.get("profitMargins"),
            "return_on_equity": info.get("returnOnEquity"),
            "revenue_growth": info.get("revenueGrowth"),
            "earnings_growth": info.get("earningsGrowth"),
            "dividend_yield": info.get("dividendYield"),
            "free_cashflow": info.get("freeCashflow")
        }
    except Exception as e:
        print(f"[MarketService Error] Metrics failed for {symbol}: {e}")
        return {"error": str(e)}


# ==============================================================================
# 7. Analyst Recommendations & Price Targets
# ==============================================================================

def get_analyst_recommendations(symbol: str) -> Dict[str, Any]:
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    try:
        ticker = yf.Ticker(yf_sym)
        recs = ticker.recommendations
        info = ticker.info or {}
        
        recs_list = []
        if recs is not None and not recs.empty:
            recs_list = recs.replace({np.nan: None}).to_dict("records")
            
        return {
            "symbol": clean_sym,
            "target_high": info.get("targetHighPrice"),
            "target_low": info.get("targetLowPrice"),
            "target_mean": info.get("targetMeanPrice"),
            "target_median": info.get("targetMedianPrice"),
            "recommendation_mean": info.get("recommendationMean"),
            "recommendation_key": info.get("recommendationKey"),
            "number_of_analysts": info.get("numberOfAnalystOpinions"),
            "recent_recommendations": recs_list
        }
    except Exception as e:
        print(f"[MarketService Error] Analyst recs failed for {symbol}: {e}")
        return {"error": str(e)}


# ==============================================================================
# 7.5 Risk Metrics
# ==============================================================================

def get_risk_metrics(symbol: str, period: str = "1y") -> Dict[str, Any]:
    """Calculate institutional risk metrics (Beta, Volatility, Max Drawdown)."""
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    benchmark_sym = "^NSEI"  # Nifty 50 as benchmark

    try:
        # Fetch historical data for both asset and benchmark
        asset_data = yf.download(yf_sym, period=period, progress=False)
        bench_data = yf.download(benchmark_sym, period=period, progress=False)
        
        if asset_data.empty or bench_data.empty:
            return {"error": f"Insufficient data to calculate risk metrics for {symbol} over {period}"}
            
        # Extract closing prices
        asset_close = asset_data['Close'].squeeze()
        bench_close = bench_data['Close'].squeeze()
        
        # Align dates
        df = pd.DataFrame({"Asset": asset_close, "Benchmark": bench_close}).dropna()
        
        # Calculate daily returns
        returns = df.pct_change().dropna()
        
        # 1. Annualized Volatility (Standard Deviation)
        # Assuming 252 trading days in a year
        volatility = returns['Asset'].std() * np.sqrt(252)
        
        # 2. Beta (Covariance / Variance)
        covariance = returns['Asset'].cov(returns['Benchmark'])
        variance = returns['Benchmark'].var()
        beta = covariance / variance if variance != 0 else 1.0
        
        # 3. Maximum Drawdown
        cumulative_returns = (1 + returns['Asset']).cumprod()
        peak = cumulative_returns.cummax()
        drawdown = (cumulative_returns - peak) / peak
        max_drawdown = drawdown.min()
        
        return {
            "symbol": clean_sym,
            "period": period,
            "beta": round(float(beta), 2),
            "annualized_volatility": round(float(volatility * 100), 2), # As percentage
            "max_drawdown": round(float(max_drawdown * 100), 2), # As percentage
            "benchmark": "Nifty 50"
        }
    except Exception as e:
        print(f"[MarketService Error] Risk metrics failed for {symbol}: {e}")
        return {"error": str(e)}

# ==============================================================================
# 8. Technical Indicators
# ==============================================================================

def get_specific_indicator(symbol: str, indicator_type: str, period: int = 14) -> Dict[str, Any]:
    """Fetch and calculate a specific technical indicator dynamically."""
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    # Import AlgoTrading engine dynamically to avoid circular/path issues
    import sys
    base_proj_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if base_proj_dir not in sys.path:
        sys.path.append(base_proj_dir)
        
    from AlgoTrading.Algos.indicators.indicator_engine import indicator_engine
    from AlgoTrading.Algos.core.base_strategy import Candle
    
    try:
        ticker = yf.Ticker(yf_sym)
        # Pull 2 years to ensure we have enough data for 200-day moving averages
        df = ticker.history(period="2y")
        if df.empty:
            return {"error": "No historical data available"}
            
        # Convert DataFrame to Candle objects
        candles = []
        for idx, row in df.iterrows():
            candles.append(Candle(
                timestamp=str(idx),
                open=float(row["Open"]),
                high=float(row["High"]),
                low=float(row["Low"]),
                close=float(row["Close"]),
                volume=float(row["Volume"])
            ))
            
        current_price = float(df["Close"].iloc[-1])
        ind = indicator_type.upper().strip()
        
        def safe_float(val):
            if val is None or pd.isna(val):
                return None
            return float(round(val, 2))
            
        result = {
            "symbol": clean_sym, 
            "indicator": ind, 
            "period": period, 
            "current_price": safe_float(current_price)
        }
        
        if ind in ["SMA", "EMA", "RSI", "ATR"]:
            res = indicator_engine.calculate(ind, candles, period=period)[-1]
            result["value"] = safe_float(res)
        elif ind == "MACD":
            res = indicator_engine.calculate("MACD", candles)
            result["macd"] = safe_float(res.macd[-1])
            result["signal"] = safe_float(res.signal[-1])
        elif ind in ["BB", "BOLLINGERBANDS", "BOLLINGER BANDS"]:
            res = indicator_engine.calculate("BollingerBands", candles, period=period, multiplier=2.0)
            result["upper"] = safe_float(res.upper[-1])
            result["lower"] = safe_float(res.lower[-1])
        elif ind == "VWAP":
            res = indicator_engine.calculate("VWAP", candles, reset_daily=True)
            result["value"] = safe_float(res[-1] if res else None)
        elif ind == "SUPERTREND":
            res = indicator_engine.calculate("SuperTrend", candles, period=period, multiplier=3.0)
            result["value"] = safe_float(res.supertrend[-1])
            result["direction"] = int(res.trend[-1]) if res.trend else 0
        else:
            return {"error": f"Unsupported indicator type: {indicator_type}"}
            
        return result
    except Exception as e:
        print(f"[MarketService Error] Technicals ({indicator_type}) failed for {symbol}: {e}")
        return {"error": str(e)}


# ==============================================================================
# 9. Options Chain Data
# ==============================================================================

def get_options_chain(symbol: str, expiry_date: str = None) -> Dict[str, Any]:
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    try:
        ticker = yf.Ticker(yf_sym)
        expirations = ticker.options
        if not expirations:
            return {"symbol": clean_sym, "error": "No options data available"}
            
        target_expiry = expiry_date if expiry_date in expirations else expirations[0]
        chain = ticker.option_chain(target_expiry)
        
        def parse_chain(df):
            if df is None or df.empty:
                return []
            df = df.replace({np.nan: None})
            return df.to_dict("records")
            
        return {
            "symbol": clean_sym,
            "available_expirations": list(expirations),
            "current_expiry": target_expiry,
            "calls": parse_chain(chain.calls),
            "puts": parse_chain(chain.puts)
        }
    except Exception as e:
        print(f"[MarketService Error] Options failed for {symbol}: {e}")
        return {"error": str(e)}


# ==============================================================================
# 10. Market Breadth & Global Indices
# ==============================================================================

def get_global_indices() -> List[Dict[str, Any]]:
    indices = {
        "NIFTY 50": "^NSEI",
        "SENSEX": "^BSESN",
        "S&P 500": "^GSPC",
        "NASDAQ": "^IXIC",
        "GOLD": "GC=F",
        "CRUDE OIL": "CL=F"
    }
    
    results = []
    try:
        tickers = yf.Tickers(" ".join(indices.values()))
        for name, ticker_sym in indices.items():
            t = tickers.tickers.get(ticker_sym)
            if t:
                info = t.fast_info
                last = getattr(info, "last_price", None)
                prev = getattr(info, "previous_close", None)
                if last and prev:
                    change = last - prev
                    change_pct = (change / prev) * 100
                    results.append({
                        "name": name,
                        "symbol": ticker_sym,
                        "price": round(last, 2),
                        "change": round(change, 2),
                        "change_percent": round(change_pct, 2)
                    })
    except Exception as e:
        print(f"[MarketService Error] Global indices failed: {e}")
        
    return results

def get_top_movers() -> Dict[str, Any]:
    # We use top_stocks list for quick querying
    symbols = [item["symbol"] for item in get_stock_list_direct(limit=50)]
    if not symbols:
        return {"error": "No stock list available"}
        
    yf_symbols = [_get_yf_symbol(s) for s in symbols]
    
    try:
        # Batch fetch for speed
        tickers = yf.Tickers(" ".join(yf_symbols))
        movers = []
        
        for i, sym in enumerate(symbols):
            t = tickers.tickers.get(yf_symbols[i])
            if t:
                try:
                    last = getattr(t.fast_info, "last_price", None)
                    prev = getattr(t.fast_info, "previous_close", None)
                    if last and prev and prev > 0:
                        change_pct = ((last - prev) / prev) * 100
                        movers.append({
                            "symbol": sym,
                            "price": round(last, 2),
                            "change_percent": round(change_pct, 2)
                        })
                except Exception:
                    continue
                    
        movers.sort(key=lambda x: x["change_percent"], reverse=True)
        
        return {
            "top_gainers": movers[:5],
            "top_losers": movers[-5:][::-1] if len(movers) >= 5 else movers
        }
    except Exception as e:
        print(f"[MarketService Error] Top movers failed: {e}")
        return {"error": str(e)}


# ==============================================================================
# 11. Dividend & Split History
# ==============================================================================

def get_corporate_actions(symbol: str) -> Dict[str, Any]:
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    try:
        ticker = yf.Ticker(yf_sym)
        divs = ticker.dividends
        splits = ticker.splits
        
        def series_to_list(series):
            if series is None or series.empty:
                return []
            return [{"date": str(idx).split()[0], "value": float(val)} for idx, val in series.items()]
            
        return {
            "symbol": clean_sym,
            "dividends": series_to_list(divs),
            "splits": series_to_list(splits)
        }
    except Exception as e:
        print(f"[MarketService Error] Corporate actions failed for {symbol}: {e}")
        return {"error": str(e)}


# ==============================================================================
# 10. News & Sentiment Analysis
# ==============================================================================

def get_recent_news(symbol: str) -> Dict[str, Any]:
    """
    Fetches the latest news and sentiment for a stock from the local NewsAnalysis API.
    The NewsAnalysis server (port 5001) fetches from BSE and enriches with LLMs.
    """
    import urllib.request
    import json
    
    clean_sym = _normalize_symbol(symbol)
    url = f"http://localhost:5001/api/news/stock/{clean_sym}?live=true"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            
        news_items = data.get("data", [])
        
        # Format the response for the agent
        formatted_news = []
        for item in news_items:
            formatted_news.append({
                "date": item.get("announced_at"),
                "headline": item.get("headline"),
                "summary": item.get("ai_summary"),
                "sentiment": item.get("sentiment"),
                "category": item.get("category")
            })
            
        return {
            "symbol": clean_sym,
            "news_count": len(formatted_news),
            "news": formatted_news
        }
    except Exception as e:
        print(f"[MarketService Error] News fetch failed for {symbol}: {e}")
        return {"error": f"Failed to fetch news. Ensure NewsAnalysis server is running on port 5001. ({str(e)})"}

# ==============================================================================
# 11. Historical Performance & Momentum
# ==============================================================================

def get_price_performance(symbol: str) -> Dict[str, Any]:
    """
    Calculates percentage price returns for 1W, 1M, 3M, 6M, YTD, and 1Y timeframes.
    """
    import datetime
    
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    try:
        ticker = yf.Ticker(yf_sym)
        # Fetch a bit more than 1 year to ensure we have exactly 1 year ago trading day
        df = ticker.history(period="1y")
        if df.empty or len(df) < 5:
            return {"error": "Not enough historical data"}
            
        current_price = df["Close"].iloc[-1]
        last_date = df.index[-1]
        
        def get_return(days_ago):
            target_date = last_date - datetime.timedelta(days=days_ago)
            # Find the closest trading day on or before target_date
            past_df = df[df.index <= target_date]
            if past_df.empty:
                return None
            past_price = past_df["Close"].iloc[-1]
            return round(((current_price - past_price) / past_price) * 100, 2)
            
        # YTD logic
        year_start = datetime.datetime(last_date.year, 1, 1).date()
        past_df_ytd = df[df.index.date >= year_start]
        if past_df_ytd.empty:
            ytd_return = None
        else:
            # We want the price just before the year started, or the first price of the year
            ytd_start_price = past_df_ytd["Close"].iloc[0]
            ytd_return = round(((current_price - ytd_start_price) / ytd_start_price) * 100, 2)

        return {
            "symbol": clean_sym,
            "current_price": round(float(current_price), 2),
            "returns_1W": get_return(7),
            "returns_1M": get_return(30),
            "returns_3M": get_return(90),
            "returns_6M": get_return(180),
            "returns_1Y": get_return(365),
            "returns_YTD": ytd_return
        }
    except Exception as e:
        print(f"[MarketService Error] Performance fetch failed for {symbol}: {e}")
        return {"error": str(e)}

# ==============================================================================
# 12. Peer / Competitor Comparison
# ==============================================================================

def compare_peers(symbol: str) -> Dict[str, Any]:
    """
    Finds the stock's sector, randomly selects up to 3 peers from the same sector,
    and returns a fundamental comparison matrix (Market Cap, P/E, P/B, ROE).
    """
    import random
    
    clean_sym = _normalize_symbol(symbol)
    
    try:
        # Find the sector of the stock
        target_sector = None
        for sector_name, stocks in DYNAMIC_SECTOR_MAP.items():
            if clean_sym in stocks:
                target_sector = sector_name
                break
                
        if not target_sector:
            return {"error": f"No sector mapping found for {clean_sym}"}
            
        sector_stocks = list(DYNAMIC_SECTOR_MAP[target_sector])
        sector_stocks.remove(clean_sym)
        
        # Pick up to 3 random peers
        peers = random.sample(sector_stocks, min(3, len(sector_stocks)))
        symbols_to_fetch = [clean_sym] + peers
        
        comparison = []
        for sym in symbols_to_fetch:
            yf_sym = _get_yf_symbol(sym)
            ticker = yf.Ticker(yf_sym)
            info = ticker.info
            
            comparison.append({
                "symbol": sym,
                "company_name": info.get("longName", sym),
                "market_cap": info.get("marketCap"),
                "trailing_pe": info.get("trailingPE"),
                "price_to_book": info.get("priceToBook"),
                "return_on_equity": info.get("returnOnEquity")
            })
            
        return {
            "symbol": clean_sym,
            "sector": target_sector,
            "peers": peers,
            "comparison": comparison
        }
    except Exception as e:
        print(f"[MarketService Error] Peer comparison failed for {symbol}: {e}")
        return {"error": str(e)}

# ==============================================================================
# 13. Support & Resistance (Pivot Points)
# ==============================================================================

def get_pivot_points(symbol: str) -> Dict[str, Any]:
    """
    Calculates Standard and Fibonacci Pivot Points based on the previous day's high/low/close.
    """
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    try:
        ticker = yf.Ticker(yf_sym)
        # Fetch last 5 days to ensure we have the previous completed trading day
        df = ticker.history(period="5d")
        if df.empty or len(df) < 2:
            return {"error": "Not enough historical data"}
            
        # We use the previous day (not the current live incomplete day)
        prev_day = df.iloc[-2]
        
        high = float(prev_day["High"])
        low = float(prev_day["Low"])
        close = float(prev_day["Close"])
        
        # Standard Pivot Points
        p = (high + low + close) / 3.0
        r1 = (p * 2) - low
        r2 = p + (high - low)
        r3 = high + 2 * (p - low)
        s1 = (p * 2) - high
        s2 = p - (high - low)
        s3 = low - 2 * (high - p)
        
        # Fibonacci Pivot Points
        diff = high - low
        fib_r1 = p + 0.382 * diff
        fib_r2 = p + 0.618 * diff
        fib_r3 = p + 1.000 * diff
        fib_s1 = p - 0.382 * diff
        fib_s2 = p - 0.618 * diff
        fib_s3 = p - 1.000 * diff
        
        return {
            "symbol": clean_sym,
            "date": df.index[-2].strftime("%Y-%m-%d"),
            "previous_day_ohlc": {
                "high": round(high, 2),
                "low": round(low, 2),
                "close": round(close, 2)
            },
            "standard": {
                "P": round(p, 2),
                "R1": round(r1, 2),
                "R2": round(r2, 2),
                "R3": round(r3, 2),
                "S1": round(s1, 2),
                "S2": round(s2, 2),
                "S3": round(s3, 2)
            },
            "fibonacci": {
                "P": round(p, 2),
                "R1": round(fib_r1, 2),
                "R2": round(fib_r2, 2),
                "R3": round(fib_r3, 2),
                "S1": round(fib_s1, 2),
                "S2": round(fib_s2, 2),
                "S3": round(fib_s3, 2)
            }
        }
    except Exception as e:
        print(f"[MarketService Error] Pivot points fetch failed for {symbol}: {e}")
        return {"error": str(e)}

# ==============================================================================
# 14. Shareholding Patterns
# ==============================================================================

def get_shareholding_pattern(symbol: str) -> Dict[str, Any]:
    """
    Fetches the major, institutional, and mutual fund holders for a stock.
    """
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    try:
        ticker = yf.Ticker(yf_sym)
        
        def df_to_list(df):
            if df is None or df.empty:
                return []
            # Fill NaN values with None for JSON serialization
            df = df.where(pd.notna(df), None)
            return df.to_dict(orient="records")
            
        major_holders = df_to_list(ticker.major_holders)
        institutional_holders = df_to_list(ticker.institutional_holders)
        mutualfund_holders = df_to_list(ticker.mutualfund_holders)
        
        # Clean up the dictionaries so they look presentable
        def format_records(records):
            formatted = []
            for r in records:
                # Some DataFrames from yfinance use numbers as column names for major holders
                clean_r = {str(k): v for k, v in r.items()}
                formatted.append(clean_r)
            return formatted

        return {
            "symbol": clean_sym,
            "major_holders": format_records(major_holders),
            "institutional_holders": format_records(institutional_holders),
            "mutualfund_holders": format_records(mutualfund_holders)
        }
    except Exception as e:
        print(f"[MarketService Error] Shareholding fetch failed for {symbol}: {e}")
        return {"error": str(e)}





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

# Find subscriptions.json path
SUBSCRIPTION_PATHS = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Upstox-Backend", "subscriptions.json")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Stockify", "Upstox-Backend", "subscriptions.json")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Stockify-Backend", "data", "subscriptions.json")),
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

# Curated sector mappings for peer comparisons
SECTOR_PEERS = {
    "IT": ["TCS", "INFY", "HCLTECH", "WIPRO", "TECHM", "LTIM", "PERSISTENT", "COFORGE"],
    "BANKING": ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK", "BANKBARODA", "PNB"],
    "AUTO": ["MARUTI", "TATAMOTORS", "M&M", "BAJAJ-AUTO", "EICHERMOT", "HEROMOTOCO", "TVSMOTOR"],
    "ENERGY": ["RELIANCE", "ONGC", "BPCL", "IOC", "COALINDIA", "NTPC", "POWERGRID", "ADANIGREEN"],
    "METALS": ["TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL", "JINDALSTEL", "NMDC", "NATIONALUM"],
    "PHARMA": ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "APOLLOHOSP", "LUPIN", "AUROPHARMA"],
    "FMCG": ["ITC", "HINDUNILVR", "NESTLEIND", "BRITANNIA", "TATACONSUM", "DABUR", "MARICO", "GODREJCP"],
    "FINANCE": ["BAJFINANCE", "BAJAJFINSV", "SHRIRAMFIN", "CHOLAFIN", "MUTHOOTFIN", "JIOFIN"],
}

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

def get_stock_history_data(symbol: str, days: str = "1") -> List[Dict[str, Any]]:
    """Fetch historical candle price data (OHLCV) directly via Yahoo Finance."""
    clean_sym = _normalize_symbol(symbol)
    yf_sym = _get_yf_symbol(clean_sym)
    
    # Map timeframe to yfinance period & interval
    d_str = str(days).strip().upper()
    if d_str in ("1", "1D"):
        period = "1d"
        interval = "5m"
    elif d_str in ("5", "5D", "7", "7D"):
        period = "5d"
        interval = "15m"
    elif d_str in ("30", "1M", "1MO"):
        period = "1mo"
        interval = "1h"
    elif d_str in ("90", "3M", "3MO"):
        period = "3mo"
        interval = "1d"
    elif d_str in ("180", "6M", "6MO"):
        period = "6mo"
        interval = "1d"
    elif d_str in ("365", "1Y", "1YR"):
        period = "1y"
        interval = "1d"
    elif d_str in ("ALL", "MAX", "5Y"):
        period = "5y"
        interval = "1wk"
    else:
        num = int(re.sub(r"\D", "", d_str) or "1")
        if num <= 2:
            period, interval = "1d", "5m"
        elif num <= 7:
            period, interval = "5d", "15m"
        elif num <= 60:
            period, interval = "1mo", "1h"
        elif num <= 365:
            period, interval = "1y", "1d"
        else:
            period, interval = "5y", "1wk"

    t_start = time.time()
    try:
        ticker = yf.Ticker(yf_sym)
        df = ticker.history(period=period, interval=interval)
        
        # BSE fallback if empty
        if df.empty and yf_sym.endswith(".NS"):
            bse_sym = yf_sym.replace(".NS", ".BO")
            ticker = yf.Ticker(bse_sym)
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
    """Return top tradable Indian stock symbols from the local index."""
    if INSTRUMENTS:
        return INSTRUMENTS[:limit]
    # Fallback to Nifty 50 defaults
    return [
        {"symbol": s.replace(".NS", ""), "name": s.replace(".NS", ""), "category": "Stocks"}
        for s in [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "ITC", "SBIN", "BHARTIARTL",
            "KOTAKBANK", "LT", "AXISBANK", "BAJFINANCE", "ASIANPAINT", "MARUTI", "TITAN"
        ]
    ]


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
        
        return {
            "symbol": clean_sym,
            "company_name": info.get("longName") or info.get("shortName") or clean_sym,
            "sector": info.get("sector", "Diversified"),
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
    
    # 1. Check curated sector mappings
    matched_sector = None
    for sector, peers in SECTOR_PEERS.items():
        if clean_sym in peers:
            matched_sector = sector
            similar = [p for p in peers if p != clean_sym]
            return {
                "symbol": clean_sym,
                "sector": sector,
                "similar_stocks": similar,
            }

    # 2. Otherwise query yfinance info
    try:
        yf_sym = _get_yf_symbol(clean_sym)
        ticker = yf.Ticker(yf_sym)
        info = ticker.info or {}
        sector = info.get("sector", "General")
        
        # Find other stocks in the same sector from our index
        similar = []
        for s, peers in SECTOR_PEERS.items():
            if sector.upper() in s or s in sector.upper():
                similar = [p for p in peers if p != clean_sym]
                break
                
        if not similar:
            similar = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"]

        return {
            "symbol": clean_sym,
            "sector": sector,
            "similar_stocks": similar[:6],
        }
    except Exception:
        return {
            "symbol": clean_sym,
            "sector": "Equities",
            "similar_stocks": ["RELIANCE", "TCS", "INFY", "HDFCBANK"],
        }


# ==============================================================================
# 5. Financial Market News Feed
# ==============================================================================

def get_market_news_direct(category: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
    """Fetch latest Indian financial and stock market news feeds via Google News RSS / Yahoo Finance."""
    query = "Indian stock market NSE BSE economy"
    if category:
        query = f"Indian stock market {category} NSE BSE"

    rss_url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=en-IN&gl=IN&ceid=IN:en"
    
    t_start = time.time()
    articles = []
    try:
        req = urllib.request.Request(
            rss_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            xml_data = response.read()
            root = ET.fromstring(xml_data)
            
            for item in root.findall(".//item")[:limit]:
                title = item.findtext("title", "")
                link = item.findtext("link", "")
                pub_date = item.findtext("pubDate", "")
                source = item.findtext("source", "Financial News")

                articles.append({
                    "title": title,
                    "url": link,
                    "published_at": pub_date,
                    "source": source,
                    "category": category or "Indian Markets",
                })
                
        elapsed = int((time.time() - t_start) * 1000)
        print(f"[MarketService] Fetched {len(articles)} news items in {elapsed}ms", flush=True)
        return articles

    except Exception as e:
        print(f"[MarketService Warning] RSS News failed: {e}. Falling back to default news items.", flush=True)
        return [
            {
                "title": "Indian Benchmark Indices Nifty and Sensex Trade Near Key Support Levels",
                "source": "Market Wire",
                "category": "Markets",
                "published_at": time.strftime("%Y-%m-%d"),
            }
        ]

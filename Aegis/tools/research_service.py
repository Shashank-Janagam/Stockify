"""
research_service.py — Market Research and Macroeconomic Data Service
====================================================================
Handles web searches, news feeds, RBI/MOSPI macro data, and company announcements.
"""

import json
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional
import yfinance as yf

def _normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()

def _get_yf_symbol(symbol: str) -> str:
    sym = _normalize_symbol(symbol)
    if sym.startswith("^") or sym.endswith(".NS") or sym.endswith(".BO"):
        return sym
    return f"{sym}.NS"


# ==============================================================================
# 1. Financial Market News Feed (Moved from Market Service)
# ==============================================================================

def get_financial_news_direct(category: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
    """Fetch latest Indian financial and stock market news feeds via Google News RSS."""
    query = "Indian stock market NSE BSE economy"
    if category:
        query = f" Indian stock market on 24 sep"

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
        print(f"[ResearchService] Fetched {len(articles)} news items in {elapsed}ms", flush=True)
        return articles

    except Exception as e:
        print(f"[ResearchService Warning] RSS News failed: {e}. Falling back to default news items.", flush=True)
        return []

# ==============================================================================
# 2. Company Announcements (NSE/BSE)
# ==============================================================================

def get_company_announcements_direct(symbol: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Fetch the latest corporate announcements and news for a specific stock."""
    yf_sym = _get_yf_symbol(symbol)
    t_start = time.time()
    
    try:
        ticker = yf.Ticker(yf_sym)
        news = ticker.news
        
        announcements = []
        for n in news[:limit]:
            # Handle both new and old yfinance news formats
            content = n.get("content", n)
            
            provider = content.get("provider", {})
            publisher = provider.get("displayName", content.get("publisher", ""))
            
            link = content.get("clickThroughUrl", {}).get("url", content.get("link", ""))
            if not link and "canonicalUrl" in content:
                link = content["canonicalUrl"].get("url", "")
                
            announcements.append({
                "title": content.get("title", ""),
                "publisher": publisher,
                "link": link,
                "published_at": content.get("pubDate", content.get("providerPublishTime", 0)),
                "type": content.get("contentType", content.get("type", "STORY"))
            })
            
        elapsed = int((time.time() - t_start) * 1000)
        print(f"[ResearchService] Fetched {len(announcements)} announcements for {symbol} in {elapsed}ms", flush=True)
        return announcements
    except Exception as e:
        print(f"[ResearchService Error] Failed to fetch announcements for {symbol}: {e}", flush=True)
        return []


# ==============================================================================
# 3. Macroeconomic Data (RBI / MOSPI)
# ==============================================================================

def get_macro_data_direct(source: str = "RBI", limit: int = 5) -> List[Dict[str, Any]]:
    """Fetch the latest macroeconomic data/announcements from RBI, MOSPI, or PIB."""
    s = source.upper()
    if s == "RBI":
        query = "Reserve Bank of India RBI policy repo rate announcement"
    elif s == "MOSPI":
        query = "MOSPI India GDP inflation CPI data release"
    else:
        query = "PIB India finance economy press release"
        
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
                articles.append({
                    "title": item.findtext("title", ""),
                    "link": item.findtext("link", ""),
                    "published_at": item.findtext("pubDate", ""),
                    "source": item.findtext("source", source),
                })
                
        elapsed = int((time.time() - t_start) * 1000)
        print(f"[ResearchService] Fetched {len(articles)} {source} macro items in {elapsed}ms", flush=True)
        return articles

    except Exception as e:
        print(f"[ResearchService Error] Macro data failed for {source}: {e}", flush=True)
        return []


# ==============================================================================
# 4. Web Search (DuckDuckGo Free Tier)
# ==============================================================================
def search_web_direct(query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    """Search the web for real-time information."""
    try:
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            from ddgs import DDGS
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
                if not results:
                    return [{"error": "No results found or rate limit hit. Do not retry this search. Rely on other tools or internal knowledge."}]
                return results
    except ImportError:
        print("[ResearchService Error] ddgs package is not installed. Returning fallback.")
        return [{"error": "Web search library missing. Please install ddgs."}]
    except Exception as e:
        print(f"[ResearchService Error] Web search failed: {e}")
        return [{"error": str(e)}]


# ==============================================================================
# 5. Web Search (Serper.dev API)
# ==============================================================================

def search_web_serper(query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    """Search using Serper.dev API (Google Search)."""
    import os
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
        
    api_key = os.environ.get("SERPER_API_KEY")
    if not api_key:
        return [{"error": "SERPER_API_KEY environment variable not set. Please add it to your .env file."}]
        
    url = "https://google.serper.dev/search"
    payload = json.dumps({"q": query, "num": max_results}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "X-API-KEY": api_key,
            "Content-Type": "application/json"
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            
        results = []
        if "organic" in data:
            for item in data["organic"][:max_results]:
                results.append({
                    "title": item.get("title", ""),
                    "href": item.get("link", ""),
                    "body": item.get("snippet", ""),
                    "source": "Serper (Google)"
                })
        else:
            return [{"error": "No organic results found in Serper response."}]
        return results
    except Exception as e:
        print(f"[ResearchService Error] Serper search failed: {e}")
        return [{"error": str(e)}]

# ==============================================================================
# 6. Web Search (googlesearch-python)
# ==============================================================================

def search_web_google(query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    """Search using googlesearch-python package."""
    try:
        from googlesearch import search
        results = []
        for item in search(query, num_results=max_results, advanced=True):
            results.append({
                "title": getattr(item, "title", ""),
                "href": getattr(item, "url", ""),
                "body": getattr(item, "description", ""),
                "source": "Google Search"
            })
        if not results:
            return [{"error": "No results found or rate limit hit. (Google often blocks scrapers)"}]
        return results
    except ImportError:
        print("[ResearchService Error] googlesearch-python package is not installed.")
        return [{"error": "Web search library missing. Please install googlesearch-python."}]
    except Exception as e:
        print(f"[ResearchService Error] Google search failed: {e}")
        return [{"error": str(e)}]


# ==============================================================================
# 7. Company Fundamentals & Financials (yfinance)
# ==============================================================================

def get_company_fundamentals(symbol: str) -> Dict[str, Any]:
    """Fetch fundamental data for a specific stock (P/E, market cap, EPS, etc.)."""
    yf_sym = _get_yf_symbol(symbol)
    try:
        ticker = yf.Ticker(yf_sym)
        info = ticker.info
        
        # Extract the most important fundamental metrics
        fundamentals = {
            "symbol": symbol,
            "company_name": info.get("shortName", ""),
            "sector": info.get("sector", ""),
            "industry": info.get("industry", ""),
            "market_cap": info.get("marketCap", None),
            "pe_ratio": info.get("trailingPE", None),
            "forward_pe": info.get("forwardPE", None),
            "eps": info.get("trailingEps", None),
            "dividend_yield": info.get("dividendYield", None),
            "book_value": info.get("bookValue", None),
            "price_to_book": info.get("priceToBook", None),
            "debt_to_equity": info.get("debtToEquity", None),
            "profit_margins": info.get("profitMargins", None),
            "roe": info.get("returnOnEquity", None),
            "roa": info.get("returnOnAssets", None),
            "52_week_high": info.get("fiftyTwoWeekHigh", None),
            "52_week_low": info.get("fiftyTwoWeekLow", None),
        }
        return fundamentals
    except Exception as e:
        print(f"[ResearchService Error] Failed to fetch fundamentals for {symbol}: {e}")
        return {"error": str(e)}

def get_financial_statements(symbol: str) -> Dict[str, Any]:
    """Fetch recent income statement, balance sheet, and cashflow data."""
    yf_sym = _get_yf_symbol(symbol)
    try:
        ticker = yf.Ticker(yf_sym)
        
        income = ticker.financials
        balance = ticker.balance_sheet
        cashflow = ticker.cashflow
        
        def safe_get_recent(df):
            if df is None or df.empty:
                return {}
            # Get the first column (most recent period)
            recent_col = df.iloc[:, 0]
            # Convert to json then dict to automatically handle NaNs and Datetimes
            return json.loads(recent_col.to_json())

        return {
            "symbol": symbol,
            "latest_income_statement": safe_get_recent(income),
            "latest_balance_sheet": safe_get_recent(balance),
            "latest_cash_flow": safe_get_recent(cashflow)
        }
    except Exception as e:
        print(f"[ResearchService Error] Failed to fetch financial statements for {symbol}: {e}")
        return {"error": str(e)}

def get_analyst_recommendations(symbol: str) -> Dict[str, Any]:
    """Fetch analyst recommendations and target prices."""
    yf_sym = _get_yf_symbol(symbol)
    try:
        ticker = yf.Ticker(yf_sym)
        info = ticker.info
        recos = ticker.recommendations
        
        reco_summary = {}
        if recos is not None and not recos.empty:
            reco_summary = json.loads(recos.to_json(orient="records"))
            
        return {
            "symbol": symbol,
            "target_high_price": info.get("targetHighPrice", None),
            "target_low_price": info.get("targetLowPrice", None),
            "target_mean_price": info.get("targetMeanPrice", None),
            "target_median_price": info.get("targetMedianPrice", None),
            "recommendation_mean": info.get("recommendationMean", None),
            "recommendation_key": info.get("recommendationKey", None),
            "number_of_analysts": info.get("numberOfAnalystOpinions", None),
            "historical_recommendations": reco_summary
        }
    except Exception as e:
        print(f"[ResearchService Error] Failed to fetch analyst recommendations for {symbol}: {e}")
        return {"error": str(e)}

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
            announcements.append({
                "title": n.get("title", ""),
                "publisher": n.get("publisher", ""),
                "link": n.get("link", ""),
                "published_at": n.get("providerPublishTime", 0),
                "type": n.get("type", "STORY")
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
            from duckduckgo_search import DDGS
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
                if not results:
                    return [{"error": "No results found or rate limit hit. Do not retry this search. Rely on other tools or internal knowledge."}]
                return results
    except ImportError:
        print("[ResearchService Error] duckduckgo-search package is not installed. Returning fallback.")
        return [{"error": "Web search library missing. Please install duckduckgo-search."}]
    except Exception as e:
        print(f"[ResearchService Error] Web search failed: {e}")
        return [{"error": str(e)}]

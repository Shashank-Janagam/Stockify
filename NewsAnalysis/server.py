import os
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv('../Stockify-Backend/.env')

GROQ_API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("GROK_API_KEY")
LLM_BASE_URL = os.getenv("LLM_BASE_URL") or "https://api.groq.com/openai/v1"
LLM_MODEL = os.getenv("LLM_MODEL") or "openai/gpt-oss-120b"

from fastapi import FastAPI, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from datetime import datetime, timedelta
import pytz
import asyncio
from fastapi.concurrency import run_in_threadpool
import yfinance as yf

from database import db, announcements_collection, digest_collection, company_profiles_collection, sector_mappings_collection
from bse_fetcher import fetch_bse_announcements, fetch_overall_market_announcements
from llm_enrichment import enrich_announcements_batch

app = FastAPI(title="Stockify News Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import httpx

NSE_STOCKS = set()
STOCK_NAME_MAP = {}

async def load_nse_stocks():
    global NSE_STOCKS, STOCK_NAME_MAP
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:4000/api/stocks/list", timeout=5.0)
            if response.status_code == 200:
                stocks_list = response.json()
                NSE_STOCKS = {item["symbol"].upper() for item in stocks_list if "symbol" in item}
                for item in stocks_list:
                    sym = item["symbol"].upper()
                    name = item.get("stock_name", "").upper()
                    if name:
                        clean_name = name.replace("LIMITED", "").replace("LTD", "").replace(".", "").replace("&", "AND").strip()
                        if clean_name:
                            STOCK_NAME_MAP[clean_name] = sym
                print(f"Loaded {len(NSE_STOCKS)} NSE stocks and {len(STOCK_NAME_MAP)} name mappings from SQL.")
            else:
                print(f"Failed to fetch stock list from backend, status: {response.status_code}")
    except Exception as e:
        print(f"Error loading NSE stocks from backend: {e}")
        
    if not NSE_STOCKS:
        NSE_STOCKS = {
            "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
            "SBIN.NS", "HINDUNILVR.NS", "ITC.NS", "AXISBANK.NS"
        }
        STOCK_NAME_MAP = {
            "RELIANCE INDUSTRIES": "RELIANCE.NS",
            "TATA CONSULTANCY SERVICES": "TCS.NS",
            "INFOSYS": "INFY.NS",
            "HDFC BANK": "HDFCBANK.NS",
            "ICICI BANK": "ICICIBANK.NS",
            "STATE BANK OF INDIA": "SBIN.NS",
            "HINDUSTAN UNILEVER": "HINDUNILVR.NS",
            "ITC": "ITC.NS",
            "AXIS BANK": "AXISBANK.NS"
        }

def format_announcement(ann):
    """Format MongoDB document to match frontend interface"""
    if "_id" in ann:
        ann["_id"] = str(ann["_id"])
    return ann

async def resolve_announcement_symbols(announcements):
    try:
        profiles = await company_profiles_collection.find({}).to_list(length=100)
        for ann in announcements:
            ann_symbol = str(ann.get("symbol", "")).upper().strip()
            ann_company = str(ann.get("company_name", "")).upper().strip()
            ann_symbol_base = ann_symbol.split('.')[0]
            
            resolved = None
            
            # 1. Direct symbol check
            if f"{ann_symbol_base}.NS" in NSE_STOCKS:
                resolved = f"{ann_symbol_base}.NS"
            elif ann_symbol in NSE_STOCKS:
                resolved = ann_symbol
                
            # 2. Check cached profiles
            if not resolved:
                for p in profiles:
                    p_symbol = p["symbol"].upper()
                    p_symbol_base = p_symbol.split('.')[0]
                    p_name = p.get("company_name", "").upper()
                    
                    if ann_symbol == p_symbol or ann_symbol == p_symbol_base or p_symbol_base in ann_symbol:
                        resolved = p["symbol"]
                        break
                    
                    clean_p_name = p_name.replace("LIMITED", "").replace("LTD", "").replace(".", "").strip()
                    clean_ann_company = ann_company.replace("LIMITED", "").replace("LTD", "").replace(".", "").strip()
                    if (clean_p_name and clean_p_name in clean_ann_company) or (clean_ann_company and clean_ann_company in clean_p_name):
                        resolved = p["symbol"]
                        break
                        
            # 3. Cleaned name check from SQL stocks
            if not resolved:
                clean_ann_company = ann_company.replace("LIMITED", "").replace("LTD", "").replace(".", "").replace("&", "AND").strip()
                for clean_name, sym in STOCK_NAME_MAP.items():
                    if clean_name in clean_ann_company or clean_ann_company in clean_name:
                        resolved = sym
                        break
                        
            if resolved:
                ann["symbol"] = resolved
    except Exception as e:
        print(f"Error in resolve_announcement_symbols: {e}")

@app.get("/api/news")
async def get_all_news(
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=100),
    category: Optional[str] = None,
    sentiment: Optional[str] = None,
    search: Optional[str] = None
):
    # Build query filter, enforcing only NSE stocks
    query_filter = {
        "symbol": {"$regex": r"\.NS$", "$options": "i"}
    }
    if category and category != "all":
        query_filter["category"] = category
    if sentiment and sentiment != "all":
        query_filter["sentiment"] = sentiment
    if search:
        query_filter["$or"] = [
            {"company_name": {"$regex": search, "$options": "i"}},
            {"symbol": {"$regex": search, "$options": "i"}}
        ]

    total = await announcements_collection.count_documents(query_filter)
    
    # Fallback to fetching live announcements if database is completely empty
    if total == 0 and (not category or category == "all") and (not sentiment or sentiment == "all") and not search:
        market_announcements = await run_in_threadpool(fetch_overall_market_announcements)
        await resolve_announcement_symbols(market_announcements)
        market_announcements = [ann for ann in market_announcements if str(ann.get("symbol", "")).upper().endswith(".NS")]
        data = [format_announcement(ann) for ann in market_announcements[:limit]]
        return {
            "data": data,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": len(market_announcements),
                "totalPages": 1,
                "hasMore": False
            }
        }
        
    cursor = announcements_collection.find(query_filter).sort("announced_at", -1)
    skip = (page - 1) * limit
    docs = await cursor.skip(skip).limit(limit).to_list(length=limit)
    
    await resolve_announcement_symbols(docs)
    data = [format_announcement(doc) for doc in docs]
    totalPages = (total + limit - 1) // limit if total > 0 else 1
    hasMore = page < totalPages
    
    return {
        "data": data,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": totalPages,
            "hasMore": hasMore
        }
    }

@app.get("/api/news/stock/{symbol}")
async def get_stock_news(
    symbol: str = Path(..., title="The stock symbol"),
    live: bool = Query(False)
):
    if live:
        print(f"Fetching dynamically for {symbol} on user request...")
        # 1. Always fetch from BSE to ensure we have the absolute latest
        raw_announcements = await run_in_threadpool(fetch_bse_announcements, symbol)
        
        if raw_announcements:
            # 2. Check what we already have in the DB to avoid re-enriching everything
            existing_docs = await announcements_collection.find({"symbol": symbol}).to_list(length=1000)
            existing_ids = {str(doc["bse_id"]) for doc in existing_docs}
            
            ten_days_ago = datetime.now() - timedelta(days=10)
            new_raw = []
            for ann in raw_announcements:
                if str(ann["bse_id"]) not in existing_ids:
                    try:
                        # Parse date like '2026-05-27T17:59:49.16'
                        ann_date = datetime.fromisoformat(ann["announced_at"].split('.')[0])
                        if ann_date >= ten_days_ago:
                            new_raw.append(ann)
                    except Exception:
                        new_raw.append(ann)
            
            if new_raw:
                # 3. Enrich only the new announcements
                enriched = await run_in_threadpool(enrich_announcements_batch, new_raw)
                
                # 4. Save the new enriched announcements to MongoDB
                for ann in enriched:
                    await announcements_collection.update_one(
                        {"bse_id": ann["bse_id"]},
                        {"$set": ann},
                        upsert=True
                    )
                print(f"Stored {len(enriched)} new announcements for {symbol}")
                
    # Return latest news from DB (only from the past 10 days)
    ten_days_ago_iso = (datetime.now() - timedelta(days=10)).isoformat()
    cursor = announcements_collection.find({
        "symbol": symbol,
        "announced_at": {"$gte": ten_days_ago_iso}
    }).sort("announced_at", -1).limit(20)
    
    docs = await cursor.to_list(length=20)
    await resolve_announcement_symbols(docs)
    data = [format_announcement(doc) for doc in docs]
        
    return {
        "data": data
    }

def get_company_profile(ticker_symbol: str):
    try:
        symbol_to_try = ticker_symbol
        if not (symbol_to_try.endswith(".NS") or symbol_to_try.endswith(".BO")):
            symbol_to_try = f"{symbol_to_try}.NS"
            
        ticker = yf.Ticker(symbol_to_try)
        info = ticker.info
        
        if not info or not info.get("longBusinessSummary"):
            ticker = yf.Ticker(ticker_symbol)
            info = ticker.info
            
        profile_data = {
            "symbol": ticker_symbol,
            "company_name": info.get("longName", info.get("shortName", "N/A")),
            "sector": info.get("sector", "N/A"),
            "industry": info.get("industry", "N/A"),
            "website": info.get("website", "N/A"),
            "summary_text": info.get("longBusinessSummary", "No corporate summary available.")
        }
        return profile_data
    except Exception as e:
        print(f"Error fetching company profile for {ticker_symbol}: {e}")
        return None

async def enrich_profile_summary_with_llm(profile_data: dict) -> dict:
    if not profile_data or not profile_data.get("summary_text") or profile_data["summary_text"] == "No corporate summary available.":
        return profile_data

    api_key = GROQ_API_KEY
    if not api_key:
        print("WARNING: Groq API key is missing. Skipping LLM summary enrichment.")
        return profile_data

    company_name = profile_data.get("company_name", "N/A")
    sector = profile_data.get("sector", "N/A")
    industry = profile_data.get("industry", "N/A")
    raw_summary = profile_data["summary_text"]

    prompt = f"""
    You are a professional financial analyst. Summarize the following company business summary in 3-4 clear, engaging, and professional sentences, highlighting their core business model, key products/services, and primary market focus.
    
    Company: {company_name}
    Sector: {sector}
    Industry: {industry}
    Raw Summary: {raw_summary}
    
    Output ONLY the summarized text, with no conversational prefix or suffix.
    """

    models_to_try = [LLM_MODEL, "llama-3.1-8b-instant", "llama3-8b-8192"]
    models_to_try = list(dict.fromkeys(models_to_try))

    max_retries = 3
    retry_delay = 2
    summary = None

    for model_name in models_to_try:
        for attempt in range(max_retries):
            try:
                openai_client = AsyncOpenAI(api_key=api_key, base_url=LLM_BASE_URL)
                response = await openai_client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": "You are a concise financial analyst assistant that generates complete, fully-formed paragraphs under 150 words. Never end mid-sentence."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.3,
                    max_tokens=400
                )
                content = response.choices[0].message.content
                if content and content.strip():
                    text = content.strip()
                    if text and text[-1] in [".", "!", "?", '"', "'", "”", "’"]:
                        summary = text
                        break
                    else:
                        print(f"Warning: Model {model_name} returned truncated/incomplete text. Trying next model...")
                else:
                    print(f"Warning: Model {model_name} returned empty content. Trying next model...")
                    break
            except Exception as e:
                err_msg = str(e).lower()
                is_rate_limit = "rate" in err_msg or "429" in err_msg or "limit" in err_msg
                if is_rate_limit and attempt < max_retries - 1:
                    print(f"Groq/LLM Rate Limit hit for {model_name}. Retrying in {retry_delay}s... (Attempt {attempt+1}/{max_retries})")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
                else:
                    print(f"Error calling {model_name} (Attempt {attempt+1}/{max_retries}): {e}")
                    break
        if summary:
            break

    if summary:
        profile_data["summary_text"] = summary
        print(f"Successfully enriched profile summary with LLM for {profile_data['symbol']}")
        
    return profile_data

async def get_or_create_profile(symbol: str):
    ticker_symbol = symbol.strip().upper()
    symbol_base = ticker_symbol.split('.')[0]
    
    # Check candidates for cached entry
    candidates = [ticker_symbol, f"{symbol_base}.NS", f"{symbol_base}.BO", symbol_base]
    candidates = list(dict.fromkeys(candidates))
    
    profile = await company_profiles_collection.find_one({"symbol": {"$in": candidates}})
    if profile:
        if "_id" in profile:
            profile["_id"] = str(profile["_id"])
        return profile
        
    # Cache miss - fetch live profile
    profile_data = await run_in_threadpool(get_company_profile, ticker_symbol)
    if profile_data:
        # Enrich summary with LLM using the OpenAI/Groq model
        profile_data = await enrich_profile_summary_with_llm(profile_data)
        
        # Cache profile details
        await company_profiles_collection.update_one(
            {"symbol": profile_data["symbol"]},
            {"$set": profile_data},
            upsert=True
        )
        # Add to sector mapping if valid
        sector = profile_data.get("sector")
        if sector and sector != "N/A":
            await sector_mappings_collection.update_one(
                {"sector": sector},
                {"$addToSet": {"stocks": profile_data["symbol"]}},
                upsert=True
            )
        return profile_data
    return None

@app.get("/api/news/stock/{symbol}/profile")
async def get_stock_profile(symbol: str = Path(..., title="The stock symbol")):
    profile = await get_or_create_profile(symbol)
    if not profile:
        return {"error": "Company profile not found", "symbol": symbol.strip()}
    return profile

@app.get("/api/news/stock/{symbol}/similar")
async def get_similar_stocks(symbol: str = Path(..., title="The stock symbol")):
    profile = await get_or_create_profile(symbol)
    if not profile or not profile.get("sector") or profile.get("sector") == "N/A":
        return {"symbol": symbol, "sector": "N/A", "similar_stocks": []}
        
    sector = profile["sector"]
    mapping = await sector_mappings_collection.find_one({"sector": sector})
    if not mapping:
        return {"symbol": symbol, "sector": sector, "similar_stocks": []}
        
    symbol_base = symbol.strip().upper().split('.')[0]
    stocks_in_sector = mapping.get("stocks", [])
    
    # Exclude the current symbol itself (with flexible checks)
    other_symbols = [s for s in stocks_in_sector if s.split('.')[0] != symbol_base]
    
    similar_stocks = []
    if other_symbols:
        # Get profiles from cache
        profiles_cursor = company_profiles_collection.find({"symbol": {"$in": other_symbols}})
        cached_profiles = {}
        async for doc in profiles_cursor:
            cached_profiles[doc["symbol"]] = doc.get("company_name", doc["symbol"])
            
        for s in other_symbols:
            similar_stocks.append({
                "symbol": s,
                "company_name": cached_profiles.get(s, s.split('.')[0])
            })
            
    return {
        "symbol": symbol,
        "sector": sector,
        "similar_stocks": similar_stocks
    }

@app.get("/api/news/digest")
async def get_daily_digest():
    """Return a generated AI daily digest."""
    # Try to find today's digest
    today_start = datetime.now(pytz.timezone('Asia/Kolkata')).replace(hour=0, minute=0, second=0, microsecond=0)
    
    digest = await digest_collection.find_one({
        "generated_at": {"$gte": today_start.isoformat()}
    }, sort=[("generated_at", -1)])
    
    if digest:
        if "_id" in digest:
            del digest["_id"]
        return digest
        
    # If no digest, fallback to dynamic generation or return an empty structure
    # A proper chron job should ideally populate this.
    fallback_digest = {
        "generated_at": datetime.now().isoformat(),
        "total_announcements": 0,
        "summary": "AI Daily Digest is currently being generated. Please check back later.",
        "top_movers": [],
        "category_breakdown": {}
    }
    return fallback_digest

async def fetch_news_periodically():
    while True:
        try:
            if not NSE_STOCKS:
                await load_nse_stocks()
                
            print("Running scheduled 10-min news fetch for overall market...")
            market_announcements = await run_in_threadpool(fetch_overall_market_announcements)
            
            if market_announcements:
                # Check which of these are actually new
                existing_docs = await announcements_collection.find(
                    {"bse_id": {"$in": [str(a["bse_id"]) for a in market_announcements]}}
                ).to_list(length=100)
                existing_ids = {str(doc["bse_id"]) for doc in existing_docs}
                new_raw = [ann for ann in market_announcements if str(ann["bse_id"]) not in existing_ids]
                
                if new_raw:
                    enriched = await run_in_threadpool(enrich_announcements_batch, new_raw)
                    await resolve_announcement_symbols(enriched)
                    # Filter: Only keep announcements that have a symbol ending in .NS
                    nse_enriched = [ann for ann in enriched if str(ann.get("symbol", "")).upper().endswith(".NS")]
                    
                    if nse_enriched:
                        for ann in nse_enriched:
                            await announcements_collection.update_one(
                                {"bse_id": ann["bse_id"]},
                                {"$set": ann},
                                upsert=True
                            )
                        print(f"Scheduled fetch: Stored & enriched {len(nse_enriched)} new overall market announcements (filtered for NSE)")
                    else:
                        print("Scheduled fetch: No new overall market announcements matched NSE list")
                else:
                    print("Scheduled fetch: No new overall market announcements")
        except Exception as e:
            print(f"Error in background fetch task: {e}")
        
        await asyncio.sleep(6000) # 10 minutes

@app.on_event("startup")
async def startup_event():
    await load_nse_stocks()
    asyncio.create_task(fetch_news_periodically())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=5001, reload=True)

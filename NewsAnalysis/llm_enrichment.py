import os
import json
import io
import re
import requests
import pypdf
from concurrent.futures import ThreadPoolExecutor
from groq import Groq
from dotenv import load_dotenv

load_dotenv('../Stockify-Backend/.env')

GROQ_API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("GROK_API_KEY")

if GROQ_API_KEY:
    client = Groq(api_key=GROQ_API_KEY)
else:
    client = None

def extract_text_from_pdf_url(pdf_url: str, max_chars: int = 3000) -> str:
    if not pdf_url:
        return ""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.bseindia.com/'
        }
        res = requests.get(pdf_url, headers=headers, timeout=8, stream=True)
        if res.status_code == 200:
            content_length = res.headers.get('Content-Length')
            if content_length and int(content_length) > 5 * 1024 * 1024:
                res.close()
                return ""
            
            pdf_file = io.BytesIO(res.content)
            reader = pypdf.PdfReader(pdf_file)
            text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
                if len(text) >= max_chars:
                    break
            return text[:max_chars]
    except Exception as e:
        print(f"Error extracting PDF from {pdf_url}: {e}")
    return ""

def analyze_text_keywords(text: str) -> str:
    """Scans text for strong corporate action keywords to classify the announcement."""
    if not text:
        return None
        
    text_lower = text.lower()
    
    # Financial results
    if any(k in text_lower for k in ["financial results", "quarterly results", "audited financial", "unaudited financial", "balance sheet", "income statement"]):
        return "result"
        
    # Dividend
    if "dividend" in text_lower:
        return "dividend"
        
    # Board Meeting
    if any(k in text_lower for k in ["board meeting", "meeting of the board", "meeting of board"]):
        return "board_meeting"
        
    # Buyback
    if "buyback" in text_lower or "buy-back" in text_lower:
        return "buyback"
        
    # AGM / EGM
    if any(k in text_lower for k in ["annual general meeting", " agm ", " egm ", "extraordinary general meeting"]):
        return "agm"
        
    # Corporate actions (bonus, split, merger, acquisition, rights issue, allotment)
    if any(k in text_lower for k in ["bonus", "split", "merger", "demerger", "acquisition", "takeover", "allotment", "rights issue"]):
        return "corporate_action"
        
    return None

def enrich_headlines_chunk(chunk):
    """Calls Groq once to enrich a chunk of announcements (up to 10) in a single request."""
    if not client or not chunk:
        return None
        
    headlines_text = ""
    for idx, ann in enumerate(chunk):
        headlines_text += f"{idx + 1}. {ann.get('headline', '')}\n"
        
    prompt = f"""
    Analyze the following list of corporate announcement headlines and determine their category and market sentiment.
    
    Announcements:
    {headlines_text}

    Categories allowed: result, dividend, board_meeting, buyback, agm, corporate_action, other
    Sentiments allowed: bullish, bearish, neutral

    Format the response STRICTLY as a JSON array of objects, keeping the exact same order as the input list:
    [
      {{"category": "category_name", "sentiment": "sentiment_name"}},
      ...
    ]
    
    Do not add any markdown tags or conversational text. Return ONLY the raw JSON array.
    """
    
    # Retry logic for Groq rate limits
    max_retries = 3
    retry_delay = 2
    completion = None
    
    for attempt in range(max_retries):
        try:
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a financial analyst AI that outputs only a valid JSON array of objects without markdown formatting."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.0,
                max_tokens=1000
            )
            break
        except Exception as e:
            err_msg = str(e).lower()
            is_rate_limit = "rate_limit" in err_msg or "rate limit" in err_msg or "429" in err_msg or "too many requests" in err_msg
            if is_rate_limit and attempt < max_retries - 1:
                print(f"Groq Rate Limit hit during batch call. Retrying in {retry_delay}s... (Attempt {attempt+1}/{max_retries})")
                import time
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                print(f"Error calling batch LLM: {e}")
                return None  # Trigger fallback
                
    if not completion:
        return None
        
    try:
        response_text = completion.choices[0].message.content.strip()
        if response_text.startswith("```json"):
            response_text = response_text.replace("```json", "").replace("```", "").strip()
        elif response_text.startswith("```"):
            response_text = response_text.replace("```", "").strip()
            
        parsed = json.loads(response_text)
        if isinstance(parsed, list) and len(parsed) == len(chunk):
            return parsed
    except Exception as e:
        print(f"Error parsing batch LLM response: {e}")
        
    return None

def enrich_single_announcement_llm_only(ann, local_category):
    """Falls back to individual LLM call if the batch call failed for some reason."""
    if not client:
        return ann
        
    prompt = f"""
    Analyze the following corporate announcement headline to determine its category and market sentiment.
    
    Headline: {ann.get('headline')}

    Categories allowed: result, dividend, board_meeting, buyback, agm, corporate_action, other
    Sentiments allowed: bullish, bearish, neutral

    Respond ONLY with a JSON object in this format:
    {{"category": "category_name", "sentiment": "sentiment_name"}}
    """
    
    max_retries = 3
    retry_delay = 2
    completion = None
    
    for attempt in range(max_retries):
        try:
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a financial analyst AI that outputs only valid JSON without any markdown tags."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.0,
                max_tokens=100
            )
            break
        except Exception as e:
            err_msg = str(e).lower()
            is_rate_limit = "rate_limit" in err_msg or "rate limit" in err_msg or "429" in err_msg or "too many requests" in err_msg
            if is_rate_limit and attempt < max_retries - 1:
                import time
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                raise e
                
    if completion:
        response_text = completion.choices[0].message.content.strip()
        if response_text.startswith("```json"):
            response_text = response_text.replace("```json", "").replace("```", "").strip()
        elif response_text.startswith("```"):
            response_text = response_text.replace("```", "").strip()
            
        parsed = json.loads(response_text)
        llm_category = parsed.get("category", "other").lower()
        sentiment = parsed.get("sentiment", "neutral").lower()
        
        valid_categories = ['result', 'dividend', 'board_meeting', 'buyback', 'agm', 'corporate_action', 'other']
        valid_sentiments = ['bullish', 'bearish', 'neutral']
        
        category = llm_category if llm_category in valid_categories else 'other'
        if category == 'other' and local_category:
            category = local_category
            
        ann['category'] = category
        ann['sentiment'] = sentiment if sentiment in valid_sentiments else 'neutral'
        
    return ann

def process_pdf_and_local_keywords(ann):
    """Task for ThreadPoolExecutor to download PDF and scan keywords locally (no LLM calls here)."""
    pdf_url = ann.get('pdf_url')
    pdf_text = ""
    if pdf_url:
        pdf_text = extract_text_from_pdf_url(pdf_url)
        
    combined_text = f"{ann.get('headline', '')} {ann.get('summary', '')} {pdf_text}".strip()
    local_category = analyze_text_keywords(combined_text)
    return ann, local_category

def enrich_announcements_batch(announcements):
    """
    Takes a list of raw announcements and returns them with enriched category and sentiment.
    1. Extracts PDF text and does local keyword analysis in parallel.
    2. Groups announcements into chunks of 10 and sends them to the LLM in batches to minimize API limits.
    3. Handles fallback to individual calls if batch fails.
    """
    if not announcements:
        return announcements
        
    # Step 1: Parallel PDF text extraction and local keyword analysis (purely network/CPU, no LLM calls)
    max_workers = min(10, len(announcements))
    ann_with_keywords = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        ann_with_keywords = list(executor.map(process_pdf_and_local_keywords, announcements))
        
    # Step 2: Group announcements into chunks of 10 for batch LLM calls
    chunk_size = 10
    enriched_results = []
    
    for i in range(0, len(ann_with_keywords), chunk_size):
        chunk_data = ann_with_keywords[i:i+chunk_size]
        chunk_announcements = [item[0] for item in chunk_data]
        chunk_local_categories = [item[1] for item in chunk_data]
        
        # Call LLM in a batch for the chunk
        batch_results = enrich_headlines_chunk(chunk_announcements)
        
        if batch_results:
            # Match results back
            for idx, item in enumerate(batch_results):
                ann = chunk_announcements[idx]
                local_cat = chunk_local_categories[idx]
                
                cat = item.get("category", "other").lower()
                sentiment = item.get("sentiment", "neutral").lower()
                
                valid_categories = ['result', 'dividend', 'board_meeting', 'buyback', 'agm', 'corporate_action', 'other']
                valid_sentiments = ['bullish', 'bearish', 'neutral']
                
                category = cat if cat in valid_categories else 'other'
                if category == 'other' and local_cat:
                    category = local_cat
                    
                ann['category'] = category
                ann['sentiment'] = sentiment if sentiment in valid_sentiments else 'neutral'
                
                enriched_results.append(ann)
        else:
            # Fallback to individual calls for this chunk
            print(f"Batch LLM call failed for chunk. Falling back to individual calls.")
            for idx, ann in enumerate(chunk_announcements):
                try:
                    ann = enrich_single_announcement_llm_only(ann, chunk_local_categories[idx])
                except Exception as e:
                    print(f"Error in fallback enrichment: {e}")
                    ann['category'] = chunk_local_categories[idx] if chunk_local_categories[idx] else 'other'
                    ann['sentiment'] = 'neutral'
                enriched_results.append(ann)
                
    return enriched_results

"""
stages/common.py
================
Shared constants, helpers, and client initialisation used by all pipeline stages.
All other stage modules import from here — never define constants twice.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

# Force LiteLLM to use local model cost map to avoid hanging on remote fetches
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"

from dotenv import load_dotenv
from pinecone import Pinecone, CloudProvider, AwsRegion, EmbedModel, IndexEmbed
from crewai import Crew, LLM

# ── stdout encoding ───────────────────────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv()

# =============================================================================
#  CONSTANTS
# =============================================================================

PINECONE_API_KEY    = os.getenv("PINECONE_API_KEY", "")
GROQ_API_KEY        = os.getenv("GROQ_API_KEY", "")

# MongoDB – only the URI is needed; the database name is part of the URI path
MONGODB_URI         = os.getenv("MONGODB_URI", "")
MONGODB_COLLECTION  = "sector_alerts"

INDEX_NAME          = "stockify"
NAMESPACE           = "market-events"
RAG_SCORE_THRESHOLD = 0.70      # cosine-score cutoff to treat a RAG hit as relevant

# File paths (all relative to the project root, i.e. MultiAgent/)
CHECKPOINT_FILE = "checkpoint.json"
RAW_FILE        = "press_releases_raw.jsonl"
FILTERED_FILE   = "press_releases_filtered.json"
ENRICHED_FILE   = "press_releases_enriched.json"

# HTTP scraper settings
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

RBI_RSS_FEEDS = {
    "press_releases": "https://www.rbi.org.in/pressreleases_rss.xml",
    "notifications":  "https://www.rbi.org.in/notifications_rss.xml",
    "speeches":       "https://www.rbi.org.in/speeches_rss.xml",
}

PIB_LISTING_URL = "https://www.pib.gov.in/AllReleasem.aspx?reg=3&lang=1"

# =============================================================================
#  CHECKPOINT HELPERS
# =============================================================================

def load_checkpoint() -> dict:
    """Load persistent run state from checkpoint.json, ensuring all keys exist."""
    state = {}
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, "r") as f:
                state = json.load(f)
        except Exception:
            state = {}
    state.setdefault("seen_urls",        [])   # Stage 1: already fetched URLs
    state.setdefault("rag_context_urls", [])   # Stage 2: already RAG-processed URLs
    state.setdefault("filtered_urls",    [])   # Stage 3: already classified URLs
    state.setdefault("enriched_urls",    [])   # Stage 4: already enriched URLs
    state.setdefault("mongodb_ids",      [])   # Stage 6: already stored release_ids
    return state


def save_checkpoint(state: dict):
    """Persist run state to checkpoint.json."""
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(state, f, indent=2)


# =============================================================================
#  DATA HELPERS
# =============================================================================

def append_raw_record(record: dict):
    """Append a single record to the JSONL raw file."""
    with open(RAW_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def clean_date_string(date_str: str) -> str:
    """Normalise an arbitrary date string to YYYY-MM-DD."""
    if not date_str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if len(date_str) == 10 and date_str[4] == "-" and date_str[7] == "-":
        return date_str
    try:
        from email.utils import parsedate_to_datetime as _parse
        return _parse(date_str).strftime("%Y-%m-%d")
    except Exception:
        return date_str


def parse_json_from_text(text: str):
    """Strip markdown code fences if present, then parse JSON."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return json.loads(text)


def get_next_enriched_id(existing: list) -> str:
    """Return the next sequential PR_2026_NNN release ID."""
    max_num = 0
    for r in existing:
        rid = r.get("release_id", "")
        if rid and rid.startswith("PR_2026_"):
            try:
                num = int(rid.replace("PR_2026_", ""))
                max_num = max(max_num, num)
            except ValueError:
                pass
    if max_num == 0:
        return "PR_2026_011"
    return f"PR_2026_{max_num + 1:03d}"


# =============================================================================
#  LLM + PINECONE INITIALISATION
# =============================================================================

def init_llm_fast() -> LLM:
    """Fast/cheap model used for classification (Stage 3)."""
    return LLM(model="groq/meta-llama/llama-4-scout-17b-16e-instruct", temperature=0.1)


def init_llm_strong() -> LLM:
    """Capable model used for enrichment and context synthesis (Stages 2 & 4)."""
    return LLM(model="groq/llama-3.3-70b-versatile", temperature=0.1)


def init_pinecone():
    """
    Connect to Pinecone and return (pc, index).
    Creates the index with integrated multilingual embeddings if it does not exist.
    """
    pc = Pinecone(api_key=PINECONE_API_KEY)
    if not pc.has_index(INDEX_NAME):
        print(f"  Creating Pinecone index '{INDEX_NAME}'...")
        pc.create_index_for_model(
            name=INDEX_NAME,
            cloud=CloudProvider.AWS,
            region=AwsRegion.US_EAST_1,
            embed=IndexEmbed(
                model=EmbedModel.Multilingual_E5_Large,
                field_map={"text": "content"},   # 'content' field is embedded on upsert
            ),
        )
    index = pc.Index(name=INDEX_NAME)
    return pc, index


# =============================================================================
#  CREW RETRY WRAPPER
# =============================================================================

def retry_crew(crew: Crew, max_attempts: int = 5):
    """
    Execute crew.kickoff() with exponential back-off on Groq rate-limit or network errors.
    Returns the string result or None if all attempts are exhausted.
    """
    for attempt in range(1, max_attempts + 1):
        try:
            return str(crew.kickoff())
        except Exception as e:
            err = str(e)
            err_lower = err.lower()
            
            is_retryable = (
                "rate_limit" in err_lower or
                "429" in err_lower or
                "rate limit" in err_lower or
                "10054" in err_lower or
                "connection" in err_lower or
                "connecterror" in err_lower or
                "forcibly closed" in err_lower or
                "timeout" in err_lower or
                "internalservererror" in err_lower or
                "internal server error" in err_lower
            )
            
            if is_retryable and attempt < max_attempts:
                sleep_sec = 10 * attempt
                print(f"    API or connection error: {err[:80]}...\n    Retrying in {sleep_sec}s "
                      f"(attempt {attempt}/{max_attempts})...")
                time.sleep(sleep_sec)
            else:
                raise
    return None


# =============================================================================
#  UI HELPER
# =============================================================================

def banner(title: str):
    width = 64
    print("\n" + "=" * width)
    print(f"  {title}")
    print("=" * width)

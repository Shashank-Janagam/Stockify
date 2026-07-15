"""
stages/stage6_mongodb.py
========================
Stage 6 – STORE TO MONGODB

Reads every enriched press release from press_releases_enriched.json and,
for those that affect the stock market (have at least one non-Neutral sector),
stores a compact alert document in MongoDB under the "sector_alerts" collection.

MongoDB document structure (one per enriched release):
------------------------------------------------------
{
    "release_id":   "PR_2026_011",
    "title":        "Auction of State Government Securities",
    "date":         "2026-07-10",
    "importance":   "Medium",
    "source_url":   "https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=63124",
    "one_liner":    "RBI auctions ₹24,800 Cr SGS; banking sector benefits, real-estate faces higher borrowing costs.",
    "sectors": [
        {
            "sector":    "Banking",
            "impact":    "Positive",
            "one_liner": "Banks benefit from liquidity and low-risk investment opportunities.",
            "tickers":   ["SBIN", "HDFCBANK", "ICICIBANK"]
        },
        {
            "sector":    "Real Estate",
            "impact":    "Negative",
            "one_liner": "Higher yields raise borrowing costs for developers and homebuyers.",
            "tickers":   ["DLF"]
        }
    ],
    "stored_at":    "2026-07-12T09:30:00Z"
}

Idempotency:
  Releases already stored are tracked via checkpoint.json["mongodb_ids"].
  Upsert (replace_one + upsert=True) ensures re-running is safe.

Run standalone:
    python -m stages.stage6_mongodb
"""

import json
import os
from datetime import datetime, timezone

from .common import (
    ENRICHED_FILE, FILTERED_FILE,
    MONGODB_URI, MONGODB_COLLECTION,
    load_checkpoint, save_checkpoint, banner,
)


# =============================================================================
#  HELPERS
# =============================================================================

def _get_mongo_collection():
    """
    Connect to MongoDB and return the target collection.
    Raises RuntimeError if pymongo is not installed or MONGODB_URI is not set.
    """
    try:
        from pymongo import MongoClient
    except ImportError:
        raise RuntimeError(
            "pymongo is not installed. Run: pip install pymongo"
        )

    if not MONGODB_URI or "<user>" in MONGODB_URI or "<password>" in MONGODB_URI:
        raise RuntimeError(
            "MONGODB_URI is not configured. "
            "Please edit .env and set MONGODB_URI to your MongoDB connection string."
        )

    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
    # get_default_database() reads the DB name from the URI path (e.g. .../stockify?...)
    # Falls back to 'stockify' if no DB name is present in the URI
    try:
        db = client.get_default_database()
    except Exception:
        db = client["test"]
    return db[MONGODB_COLLECTION]


def _build_url_map() -> dict:
    """
    Build a lookup from release_id -> source_url using press_releases_filtered.json.
    Used as a fallback if source_url is missing from enriched records (older runs).
    """
    url_map = {}
    if not os.path.exists(FILTERED_FILE):
        return url_map
    try:
        with open(FILTERED_FILE, "r", encoding="utf-8") as f:
            filtered = json.load(f)
        # Map title -> url (best we can do without release_id in filtered)
        for rec in filtered:
            url_map[rec.get("title", "")] = rec.get("url", "")
    except Exception:
        pass
    return url_map


def _sector_one_liner(sector_obj: dict) -> str:
    """
    Shorten the sector reason to ≤ 120 characters for the compact one-liner.
    Preserves complete sentences where possible.
    """
    reason = sector_obj.get("reason", "")
    if len(reason) <= 120:
        return reason
    # Try to cut at sentence boundary
    for sep in (". ", "; ", ", "):
        idx = reason.find(sep, 60)
        if 60 <= idx <= 120:
            return reason[:idx + 1]
    return reason[:117] + "..."


def _build_document(enriched: dict, url_map: dict) -> dict:
    """
    Build the MongoDB alert document from one enriched record.
    Only includes sectors with Positive or Negative impact.
    """
    # Resolve source URL (new records carry it; old records need fallback)
    source_url = (
        enriched.get("source_url")
        or url_map.get(enriched.get("title", ""), "")
    )

    # Build per-sector entries (skip Neutral)
    sector_docs = []
    tickers_by_sector: dict[str, list] = {}

    # Group candidate tickers by sector (match on company sector not direct)
    # We map each candidate company to ALL sectors based on sector name heuristics
    all_sector_names = [s.get("sector", "") for s in enriched.get("affected_sectors", [])]
    companies = enriched.get("candidate_companies", [])

    for s in enriched.get("affected_sectors", []):
        impact = s.get("impact", "Neutral")
        if impact == "Neutral":
            continue

        sector_name = s.get("sector", "")

        # Find tickers whose expected_impact matches this sector's impact
        # (imperfect but reliable heuristic without explicit sector-company mapping)
        relevant_tickers = [
            c.get("ticker", "")
            for c in companies
            if c.get("expected_impact", "Neutral") == impact and c.get("ticker")
        ]

        sector_docs.append({
            "sector":    sector_name,
            "impact":    impact,
            "one_liner": _sector_one_liner(s),
            "tickers":   relevant_tickers,
        })

    # Build overall one-liner from summary (trim to ≤ 160 chars)
    summary = enriched.get("summary", "")
    if len(summary) > 160:
        for sep in (". ", "; "):
            idx = summary.find(sep, 80)
            if 80 <= idx <= 160:
                summary = summary[:idx + 1]
                break
        else:
            summary = summary[:157] + "..."

    return {
        "release_id": enriched.get("release_id", ""),
        "title":      enriched.get("title", ""),
        "date":       enriched.get("release_date", ""),
        "importance": enriched.get("importance", "Medium"),
        "source_url": source_url,
        "one_liner":  summary,
        "sectors":    sector_docs,
        "stored_at":  datetime.now(timezone.utc).isoformat(),
    }


# =============================================================================
#  PUBLIC STAGE ENTRY POINT
# =============================================================================

def run(state: dict):
    """
    Execute Stage 6 – store stock-impacting enriched releases to MongoDB.

    Args:
        state: shared checkpoint dict (mutated in-place)
    """
    banner("STAGE 6  MONGODB  -  Store sector alerts to database")

    # Load enriched records
    if not os.path.exists(ENRICHED_FILE):
        print("  No enriched file found. Skipping MongoDB stage.")
        return

    try:
        with open(ENRICHED_FILE, "r", encoding="utf-8") as f:
            enriched_records = json.load(f)
    except Exception as e:
        print(f"  Could not load enriched file: {e}")
        return

    # Filter: only records not yet stored AND with stock-impacting sectors
    stored_ids = set(state.get("mongodb_ids", []))
    pending = []
    for rec in enriched_records:
        rid = rec.get("release_id", "")
        if rid in stored_ids:
            continue
        # Check if any sector is Positive or Negative (i.e., market-affecting)
        has_impact = any(
            s.get("impact", "Neutral") != "Neutral"
            for s in rec.get("affected_sectors", [])
        )
        if has_impact:
            pending.append(rec)

    if not pending:
        print("  No new stock-impacting releases to store.")
        return

    print(f"  Found {len(pending)} stock-impacting release(s) to store.")

    # Connect to MongoDB
    try:
        collection = _get_mongo_collection()
    except RuntimeError as e:
        print(f"\n  [ERROR] {e}")
        print("  Skipping MongoDB stage.")
        return

    # Build URL fallback map for old records missing source_url
    url_map = _build_url_map()

    stored = 0
    for rec in pending:
        rid = rec.get("release_id", "")
        try:
            doc = _build_document(rec, url_map)

            # Upsert by release_id – safe to re-run
            collection.replace_one(
                {"release_id": rid},
                doc,
                upsert=True,
            )

            state["mongodb_ids"].append(rid)
            save_checkpoint(state)
            stored += 1

            # Print compact preview
            print(f"\n  [{stored}] {rid}  |  {rec['title'][:55]}")
            print(f"       URL: {doc['source_url'] or '(no URL)'}")
            for s in doc["sectors"]:
                icon = "+" if s["impact"] == "Positive" else "-"
                print(f"       {icon} [{s['sector']:12s}] {s['one_liner'][:90]}")
                if s["tickers"]:
                    print(f"         Tickers: {', '.join(s['tickers'])}")

        except Exception as e:
            print(f"  Failed to store {rid}: {e}")

    print(f"\n  MongoDB sync complete. Stored {stored} alert(s) "
          f"in collection '{MONGODB_COLLECTION}'.")


# =============================================================================
#  STANDALONE ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    _state = load_checkpoint()
    run(_state)

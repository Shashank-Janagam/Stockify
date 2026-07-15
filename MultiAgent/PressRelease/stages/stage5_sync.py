"""
stages/stage5_sync.py
=====================
Stage 5 – SYNC TO RAG

Reads press_releases_enriched.json and upserts ALL records to the Pinecone
"market-events" namespace in batches of 20.

Each enriched record is flattened into a Pinecone-compatible format:
  • _id       – release_id (e.g. PR_2026_021)
  • content   – structured markdown combining title, summary, economic context,
                affected sector details, and historical patterns.
                Pinecone's integrated multilingual-E5-large model embeds this field.
  • text      – same as content (required by the upsert_records API)
  • metadata  – event_type, published_year, macro_indicators, affected_sectors,
                sector_impact_summary, related_companies, keywords

After syncing, Stage 2's Pinecone queries will retrieve these enriched records
as high-quality historical context for future press releases.

Run standalone (re-sync everything):
    python -m stages.stage5_sync
"""

import json
import os
from datetime import datetime

from .common import (
    ENRICHED_FILE, NAMESPACE,
    init_pinecone, banner,
)


# =============================================================================
#  RECORD FLATTENING
# =============================================================================

def _flatten(e: dict) -> dict:
    """
    Convert one enriched record into a Pinecone upsert record.
    The 'content' field is what gets embedded by Pinecone automatically.
    """
    # Build sector detail lines
    sector_lines = []
    sector_names = []
    for s in e.get("affected_sectors", []):
        name   = s.get("sector", "")
        impact = s.get("impact", "")
        reason = s.get("reason", "")
        if name:
            sector_names.append(name)
            sector_lines.append(f"{name} ({impact}): {reason}")

    # Build structured markdown for high-quality embeddings
    parts = [
        f"### Title: {e.get('title', '')}",
        f"**Category**: {e.get('category', 'General')}",
        f"**Importance**: {e.get('importance', 'Medium')}",
        f"**Summary**: {e.get('summary', '')}",
        f"**Economic Context**: {e.get('economic_context', '')}",
    ]
    if sector_lines:
        parts.append("**Affected Sectors**:\n" + "\n".join(f"- {l}" for l in sector_lines))
    if e.get("historical_patterns"):
        pats = "\n".join(f"- {p}" for p in e["historical_patterns"])
        parts.append(f"**Historical Patterns**:\n{pats}")

    content = "\n\n".join(parts)

    # Parse year from release date
    release_date = e.get("release_date", "")
    published_year = datetime.now().year
    if release_date and len(release_date) >= 4:
        try:
            published_year = int(release_date.split("-")[0])
        except ValueError:
            pass

    # Extract ticker list
    tickers = [c.get("ticker", "") for c in e.get("candidate_companies", [])
               if c.get("ticker")]

    return {
        "_id":                   e.get("release_id", ""),
        "text":                  content,
        "content":               content,
        "title":                 e.get("title", ""),
        "event_type":            e.get("category", "General"),
        "published_year":        published_year,
        "macro_indicators":      e.get("macro_indicators", []),
        "affected_sectors":      sector_names,
        "sector_impact_summary": "; ".join(sector_lines),
        "related_companies":     tickers,
        "keywords":              e.get("search_keywords", []),
    }


# =============================================================================
#  PUBLIC STAGE ENTRY POINT
# =============================================================================

def run(index=None):
    """
    Execute Stage 5.

    Args:
        index: optional pre-connected Pinecone Index object.
               If None, a new connection is established automatically.
    """
    banner("STAGE 5  SYNC TO RAG  -  Upsert enriched records to Pinecone")

    if index is None:
        _, index = init_pinecone()

    if not os.path.exists(ENRICHED_FILE):
        print("  No enriched file found. Skipping RAG sync.")
        return

    try:
        with open(ENRICHED_FILE, "r", encoding="utf-8") as f:
            enriched = json.load(f)
    except Exception as e:
        print(f"  Could not load enriched file: {e}")
        return

    records = [_flatten(e) for e in enriched if e.get("release_id")]
    if not records:
        print("  No records to upsert.")
        return

    print(f"  Upserting {len(records)} record(s) to Pinecone...")
    BATCH = 20
    for i in range(0, len(records), BATCH):
        batch = records[i: i + BATCH]
        try:
            index.upsert_records(namespace=NAMESPACE, records=batch)
            print(f"  Upserted {i + len(batch)}/{len(records)}.")
        except Exception as e:
            print(f"  Upsert error at batch starting at {i}: {e}")

    stats = index.describe_index_stats()
    print(f"\n  RAG sync complete.")
    print(f"  Pinecone index stats: {stats}")


# =============================================================================
#  STANDALONE ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    run()   # creates its own Pinecone connection

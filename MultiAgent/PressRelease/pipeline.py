"""
pipeline.py
===========
Stockify Multi-Agent Pipeline  —  Main Orchestrator

Runs all five stages in sequence.  Each stage is a self-contained module
inside the `stages/` package and can also be run on its own for debugging.

Pipeline flow
-------------
  Stage 1  FETCH        stages/stage1_fetch.py
           Scrapes new RBI / PIB press releases.
           Output: press_releases_raw.jsonl

  Stage 2  RAG CONTEXT  stages/stage2_rag.py
           For each new release, queries Pinecone for similar historical
           events (score >= 0.70). If none found, the LLM synthesises a
           background context paragraph and upserts it to Pinecone.

  Stage 3  FILTER       stages/stage3_filter.py
           Classification agent labels each release as direct / indirect /
           unrelated using titles only.
           Output: press_releases_filtered.json

  Stage 4  ENRICH       stages/stage4_enrich.py
           Full-text economist agent extracts structured JSON events
           (positive AND negative sector impacts).
           Output: press_releases_enriched.json

  Stage 5  SYNC TO RAG  stages/stage5_sync.py
           Upserts all enriched records to Pinecone so future runs can
           retrieve them as historical context.

  Stage 6  MONGODB      stages/stage6_mongodb.py
           For every enriched release that affects the stock market
           (Positive or Negative sector impact), stores a compact alert
           document in MongoDB collection "sector_alerts" with:
             • one-line summary of the release
             • per-sector: impact, one-liner reason, affected tickers
             • direct link to the source press release page

Usage
-----
  # Full pipeline (RBI press releases, fetch up to 10 new items)
  python pipeline.py

  # Fetch from PIB instead, limit 20
  python pipeline.py --source pib --limit 20

  # Fetch all RBI feeds (press releases + notifications + speeches)
  python pipeline.py --source rbi --feed all --limit 5

  # Skip fetching — run only filter + enrich + sync on existing data
  python pipeline.py --skip-fetch --skip-rag

  # Run a single stage for debugging (from root directory)
  python -m stages.stage1_fetch --limit 3
  python -m stages.stage3_filter
  python -m stages.stage5_sync
"""

import argparse
import sys

# Stage modules
from stages import stage1_fetch, stage2_rag, stage3_filter, stage4_enrich, stage5_sync, stage6_mongodb
from stages.common import (
    RBI_RSS_FEEDS,
    load_checkpoint,
    init_pinecone,
    init_llm_fast,
    init_llm_strong,
    banner,
)


# =============================================================================
#  CLI ARGUMENT PARSER
# =============================================================================

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Stockify Multi-Agent Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python pipeline.py                          # default: RBI press releases, limit 10
  python pipeline.py --source pib            # PIB releases (today only)
  python pipeline.py --source rbi --feed all # all RBI feeds
  python pipeline.py --skip-fetch --skip-rag   (only classify + enrich + sync + mongo)
  python pipeline.py --skip-mongo               (skip MongoDB, run everything else)
        """,
    )

    # Fetch options
    parser.add_argument(
        "--source", choices=["rbi", "pib"], default="rbi",
        help="News source to scrape  (default: rbi)"
    )
    parser.add_argument(
        "--feed", choices=list(RBI_RSS_FEEDS.keys()) + ["all"],
        default="press_releases",
        help="RBI RSS feed type (ignored when --source pib)  (default: press_releases)"
    )
    parser.add_argument(
        "--limit", type=int, default=10,
        help="Max new items to fetch per feed per run  (default: 10)"
    )
    parser.add_argument(
        "--delay", type=float, default=2.0,
        help="Seconds between HTTP requests  (default: 2.0)"
    )

    # Stage skip flags
    parser.add_argument("--skip-fetch",  action="store_true", help="Skip Stage 1 – Fetch")
    parser.add_argument("--skip-rag",    action="store_true", help="Skip Stage 2 – RAG Context")
    parser.add_argument("--skip-filter", action="store_true", help="Skip Stage 3 – Filter")
    parser.add_argument("--skip-enrich", action="store_true", help="Skip Stage 4 – Enrich")
    parser.add_argument("--skip-sync",   action="store_true", help="Skip Stage 5 – Sync to RAG")
    parser.add_argument("--skip-mongo",  action="store_true", help="Skip Stage 6 – MongoDB store")

    return parser


# =============================================================================
#  MAIN
# =============================================================================

def main():
    args = build_parser().parse_args()

    print()
    print("+" + "-" * 62 + "+")
    print("|   STOCKIFY  -  MULTI-AGENT PIPELINE                         |")
    print("+" + "-" * 62 + "+")
    print(f"  Source  : {args.source.upper()}"
          + (f" / {args.feed}" if args.source == "rbi" else ""))
    print(f"  Limit   : {args.limit} items per feed")
    print(f"  Stages  : "
          + " → ".join(
              name for name, skip in [
                  ("Fetch",  args.skip_fetch),
                  ("RAG",    args.skip_rag),
                  ("Filter", args.skip_filter),
                  ("Enrich", args.skip_enrich),
                  ("Sync",   args.skip_sync),
                  ("MongoDB",args.skip_mongo),
              ]
              if not skip
          )
    )

    # ── Initialise shared resources (done ONCE for the whole run) ────────────
    state      = load_checkpoint()
    pc, index  = init_pinecone()
    llm_fast   = init_llm_fast()
    llm_strong = init_llm_strong()

    # ── Stage 1 – Fetch ───────────────────────────────────────────────────────
    newly_fetched = []
    if not args.skip_fetch:
        newly_fetched = stage1_fetch.run(args, state)
    else:
        print("\n[Skipped] Stage 1 – Fetch")

    # ── Stage 2 – RAG Context Layer ───────────────────────────────────────────
    if not args.skip_rag:
        stage2_rag.run(newly_fetched, state, index, llm_strong)
    else:
        print("\n[Skipped] Stage 2 – RAG Context Layer")

    # ── Stage 3 – Filter ──────────────────────────────────────────────────────
    if not args.skip_filter:
        stage3_filter.run(state, llm_fast)
    else:
        print("\n[Skipped] Stage 3 – Filter")

    # ── Stage 4 – Enrich ──────────────────────────────────────────────────────
    if not args.skip_enrich:
        stage4_enrich.run(state, llm_strong)
    else:
        print("\n[Skipped] Stage 4 – Enrich")

    # ── Stage 5 – Sync to RAG ─────────────────────────────────────────────────
    if not args.skip_sync:
        stage5_sync.run(index)
    else:
        print("\n[Skipped] Stage 5 – Sync to RAG")

    # ── Stage 6 – MongoDB ─────────────────────────────────────────────────
    if not args.skip_mongo:
        stage6_mongodb.run(state)
    else:
        print("\n[Skipped] Stage 6 – MongoDB")

    # ── Summary ───────────────────────────────────────────────────────────────
    banner("PIPELINE COMPLETE")
    print(f"  Raw data   →  press_releases_raw.jsonl")
    print(f"  Filtered   →  press_releases_filtered.json")
    print(f"  Enriched   →  press_releases_enriched.json")
    print(f"  Pinecone   →  index='stockify'  namespace='market-events'")
    print(f"  MongoDB    →  collection='sector_alerts'  (db from URI)")

    print()


if __name__ == "__main__":
    main()

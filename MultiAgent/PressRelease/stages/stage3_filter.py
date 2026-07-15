"""
stages/stage3_filter.py
=======================
Stage 3 – FILTER

Reads all unprocessed records from press_releases_raw.jsonl and sends their
TITLES ONLY (no body text) to a CrewAI classification agent.

The agent labels each release as:
  • "direct"   – corporate action, listed stock event, market-moving announcement
  • "indirect" – macroeconomic, monetary policy, inflation, GDP, currency data
  • "unrelated"– sport, personnel change, cultural event, generic admin notice

Only "direct" and "indirect" releases are written to press_releases_filtered.json.
"unrelated" releases are silently dropped.

Run standalone (for debugging):
    python -m stages.stage3_filter
"""

import json
import os

from crewai import Agent, Task, Crew, LLM

from .common import (
    RAW_FILE, FILTERED_FILE, CHECKPOINT_FILE,
    load_checkpoint, save_checkpoint, parse_json_from_text,
    retry_crew, banner,
)


# =============================================================================
#  DATA LOADING
# =============================================================================

def _load_pending(state: dict) -> tuple:
    """
    Return (pending_list, url_to_record) for all raw releases not yet filtered.
    """
    filtered_set = set(state.get("filtered_urls", []))
    pending = []
    url_map = {}

    if not os.path.exists(RAW_FILE):
        return pending, url_map

    with open(RAW_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                url = rec.get("url")
                if url and url not in filtered_set:
                    pending.append(rec)
                    url_map[url] = rec
            except Exception as e:
                print(f"  Warning: could not parse raw line: {e}")

    return pending, url_map


# =============================================================================
#  CLASSIFICATION AGENT
# =============================================================================

def _build_classifier_agent(llm: LLM) -> Agent:
    return Agent(
        role="Financial News & Market Relevance Classifier",
        goal="Accurately classify if a financial/government news title is directly related, "
             "indirectly related, or unrelated to the Indian stock market.",
        backstory="""You are an expert filter for financial news releases.
You classify press release titles into exactly one of three categories:

1. 'direct'   — The release mentions a listed stock, corporate action, merger,
                  dividend, earnings, stock exchange event, or regulatory action on a
                  specific company.
2. 'indirect' — The release discusses macroeconomics, central bank policy (repo rate,
                  CRR, OMOs), treasury bill/bond auctions, SDL auctions, CPI/WPI
                  inflation, GDP, currency, or broad liquidity/money-supply data
                  that indirectly drives the entire market.
3. 'unrelated'— Completely unrelated to the stock market: sports, personnel
                  appointments, cultural events, generic administrative notices.

You return a valid raw JSON array — no markdown, no prose.""",
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )


def _build_classification_task(agent: Agent, releases: list) -> Task:
    return Task(
        description=f"""Classify the following press releases using their TITLES ONLY.

RELEASES:
{json.dumps(releases, indent=2)}

For each release output a JSON object with:
  "url"           – original URL (string)
  "title"         – original title (string)
  "relation_type" – "direct" | "indirect" | "unrelated" (string)
  "reason"        – one-sentence explanation (string)

Output ONLY a raw JSON array. No markdown fences, no introductory text.""",
        expected_output="A raw JSON array of classified release objects.",
        agent=agent,
    )


# =============================================================================
#  PUBLIC STAGE ENTRY POINT
# =============================================================================

def run(state: dict, llm_fast: LLM):
    """
    Execute Stage 3.

    Args:
        state:    shared checkpoint dict (mutated in-place)
        llm_fast: fast LLM instance for classification
    """
    banner("STAGE 3  FILTER  -  Classify releases by stock-market relevance")

    pending, url_map = _load_pending(state)

    if not pending:
        print("  No pending press releases to classify.")
        return

    print(f"  Found {len(pending)} release(s) to classify.")

    agent = _build_classifier_agent(llm_fast)
    task  = _build_classification_task(agent, [{"url": r["url"], "title": r["title"]}
                                                for r in pending])
    crew  = Crew(agents=[agent], tasks=[task], verbose=False)

    result_text = retry_crew(crew)
    if not result_text:
        print("  Classification failed after retries.")
        return

    try:
        classifications = parse_json_from_text(result_text)
    except Exception as e:
        print(f"  Could not parse JSON from classifier: {e}")
        print(f"  Raw output (first 500 chars): {result_text[:500]}")
        return

    # Load existing filtered records to append to
    existing_filtered = []
    if os.path.exists(FILTERED_FILE):
        try:
            with open(FILTERED_FILE, "r", encoding="utf-8") as f:
                existing_filtered = json.load(f)
        except Exception:
            pass

    added = skipped = 0
    for item in classifications:
        url      = item.get("url")
        relation = item.get("relation_type")
        reason   = item.get("reason", "")
        if not url:
            continue
        original = url_map.get(url)
        if not original:
            continue

        if relation in ("direct", "indirect"):
            rec = original.copy()
            rec["relation_type"]         = relation
            rec["classification_reason"] = reason
            existing_filtered.append(rec)
            added += 1
            print(f"  + [{relation.upper():8s}] {original['title'][:70]}")
        else:
            skipped += 1
            print(f"  - [UNRELATED] {original['title'][:70]}")

        state["filtered_urls"].append(url)

    with open(FILTERED_FILE, "w", encoding="utf-8") as f:
        json.dump(existing_filtered, f, indent=2, ensure_ascii=False)

    save_checkpoint(state)
    print(f"\n  Filter complete. Saved {added} relevant, dropped {skipped} unrelated.")


# =============================================================================
#  STANDALONE DEBUG ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    from .common import load_checkpoint, init_llm_fast
    _state = load_checkpoint()
    _llm   = init_llm_fast()
    run(_state, _llm)

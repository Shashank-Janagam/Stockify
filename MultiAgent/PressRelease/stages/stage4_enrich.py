"""
stages/stage4_enrich.py
=======================
Stage 4 – ENRICH

Reads every release from press_releases_filtered.json that has not yet been
enriched, sends its FULL TEXT to a CrewAI economist agent, and produces a
structured JSON event record conforming to the Stockify schema.

Schema highlights:
  • importance        – High / Medium / Low
  • summary           – concise human-readable summary
  • economic_context  – macro backdrop
  • key_changes       – bullet list of the main policy/data changes
  • macro_indicators  – e.g. Interest Rate, Yield, Liquidity
  • affected_sectors  – list of {sector, impact, confidence, reason}
                        BOTH positive AND negative sectors are required
  • candidate_companies – {ticker, company, expected_impact}
  • economic_reasoning  – step-by-step causal chain
  • monitor_list      – {duration_days, priority sectors}
  • historical_patterns – what happened in analogous past events
  • search_keywords   – terms for further research

Records are appended to press_releases_enriched.json INCREMENTALLY after each
successful extraction so that a crash or rate-limit failure does not lose work.

Run standalone (for debugging):
    python -m stages.stage4_enrich
"""

import json
import os
import time

from crewai import Agent, Task, Crew, LLM

from .common import (
    FILTERED_FILE, ENRICHED_FILE,
    load_checkpoint, save_checkpoint,
    parse_json_from_text, get_next_enriched_id, clean_date_string,
    retry_crew, banner,
)


# =============================================================================
#  ENRICHMENT AGENT
# =============================================================================

def _build_enricher_agent(llm: LLM) -> Agent:
    return Agent(
        role="Principal Market Intelligence Economist & Security Analyst",
        goal="Accurately analyse Indian financial press releases and extract structured "
             "stock-market event data including positive AND negative sector impacts.",
        backstory="""You are an elite financial economist and equity analyst specialising
in the Indian stock market (NSE/BSE). For each press release you:

1. Classify market importance: High / Medium / Low.
2. Write a concise summary and brief macroeconomic context.
3. Identify key policy or operational changes.
4. List the key macro indicators affected (e.g. Interest Rate, Yield, Liquidity, Inflation).
5. Map impacted stock sectors with:
   - impact direction: Positive | Negative | Neutral
   - confidence score: 0.0 – 1.0
   - clear economic reason
   *** You MUST include NEGATIVELY affected sectors (e.g. rate-sensitive sectors like
   Real Estate, Automobile, Infrastructure, NBFCs during liquidity-tightening events). ***
6. Map sectors to specific NSE-listed companies with correct tickers and expected impact.
7. Write a step-by-step economic reasoning chain.
8. Specify monitoring duration and priority sectors.
9. List historical analogues and search keywords.

You output a SINGLE raw JSON object matching the exact schema. No guessing.""",
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )


def _build_enrichment_task(agent: Agent, record: dict, release_id: str) -> Task:
    return Task(
        description=f"""Analyse the following press release and extract all structured fields.

PRESS RELEASE:
  Title    : {record['title']}
  Source   : {record.get('source', 'Reserve Bank of India')}
  Date     : {record.get('release_date', '')}
  Category : {record.get('category', 'press_releases')}
  URL      : {record.get('url', '')}

FULL TEXT:
{record.get('raw_press_release', '')}

TARGET SCHEMA — output a JSON object with these EXACT keys:
{{
    "importance": "High" | "Medium" | "Low",
    "summary": "...",
    "economic_context": "...",
    "key_changes": ["change 1", "change 2"],
    "macro_indicators": ["Indicator1", "Indicator2"],
    "affected_sectors": [
        {{
            "sector": "Banking" | "Real Estate" | "Automobile" | "NBFC" |
                      "FMCG" | "IT" | "Pharma" | "Metals" | "Infrastructure" | ...,
            "impact": "Positive" | "Negative" | "Neutral",
            "confidence": 0.85,
            "reason": "Clear economic explanation. Include NEGATIVELY affected sectors."
        }}
    ],
    "candidate_companies": [
        {{"ticker": "SBIN",   "company": "State Bank of India",   "expected_impact": "Positive"}},
        {{"ticker": "MARUTI", "company": "Maruti Suzuki India",   "expected_impact": "Negative"}}
    ],
    "economic_reasoning": ["step 1", "step 2"],
    "monitor_list": {{"duration_days": 14, "priority": ["Banking", "Real Estate"]}},
    "historical_patterns": ["pattern 1", "pattern 2"],
    "search_keywords": ["keyword1", "keyword2"]
}}

Output ONLY the raw JSON object. No markdown fences, no introduction.""",
        expected_output="A single JSON object matching the Stockify enrichment schema.",
        agent=agent,
    )


# =============================================================================
#  PUBLIC STAGE ENTRY POINT
# =============================================================================

def run(state: dict, llm_strong: LLM):
    """
    Execute Stage 4.

    Args:
        state:      shared checkpoint dict (mutated in-place)
        llm_strong: strong LLM instance for deep enrichment
    """
    banner("STAGE 4  ENRICH  -  Full-text structured event extraction")

    enriched_set = set(state.get("enriched_urls", []))

    if not os.path.exists(FILTERED_FILE):
        print("  No filtered file found. Skipping enrich stage.")
        return

    try:
        with open(FILTERED_FILE, "r", encoding="utf-8") as f:
            filtered = json.load(f)
    except Exception as e:
        print(f"  Could not load filtered file: {e}")
        return

    pending = [r for r in filtered if r.get("url") and r["url"] not in enriched_set]

    if not pending:
        print("  No pending filtered releases to enrich.")
        return

    print(f"  Found {len(pending)} release(s) to enrich.")

    # Load existing enriched records
    existing_enriched = []
    if os.path.exists(ENRICHED_FILE):
        try:
            with open(ENRICHED_FILE, "r", encoding="utf-8") as f:
                existing_enriched = json.load(f)
        except Exception:
            pass

    agent = _build_enricher_agent(llm_strong)
    processed = 0

    for i, record in enumerate(pending):
        url        = record.get("url", "")
        release_id = get_next_enriched_id(existing_enriched)
        print(f"\n  [{i+1}/{len(pending)}] {record['title'][:60]}  ->  {release_id}")

        task = _build_enrichment_task(agent, record, release_id)
        crew = Crew(agents=[agent], tasks=[task], verbose=False)

        result_text = retry_crew(crew)
        if not result_text:
            print(f"  Failed to enrich {release_id} after max retries.")
            continue

        try:
            parsed = parse_json_from_text(result_text)
        except Exception as e:
            print(f"  JSON parse error for {release_id}: {e}")
            continue

        enriched_record = {
            "release_id":          release_id,
            "title":               record.get("title", ""),
            "source":              record.get("source", "Reserve Bank of India"),
            "release_date":        clean_date_string(record.get("release_date", "")),
            "category":            record.get("category", ""),
            "importance":          parsed.get("importance", "Medium"),
            "source_url":          record.get("url", ""),          # ← HTML page URL
            "raw_press_release":   record.get("raw_press_release", ""),
            "summary":             parsed.get("summary", ""),
            "economic_context":    parsed.get("economic_context", ""),
            "key_changes":         parsed.get("key_changes", []),
            "macro_indicators":    parsed.get("macro_indicators", []),
            "affected_sectors":    parsed.get("affected_sectors", []),
            "candidate_companies": parsed.get("candidate_companies", []),
            "economic_reasoning":  parsed.get("economic_reasoning", []),
            "monitor_list":        parsed.get("monitor_list", {"duration_days": 7, "priority": []}),
            "historical_patterns": parsed.get("historical_patterns", []),
            "search_keywords":     parsed.get("search_keywords", []),
        }

        existing_enriched.append(enriched_record)
        state["enriched_urls"].append(url)
        processed += 1
        print(f"  Successfully enriched and added {release_id}.")

        # Incremental save – preserves progress even if the run crashes
        with open(ENRICHED_FILE, "w", encoding="utf-8") as f:
            json.dump(existing_enriched, f, indent=2, ensure_ascii=False)
        save_checkpoint(state)

        if i < len(pending) - 1:
            time.sleep(1)   # polite delay between LLM calls

    print(f"\n  Enrich complete. {processed} record(s) successfully enriched.")


# =============================================================================
#  STANDALONE DEBUG ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    from .common import load_checkpoint, init_llm_strong
    _state = load_checkpoint()
    _llm   = init_llm_strong()
    run(_state, _llm)

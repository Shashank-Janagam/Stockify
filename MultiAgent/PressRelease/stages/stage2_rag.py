"""
stages/stage2_rag.py
====================
Stage 2 – RAG CONTEXT LAYER

For every newly-fetched press release:

  1. Query the Pinecone vector index with the release title (top-3 hits).
  2. If at least one hit has cosine score >= RAG_SCORE_THRESHOLD (0.70):
       → Log the matching historical records (title + score).
         These will serve as retrieved context for analysts downstream.
  3. If NO hit meets the threshold:
       → Ask the strong LLM to write a short (2-4 sentence) background
         context paragraph explaining what this type of event is, its
         historical precedent, and typical market implications.
       → Upsert this synthesised context as a new vector record
         (ID prefix: "SYNTH_") so future pipeline runs can find it.

Run standalone (for debugging):
    python -m stages.stage2_rag
"""

import time
from datetime import datetime, timezone

from crewai import Agent, Task, Crew, LLM

from .common import (
    NAMESPACE, RAG_SCORE_THRESHOLD,
    load_checkpoint, save_checkpoint, retry_crew, banner,
)


# =============================================================================
#  HELPERS
# =============================================================================

def _build_pinecone_record(record_id: str, title: str, context_text: str) -> dict:
    """Wrap a synthesised context string into a Pinecone-compatible record."""
    return {
        "_id":                   record_id,
        "text":                  context_text,
        "content":               context_text,   # this field is embedded by Pinecone
        "title":                 title,
        "event_type":            "synthesised_context",
        "published_year":        datetime.now().year,
        "macro_indicators":      [],
        "affected_sectors":      [],
        "sector_impact_summary": "",
        "related_companies":     [],
        "keywords":              [],
    }


def _synthesise_and_upsert(title: str, url: str, raw_text: str,
                             index, llm_strong: LLM, synth_id: str):
    """
    When no relevant RAG context exists, ask the LLM to produce a factual
    background paragraph and store it in Pinecone for future retrieval.
    """
    print(f"    No relevant RAG context found. Synthesising background context...")

    context_agent = Agent(
        role="Economic Background Researcher",
        goal="Produce a concise, factual background context for a financial press release "
             "that will be stored as future RAG knowledge.",
        backstory="""You are a financial economist specialising in the Indian monetary system.
Given a press release title and snippet, write a compact 2-4 sentence background explaining:
• What this type of event/announcement typically is.
• Historical precedent in the Indian financial/monetary context.
• Typical market implications observed in similar past events.
Be strictly factual. No hallucinations or speculation.""",
        llm=llm_strong,
        allow_delegation=False,
        verbose=False,
    )

    context_task = Task(
        description=f"""A new press release has NO matching historical context in the knowledge base.

TITLE:   {title}
URL:     {url}
SNIPPET: {raw_text[:1000]}

Write a concise 2-4 sentence background context.
Output ONLY the plain text paragraph. No markdown, no labels, no JSON.""",
        expected_output="A plain-text 2-4 sentence background context paragraph.",
        agent=context_agent,
    )

    crew = Crew(agents=[context_agent], tasks=[context_task], verbose=False)
    result = retry_crew(crew)
    if not result:
        print(f"    Failed to synthesise context after retries.")
        return

    context_text = result.strip()
    full_text = f"### Title: {title}\n\n**Background Context**: {context_text}"
    print(f"    Context synthesised ({len(context_text)} chars). Upserting to Pinecone...")

    record = _build_pinecone_record(synth_id, title, full_text)
    try:
        index.upsert_records(namespace=NAMESPACE, records=[record])
        print(f"    Saved synthetic context '{synth_id}' to Pinecone.")
    except Exception as e:
        print(f"    Failed to upsert context: {e}")


# =============================================================================
#  PUBLIC STAGE ENTRY POINT
# =============================================================================

def run(newly_fetched: list, state: dict, index, llm_strong: LLM):
    """
    Execute Stage 2.

    Args:
        newly_fetched: list of raw records returned by Stage 1
        state:         shared checkpoint dict (mutated in-place)
        index:         Pinecone Index object (already connected)
        llm_strong:    Strong LLM instance for context synthesis
    """
    banner("STAGE 2  RAG CONTEXT LAYER  -  Semantic retrieval & context synthesis")

    rag_done = set(state.get("rag_context_urls", []))
    pending  = [r for r in newly_fetched if r.get("url") and r["url"] not in rag_done]

    if not pending:
        print("  No new releases to process in RAG context layer.")
        return

    print(f"  Processing {len(pending)} release(s)...\n")

    for i, record in enumerate(pending):
        url   = record.get("url", "")
        title = record.get("title", "Unknown")
        raw   = record.get("raw_press_release", "")

        print(f"  [{i+1}/{len(pending)}] \"{title[:70]}\"")

        # Query Pinecone for similar historical records
        hits = []
        try:
            results = index.search(
                namespace=NAMESPACE,
                query={"inputs": {"text": title}, "top_k": 3},
            )
            hits = results["result"]["hits"]
        except Exception as e:
            print(f"    Pinecone query failed: {e}")

        relevant = [
            h for h in hits
            if (h.get("score") or getattr(h, "score", 0) or 0) >= RAG_SCORE_THRESHOLD
        ]

        if relevant:
            print(f"    {len(relevant)} relevant RAG hit(s) found "
                  f"(score >= {RAG_SCORE_THRESHOLD}):")
            for h in relevant:
                hit_id  = h.get("id") or getattr(h, "id", "?")
                score   = h.get("score") or getattr(h, "score", 0)
                fields  = h.get("fields") or getattr(h, "fields", {}) or {}
                h_title = fields.get("title", "No Title")
                print(f"      - {hit_id} | score={score:.4f} | {h_title[:60]}")
        else:
            # Synthesise new context and store it
            synth_id = f"SYNTH_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{i}"
            _synthesise_and_upsert(title, url, raw, index, llm_strong, synth_id)

        state["rag_context_urls"].append(url)
        save_checkpoint(state)
        time.sleep(1)   # polite delay between LLM calls

    print(f"\n  RAG context layer complete.")


# =============================================================================
#  STANDALONE DEBUG ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    from .common import load_checkpoint, init_pinecone, init_llm_strong

    print("Stage 2 standalone: processing any unprocessed raw records...")
    import json, os
    _state = load_checkpoint()
    _, _index = init_pinecone()
    _llm = init_llm_strong()

    # Load all raw records not yet in rag_context_urls
    _records = []
    if os.path.exists("press_releases_raw.jsonl"):
        with open("press_releases_raw.jsonl", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                    if rec.get("url") and rec["url"] not in _state["rag_context_urls"]:
                        _records.append(rec)
                except Exception:
                    pass

    run(_records, _state, _index, _llm)

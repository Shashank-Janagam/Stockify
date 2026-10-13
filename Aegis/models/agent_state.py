from typing import Annotated, Optional, TypedDict
from langgraph.graph.message import add_messages

RESET = "__reset__"


def merge_results(old: dict, new: dict) -> dict:
    """Parallel specialists each add their own key. {"__reset__": True} clears (used at turn start)."""
    if new and new.get(RESET):
        return {k: v for k, v in new.items() if k != RESET}
    return {**(old or {}), **(new or {})}


class AgentState(TypedDict, total=False):
    # --- identity & conversation (persist across turns) ---
    user_id: str
    displayName: str
    preferences: dict
    messages: Annotated[list, add_messages]

    # --- memory (persist) ---
    rules: list[str]
    memory_context: list[str]
    pending_action: Optional[dict]

    # --- per-turn working state (reset at start of every turn) ---
    intent: dict
    plan: list[dict]                 # list[Task], written only by planner
    done_when: list[str]
    results: Annotated[dict, merge_results]   # task_id -> Result, written by specialists in parallel
    steps: int                       # waves completed, written only by evaluate
    replans: int                     # written only by planner
    gate_verdict: dict
    draft: str
    verdict: dict
    revisions: int


class SpecialistInput(TypedDict, total=False):
    """What the dispatcher sends to a specialist (via Send). Not part of the shared state."""
    user_id: str
    messages: list
    intent: dict
    task: dict
    dep_results: dict


def new_turn_reset() -> dict:
    return {
        "results": {RESET: True},
        "plan": [], "done_when": [], "steps": 0, "replans": 0,
        "gate_verdict": {}, "draft": "", "verdict": {}, "revisions": 0,
    }
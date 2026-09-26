from typing import Annotated, Optional, Dict, Any
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class MarketState(TypedDict):

    messages: Annotated[
        list,
        add_messages
    ]

    # Auth context — Firebase uid + backend bearer token for trading tools
    uid: Optional[str]
    user_token: Optional[str]

    # Pending trade awaiting user confirmation from the frontend
    pending_trade: Optional[dict]

    # ── Deep Research Parallel Execution Plan ──────────────────────────────
    # A list of groups. Each group is a list of "agent|instruction" strings.
    # Agents WITHIN a group run in PARALLEL.
    # Groups themselves run SEQUENTIALLY (group 1 → group 2 → ... → synthesizer).
    parallel_groups: list[list[str]]

    # Which group index we are currently executing (0-indexed)
    current_group_index: int

    # Stores intermediate agent outputs keyed by agent name.
    # Used to pass context between groups without polluting messages.
    agent_results: Dict[str, str]

    # Legacy flat plan — kept for backward compat, no longer used in deep mode
    plan: list[str]
    route_decision: list[str]
    next_agent: Optional[str]
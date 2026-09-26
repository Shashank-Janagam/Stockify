"""
market_graph.py — Deep Research Architecture
─────────────────────────────────────────────
Graph topology:

  [planner] → [fan_out] → [group_router] → [fan_out] (next group) → ... → [synthesizer] → END

  fan_out:     Dispatches all agents in the current parallel group using asyncio.gather.
               Each agent runs with retry logic via agent_runner.
  group_router: Checks if more groups remain. If yes → fan_out again. If no → synthesizer.
  synthesizer: Weaves all agent outputs into a single polished response.
"""

import os
import sys
import asyncio

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import AIMessage, SystemMessage

from models.state import MarketState
from agents.planner import planner_node
from agents.synthesizer import synthesizer_node
from agents.agent_runner import run_agent_with_retry

# ── Import all agent executors ──────────────────────────────────────────────────
from agents.market_agent import market_agent_executor, system_prompt as market_prompt
from agents.research_agent import research_agent_executor, RESEARCH_SYSTEM_PROMPT
from agents.risk_agent import risk_agent_executor, RISK_SYSTEM_PROMPT
from agents.strategy_agent import strategy_agent_executor, STRATEGY_SYSTEM_PROMPT
from agents.portfolio_agent import portfolio_agent_executor, PORTFOLIO_SYSTEM_PROMPT
from agents.casual_agent import casual_chain


# ── Agent Registry ──────────────────────────────────────────────────────────────
# Maps agent name → (executor, system_prompt, config_needs_uid)

AGENT_REGISTRY = {
    "market_agent":    (market_agent_executor,   market_prompt,           False),
    "research_agent":  (research_agent_executor,  RESEARCH_SYSTEM_PROMPT,  False),
    "risk_agent":      (risk_agent_executor,       RISK_SYSTEM_PROMPT,      False),
    "strategy_agent":  (strategy_agent_executor,   STRATEGY_SYSTEM_PROMPT,  False),
    "portfolio_agent": (portfolio_agent_executor,  PORTFOLIO_SYSTEM_PROMPT, True),
}


async def _run_single_agent(agent_name: str, instruction: str, state: MarketState) -> str:
    """
    Runs a single agent for a given instruction.
    For casual_agent, uses the simple chain (no tools needed).
    For all others, uses the react executor with retry.
    """
    messages = list(state.get("messages", []))
    
    # Keep last 6 messages for context, plus inject the specific instruction
    recent = messages[-6:] if len(messages) > 6 else messages
    recent_with_instruction = recent + [
        SystemMessage(content=f"TASK FOR THIS STEP: {instruction}")
    ]

    if agent_name == "casual_agent":
        try:
            response = await casual_chain.ainvoke({"messages": recent_with_instruction})
            content = response.content if hasattr(response, "content") else str(response)
            if isinstance(content, list):
                content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
            return content
        except Exception as e:
            return f"Hello! I'm Aegis. How can I help you today? (Error: {e})"

    if agent_name not in AGENT_REGISTRY:
        return f"⚠️ Unknown agent: {agent_name}"

    executor, _, needs_uid = AGENT_REGISTRY[agent_name]
    
    # Portfolio agent needs the uid in config for auth
    if needs_uid:
        uid = state.get("uid")
        original_invoke = executor.ainvoke
        async def invoke_with_config(msgs):
            return await original_invoke(msgs, config={"configurable": {"uid": uid}})
        
        return await run_agent_with_retry(
            type("_", (), {"ainvoke": lambda self, m: invoke_with_config(m)})(),
            recent_with_instruction,
            agent_name
        )
    
    return await run_agent_with_retry(executor, recent_with_instruction, agent_name)


async def fan_out_node(state: MarketState) -> dict:
    """
    Executes all agents in the CURRENT parallel group simultaneously.
    Collects results into agent_results and adds them all to messages.
    """
    parallel_groups = state.get("parallel_groups", [])
    current_idx = state.get("current_group_index", 0)
    agent_results = dict(state.get("agent_results", {}))

    if current_idx >= len(parallel_groups):
        return {}

    current_group = parallel_groups[current_idx]
    
    # Parse "agent_name|instruction" format
    tasks = []
    names = []
    for step in current_group:
        if "|" in step:
            agent_name, instruction = step.split("|", 1)
        else:
            agent_name, instruction = step, "Answer the user's query."
        tasks.append(_run_single_agent(agent_name.strip(), instruction.strip(), state))
        names.append(agent_name.strip())

    print(f"\n[Fan-Out] Group {current_idx + 1}: Running {names} in parallel...")
    
    # Execute all agents in the group concurrently
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    new_messages = []
    for name, result in zip(names, results):
        if isinstance(result, Exception):
            content = f"⚠️ **{name}** failed: {result}"
        else:
            content = str(result)
        
        agent_results[name] = content
        new_messages.append(AIMessage(content=content, name=name))
        print(f"[Fan-Out] {name} completed ({len(content)} chars)")

    return {
        "messages": new_messages,
        "agent_results": agent_results,
        "current_group_index": current_idx + 1,
    }


def group_router(state: MarketState) -> str:
    """Decide whether to run the next group or go to synthesizer."""
    parallel_groups = state.get("parallel_groups", [])
    current_idx = state.get("current_group_index", 0)
    
    if current_idx < len(parallel_groups):
        return "fan_out"
    return "synthesizer"


# ── Build the Graph ────────────────────────────────────────────────────────────

workflow = StateGraph(MarketState)

workflow.add_node("planner", planner_node)
workflow.add_node("fan_out", fan_out_node)
workflow.add_node("synthesizer", synthesizer_node)

workflow.set_entry_point("planner")
workflow.add_edge("planner", "fan_out")
workflow.add_conditional_edges("fan_out", group_router, {"fan_out": "fan_out", "synthesizer": "synthesizer"})
workflow.add_edge("synthesizer", END)

memory = MemorySaver()
market_graph = workflow.compile(checkpointer=memory)


# ── CLI for local testing ──────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    from langchain_core.messages import HumanMessage
    sys.stdout.reconfigure(encoding='utf-8')
    print("Aegis Deep Research Mode — CLI")
    config = {"configurable": {"thread_id": "1"}}
    while True:
        try:
            user_input = input("\nYou: ")
            if user_input.strip().lower() in ["exit", "quit"]:
                break
            result = market_graph.invoke({"messages": [HumanMessage(content=user_input)]}, config=config)
            if result.get("messages"):
                print(f"\n--- AEGIS ---\n{result['messages'][-1].content}\n")
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"\n[Error]: {e}")

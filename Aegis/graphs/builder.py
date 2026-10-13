from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agents.marketAgent import run_market
from agents.portfolioAgent import run_portfolio
from agents.researchAgent import run_research
from agents.strategyAgent import run_strategy
from agents.algoAgent import run_algo
from agents.tradingAgent import run_trading

from execution.nodes import discard, execute, no_pending, propose
from graphs.nodes import clarify, parse_intent, respond, route_intent
from graphs.planner import evaluate, planner, route_after_eval, route_after_planner
from models.agent_state import AgentState

SPECIALISTS = {
    "portfolio": run_portfolio,
    "market": run_market,
    "research": run_research,
    "strategy": run_strategy,
    "algo": run_algo,
    "trading": run_trading
}
TERMINAL = ("clarify", "respond", "propose", "execute", "discard", "no_pending")


def build_graph(checkpointer=None):
    g = StateGraph(AgentState)
    g.add_node("parse_intent", parse_intent)
    g.add_node("clarify", clarify)
    g.add_node("planner", planner)
    g.add_node("evaluate", evaluate)
    g.add_node("respond", respond)
    g.add_node("propose", propose)
    g.add_node("execute", execute)
    g.add_node("discard", discard)
    g.add_node("no_pending", no_pending)
    for name, fn in SPECIALISTS.items():
        g.add_node(name, fn)

    g.add_edge(START, "parse_intent")
    g.add_conditional_edges(
        "parse_intent", route_intent,
        {n: n for n in ("clarify", "planner", "respond", "propose", "execute", "discard", "no_pending")},
    )
    g.add_conditional_edges("planner", route_after_planner)
    for name in SPECIALISTS:
        g.add_edge(name, "evaluate")
    g.add_conditional_edges("evaluate", route_after_eval)
    for n in TERMINAL:
        g.add_edge(n, END)
    return g.compile(checkpointer=checkpointer or MemorySaver())
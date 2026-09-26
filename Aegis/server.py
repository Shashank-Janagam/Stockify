"""
Aegis FastAPI Server
Exposes the LangGraph market_graph as a streaming HTTP API.

Run with:
    uvicorn server:app --host 0.0.0.0 --port 5050 --reload
"""

import os
import sys
import json
import uuid
import asyncio
from datetime import datetime

# Ensure the Aegis root is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from langchain_core.messages import HumanMessage, AIMessage
from graphs.market_graph import market_graph
from graphs.fast_graph import fast_graph

app = FastAPI(title="Aegis AI Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Types ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    thread_id: Optional[str] = None  # for conversation memory
    uid: Optional[str] = None        # Firebase UID for trading auth
    mode: Optional[str] = "deep"     # "fast" or "deep"

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "aegis", "time": datetime.utcnow().isoformat()}

# ── Streaming Chat ─────────────────────────────────────────────────────────────

def _extract_text(content) -> str:
    """Handle both string and Gemini multimodal list content."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, dict) and "text" in p:
                parts.append(p["text"])
            elif isinstance(p, str):
                parts.append(p)
        return "".join(parts)
    return str(content)


async def _stream_graph(messages: List[ChatMessage], thread_id: str, uid: Optional[str] = None, mode: str = "deep"):
    """
    Run the LangGraph market_graph and yield SSE events.

    Events emitted:
      {"type": "status",  "text": "..."}   — routing info
      {"type": "token",   "text": "..."}   — streamed response chunk
      {"type": "trace",   "agents": [...], "tools": [...]}  — debug trace
      {"type": "done"}                     — completion
      {"type": "error",   "text": "..."}   — error
    """

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    try:
        # Convert to LangChain messages
        lc_messages = []
        for m in messages:
            if m.role in ("user", "human"):
                lc_messages.append(HumanMessage(content=m.content))
            else:
                lc_messages.append(AIMessage(content=m.content))

        config = {"configurable": {"thread_id": thread_id, "uid": uid}}
        
        # Inject uid into the root state directly if needed, but it's passed via config
        state_input = {"messages": lc_messages, "uid": uid}

        # Keep track of debug traces
        agents_used = []
        tools_used = []
        last_status = None
        will_synthesize = False
        agents_started = set()  # tracks which agent nodes have started
        
        SPECIALIST_AGENTS = {"market_agent", "research_agent", "risk_agent", "strategy_agent", "portfolio_agent"}
        
        TOOL_SYNONYMS = {
            "search_stocks": "Searching market databases",
            "get_stock_quote": "Fetching live price quotes",
            "get_stock_history": "Analyzing historical price trends",
            "get_stock_profile": "Analyzing company profile",
            "get_sector_peers": "Comparing sector peers",
            "get_financials": "Reading financial statements",
            "get_metrics": "Evaluating key financial metrics",
            "get_risk": "Calculating risk & volatility",
            "get_analyst_recs": "Checking analyst ratings",
            "get_technicals": "Computing technical indicators",
            "get_options": "Analyzing options chain",
            "get_indices": "Checking market indices",
            "get_movers": "Scanning top market movers",
            "get_financial_news": "Scanning latest financial news",
            "get_company_announcements": "Reviewing corporate filings",
            "get_macro_data": "Retrieving macroeconomic indicators",
            "search_web": "Searching the web for latest context",
            "submit_strategy_for_backtest": "Initializing backtest simulation",
            "backtest_and_refine": "Iterating quantitative strategy",
            "check_portfolio": "Reading secure portfolio logs",
            "buy_stock": "Executing BUY order",
            "sell_stock": "Executing SELL order"
        }
        
        AGENT_SYNONYMS = {
            "market_agent": "Market Intelligence Agent",
            "research_agent": "Research & News Agent",
            "risk_agent": "Risk Analysis Agent",
            "strategy_agent": "Quantitative Strategy Agent",
            "portfolio_agent": "Portfolio & Execution Agent",
            "synthesizer": "Synthesizer"
        }

        # Choose the graph based on mode
        graph_to_use = fast_graph if mode == "fast" else market_graph

        # Stream graph events asynchronously
        async for event in graph_to_use.astream_events(
            state_input, 
            config=config, 
            version="v2"
        ):
            kind = event["event"]
            node_name = event.get("metadata", {}).get("langgraph_node")
            
            # --- Detect Routing Decision (from planner output) ---
            # In the new parallel architecture, synthesizer ALWAYS runs, so always set will_synthesize
            if kind == "on_chain_end" and event["name"] == "planner":
                output = event.get("data", {}).get("output", {})
                parallel_groups = output.get("parallel_groups", [])
                total_steps = sum(len(g) for g in parallel_groups)
                if total_steps > 1:
                    will_synthesize = True
                # Emit a status for each group
                for i, group in enumerate(parallel_groups):
                    names = [s.split("|")[0] for s in group]
                    friendly_names = [AGENT_SYNONYMS.get(n, n) for n in names]
                    if len(friendly_names) > 1:
                        status_text = f"Running {' + '.join(friendly_names)} in parallel..."
                    else:
                        status_text = f"Activating {friendly_names[0]}..."
                    yield sse({"type": "status", "text": status_text})
            
            # --- Tool Executions ---
            elif kind == "on_tool_start":
                tool_name = event["name"]
                tools_used.append(tool_name)
                
                friendly_tool = TOOL_SYNONYMS.get(tool_name, f"Running {tool_name}")
                status_text = f"{friendly_tool}..."
                
                if status_text != last_status:
                    yield sse({"type": "status", "text": status_text})
                    last_status = status_text
                
            # --- Node/Agent Executions ---
            elif kind == "on_chain_start":
                HIDE_NODES = ("__start__", "__end__", "model", "router", "casual_agent",
                              "planner", "planner_update", "fan_out", "group_router")
                if node_name and node_name not in HIDE_NODES:
                    if node_name not in agents_used:
                        agents_used.append(node_name)
            
            # --- Text Token Streaming ---
            elif kind == "on_chat_model_stream":
                # Do NOT stream internal thoughts/routing JSON from the router/planner nodes
                if node_name in ("router", "planner", "planner_update"):
                    continue
                    
                # If multiple agents are running, mute their individual token streams
                # and ONLY stream the final Synthesizer output
                if will_synthesize and node_name != "synthesizer":
                    continue

                chunk = event["data"]["chunk"]
                if hasattr(chunk, "content") and chunk.content:
                    if isinstance(chunk.content, str):
                        yield sse({"type": "token", "text": chunk.content})
                    elif isinstance(chunk.content, list):
                        for p in chunk.content:
                            if isinstance(p, dict) and "text" in p:
                                yield sse({"type": "token", "text": p["text"]})
                            elif isinstance(p, str):
                                yield sse({"type": "token", "text": p})
            
            # (Optional) Tool end for completion feedback
            elif kind == "on_tool_end":
                tool_name = event["name"]
                friendly_tool = TOOL_SYNONYMS.get(tool_name, tool_name)
                # Convert "Analyzing options chain" to "Finished analyzing options chain"
                status_text = f"Finished {friendly_tool.lower()}..."
                if status_text != last_status:
                    yield sse({"type": "status", "text": status_text})
                    last_status = status_text

        # Emit final trace summary
        seen_tools = set()
        unique_tools = [t for t in tools_used if not (t in seen_tools or seen_tools.add(t))]
        yield sse({"type": "trace", "agents": agents_used, "tools": unique_tools})
        yield sse({"type": "done"})

    except Exception as e:
        print(f"[AEGIS Server Error] {e}")
        yield sse({"type": "error", "text": str(e)})
        yield sse({"type": "done"})


@app.post("/chat")
async def chat_stream(req: ChatRequest):
    """
    POST /chat
    Body: { "messages": [{"role":"user","content":"..."}], "thread_id": "optional-uuid", "uid": "..." }
    Returns: text/event-stream  SSE
    """
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages array is required")

    thread_id = req.thread_id or str(uuid.uuid4())

    return StreamingResponse(
        _stream_graph(req.messages, thread_id, req.uid, req.mode),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# ── Simple non-streaming chat (for testing) ──────────────────────────────────

@app.post("/chat/sync")
async def chat_sync(req: ChatRequest):
    """Returns a single JSON response (non-streaming). Useful for quick tests."""
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages array is required")

    thread_id = req.thread_id or str(uuid.uuid4())
    lc_messages = [
        HumanMessage(content=m.content) if m.role in ("user","human") else AIMessage(content=m.content)
        for m in req.messages
    ]
    config = {"configurable": {"thread_id": thread_id, "uid": req.uid}}

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: market_graph.invoke({"messages": lc_messages}, config=config)
    )

    final_msgs = result.get("messages", [])
    text = ""
    if final_msgs:
        last = final_msgs[-1]
        text = _extract_text(last.content if hasattr(last, "content") else str(last))

    return {
        "response": text,
        "agents": result.get("route_decision", []),
        "thread_id": thread_id,
    }

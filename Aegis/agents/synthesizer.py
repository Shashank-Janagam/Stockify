"""
synthesizer.py
──────────────
Final intelligence layer — weaves all agent outputs into a single polished response.

Correctly works with both:
  - 1-agent responses (no synthesis needed — just re-presents cleanly)
  - N-agent parallel responses (full synthesis)
"""

import os
from dotenv import load_dotenv
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from models.llm_factory import get_llm
from models.state import MarketState

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

llm = get_llm(temperature=0.3)

SYNTHESIZER_SYSTEM_PROMPT = """You are Aegis, the final response layer of an institutional-grade AI financial system.

You have just received research, data, and analysis from multiple specialized sub-agents that ran in parallel or sequentially.

Your job:
1. Synthesize all the data into ONE single, cohesive, beautifully formatted response.
2. Use Markdown: bold headers, tables, and bullet points where appropriate.
3. Speak in unified first-person as "Aegis" — never say "the research agent found" or "the market agent said."
4. If any agent data contains an error message or limitation, either work around it or note it briefly at the end. Do NOT lead with failures.
5. If only one agent ran, present its output cleanly and concisely without saying "synthesizing."
6. This is a simulated paper-trading environment — never add disclaimers about financial advice.
7. If a trade was executed, clearly confirm it (stock, quantity, price, order type). Ensure your summary includes ALL executed stocks and their exact quantities. Do not truncate the list.
8. CRITICAL: If you see one or multiple JSON blocks (e.g. `{"status": "trade_executed"...}`) in any agent's output, you MUST include ALL of them EXACTLY as they are at the very end of your response. Do not miss any.

Answer the user's original question directly and completely."""


async def synthesizer_node(state: MarketState):
    """Synthesizes all agent outputs into a final user-facing response."""
    messages = state.get("messages", [])
    
    # Find the last HumanMessage — that's the user's query for this turn
    user_query = ""
    for msg in reversed(messages):
        if hasattr(msg, "type") and msg.type == "human":
            user_query = msg.content
            break
        if isinstance(msg, HumanMessage):
            user_query = msg.content
            break

    # Collect all AIMessages that were added after the last HumanMessage
    # These are the agent outputs for this turn
    agent_outputs = []
    collecting = False
    for msg in messages:
        if isinstance(msg, HumanMessage) or (hasattr(msg, "type") and msg.type == "human"):
            if msg.content == user_query:
                collecting = True
                agent_outputs = []  # reset on each matching human message
                continue
        if collecting and (isinstance(msg, AIMessage) or (hasattr(msg, "type") and msg.type == "ai")):
            content = msg.content
            if isinstance(content, list):
                content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
            if content and not content.startswith("⚠️"):
                agent_name = getattr(msg, "name", None) or "agent"
                agent_outputs.append((agent_name, content))

    if not agent_outputs:
        # Fallback: no valid agent outputs found
        return {"messages": [AIMessage(content="I wasn't able to retrieve the requested information. Please try again.")]}

    # If only 1 agent ran, it was already streamed to the user. No need to synthesize.
    if len(agent_outputs) == 1:
        return {}
    
    context = "\n\n".join(
        f"## {name.replace('_', ' ').title()} Output\n{content}"
        for name, content in agent_outputs
    )
    synthesis_msgs = [
        SystemMessage(content=SYNTHESIZER_SYSTEM_PROMPT),
        HumanMessage(content=f"User asked: {user_query}\n\n{context}")
    ]

    response = await llm.ainvoke(synthesis_msgs)
    return {"messages": [response]}

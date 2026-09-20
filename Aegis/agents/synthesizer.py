from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from models.state import MarketState

import os
import sys
from dotenv import load_dotenv

# Load env from the Aegis directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

# The synthesizer doesn't need tools, just a good reasoning model
llm = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    temperature=0.3,
    api_key=os.getenv("GEMINI_API_KEY")
)

SYNTHESIZER_SYSTEM_PROMPT = """You are Aegis Synthesizer, the final intelligence layer of the Aegis financial system.
You have just received raw research and technical data from multiple specialized sub-agents.

Your job is to:
1. Seamlessly weave their findings together into a single, cohesive, institutional-grade narrative.
2. Present the final answer to the user beautifully using Markdown (bolding, tables, or bullet points where appropriate).
3. Do NOT mention "the research agent found" or "the market agent said". Present the final response as a unified voice (you are Aegis).

Synthesize the context provided and answer the user's original query."""

def synthesizer_node(state: MarketState):
    """Takes the outputs of the parallel agents and synthesizes them."""
    messages = state.get("messages", [])
    routes = state.get("route_decision", [])
    
    # If no agents ran, just return (shouldn't happen)
    if not routes:
        return {"messages": []}
        
    num_agents = len(routes)
    
    # Extract the original user query and the agent outputs
    # The user query is just before the agent outputs
    user_query_msg = messages[-(num_agents + 1)]
    agent_outputs = messages[-num_agents:]
    
    # Format the context for the synthesizer
    context = "Here is the raw data gathered by the specialized sub-agents:\n\n"
    for idx, msg in enumerate(agent_outputs):
        context += f"--- Data Source {idx + 1} ---\n{msg.content}\n\n"
        
    synthesis_messages = [
        SystemMessage(content=SYNTHESIZER_SYSTEM_PROMPT),
        HumanMessage(content=f"User Query: {user_query_msg.content}\n\n{context}")
    ]
    
    response = llm.invoke(synthesis_messages)
    
    return {"messages": [response]}

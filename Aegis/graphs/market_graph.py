import os
import sys

# Add the parent directory (Aegis) to the path so 'models' and 'agents' can be imported when running directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from models.state import MarketState
from agents.market_agent import market_agent
from agents.research_agent import research_agent
from agents.risk_agent import risk_agent_node
from agents.router import router_node
from agents.synthesizer import synthesizer_node
from langgraph.checkpoint.memory import MemorySaver
from models.state import MarketState

# Initialize the StateGraph with the MarketState schema
workflow = StateGraph(MarketState)

# Add all nodes to the graph
workflow.add_node("router", router_node)
workflow.add_node("market_agent", market_agent)
workflow.add_node("research_agent", research_agent)
workflow.add_node("risk_agent", risk_agent_node)
workflow.add_node("synthesizer", synthesizer_node)

# Entry point is now the router
workflow.set_entry_point("router")

# Fan-out routing logic
def route_from_router(state: MarketState):
    routes = state.get("route_decision", [])
    if not routes:
        return ["market_agent"]
    return [f"{r}_agent" for r in routes]

workflow.add_conditional_edges(
    "router",
    route_from_router,
    ["market_agent", "research_agent", "risk_agent"]
)

# Fan-in routing logic (skip synthesizer if only one agent ran)
def route_from_agent(state: MarketState):
    routes = state.get("route_decision", [])
    if len(routes) > 1:
        return "synthesizer"
    return END

workflow.add_conditional_edges("market_agent", route_from_agent, {"synthesizer": "synthesizer", END: END})
workflow.add_conditional_edges("research_agent", route_from_agent, {"synthesizer": "synthesizer", END: END})
workflow.add_conditional_edges("risk_agent", route_from_agent, {"synthesizer": "synthesizer", END: END})

# Synthesizer unconditionally ends
workflow.add_edge("synthesizer", END)

# Compile the graph into an executable format with memory checkpointer
memory = MemorySaver()
market_graph = workflow.compile(checkpointer=memory)

if __name__ == "__main__":
    import sys
    from langchain_core.messages import HumanMessage
    
    # Reconfigure stdout to handle unicode characters like ₹
    sys.stdout.reconfigure(encoding='utf-8')
    
    print("Welcome to the Aegis Market Agent CLI! Type 'exit' or 'quit' to stop.")
    
    # Configuration for conversation state
    config = {"configurable": {"thread_id": "1"}}
    
    while True:
        try:
            # Get user input
            user_input = input("\nYou: ")
            
            # Check for exit commands
            if user_input.strip().lower() in ["exit", "quit"]:
                print("Goodbye!")
                break
                
            if not user_input.strip():
                continue
            
            # Run the graph by passing only the new user message
            # The checkpointer maintains the full conversation state
            result = market_graph.invoke(
                {"messages": [HumanMessage(content=user_input)]}, 
                config=config
            )
            
            # Print the agent's response
            if "messages" in result and len(result["messages"]) > 0:
                response_msg = result["messages"][-1]
                
                print("\n--- AEGIS ---")
                if hasattr(response_msg, "content"):
                    if isinstance(response_msg.content, list):
                        # Parse Gemini multimodal list response
                        text_parts = []
                        for part in response_msg.content:
                            if isinstance(part, dict) and "text" in part:
                                text_parts.append(part["text"])
                            elif isinstance(part, str):
                                text_parts.append(part)
                        print("".join(text_parts))
                    else:
                        print(response_msg.content)
                elif isinstance(response_msg, dict) and "messages" in response_msg:
                    final_msg = response_msg["messages"][-1]
                    print(final_msg.content if hasattr(final_msg, "content") else final_msg)
                else:
                    print(response_msg)
                print("-------------\n")
            else:
                print("\n[No response generated.]\n")
                
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
            print(f"\n[Error]: {e}")

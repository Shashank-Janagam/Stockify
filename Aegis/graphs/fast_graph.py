import os
import sys

# Add the parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from models.state import MarketState
from agents.fast_agent import fast_agent_node

# Initialize the StateGraph
workflow = StateGraph(MarketState)

# Add single monolithic node
workflow.add_node("fast_agent", fast_agent_node)

# Set entry point
workflow.set_entry_point("fast_agent")
workflow.add_edge("fast_agent", END)

# Compile graph
memory = MemorySaver()
fast_graph = workflow.compile(checkpointer=memory)

if __name__ == "__main__":
    import sys
    from langchain_core.messages import HumanMessage
    
    sys.stdout.reconfigure(encoding='utf-8')
    print("Welcome to Aegis Fast Mode!")
    
    config = {"configurable": {"thread_id": "1", "uid": "cli-user"}}
    
    while True:
        try:
            user_input = input("\nYou: ")
            if user_input.strip().lower() in ["exit", "quit"]:
                break
                
            result = fast_graph.invoke(
                {"messages": [HumanMessage(content=user_input)]}, 
                config=config
            )
            
            if "messages" in result:
                print(f"\n--- AEGIS ---\n{result['messages'][-1].content}\n-------------")
                
        except Exception as e:
            print(f"\n[Error]: {e}")

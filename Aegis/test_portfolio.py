import os
import sys

# Ensure Aegis is in PYTHONPATH
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from langchain_core.messages import HumanMessage
from agents.portfolioAgent import run_portfolio
from models.agent_state import AgentState

def main():
    print("Preparing Agent State for test...")
    
    # Mocking a basic state to pass into the node
    state: AgentState = {
        "user_id": 3,
        "messages": [HumanMessage(content="What is my balance")],
        "intent": {"goal": "Check the user's current portfolio status and summarize it"},
        "task": {"id": "test_task_1", "goal": "Check the user's current portfolio status and summarize it"}
    }
    
    print("Running portfolio_node...")
    try:
        result = run_portfolio(state)
        # print("\n--- Result ---")
        import json
        print(json.dumps(result, indent=2, default=str))
    except Exception as e:
        print(f"Error during execution: {e}")

if __name__ == "__main__":
    main()

from langgraph.constants import Send
from models.agent_state import AgentState
from parsers.planner import generate_plan
from models.schemas import Intent

def planner(state: AgentState):
    intent_obj = state.get("intent", {})
    plan_obj = generate_plan(Intent(**intent_obj))
    return {"plan": [t.model_dump() for t in plan_obj.tasks], "done_when": plan_obj.done_when}

def route_after_planner(state: AgentState):
    plan = state.get("plan", [])
    if not plan:
        return "evaluate"
    sends = []
    for task in plan:
        agent = task["agent"]
        sends.append(Send(agent, {
            "user_id": state.get("user_id"),
            "messages": state.get("messages", []), 
            "intent": state.get("intent"), 
            "task": task
        }))
    return sends

def evaluate(state: AgentState):
    steps = state.get("steps", 0) + 1
    return {"steps": steps}

def route_after_eval(state: AgentState):
    # For now, immediately respond after agents finish once
    return "respond"

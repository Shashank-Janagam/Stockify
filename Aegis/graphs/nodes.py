from langchain_core.messages import AIMessage, HumanMessage
from models.agent_state import AgentState, new_turn_reset
from parsers.intentParser import parse_intent as do_parse_intent
from models.llm_factory import get_llm

def parse_intent(state: AgentState):
    intent_obj = do_parse_intent(state.get("messages", []))
    updates = new_turn_reset()
    updates["intent"] = intent_obj.model_dump()
    return updates

def clarify(state: AgentState):
    question = state.get("intent", {}).get("clarification_question", "Could you please clarify your request?")
    return {"messages": [AIMessage(content=question)]}

def route_intent(state: AgentState):
    intent = state.get("intent", {})
    pending = state.get("pending_action")
    
    # 1. If we are actively waiting for a confirmation on a fast-path proposal
    if pending:
        conf = intent.get("confirmation")
        if conf == "yes": return "execute"
        if conf == "no": return "discard"

    # 2. If it's just casual conversation, respond directly
    if intent.get("agent") == "general":
        return "respond"
        
    # 3. For ALL other requests (ambiguity, execution, research, strategy), rely entirely on the smart Planner
    # The planner will read the conversation history and naturally figure out what to do.
    return "planner"

def respond(state: AgentState):
    # Respond handles final output or general chat
    llm = get_llm(temperature=0.1)
    
    # If there are results from tasks, inject them into the response context
    results = state.get("results", {})
    if results:
        context = "Here are the results from the specialist agents:\n"
        for task_id, res in results.items():
            if isinstance(res, dict) and res.get("data"):
                context += f"- {res['agent']}: {res['data']}\n"
        
        displayName = state.get("displayName", "User")
        messages = state.get("messages", []) + [HumanMessage(content=context + f"\nSynthesize a final answer for {displayName} based on the above results. ALWAYS format the data using beautiful Markdown tables. Use their name when appropriate.")]
        msg = llm.invoke(messages)
    else:
        displayName = state.get("displayName", "User")
        from langchain_core.messages import SystemMessage
        aegis_persona = f"""You are Aegis, a highly advanced AI financial assistant and trading copilot built into the Stockify/PaperBull platform. 
You are speaking with {displayName}.

## About Your Creator and Platform
- You were created for PaperBull (and the Stockify platform) by Shashank.
- The intent of PaperBull is to provide a powerful algorithmic paper-trading and portfolio management environment. It allows users to learn, backtest trading strategies, and simulate trading with real-time Indian stock market data without financial risk.

## Your Capabilities
- You specialize in Indian stock markets (NSE/BSE), algorithmic trading, portfolio analysis, and financial research.
- You can execute paper trades (buy/sell), view order history, and manage portfolios.
- You can fetch real-time stock quotes, technical indicators, financial snapshots, and market news.
- You can analyze risk profiles, review behavioral trading patterns, and backtest algorithmic strategies.

## Rules
- DO NOT introduce yourself as a generic large language model. DO NOT claim you can write poems, essays, or translate languages. 
- Your sole purpose is to help {displayName} dominate the financial markets with intelligent insights and flawless execution. Keep your tone professional, sharp, and concise."""
        messages = [SystemMessage(content=aegis_persona)] + state.get("messages", [])
        msg = llm.invoke(messages)
        
    return {"messages": [msg]}

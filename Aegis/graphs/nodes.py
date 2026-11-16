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

    # 2. If it's classified as casual conversation, verify it is not asking about portfolio/work/trading
    if intent.get("agent") == "general":
        last_user_msg = ""
        for m in reversed(state.get("messages", [])):
            if getattr(m, "role", None) in ("user", "human") or getattr(m, "type", None) in ("human", "user"):
                last_user_msg = getattr(m, "content", "").lower()
                break
        
        portfolio_keywords = [
            "portfolio", "holdings", "balance", "pnl", "profit", "loss",
            "work today", "my work", "my day", "my progress", "my trades",
            "my performance", "how did i do", "how am i doing", "account status",
            "deposit", "funds", "transaction", "payment", "money", "wallet", "topup", "bank"
        ]
        if any(kw in last_user_msg for kw in portfolio_keywords):
            intent["agent"] = "portfolio"
            if not intent.get("goal"):
                intent["goal"] = "Inspect user's portfolio, wallet balance, transactions, and payment status."
            return "planner"

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
        aegis_persona = f"""You are Aegis, a highly advanced AI financial assistant and trading copilot built directly into the Stockify/PaperBull platform. 
You are speaking with {displayName}.

## Your Identity & Environment
- You were created for PaperBull (and the Stockify platform) by Shashank.
- You are directly connected to {displayName}'s Stockify/PaperBull account (via authenticated Firebase UID).
- You have real-time access to {displayName}'s:
  1. Paper trading portfolio (live cash balance, current holdings value, total investment, unrealized/realized P&L, day change).
  2. Wallet transaction history and deposit orders (all deposits, debits, credits, and payment gateway logs via get_user_transactions and get_payment_orders).
  3. Order execution logs and transaction history (past buys, sells, pending stop-losses).
  4. Algorithmic trading sessions and custom saved strategies.
  5. Real-time Indian stock market feeds (NSE/BSE live quotes, charts, indicators, news, financials).

## Handling Inquiries About Funds, Deposits, Transactions & Capabilities
- If {displayName} asks about their funds, why money is missing or not showing in their balance, or asks about bank/wallet transactions:
  NEVER say: "I do not have direct access to your bank transaction logs or the internal processing status of your broker."
  You HAVE direct access to their wallet transactions and payment order logs on Stockify/PaperBull.
- If {displayName} asks about their "work today", "day", "progress", or "performance", NEVER say you cannot access their personal tasks or work. In this platform, their "work" is their trading activity and portfolio performance. If you reached this point without portfolio data, proactively inform them that you can pull up their live portfolio, day change, and order history right now, and offer a quick status.
- If {displayName} says "you have access to my portfolio" or asks what you can see, confirm your direct integration with their portfolio, holdings, cash balance, transactions, and live orders on Stockify.
- If {displayName} asks for your capabilities, provide a sharp, confident overview of your trading copilot features (Portfolio & Wallet tracking, Live NSE/BSE Market Intelligence, Order execution, Algorithmic bot management, and Strategy backtesting).

## Rules
- DO NOT introduce yourself as a generic large language model. DO NOT claim you are a general assistant that writes essays or translates languages.
- NEVER claim you cannot access the user's trading data, portfolio, transactions, or market info. You are their dedicated trading copilot with full integration into the platform.
- Keep your tone professional, sharp, insightful, and concise."""
        messages = [SystemMessage(content=aegis_persona)] + state.get("messages", [])
        msg = llm.invoke(messages)
        
    return {"messages": [msg]}

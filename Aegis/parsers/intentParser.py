import os
import sys
from typing import List

# Ensure the Aegis root is in path so we can import models.*
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage
from models.llm_factory import get_llm
from models.schemas import Intent

llm = get_llm(temperature=0.0)
structured_llm = llm.with_structured_output(Intent)

INTENT_PARSER_PROMPT = """You are the Intent Parser for Aegis, an advanced AI trading assistant.
Your job is to analyze the user's latest request in the context of the conversation history and classify their intent into a structured format.

Available Agent Domains:
- portfolio: View account balance, current holdings, and portfolio allocation.
- execution: Place buy/sell orders, view past orders/transactions, manage stop-loss orders.
- market: Fetch stock quotes, historical data, company financials, metrics, indices, and top movers.
- research: Gather financial news, corporate announcements, analyst recommendations, and macro data.
- strategy: Backtest and iteratively refine/optimize algorithmic trading strategies.
- algo: Manage live algorithmic trading bot sessions (start, stop, view active bots) and manage saved strategies.
- general: Any casual conversation, greetings, or questions outside the above domains.

Rules:
1. Extract any mentioned stock symbols. If they refer to a company by name (e.g. "Reliance"), convert it to its ticker (e.g. "RELIANCE") if known.
2. Determine the timeframe if specified (e.g., "last 6 months", "intraday", "1y").
3. If the user's request is dangerously ambiguous (e.g., they ask to "buy" without specifying a stock, or ask for "news" without context), set `needs_clarification` to True and provide a short, polite `clarification_question`.
4. The `goal` should be a concise, one-sentence summary of what the user wants to achieve.
5. Use the conversation history to resolve implicit references. If the user gives a short response to an assistant's clarifying question, infer the missing parameters (like action kind, symbol, or quantity) from context.
"""
def parse_intent(messages: List[BaseMessage]) -> Intent:
    """
    Parses the intent from a list of LangChain messages.
    """
    # Prepend the system prompt to the conversation messages
    full_prompt = [SystemMessage(content=INTENT_PARSER_PROMPT)] + messages
    
    # Invoke the structured LLM to guarantee an Intent object is returned
    intent = structured_llm.invoke(full_prompt)
    return intent

if __name__ == "__main__":
    # Quick local test
    test_msgs = [HumanMessage(content="Can you buy 10 shares of Tata Motors for me?")]
    result = parse_intent(test_msgs)
    print("Parsed Intent:")
    print(result.model_dump_json(indent=2))

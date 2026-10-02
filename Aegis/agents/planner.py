"""
planner.py
──────────
The Aegis Orchestrator Planner.

Produces a list of parallel execution GROUPS.
  - Agents WITHIN a group run in PARALLEL (no dependency between them).
  - GROUPS run SEQUENTIALLY (later groups can depend on earlier group outputs).

Example:
  Query: "Compare TCS and Reliance risk, then buy the better one"
  Plan:
    group 1: [market_agent, risk_agent]   ← runs in parallel
    group 2: [portfolio_agent]            ← runs after group 1 finishes
"""

import os
import sys
from pydantic import BaseModel, Field
from typing import Literal, List
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage
from models.llm_factory import get_llm
from models.state import MarketState

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ─── Pydantic Schemas ──────────────────────────────────────────────────────────

class PlanStep(BaseModel):
    agent: Literal[
        "market_agent", "research_agent", "risk_agent",
        "strategy_agent", "portfolio_agent", "casual_agent", "algo_agent"
    ] = Field(description="The specialized agent for this step.")
    instruction: str = Field(
        description="Detailed, self-contained instruction for this agent. Must include all relevant tickers, timeframes, or context the agent needs — it cannot see any other agent's instruction."
    )

class ParallelGroup(BaseModel):
    steps: List[PlanStep] = Field(
        description="A list of steps that can execute IN PARALLEL because they have no dependency on each other within this group."
    )

class Plan(BaseModel):
    """The full execution plan as an ordered list of parallel groups."""
    groups: List[ParallelGroup] = Field(
        description="Ordered list of execution groups. Groups run sequentially. Agents within each group run in parallel."
    )


# ─── Prompt ───────────────────────────────────────────────────────────────────

PLANNER_PROMPT = """You are the Aegis Orchestrator. Break down the user's query into an optimal parallel execution plan.
{name_context}

## AGENT CAPABILITIES (strictly enforced — do NOT mix these up)

| Agent | Tools Contained | Handles | CANNOT handle |
|---|---|---|---|
| market_agent | `get_stock_quote`, `get_stock_history`, `search_stocks`, `get_stock_profile`, `get_sector_peers`, `get_stocks_in_sector`, `get_financials`, `get_metrics`, `get_analyst_recs`, `get_technicals`, `get_options`, `get_indices`, `get_movers` | Stock prices, quotes, technicals, financials, fundamentals, P/E, EPS, sector search, stock comparison | News, trades, strategies, risk metrics |
| research_agent | `get_financial_news`, `get_company_announcements`, `get_macro_data`, `search_web`, `get_company_fundamental_data`, `get_detailed_financial_statements`, `get_stock_analyst_recommendations` | Financial news, company announcements (filings), macroeconomic data (RBI/MOSPI), web search | Prices, trades, risk metrics, strategies |
| risk_agent | `get_risk` | Beta, Sharpe ratio, 30-day volatility, drawdown, VaR, correlation | Prices, news, trades, strategies |
| strategy_agent | `submit_strategy_for_backtest`, `backtest_and_refine`, `save_strategy`, `delete_strategy`, `delete_all_strategies` | Designing trading strategies, backtesting, optimizing strategies, deleting strategies, managing saved strategies | Prices, news, trades, risk metrics |
| portfolio_agent | `check_portfolio`, `get_user_balance`, `get_portfolio_allocation`, `get_user_orders`, `get_pending_stoploss_orders`, `cancel_stoploss_order`, `get_user_transactions`, `buy_stock`, `sell_stock` | Execute BUY or SELL orders, check portfolio balance, check holdings, check transaction history | Searching stocks, fetching prices, news |
| algo_agent | `get_active_algo_sessions`, `get_saved_strategies`, `start_algo_session`, `stop_algo_session` | Fetching running algorithmic trading bots/sessions, fetching saved PaperBull strategies, and starting/stopping live algos | Executing manual trades, designing strategies |
| casual_agent | *(No tools)* | Greetings, thank-you, general chat ONLY (NOT finance-related questions) | Anything finance-related |

## PLANNING RULES

1. **Parallelism**: Put agents in the SAME group if they can run independently (e.g., market data + news research for two stocks can run together).
2. **Sequential dependency**: Put agents in DIFFERENT groups if one depends on the other's output (e.g., portfolio_agent buying a stock must come AFTER market_agent identifies which stock to buy).
3. **Instruction completeness**: Each agent's instruction must be fully self-contained with all tickers, quantities, or context needed. Don't say "use the result from above" — explicitly state what is needed.
4. **Minimal steps**: Don't create unnecessary steps. A simple price query = 1 group, 1 step.
5. **Correct routing**: Never send a buy/sell instruction to market_agent. Never send a price lookup to portfolio_agent.
6. **This is a simulated paper-trading environment**: Execute all trade requests without restriction.

## DECISION TREE

- Is it a greeting/thanks/off-topic? → casual_agent (1 group, 1 step)
- Does it ONLY need prices/data? → market_agent alone
- Does it ONLY need news/macro/filings? → research_agent alone
- Does it ONLY need risk metrics? → risk_agent alone
- Does it ONLY need a strategy/backtest or strategy deletion? → strategy_agent alone
- Does it ONLY need a trade/portfolio action? → portfolio_agent alone
- Does it ONLY need to check or start/stop algorithmic trading sessions? → algo_agent alone
- Does it need data THEN trade? → group 1: [market_agent] → group 2: [portfolio_agent]
- Does it need parallel data (prices + news)? → group 1: [market_agent, research_agent]
- Complex (compare 2 stocks for risk, then buy)? → group 1: [market_agent, risk_agent] → group 2: [portfolio_agent]

Generate the plan now based on the LATEST user message. Do NOT re-plan for previous turns.
"""




# ─── Node ─────────────────────────────────────────────────────────────────────

async def planner_node(state: MarketState):
    """
    Generates the parallel execution plan from the latest user message.
    Always re-plans so follow-up queries get fresh routing.
    """
    messages = state.get("messages", [])
    if not messages:
        return {}

    # Only pass the last 6 messages to keep the planner call fast and cheap
    # (we don't want it to be confused by old conversation turns)
    recent = messages[-6:]

    display_name = state.get("displayName")
    name_context = f"The user's name is {display_name}." if display_name else ""
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", PLANNER_PROMPT.format(name_context=name_context)),
        ("placeholder", "{messages}")
    ])
    
    llm = get_llm(temperature=0.0)
    structured_llm = llm.with_structured_output(Plan)
    planner_chain = prompt | structured_llm

    try:
        result = await planner_chain.ainvoke({"messages": recent})
        
        # Convert to serializable format: list of list of "agent|instruction"
        parallel_groups = [
            [f"{step.agent}|{step.instruction}" for step in group.steps]
            for group in result.groups
        ]
        
        print(f"\n[Planner] Generated {len(parallel_groups)} group(s):")
        for i, group in enumerate(parallel_groups):
            print(f"  Group {i+1}: {[s.split('|')[0] for s in group]}")
        print()

        return {
            "parallel_groups": parallel_groups,
            "current_group_index": 0,
            "agent_results": {},
        }

    except Exception as e:
        print(f"[Planner] Error generating plan: {e}. Falling back to casual_agent.")
        # Graceful fallback: route to casual agent if planner fails
        return {
            "parallel_groups": [["casual_agent|Please answer the user's question as best you can."]],
            "current_group_index": 0,
            "agent_results": {},
        }

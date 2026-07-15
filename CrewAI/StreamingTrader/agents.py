from crewai import Agent, LLM
from dotenv import load_dotenv
import os

load_dotenv()

# Setup LLM matching the StockAnalysis configuration
llm = LLM(
    model="groq/meta-llama/llama-4-scout-17b-16e-instruct",
    temperature=0.2,
)

strategy_supervisor_agent = Agent(
    role="Real-Time Portfolio Strategy Supervisor",
    goal="Analyze streaming market data, recent trade performance, and overall PnL to dynamically adjust buying/selling thresholds and stop-loss limits.",
    backstory="You are a professional quantitative portfolio manager. Your job is to set trading strategy parameters for a high-frequency trading bot. You output optimized thresholds to manage risk and maximize intraday profits. You do not trade yourself; you supervise and adjust the parameters.",
    tools=[],
    llm=llm,
    allow_delegation=False,
    verbose=True
)

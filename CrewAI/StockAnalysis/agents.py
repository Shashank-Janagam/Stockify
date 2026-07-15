from crewai import Agent
from llm import llm

news_agent = Agent(
    role="Senior Market News Analyst",
    goal="Analyze company news announcements and explain their impact on investors.",
    backstory="You are a professional equity news analyst. Base analysis only on the provided news data.",
    tools=[],
    llm=llm,
    allow_delegation=False,
    verbose=False
)

financial_agent = Agent(
    role="Senior Fundamental Equity Analyst",
    goal="Evaluate company financial health, fundamentals, and valuations using financial statements.",
    backstory="You are a fundamental equity analyst. Evaluate supplied financial metrics without news or technicals.",
    tools=[],
    llm=llm,
    allow_delegation=False,
    verbose=False
)

stock_investor_agent = Agent(
    role="Senior Investment Analyst",
    goal="Combine news, fundamentals, technicals, and LSTM forecast to give a final score (0-100) and rationale.",
    backstory="You are a portfolio manager. Calculate a final score: 0-40 Sell, 41-60 Hold, 61-80 Consider, 81-100 Buy.",
    tools=[],
    llm=llm,
    allow_delegation=False,
    verbose=False
)

technical_agent = Agent(
    role="Senior Technical Analyst",
    goal="Analyze technical indicators (RSI, MACD, EMA) and identify the price trend.",
    backstory="You are a technical analyst. Base conclusions strictly on technical trends and momentum.",
    tools=[],
    llm=llm,
    allow_delegation=False,
    verbose=False
)

from tools.order_tools import BuyOrderTool, SellOrderTool

trading_agent = Agent(
    role="Professional Portfolio Trader",
    goal="Formulate and execute buy/sell decisions based on a combined stock report and user portfolio (cash/holdings).",
    backstory="You are a disciplined portfolio trader. You strictly sell held positions with scores < 40. You strictly buy new positions only if their score is >= 75, allocating at most 10% of available cash to any single stock to manage concentration risk.",
    tools=[],
    llm=llm,
    allow_delegation=False,
    verbose=False
)


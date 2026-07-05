from crewai import Agent
from llm import llm
from tools.news import StockNewsTool

news_agent = Agent(
    role="Senior Market News Analyst",
    goal="Analyze company news announcements and explain their impact on investors.",
    backstory="You are a professional equity news analyst. Base analysis only on the provided news data.",
    tools=[StockNewsTool()],
    llm=llm,
    allow_delegation=False,
    verbose=False
)

from tools.financial_tool import FinancialTool

financial_agent = Agent(
    role="Senior Fundamental Equity Analyst",
    goal="Evaluate company financial health, fundamentals, and valuations using financial statements.",
    backstory="You are a fundamental equity analyst. Evaluate supplied financial metrics without news or technicals.",
    tools=[FinancialTool()],
    llm=llm,
    allow_delegation=False,
    verbose=False
)

from tools.tech_tool import TechTool

stock_investor_agent = Agent(
    role="Senior Investment Analyst",
    goal="Combine news, fundamentals, technicals, and LSTM forecast to give a final score (0-100) and rationale.",
    backstory="You are a portfolio manager. Calculate a final score: 0-40 Sell, 41-60 Hold, 61-80 Consider, 81-100 Buy.",
    tools=[],
    llm=llm,
    allow_delegation=False,
    verbose=False
)

from tools.technical_tool import TechnicalTool

technical_agent = Agent(
    role="Senior Technical Analyst",
    goal="Analyze technical indicators (RSI, MACD, EMA) and identify the price trend.",
    backstory="You are a technical analyst. Base conclusions strictly on technical trends and momentum.",
    tools=[TechnicalTool()],
    llm=llm,
    allow_delegation=False,
    verbose=False
)

from tools.order_tools import BuyOrderTool, SellOrderTool

trading_agent = Agent(
    role="Professional Portfolio Trader",
    goal="Formulate and execute buy/sell decisions based on a combined stock report and user portfolio (cash/holdings).",
    backstory="You are a trader. Sell positions with scores < 50, and buy positions with scores >= 80 within cash limits. Use your tools to execute these transactions.",
    tools=[BuyOrderTool(), SellOrderTool()],
    llm=llm,
    allow_delegation=False,
    verbose=True
)

from crewai import Task
from pydantic import BaseModel, Field
from typing import List, Union
from agents import news_agent, financial_agent, technical_agent, stock_investor_agent, trading_agent

# Define Pydantic models for structured JSON output

class NewsAnalysisOutput(BaseModel):
    symbol: str = Field(description="The stock ticker symbol")
    sentiment: str = Field(description="Market sentiment: bullish, bearish, or neutral")
    sentiment_score: float = Field(description="Numeric score from -1.0 (bearish) to 1.0 (bullish). Must be a float number (e.g. 0.5), NOT a string.")
    summary: str = Field(description="Brief summary of the announcements")
    key_points: List[str] = Field(description="List of key highlights/important news points")
    short_term_impact: str = Field(description="Explanation of the short-term impact on the stock price")
    long_term_impact: str = Field(description="Explanation of the long-term impact on the stock price")

class FinancialAnalysisOutput(BaseModel):
    symbol: str = Field(description="The stock ticker symbol")
    company_name: str = Field(description="Full name of the company")
    overall_financial_score: Union[int, str] = Field(description="Overall financial strength score out of 100. Must be a raw integer number (e.g., 85), NOT a string.")
    strengths: List[str] = Field(description="Key financial strengths of the company")
    weaknesses: List[str] = Field(description="Key financial weaknesses of the company")
    overview_score: Union[int, str] = Field(description="Company overview score out of 10. Must be a raw integer number (e.g., 8), NOT a string.")
    valuation_score: Union[int, str] = Field(description="Valuation score out of 10. Must be a raw integer number (e.g., 7), NOT a string.")
    growth_score: Union[int, str] = Field(description="Growth score out of 10. Must be a raw integer number (e.g., 9), NOT a string.")
    profitability_score: Union[int, str] = Field(description="Profitability score out of 10. Must be a raw integer number (e.g., 9), NOT a string.")
    debt_score: Union[int, str] = Field(description="Debt/leverage score out of 10. Must be a raw integer number (e.g., 7), NOT a string.")
    liquidity_score: Union[int, str] = Field(description="Liquidity score out of 10. Must be a raw integer number (e.g., 8), NOT a string.")
    cash_flow_score: Union[int, str] = Field(description="Cash flow score out of 10. Must be a raw integer number (e.g., 8), NOT a string.")
    dividend_score: Union[int, str] = Field(description="Dividend score out of 10. Must be a raw integer number (e.g., 6), NOT a string.")
    risk_score: Union[int, str] = Field(description="Financial risk score out of 10. Must be a raw integer number (e.g., 6), NOT a string.")

class TechnicalAnalysisOutput(BaseModel):
    symbol: str = Field(description="The stock ticker symbol")
    overall_technical_score: Union[int, str] = Field(description="Overall technical analysis score out of 100. Must be a raw integer number (e.g., 75), NOT a string.")
    trend: str = Field(description="The primary trend: uptrend, downtrend, or sideways")
    momentum: str = Field(description="Momentum assessment: e.g., bullish, bearish, neutral")
    rsi_status: str = Field(description="RSI indicator interpretation")
    macd_status: str = Field(description="MACD indicator interpretation")
    support_resistance: str = Field(description="Approximate support and resistance levels")
    short_term_outlook: str = Field(description="Short-term outlook")
    medium_term_outlook: str = Field(description="Medium-term outlook")
    strengths: List[str] = Field(description="Key technical strengths")
    weaknesses: List[str] = Field(description="Key technical weaknesses")

class FinalInvestmentOutput(BaseModel):
    symbol: str = Field(description="The stock ticker symbol")
    final_score: Union[int, str] = Field(description="Final overall stock score (0 to 100). Must be a raw integer number (e.g., 80), NOT a string.")
    recommendation: str = Field(description="Strong Buy, Buy, Hold, Sell, or Strong Sell")
    conviction_level: str = Field(description="Low, Medium, High, or Very High")
    risk_assessment: str = Field(description="Summary of primary risks associated with the stock")
    investment_rationale: str = Field(description="Detailed rationale combining news, fundamentals, and technicals")


# Define Tasks with output_json parameter

news_task = Task(
    description="""
    Analyze the latest news for {symbol}.

    Explain:
    - What happened?
    - Why is it important?
    - Bullish or bearish?
    - Short-term impact
    - Long-term impact

    Use only the fetched announcements.
    """,
    expected_output="A structured JSON news analysis report.",
    agent=news_agent,
    async_execution=True,
    output_json=NewsAnalysisOutput
)

financial_task = Task(
    description="""
    Analyze the company ticker {symbol}.

    Using the Financial Tool, perform a complete fundamental analysis.
    Evaluate:
    1. Company Overview
    2. Valuation
    3. Revenue Growth
    4. Earnings Growth
    5. Profitability
    6. Debt
    7. Liquidity
    8. Cash Flow
    9. Shareholder Returns
    10. Financial Risks
    11. Overall Financial Strength

    Give every section a score out of 10.
    Finally provide an Overall Score /100.

    Do NOT give Buy/Sell recommendations.
    Do NOT analyze news.
    Do NOT analyze charts.
    """,
    expected_output="A structured JSON fundamental financial report.",
    agent=financial_agent,
    async_execution=True,
    output_json=FinancialAnalysisOutput
)

technical_task = Task(
    description="""
    Analyze the technical condition of stock {symbol}.

    Evaluate:
    1. Trend
    2. Momentum
    3. RSI
    4. MACD
    5. EMA Crossovers
    6. Bollinger Bands
    7. Volume
    8. Support & Resistance (approximate based on price trend)
    9. Short-term outlook
    10. Medium-term outlook

    Give each section a score out of 10.
    Return an Overall Technical Score /100.

    Do NOT analyze company news.
    Do NOT analyze financials.
    Only analyze supplied indicators.
    """,
    expected_output="A structured JSON technical analysis report.",
    agent=technical_agent,
    async_execution=True,
    output_json=TechnicalAnalysisOutput
)

stock_investor_task = Task(
    description="""
    Analyze the stock {symbol}.

    Here is the 5-day LSTM machine learning price forecast for {symbol}:
    {lstm_forecast}

    Here is the latest company news:
    {news_data}

    Here is the fundamental financial data:
    {financial_data}

    Here is the technical indicator data:
    {technical_data}

    Analyze this forecast along with the news, financial fundamentals, and technicals provided above.

    Provide:
    1. Final Score (/100)
    2. Recommendation
       - Strong Buy
       - Buy
       - Hold
       - Sell
       - Strong Sell
    3. Conviction Level
       - Low
       - Medium
       - High
       - Very High
    4. Risk Assessment
    5. Investment Rationale (must mention the LSTM predicted price direction and confidence)

    Scoring guidance:
    - If LSTM predicts bullish direction with >60% confidence, add 5-10 points to the score
    - If LSTM predicts bearish direction, subtract 5-10 points from the score
    - Mention the predicted 5-day price change percentage in your rationale
    """,
    expected_output="A structured JSON final investment summary.",
    agent=stock_investor_agent,
    output_json=FinalInvestmentOutput
)


def get_tasks():
    n_task = Task(
        description="""
        Analyze the latest news for {symbol}.

        Explain:
        - What happened?
        - Why is it important?
        - Bullish or bearish?
        - Short-term impact
        - Long-term impact

        Use only the fetched announcements.
        """,
        expected_output="A structured JSON news analysis report.",
        agent=news_agent,
        async_execution=True,
        output_json=NewsAnalysisOutput
    )

    f_task = Task(
        description="""
        Analyze the company ticker {symbol}.

        Using the Financial Tool, perform a complete fundamental analysis.
        Evaluate:
        1. Company Overview
        2. Valuation
        3. Revenue Growth
        4. Earnings Growth
        5. Profitability
        6. Debt
        7. Liquidity
        8. Cash Flow
        9. Shareholder Returns
        10. Financial Risks
        11. Overall Financial Strength

        Give every section a score out of 10.
        Finally provide an Overall Score /100.

        CRITICAL: All scores must be output as pure numbers/integers (e.g., 85 or 8), NOT as strings (do NOT wrap numbers in quotes).
        
        Do NOT give Buy/Sell recommendations.
        Do NOT analyze news.
        Do NOT analyze charts.
        """,
        expected_output="A structured JSON fundamental financial report.",
        agent=financial_agent,
        async_execution=True,
        output_json=FinancialAnalysisOutput
    )

    t_task = Task(
        description="""
        Analyze the technical condition of stock {symbol}.

        Evaluate and describe:
        - Trend (uptrend, downtrend, or sideways)
        - Momentum (bullish, bearish, or neutral)
        - RSI Status (e.g., overbought, oversold, or neutral)
        - MACD Status (e.g., bullish crossover, bearish crossover, or neutral)
        - Support & Resistance levels
        - Short-term outlook
        - Medium-term outlook
        - Key technical strengths and weaknesses

        Provide an overall technical score out of 100 based on your findings.

        CRITICAL: The overall technical score must be output as a pure number/integer (e.g., 75), NOT as a string (do NOT wrap the number in quotes).

        Do NOT analyze company news.
        Do NOT analyze financials.
        Only analyze supplied indicators.
        """,
        expected_output="A structured JSON technical analysis report.",
        agent=technical_agent,
        async_execution=True,
        output_json=TechnicalAnalysisOutput
    )

    s_task = Task(
        description="""
        Analyze the stock {symbol}.

        Here is the 5-day LSTM machine learning price forecast for {symbol}:
        {lstm_forecast}

        Here is the latest company news:
        {news_data}

        Here is the fundamental financial data:
        {financial_data}

        Here is the technical indicator data:
        {technical_data}

        Analyze this forecast along with the news, financial fundamentals, and technicals provided above.

        Provide:
        1. Final Score (/100)
        2. Recommendation
           - Strong Buy
           - Buy
           - Hold
           - Sell
           - Strong Sell
        3. Conviction Level
           - Low
           - Medium
           - High
           - Very High
        4. Risk Assessment
        5. Investment Rationale (must mention the LSTM predicted price direction and confidence)

        Scoring guidance:
        - If LSTM predicts bullish direction with >60% confidence, add 5-10 points to the score
        - If LSTM predicts bearish direction, subtract 5-10 points from the score
        - Mention the predicted 5-day price change percentage in your rationale

        CRITICAL: The final score must be output as a pure number/integer (e.g., 80), NOT as a string (do NOT wrap it in quotes).
        """,
        expected_output="A structured JSON final investment summary.",
        agent=stock_investor_agent,
        output_json=FinalInvestmentOutput
    )

    return n_task, f_task, t_task, s_task


class PortfolioDecision(BaseModel):
    symbol: str = Field(description="The stock ticker symbol (e.g. KOTAKBANK, RELIANCE, TCS)")
    action: str = Field(description="The action to perform. Must be either 'BUY' or 'SELL'.")
    quantity: Union[int, str] = Field(description="The quantity of shares to buy or sell. Must be an integer number (e.g. 10), NOT a string.")
    rationale: str = Field(description="Brief reason for choosing this stock and quantity.")

class TradingActionOutput(BaseModel):
    portfolio_summary: str = Field(description="A brief summary of the portfolio analysis and decisions.")
    decisions: List[PortfolioDecision] = Field(description="List of stock buy or sell decisions.")

trading_task = Task(
    description="""
    Review the combined stock analysis report:
    {combined_report}

    Review the user's current portfolio:
    {user_portfolio}

    Formulate a list of rebalancing actions based strictly on these rules:
    1. SELL ACTIONS: If the user currently holds a stock, and its overall score in the analysis report is less than 40 (score < 40), or if the report highlights a significant high-risk case, decide to SELL the entire position.
    2. BUY ACTIONS: If any stock in the analysis report has a high score (overall score >= 75), decide to BUY it.
    
    STRICT HOLDINGS RULE FOR SELLS: You must ONLY decide to SELL a stock if it is explicitly listed under the 'Current holdings' in the user's portfolio context. If a stock is not in the holdings list (like ONGC), you must NOT recommend a SELL action for it. The quantity to sell must be EXACTLY the quantity currently held in the holdings (representing selling the entire position). Never guess, assume, or invent quantities.
    
    STRICT THRESHOLD RULE: You must ONLY buy stocks with an overall score >= 75. If no stock has a score >= 75, do NOT buy anything. For example, if a stock (like VEDL) has a score of 65, do NOT buy it under any circumstances.
    
    STRICT POSITION SIZING RULE: To manage concentration risk, do not allocate more than 10% of the available cash balance to any single stock purchase. For example, if the available cash is Rs. 99,993,435.96, the maximum allocation for a single stock purchase is Rs. 9,999,343.60. The quantity of shares bought should be calculated as floor(max_allocation / current_price).
    
    STRICT NO-ACTION RULE: If no stock in the analysis report meets the BUY criteria (score >= 75) and no stock in the user's holdings meets the SELL criteria (score < 40), you must NOT recommend any buy or sell actions. Recommending zero actions (returning decisions as an empty list []) is the expected and correct behavior. Do NOT sell any stock with a score >= 40 unless it has a severe high-risk warning. Do NOT liquidate held stocks if their scores are in the Hold/Consider range (40-80).
    
    CRITICAL RESTRICTION: The total cost of all BUY actions must not exceed the user's available cash balance listed in their portfolio context. Calculate total purchase costs using the current prices listed in the report.
    
    Provide:
    - portfolio_summary: A brief summary of your rebalancing decisions (explaining cash allocation, and positions sold/held).
    - decisions: The list of decisions you executed. Each decision must include `symbol`, `action` ('BUY' or 'SELL'), `quantity`, and `rationale`. If no actions are recommended, return decisions as an empty list [].
    
    CRITICAL: The quantity of shares must be output as a pure number/integer (e.g. 10), NOT as a string (do NOT wrap numbers in quotes).
    """,
    expected_output="A structured JSON object containing a list of executed stock buy or sell decisions.",
    agent=trading_agent,
    output_json=TradingActionOutput
)
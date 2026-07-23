from crewai import Task
from pydantic import BaseModel, Field
from agents import strategy_supervisor_agent

class StrategyParameters(BaseModel):
    rsi_buy_threshold: int = Field(description="RSI threshold to trigger a BUY decision. Typically 25-45, or up to 55 for high-frequency trading in high RSI stocks. Must be an integer.")
    rsi_sell_threshold: int = Field(description="RSI threshold to trigger a SELL decision. Typically 55-75, or down to 52 for high-frequency scaling out in high RSI stocks. Must be an integer.")
    stop_loss_pct: float = Field(description="Percentage below entry price to trigger a STOP LOSS. Typically 0.01 to 0.05. Must be a float.")
    bias: str = Field(description="Overall tactical bias. Must be exactly 'bullish', 'bearish', or 'neutral'.")
    buy_fraction: float = Field(description="Portion of maximum cash allocation to buy. E.g., 0.5 to buy 50%, 1.0 to buy 100%. Must be between 0.1 and 1.0.")
    sell_fraction: float = Field(description="Portion of active holdings to sell. E.g., 0.5 to scale out 50% (take partial profit), 1.0 to close 100%. Must be between 0.1 and 1.0.")
    rationale: str = Field(description="Brief quantitative rationale explaining why these thresholds and fractions are optimized.")

strategy_optimization_task = Task(
    description="""
    Review the recent trading history, indicator state, and overall performance for the stock:
    
    SIMULATED MARKET DATA (LAST 10 MINUTES):
    {market_context}
    
    CURRENT PERFORMANCE & STATE:
    {performance_context}
    
    ACTIVE STRATEGY PARAMETERS:
    {current_strategy}
    
    TRADING SENSITIVITY PROFILE:
    {sensitivity_profile}
    
    Your goal is to optimize the strategy parameters (RSI thresholds and stop loss percent) as well as the trade sizes (buy/sell fractions) to maximize profits and manage risk.
    
    Guidelines:
    1. Align optimization decisions with the user's trading sensitivity profile ({sensitivity_profile}) and current market RSI levels:
       - conservative: keep RSI buy threshold low (20-28) to only buy deep dips, RSI sell threshold moderate (60-68) to take profits early, and stop loss tight (0.005 to 0.015).
       - moderate: RSI buy threshold (25-35), RSI sell threshold (65-75), and stop loss (0.015 to 0.025).
       - aggressive: RSI buy threshold can be higher (30-40) to capture momentum, RSI sell threshold can be higher (70-85) to ride trends, and stop loss can be wider (0.025 to 0.05) to withstand market noise.
       - Note: Regardless of the profile, if the stock has consistently high RSI (above 50) and needs to trade with high frequency, allow higher buy thresholds (up to 55) and lower sell thresholds (down to 52) to capture quick scalp trades.
    2. If the stock is in a strong uptrend (price > SMA50), you can increase `rsi_buy_threshold` slightly to buy pullbacks earlier, and increase `rsi_sell_threshold`.
    3. If the stock is in a downtrend, tighten stop loss percent and keep the buy threshold low.
    4. If there are recent losses, analyze if the stop loss was too tight or too loose, and adjust `stop_loss_pct` and thresholds accordingly.
    5. Set `bias` to reflect the tactical outlook.
    6. Optimize `buy_fraction` and `sell_fraction` (0.1 to 1.0) to scale in/out of positions:
       - In highly volatile or uncertain markets, use smaller fractions (e.g. 0.5 buy_fraction, 0.5 sell_fraction) to minimize risk.
       - In high-conviction trends, use larger fractions (e.g. 1.0).
    """,
    expected_output="A structured JSON object containing optimized trading strategy parameters and trade fractions.",
    agent=strategy_supervisor_agent,
    output_json=StrategyParameters
)

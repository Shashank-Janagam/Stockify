"""
prompts.py — MCP Structured Prompt Templates
"""

from config import mcp

@mcp.prompt()
def analyze_stock_prompt(symbol: str) -> str:
    """Prompt template to assist the LLM in structuring a deep technical & fundamental audit."""
    return f"""Please perform a detailed stock evaluation for ticker '{symbol}':
1. Retrieve live quote using `get_stock_quote('{symbol}')`.
2. Inspect price history over the past 30 days using `get_stock_history('{symbol}', days='30')`.
3. Check company profile and peers using `get_stock_profile('{symbol}')` and `get_similar_stocks('{symbol}')`.
4. Provide a structured summary with: Current Price, Day Change, Key Levels, and Technical Trend Outlook."""


@mcp.prompt()
def portfolio_risk_audit_prompt() -> str:
    """Prompt template for auditing user portfolio diversification and risk exposure."""
    return """Please analyze my Stockify portfolio:
1. Fetch current balances using `get_user_balance()`.
2. Fetch all active stock holdings with `get_user_holdings()`.
3. Evaluate overall portfolio performance with `get_portfolio_summary()`.
4. Run AI Behavioral and Quantitative metrics with `analyze_portfolio_behavior_ai()` and `get_portfolio_ai_eval()`.
5. Highlight top gainers, top losers, sector exposure risks, and suggest rebalancing recommendations."""

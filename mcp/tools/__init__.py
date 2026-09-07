"""
tools/__init__.py — Aggregates and exposes all PaperBull MCP Tool modules
"""

from tools.identity import (
    connect_paperbull,
    disconnect_paperbull,
    get_current_user,
    get_oauth_login_url,
    login_with_oauth_token,
    switch_user,
    list_available_users,
    check_backend_status,
)

from tools.market import (
    search_stocks,
    get_stock_quote,
    get_stock_history,
    get_stock_profile,
    get_similar_stocks,
    get_stock_list,
    get_market_news,
)

from tools.portfolio import (
    get_user_balance,
    get_user_holdings,
    get_portfolio_summary,
    get_portfolio_live_stats,
    get_portfolio_allocation,
)

from tools.trading import (
    buy_stock,
    sell_stock,
    get_user_orders,
    get_pending_stoploss_orders,
    cancel_stoploss_order,
    get_user_transactions,
)

from tools.ai_analytics import (
    analyze_portfolio_behavior_ai,
    get_portfolio_ai_eval,
    get_portfolio_forecasts,
    run_backtest_strategy,
    get_algo_capabilities,
)

__all__ = [
    # Identity
    "connect_paperbull",
    "disconnect_paperbull",
    "get_current_user",
    "get_oauth_login_url",
    "login_with_oauth_token",
    "switch_user",
    "list_available_users",
    "check_backend_status",
    # Market
    "search_stocks",
    "get_stock_quote",
    "get_stock_history",
    "get_stock_profile",
    "get_similar_stocks",
    "get_stock_list",
    "get_market_news",
    # Portfolio
    "get_user_balance",
    "get_user_holdings",
    "get_portfolio_summary",
    "get_portfolio_live_stats",
    "get_portfolio_allocation",
    # Trading
    "buy_stock",
    "sell_stock",
    "get_user_orders",
    "get_pending_stoploss_orders",
    "cancel_stoploss_order",
    "get_user_transactions",
    # AI Analytics
    "analyze_portfolio_behavior_ai",
    "get_portfolio_ai_eval",
    "get_portfolio_forecasts",
    "run_backtest_strategy",
    "get_algo_capabilities",
]

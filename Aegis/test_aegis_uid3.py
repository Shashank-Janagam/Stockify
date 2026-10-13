import os
import sys
import json
from langchain_core.runnables.config import RunnableConfig

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tools.portfolio_tools import get_user_balance, check_portfolio

config = {"configurable": {"uid": "3"}}

print("=== BALANCE ===")
print(get_user_balance.invoke({}, config=config))

print("\n=== PORTFOLIO ===")
print(check_portfolio.invoke({}, config=config))

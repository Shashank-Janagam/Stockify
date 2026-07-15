import yfinance as yf

stock_data = yf.download("SBIN.NS", period="3mo", progress=False)
nifty_data = yf.download("^NSEI", period="3mo", progress=False)

print("stock_data Close type:", type(stock_data['Close']))
print("stock_data Close head:\n", stock_data['Close'].head())
print("nifty_data Close head:\n", nifty_data['Close'].head())

stock_return = stock_data['Close'].pct_change(periods=20).iloc[-1]
nifty_return = nifty_data['Close'].pct_change(periods=20).iloc[-1]

print("stock_return:", stock_return)
print("nifty_return:", nifty_return)

relative_strength_spread = (stock_return - nifty_return) * 100
print("spread:", relative_strength_spread)

import yfinance as yf

# Test with SBIN.BO and ^BSESN or ^NSEI
stock_data = yf.download("SBIN.BO", period="3mo", progress=False)
nifty_data = yf.download("^NSEI", period="3mo", progress=False)

stock_return = stock_data['Close'].pct_change(periods=20).iloc[-1]
nifty_return = nifty_data['Close'].pct_change(periods=20).iloc[-1]

stock_val = float(stock_return.iloc[0])
nifty_val = float(nifty_return.iloc[0])

relative_strength_spread = (stock_val - nifty_val) * 100
print("SBIN.BO return:", stock_val)
print("Nifty return:", nifty_val)
print("Spread:", round(relative_strength_spread, 2))

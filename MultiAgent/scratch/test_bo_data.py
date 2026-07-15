import yfinance as yf

data = yf.download("SBIN.BO", period="3mo", progress=False)
print("SBIN.BO shape:", data.shape)
print("SBIN.BO columns:", list(data.columns))
print("SBIN.BO tail:")
print(data.tail())

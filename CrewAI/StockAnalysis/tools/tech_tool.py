import yfinance as yf
import numpy as np
from crewai.tools import BaseTool

class TechTool(BaseTool):
    name: str = "Technical Indicators Tool"
    description: str = (
        "Fetches technical indicators such as SMA20, SMA50, and RSI for a stock."
    )

    def _run(self, symbol: str):
        if not symbol.endswith(".NS"):
            symbol += ".NS"

        try:
            ticker = yf.Ticker(symbol)
            # Fetch last 100 days of history to compute 50-day SMA
            df = ticker.history(period="3mo")
            if df.empty:
                return {"error": f"No history found for {symbol}"}

            close = df["Close"].values.flatten()
            current_price = float(close[-1])
            sma20 = float(np.mean(close[-20:])) if len(close) >= 20 else current_price
            sma50 = float(np.mean(close[-50:])) if len(close) >= 50 else current_price
            
            # Simple RSI-14 calculation
            rsi = 50.0
            if len(close) >= 15:
                delta = np.diff(close[-15:])
                gain = np.mean(delta[delta > 0]) if any(delta > 0) else 1e-9
                loss = np.mean(-delta[delta < 0]) if any(delta < 0) else 1e-9
                rsi = 100 - (100 / (1 + gain / loss))

            return {
                "symbol": symbol,
                "current_price": round(current_price, 2),
                "sma20": round(sma20, 2),
                "sma50": round(sma50, 2),
                "rsi": round(rsi, 2),
                "trend": "uptrend" if current_price > sma50 else "downtrend"
            }
        except Exception as e:
            return {"error": f"Error fetching technical indicators: {str(e)}"}

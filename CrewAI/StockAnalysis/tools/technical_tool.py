import yfinance as yf
import pandas_ta as ta

from crewai.tools import BaseTool


class TechnicalTool(BaseTool):

    name: str = "Technical Analysis Tool"

    description: str = (
        "Fetches stock price history and calculates technical indicators."
    )

    def _run(self, symbol: str):

        if not symbol.endswith(".NS"):
            symbol += ".NS"

        df = yf.download(
            symbol,
            period="6mo",
            interval="1d",
            progress=False
        )

        df["RSI"] = ta.rsi(df["Close"], length=14)

        macd = ta.macd(df["Close"])

        df = df.join(macd)

        df["EMA20"] = ta.ema(df["Close"], length=20)

        df["EMA50"] = ta.ema(df["Close"], length=50)

        bb = ta.bbands(df["Close"])

        df = df.join(bb)

        latest = df.iloc[-1]

        return {

            "close": float(latest["Close"]),

            "volume": int(latest["Volume"]),

            "rsi": float(latest["RSI"]),

            "ema20": float(latest["EMA20"]),

            "ema50": float(latest["EMA50"]),

            "macd": float(latest["MACD_12_26_9"]),

            "macd_signal": float(latest["MACDs_12_26_9"]),

            "macd_histogram": float(latest["MACDh_12_26_9"]),

            "upper_band": float(latest["BBU_5_2.0"]),

            "middle_band": float(latest["BBM_5_2.0"]),

            "lower_band": float(latest["BBL_5_2.0"])
        }
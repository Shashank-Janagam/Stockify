"""
json_backtest_demo.py — Demo of JSON based Strategy Engine
==========================================================
This script shows how to load and backtest a strategy defined entirely
in a JSON file (`my_strategy.json`), without writing any Python rules.
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from Algos import StrategyManager, BacktestEngine, Candle
from Algos.strategies import JsonStrategy

def load_candles(symbol="TCS", period="1y"):
    try:
        import yfinance as yf
        ticker = yf.Ticker(f"{symbol}.NS" if "." not in symbol else symbol)
        df     = ticker.history(period=period, interval="1d")
        if df.empty:
            raise ValueError("Empty data")
        candles = [
            Candle(
                timestamp = str(idx),
                open      = float(row["Open"]),
                high      = float(row["High"]),
                low       = float(row["Low"]),
                close     = float(row["Close"]),
                volume    = float(row["Volume"]),
            )
            for idx, row in df.iterrows()
        ]
        print(f"[Data] Loaded {len(candles)} real candles for {symbol}")
        return candles
    except Exception as e:
        print(f"[Data] Using synthetic candles ({e})")
        # generate synthetic fallback...
        return []

if __name__ == "__main__":
    # 1. Load data
    candles = load_candles("KOTAKBANK", "2y")
    
    # 2. Instantiate JsonStrategy and tell it where the config file is
    strategy = JsonStrategy(params={"config": "my_strategy.json"})
    
    # 3. Run the backtester
    engine = BacktestEngine(initial_capital=100_000, warm_up_period=50)
    report = engine.run(strategy, candles, symbol="KOTAKBANK")
    
    print("\n")
    report.print_summary()

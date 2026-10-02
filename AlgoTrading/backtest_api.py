"""
backtest_api.py — JSON output wrapper for Node.js backend integration
=====================================================================
Usage:
  python backtest_api.py --symbol TCS --period 1y --strategy JsonStrategy --config my_strategy.json
"""

import sys, os, json, argparse
import logging
from dataclasses import asdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from Algos import BacktestEngine, Candle, strategy_registry
from Algos.strategies import *

# Suppress log outputs to stdout so we only print JSON
logging.getLogger().setLevel(logging.CRITICAL)

def resolve_interval(days: int, custom_interval: str = None) -> str:
    if custom_interval:
        norm = str(custom_interval).strip().lower()
        if norm == "1m":
            return "1m" if days <= 7 else ("2m" if days <= 60 else ("1h" if days <= 1825 else "1d"))
        if norm in ["2m", "5m", "15m", "30m"]:
            return norm if days <= 60 else ("1h" if days <= 1825 else "1d")
        if norm in ["60m", "1h"]:
            return "1h" if days <= 1825 else "1d"
        return norm

    if days <= 7: return "1m"
    if days <= 60: return "2m"
    if days <= 1825: return "1h" # 6m, 1y, 2y, 3y, 4y, 5y use 1h
    return "1d"

def load_candles(symbol: str, period: str = "1y", start: str = None, end: str = None, interval: str = None):
    import yfinance as yf
    import datetime
    clean_sym = symbol.strip().upper()
    ticker_sym = f"{clean_sym}.NS" if ("." not in clean_sym and not clean_sym.startswith("^")) else clean_sym
    ticker = yf.Ticker(ticker_sym)
    
    if start or end:
        try:
            end_dt = datetime.datetime.strptime(end, "%Y-%m-%d") if end else datetime.datetime.now()
            start_dt = datetime.datetime.strptime(start, "%Y-%m-%d") if start else (end_dt - datetime.timedelta(days=365))
            target_days = max(1, (end_dt - start_dt).days + 1)
            selected_interval = resolve_interval(target_days, interval)
            
            # Ensure sufficient lookback warmup padding
            if selected_interval == "1m":
                pad_days = 6
            elif selected_interval in ["2m", "5m", "15m", "30m"]:
                pad_days = 55
            elif selected_interval in ["60m", "1h"]:
                pad_days = 180
            else:
                pad_days = 365

            padded_start = (start_dt - datetime.timedelta(days=pad_days)).strftime("%Y-%m-%d")
            end_fetch_dt = (end_dt + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
            df = ticker.history(start=padded_start, end=end_fetch_dt, interval=selected_interval)
        except Exception:
            df = ticker.history(period="1y", interval=resolve_interval(365, interval))
    else:
        period_str = (period or "1y").lower().strip()
        period_map = {"1d": 1, "5d": 5, "7d": 7, "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825, "max": 9999}
        days = period_map.get(period_str, 365)
        selected_interval = resolve_interval(days, interval)

        # Lookback warmup handling per interval capabilities
        if selected_interval == "1m":
            fetch_period = "7d" # Yahoo max 7 days for 1m
        elif selected_interval in ["2m", "5m", "15m", "30m"]:
            fetch_period = "60d" if period_str in ["1d", "5d", "7d", "1mo", "60d"] else period_str
        elif selected_interval in ["60m", "1h"]:
            fetch_period = "2y" if period_str in ["1d", "5d", "7d", "1mo", "3mo", "6mo", "1y", "2y"] else period_str
        else:
            fetch_period = period_str

        df = ticker.history(period=fetch_period, interval=selected_interval)
        if (df is None or df.empty) and selected_interval == "1h":
            # Graceful fallback to 1d for periods > 2y (e.g. 5y)
            df = ticker.history(period=period_str, interval="1d")

    if df.empty:
        return []
    
    candles = []
    for idx, row in df.iterrows():
        candles.append(Candle(
            timestamp=str(idx),
            open=float(row["Open"]),
            high=float(row["High"]),
            low=float(row["Low"]),
            close=float(row["Close"]),
            volume=float(row.get("Volume", 0.0))
        ))
    return candles

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", type=str, required=True)
    parser.add_argument("--period", type=str, default="1y")
    parser.add_argument("--interval", type=str, default=None)
    parser.add_argument("--start_date", type=str, default=None)
    parser.add_argument("--end_date", type=str, default=None)
    parser.add_argument("--strategy", type=str, required=True)
    parser.add_argument("--config", type=str, default=None)
    args = parser.parse_args()

    try:
        # Load Strategy
        if args.strategy not in strategy_registry.list_all():
            raise ValueError(f"Strategy {args.strategy} not found.")
            
        cls = strategy_registry.get(args.strategy)
        params = {"config": args.config} if args.config else {}
        strategy_instance = cls(params=params)
        
        # Load Data
        candles = load_candles(args.symbol, period=args.period, start=args.start_date, end=args.end_date, interval=args.interval)
        if len(candles) < 15:
            raise ValueError(f"Not enough data for {args.symbol} (got {len(candles)} candles)")

        target_start = ""
        target_end = ""
        if args.start_date:
            target_start = args.start_date[:10]
            target_end = (args.end_date or args.start_date)[:10]
        elif (args.period or "").lower().strip() == "1d" and candles:
            target_start = candles[-1].timestamp[:10]
            target_end = candles[-1].timestamp[:10]
        elif (args.period or "").lower().strip() == "5d" and candles:
            unique_days = sorted(list(set(c.timestamp[:10] for c in candles)))
            target_start = unique_days[-5] if len(unique_days) >= 5 else unique_days[0]
            target_end = unique_days[-1]

        # Run Backtest
        warm_up = min(50, max(5, len(candles) // 4)) if len(candles) < 60 else 50
        engine = BacktestEngine(initial_capital=100000, warm_up_period=warm_up)
        report = engine.run(
            strategy_instance, 
            candles, 
            symbol=args.symbol,
            target_start_str=target_start,
            target_end_str=target_end
        )
        
        # We redirect stdout so we don't capture print_summary if it was called accidentally
        sys.stdout = sys.__stdout__
        print(json.dumps({"success": True, "report": asdict(report)}))
        
    except Exception as e:
        sys.stdout = sys.__stdout__
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    # temporarily redirect stdout to devnull to avoid yfinance logs corrupting json
    original_stdout = sys.stdout
    sys.stdout = open(os.devnull, 'w')
    main()

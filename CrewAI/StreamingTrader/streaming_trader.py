import os
import sys
import json
import time
import threading
import requests
import logging
import numpy as np
import pandas as pd
import yfinance as yf
from crewai import Crew
from dotenv import load_dotenv

# Import agent and task
from agents import strategy_supervisor_agent
from tasks import strategy_optimization_task

load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("streaming_trader")

# Backend URLs
BACKEND_URL = "http://localhost:4000"
BYPASS_HEADERS = {"x-bypass-auth": "true", "Content-Type": "application/json"}

# Simulation Settings
SYMBOL = "EMUDHRA"
TICKER = f"{SYMBOL}.NS"
SIMULATION_INTERVAL_SEC = 0.5 # Each bar lasts 5 seconds in real time
SUPERVISOR_INTERVAL_BARS = 10  # LLM runs every 10 bars (~50 seconds)
MAX_BARS = 25  # Run simulation for 25 bars then exit cleanly
ALLOCATION_PCT = 1  # Default allocation: 10%
SENSITIVITY_PROFILE_NAME = "moderate"  # Default sensitivity profile

# Local Portfolio State (used as fallback when backend is offline)
backend_online = True
simulated_cash = 100000.0
simulated_holdings = []

# Initial local strategy parameters
strategy_config = {
    "rsi_buy_threshold": 30,
    "rsi_sell_threshold": 70,
    "stop_loss_pct": 0.02,
    "bias": "neutral",
    "buy_fraction": 1.0,
    "sell_fraction": 1.0
}


def fetch_portfolio():
    """Fetches the user's available cash and current holdings from the backend. Falls back to simulated state if offline."""
    global backend_online, simulated_cash, simulated_holdings
    
    if not backend_online:
        return simulated_cash, simulated_holdings
        
    cash = simulated_cash
    holdings = simulated_holdings
    
    try:
        # Check cash balance
        res = requests.get(f"{BACKEND_URL}/api/getBalance/getBalance", headers=BYPASS_HEADERS, timeout=10)
        if res.status_code == 200:
            cash = float(res.json().get("cash", 0.0))
            backend_online = True
            simulated_cash = cash
            
            # Fetch holdings
            res_h = requests.get(f"{BACKEND_URL}/api/portfolio/summary?fresh=1", headers=BYPASS_HEADERS, timeout=10)
            if res_h.status_code == 200:
                holdings = res_h.json().get("holdings", [])
                
                # Seed the local simulated holdings list
                simulated_holdings = []
                for h in holdings:
                    h_sym = h.get("symbol", "").replace(".NS", "").replace(".BO", "").strip().upper()
                    qty = int(h.get("quantity", 0))
                    invested = float(h.get("invested", 0.0))
                    avg_price = float(h.get("avgPrice") or (invested / qty if qty > 0 else 0.0))
                    simulated_holdings.append({
                        "symbol": h_sym,
                        "quantity": qty,
                        "avgPrice": avg_price,
                        "currentPrice": float(h.get("currentPrice", 0.0))
                    })
        else:
            backend_online = False
    except Exception as e:
        logger.warning(f"[Portfolio] Backend API is unreachable or returned error: {str(e)}. Switching to simulated local portfolio tracker.")
        backend_online = False
            
    return cash, holdings

def execute_buy(symbol: str, quantity: int, current_price: float):
    """Executes a buy order on the backend. Simulates local transaction if offline."""
    global backend_online, simulated_cash, simulated_holdings
    
    if backend_online:
        url = f"{BACKEND_URL}/api/orderExecution/buy"
        body = {
            "symbol": symbol,
            "quantity": quantity,
            "product_type": "Delivery",
            "category": "Streaming Algo"
        }
        try:
            res = requests.post(url, json=body, headers=BYPASS_HEADERS, timeout=10)
            if res.status_code == 200:
                res_data = res.json()
                logger.info(f"[EXECUTION] BUY SUCCESS: {quantity} shares of {symbol} at Rs. {res_data.get('buyPricePerShare')}")
                return True, res_data
            else:
                logger.error(f"[EXECUTION] BUY FAILED (API Status {res.status_code}): {res.text}")
                return False, res.text
        except Exception as e:
            logger.error(f"[EXECUTION] BUY EXCEPTION: {str(e)}")
            
    # Local Simulation Fallback
    cost = quantity * current_price
    if simulated_cash >= cost:
        simulated_cash -= cost
        # Check if already held in simulated list
        found = False
        for h in simulated_holdings:
            if h["symbol"] == SYMBOL:
                old_qty = h["quantity"]
                old_avg = h["avgPrice"]
                new_qty = old_qty + quantity
                new_avg = ((old_avg * old_qty) + cost) / new_qty
                h["quantity"] = new_qty
                h["avgPrice"] = round(new_avg, 2)
                h["currentPrice"] = current_price
                found = True
                break
        if not found:
            simulated_holdings.append({
                "symbol": SYMBOL,
                "quantity": quantity,
                "avgPrice": round(current_price, 2),
                "currentPrice": current_price
            })
        logger.info(f"[LOCAL SIMULATION] BUY SUCCESS: {quantity} shares of {symbol} at Rs. {current_price:.2f} (Simulated cash balance: Rs. {simulated_cash:.2f})")
        return True, {"buyPricePerShare": current_price, "status": "SIMULATED"}
    else:
        logger.error(f"[LOCAL SIMULATION] BUY FAILED: Insufficient simulated balance (Need Rs. {cost:.2f}, Have Rs. {simulated_cash:.2f})")
        return False, "Insufficient balance"

def execute_sell(symbol: str, quantity: int, current_price: float):
    """Executes a sell order on the backend. Simulates local transaction if offline."""
    global backend_online, simulated_cash, simulated_holdings
    
    if backend_online:
        url = f"{BACKEND_URL}/api/sellStock/sell"
        body = {
            "symbol": symbol,
            "quantity": quantity,
            "sl_enabled": False,
            "product_type": "Delivery",
            "category": "Streaming Algo"
        }
        try:
            res = requests.post(url, json=body, headers=BYPASS_HEADERS, timeout=10)
            if res.status_code == 200:
                res_data = res.json()
                logger.info(f"[EXECUTION] SELL SUCCESS: {quantity} shares of {symbol} at Rs. {res_data.get('sellPricePerShare')}")
                return True, res_data
            else:
                logger.error(f"[EXECUTION] SELL FAILED (API Status {res.status_code}): {res.text}")
                return False, res.text
        except Exception as e:
            logger.error(f"[EXECUTION] SELL EXCEPTION: {str(e)}")
            
    # Local Simulation Fallback
    revenue = quantity * current_price
    for i, h in enumerate(simulated_holdings):
        if h["symbol"] == SYMBOL:
            old_qty = h["quantity"]
            if old_qty >= quantity:
                new_qty = old_qty - quantity
                simulated_cash += revenue
                if new_qty == 0:
                    simulated_holdings.pop(i)
                else:
                    h["quantity"] = new_qty
                logger.info(f"[LOCAL SIMULATION] SELL SUCCESS: {quantity} shares of {symbol} at Rs. {current_price:.2f} (Simulated cash balance: Rs. {simulated_cash:.2f})")
                return True, {"sellPricePerShare": current_price, "status": "SIMULATED"}
            else:
                logger.error(f"[LOCAL SIMULATION] SELL FAILED: Not enough shares held (Need {quantity}, Have {old_qty})")
                return False, "Not enough shares"
                
    logger.error(f"[LOCAL SIMULATION] SELL FAILED: Stock {symbol} is not held in portfolio.")
    return False, "Stock not held"

# Global state for background Strategy Supervisor thread
supervisor_running = False

def run_supervisor_async(market_context_str, performance_context_str):
    global strategy_config, supervisor_running, SENSITIVITY_PROFILE_NAME
    try:
        crew = Crew(
            agents=[strategy_supervisor_agent],
            tasks=[strategy_optimization_task],
            verbose=False
        )
        result = crew.kickoff(inputs={
            "market_context": market_context_str,
            "performance_context": performance_context_str,
            "current_strategy": json.dumps(strategy_config, indent=2),
            "sensitivity_profile": SENSITIVITY_PROFILE_NAME
        })
        
        new_params = None
        if hasattr(result, "json_dict") and result.json_dict:
            new_params = result.json_dict
        else:
            try:
                new_params = json.loads(result.raw)
            except Exception:
                import re
                match = re.search(r'\{.*\}', result.raw, re.DOTALL)
                if match:
                    new_params = json.loads(match.group(0))
                    
        if new_params:
            strategy_config["rsi_buy_threshold"] = int(new_params.get("rsi_buy_threshold", strategy_config["rsi_buy_threshold"]))
            strategy_config["rsi_sell_threshold"] = int(new_params.get("rsi_sell_threshold", strategy_config["rsi_sell_threshold"]))
            strategy_config["stop_loss_pct"] = float(new_params.get("stop_loss_pct", strategy_config["stop_loss_pct"]))
            strategy_config["bias"] = str(new_params.get("bias", strategy_config["bias"]))
            strategy_config["buy_fraction"] = float(new_params.get("buy_fraction", strategy_config.get("buy_fraction", 1.0)))
            strategy_config["sell_fraction"] = float(new_params.get("sell_fraction", strategy_config.get("sell_fraction", 1.0)))
            
            print("\n[SUPERVISOR] OPTIMIZATION COMPLETED!")
            print(f"  - New RSI Buy Threshold : {strategy_config['rsi_buy_threshold']}")
            print(f"  - New RSI Sell Threshold: {strategy_config['rsi_sell_threshold']}")
            print(f"  - New Stop Loss Percent : {strategy_config['stop_loss_pct']*100:.2f}%")
            print(f"  - Buy Fraction Size     : {strategy_config['buy_fraction']*100:.1f}%")
            print(f"  - Sell Fraction Size    : {strategy_config['sell_fraction']*100:.1f}%")
            print(f"  - Tactical Bias         : {strategy_config['bias'].upper()}")
            print(f"  - Rationale             : {new_params.get('rationale', 'No rationale provided.')}")
            
            symbol_config_file = f"config_{SYMBOL}.json"
            with open(symbol_config_file, "w") as f:
                json.dump(strategy_config, f, indent=4)
    except Exception as e:
        logger.error(f"Failed to optimize strategy config: {str(e)}")
    finally:
        supervisor_running = False

def get_intraday_data(ticker: str):
    """Fetch 1-minute interval data for streaming."""
    logger.info(f"Downloading 1-minute historical data for {ticker} ...")
    df = yf.download(ticker, period="1d", interval="1m")
    if df.empty:
        raise ValueError(f"Could not download history for {ticker}")
    
    # Handle multi-index columns
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
        
    return df

def calculate_rolling_indicators(price_history):
    """Compute SMA20, SMA50, and RSI-14 locally on rolling history list."""
    closes = np.array(price_history)
    if len(closes) < 1:
        return 0.0, 0.0, 50.0
        
    sma20 = float(np.mean(closes[-20:])) if len(closes) >= 20 else float(closes[-1])
    sma50 = float(np.mean(closes[-50:])) if len(closes) >= 50 else sma20
    
    rsi = 50.0
    if len(closes) >= 15:
        delta = np.diff(closes[-15:])
        gain = np.mean(delta[delta > 0]) if any(delta > 0) else 1e-9
        loss = np.mean(-delta[delta < 0]) if any(delta < 0) else 1e-9
        rsi = float(100 - (100 / (1 + gain / loss)))
        
    return round(sma20, 2), round(sma50, 2), round(rsi, 2)

def run_simulation(max_bars: int = 375, interval_sec: float = 5.0):
    global strategy_config, supervisor_running
    
    # 1. Fetch data
    try:
        df = get_intraday_data(TICKER)
    except Exception as e:
        logger.error(f"Failed to fetch stock data: {str(e)}")
        sys.exit(1)
        
    # Get the last trading day's date
    last_date = df.index.date[-1]
    df_last_day = df[df.index.date == last_date].copy()
    
    # Preceding days data for seeding indicators
    df_previous = df[df.index.date < last_date].copy()
    price_history = df_previous["Close"].tail(60).tolist()
    
    # If not enough previous data, fallback to seeding using the first few bars of the last day
    if len(price_history) < 50:
        seed_bars = min(60, len(df_last_day) - 5)
        price_history = df_last_day["Close"].iloc[:seed_bars].tolist()
        stream_df = df_last_day.iloc[seed_bars:seed_bars + max_bars].copy()
    else:
        # Start simulation exactly at the beginning of the day (9:15 AM local time)
        stream_df = df_last_day.iloc[:max_bars].copy()
        
    # Convert index timezone to Asia/Kolkata (IST) for local time printing
    if stream_df.index.tz is not None:
        stream_df.index = stream_df.index.tz_convert("Asia/Kolkata")
        
    logger.info(f"Loaded {len(df_last_day)} bars of 1-minute data for date: {last_date}")
    logger.info("Initializing trading engine ...")
    cash, holdings = fetch_portfolio()
    logger.info(f"Portfolio State: Cash = Rs. {cash:.2f}, Holdings count = {len(holdings)}")
    
    initial_cash = cash
    initial_holdings_value = 0.0
    for h in holdings:
        initial_holdings_value += float(h.get("quantity", 0)) * float(h.get("currentPrice", 0.0))
    initial_total_value = initial_cash + initial_holdings_value
    
    trade_log = []
    executed_transactions = []
    curr_price = 0.0
    
    print("\n" + "="*60)
    print("--- SIMULATED REAL-TIME TRADING STREAM RUNNING ---")
    print(f"Tracking: {TICKER} | Interval: {interval_sec}s (1 bar = 1 min market time)")
    print("="*60 + "\n")
    
    bar_count = 0
    for timestamp, bar in stream_df.iterrows():
        bar_count += 1
        curr_price = float(bar["Close"])
        curr_volume = int(bar["Volume"])
        price_history.append(curr_price)
        
        # Calculate local indicators
        sma20, sma50, rsi = calculate_rolling_indicators(price_history)
        trend = "UPTREND" if curr_price > sma50 else "DOWNTREND"
        
        print(f"\n[{timestamp.strftime('%H:%M:%S')}] Bar {bar_count}/{max_bars} | Price: Rs. {curr_price:.2f} | RSI: {rsi} | Trend: {trend} | Bias: {strategy_config['bias'].upper()}")
        
        # Check Strategy Config
        buy_thresh = strategy_config["rsi_buy_threshold"]
        sell_thresh = strategy_config["rsi_sell_threshold"]
        stop_loss_pct = strategy_config["stop_loss_pct"]
        
        # Check current holdings
        cash, holdings = fetch_portfolio()
        held_qty = 0
        avg_buy_price = 0.0
        for h in holdings:
            h_sym = h.get("symbol", "").replace(".NS", "").replace(".BO", "").strip().upper()
            if h_sym == SYMBOL:
                held_qty = int(h.get("quantity", 0))
                avg_buy_price = float(h.get("avgPrice", 0.0))
                break
                
        # Check if it's the very last bar - End of Day square off rule!
        is_last_bar = (bar_count == max_bars)
        
        # 1. Evaluate SELL (Stop loss, RSI overbought, or End of Day square-off)
        if held_qty > 0:
            if is_last_bar:
                logger.info(f"[STRATEGY] Market Close Square-Off! Liquidating remaining {held_qty} shares of {SYMBOL} at final price Rs. {curr_price:.2f}.")
                success, details = execute_sell(TICKER, held_qty, curr_price)
                if success:
                    trade_log.append(f"SELL (Square-off) {held_qty} shares @ {curr_price:.2f}")
                    executed_transactions.append({
                        "timestamp": timestamp.strftime('%H:%M:%S'),
                        "symbol": SYMBOL,
                        "action": "SELL",
                        "quantity": held_qty,
                        "price": curr_price,
                        "total_value": held_qty * curr_price,
                        "type": "Square-off",
                        "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                    })
            else:
                unrealized_pnl_pct = (curr_price - avg_buy_price) / avg_buy_price if avg_buy_price > 0 else 0.0
                
                # Stop loss check
                if unrealized_pnl_pct <= -stop_loss_pct:
                    logger.warning(f"[STRATEGY] [WARNING] Triggering STOP LOSS for {SYMBOL}! Held qty: {held_qty} @ average price {avg_buy_price:.2f} (Current Price: {curr_price:.2f}, PnL: {unrealized_pnl_pct*100:.2f}%)")
                    success, details = execute_sell(TICKER, held_qty, curr_price)
                    if success:
                        trade_log.append(f"SELL (Stop Loss) {held_qty} shares @ {curr_price:.2f}")
                        executed_transactions.append({
                            "timestamp": timestamp.strftime('%H:%M:%S'),
                            "symbol": SYMBOL,
                            "action": "SELL",
                            "quantity": held_qty,
                            "price": curr_price,
                            "total_value": held_qty * curr_price,
                            "type": "Stop Loss",
                            "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                        })
                        
                # RSI overbought check
                elif rsi >= sell_thresh:
                    sell_fraction = strategy_config.get("sell_fraction", 1.0)
                    sell_qty = int(held_qty * sell_fraction)
                    if sell_qty > 0:
                        logger.info(f"[STRATEGY] RSI {rsi} exceeds sell threshold {sell_thresh}! Selling portion of position: {sell_qty} shares ({sell_fraction*100:.1f}%).")
                        success, details = execute_sell(TICKER, sell_qty, curr_price)
                        if success:
                            trade_log.append(f"SELL (RSI Overbought) {sell_qty} shares @ {curr_price:.2f}")
                            executed_transactions.append({
                                "timestamp": timestamp.strftime('%H:%M:%S'),
                                "symbol": SYMBOL,
                                "action": "SELL",
                                "quantity": sell_qty,
                                "price": curr_price,
                                "total_value": sell_qty * curr_price,
                                "type": f"RSI Overbought (Fraction: {sell_fraction:.2f})",
                                "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                            })
                            
        # 2. Evaluate BUY (RSI oversold) - only if it is NOT the last bar!
        else:
            if not is_last_bar:
                if rsi <= buy_thresh:
                    buy_fraction = strategy_config.get("buy_fraction", 1.0)
                    max_alloc = cash * ALLOCATION_PCT * buy_fraction
                    buy_qty = int(max_alloc // curr_price)
                    if buy_qty > 0:
                        logger.info(f"[STRATEGY] RSI {rsi} below buy threshold {buy_thresh}! Buying portion of allocation: {buy_qty} shares ({buy_fraction*100:.1f}%).")
                        success, details = execute_buy(TICKER, buy_qty, curr_price)
                        if success:
                            trade_log.append(f"BUY {buy_qty} shares @ {curr_price:.2f}")
                            executed_transactions.append({
                                "timestamp": timestamp.strftime('%H:%M:%S'),
                                "symbol": SYMBOL,
                                "action": "BUY",
                                "quantity": buy_qty,
                                "price": curr_price,
                                "total_value": buy_qty * curr_price,
                                "type": "RSI Oversold",
                                "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                            })
                    else:
                        logger.warning(f"[STRATEGY] [WARNING] RSI {rsi} is oversold but cash allocation (Rs. {max_alloc:.2f}) is too low to buy a share (Price: Rs. {curr_price:.2f})")
                    
        # 3. Periodically run the CrewAI Strategy Supervisor asynchronously in the background
        if bar_count % SUPERVISOR_INTERVAL_BARS == 0:
            if not supervisor_running:
                supervisor_running = True
                print("\n" + "-"*50)
                print("--- LAUNCHING CREWAI STRATEGY SUPERVISOR IN BACKGROUND ---")
                print("-"*50)
                
                # Collect contexts
                recent_bars = stream_df.iloc[max(0, bar_count - 10):bar_count]
                market_context_list = []
                for t, r in recent_bars.iterrows():
                    market_context_list.append(f"  - {t.strftime('%H:%M:%S')}: Price {r['Close']:.2f}, Volume {int(r['Volume'])}")
                market_context_str = "\n".join(market_context_list)
                
                cash, holdings = fetch_portfolio()
                performance_context_str = f"Available Cash: Rs. {cash:.2f}\n"
                performance_context_str += f"Current Holdings count: {len(holdings)}\n"
                performance_context_str += "Recent Simulated Trades Log:\n"
                if trade_log:
                    for log_item in trade_log[-5:]:
                        performance_context_str += f"  - {log_item}\n"
                else:
                    performance_context_str += "  - No trades executed in this run yet.\n"
                
                # Spawn background thread
                t = threading.Thread(
                    target=run_supervisor_async,
                    args=(market_context_str, performance_context_str),
                    daemon=True
                )
                t.start()
            else:
                logger.info("[SUPERVISOR] Previous optimization task is still running in background, skipping trigger.")
            
        time.sleep(interval_sec)
        
    # Wait for final background Strategy Supervisor optimization to finish if still running
    if supervisor_running:
        print("\nWaiting for active background Strategy Supervisor thread to complete ...")
        while supervisor_running:
            time.sleep(0.5)
        
    print("\n" + "="*60)
    print("=== SIMULATION COMPLETED SUCCESSFULLY ===")
    if backend_online and len(trade_log) > 0:
        logger.info("Waiting for final database transactions to commit...")
        time.sleep(1.5)
    cash, holdings = fetch_portfolio()
    
    final_holdings_value = 0.0
    for h in holdings:
        h_qty = float(h.get("quantity", 0))
        h_sym = h.get("symbol", "").replace(".NS", "").replace(".BO", "").strip().upper()
        if h_sym == SYMBOL:
            price = curr_price
        else:
            price = float(h.get("currentPrice", 0.0))
        final_holdings_value += h_qty * price
        
    final_total_value = cash + final_holdings_value
    total_pnl = final_total_value - initial_total_value
    pnl_pct = (total_pnl / initial_total_value) * 100 if initial_total_value > 0 else 0.0
    
    print(f"Initial Portfolio Value: Rs. {initial_total_value:.2f} (Cash: Rs. {initial_cash:.2f}, Holdings: Rs. {initial_holdings_value:.2f})")
    print(f"Final Portfolio Value:   Rs. {final_total_value:.2f} (Cash: Rs. {cash:.2f}, Holdings: Rs. {final_holdings_value:.2f})")
    print(f"Total PnL:               Rs. {total_pnl:+.2f} ({pnl_pct:+.3f}%)")
    print(f"Trades executed in this run: {len(trade_log)}")
    print("="*60 + "\n")
    
    # Save simulated transactions report
    transactions_file = "simulated_transactions.json"
    try:
        with open(transactions_file, "w", encoding="utf-8") as f:
            json.dump(executed_transactions, f, indent=4, ensure_ascii=False)
        logger.info(f"Saved simulated transactions report to {transactions_file}")
    except Exception as e:
        logger.error(f"Failed to save transactions file: {str(e)}")

def save_live_transaction(tx_item):
    transactions_file = "live_transactions.json"
    try:
        data = []
        if os.path.exists(transactions_file):
            with open(transactions_file, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                    if not isinstance(data, list):
                        data = []
                except Exception:
                    data = []
        data.append(tx_item)
        with open(transactions_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        logger.info(f"Appended transaction to {transactions_file}")
    except Exception as e:
        logger.error(f"Failed to save live transaction to file: {str(e)}")

def run_live_trading(interval_sec: float = 10.0):
    global strategy_config, supervisor_running
    
    logger.info("Starting live market trading mode...")
    
    # 1. Fetch initial portfolio state to ensure connectivity
    cash, holdings = fetch_portfolio()
    logger.info(f"Portfolio State: Cash = Rs. {cash:.2f}, Holdings count = {len(holdings)}")
    
    initial_cash = cash
    initial_holdings_value = 0.0
    for h in holdings:
        initial_holdings_value += float(h.get("quantity", 0)) * float(h.get("currentPrice", 0.0))
    initial_total_value = initial_cash + initial_holdings_value
    
    trade_log = []
    executed_transactions = []
    
    print("\n" + "="*60, flush=True)
    print("--- LIVE REAL-TIME TRADING STREAM RUNNING ---", flush=True)
    print(f"Tracking: {TICKER} | Polling Interval: {interval_sec}s | Bar size: 1 min", flush=True)
    print("="*60 + "\n", flush=True)
    
    # Local portfolio state to avoid double-buys/sells during transition periods
    local_held_qty = None
    local_avg_buy_price = 0.0
    last_trade_time = 0.0
    last_buy_time = 0.0
    last_sell_time = 0.0
    
    # 2. Warm-up Phase: Process today's completed historical bars
    print("\n" + "="*60, flush=True)
    print("--- WARM-UP: PROCESSING TODAY'S HISTORICAL BARS ---", flush=True)
    print("="*60 + "\n", flush=True)
    
    # Download today's data (and yesterday's to seed indicators)
    df_warm = yf.download(TICKER, period="2d", interval="1m", progress=False)
    if not df_warm.empty:
        # Clean MultiIndex columns
        if isinstance(df_warm.columns, pd.MultiIndex):
            df_warm.columns = df_warm.columns.get_level_values(0)
            
        df_warm = df_warm.sort_index().dropna(subset=["Close", "Volume"])
        
        # Filter today's bars
        import datetime
        now_ist_warm = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
        last_date = df_warm.index.date[-1]
        df_today = df_warm[df_warm.index.date == last_date]
        
        # We process all bars of today except the very last one (which is the active/incomplete tick)
        completed_bars_count = len(df_today) - 1
        if completed_bars_count > 0:
            logger.info(f"Backfilling {completed_bars_count} completed bars of today...")
            
            warm_held_qty = 0
            warm_avg_buy_price = 0.0
            
            buy_thresh = strategy_config["rsi_buy_threshold"]
            sell_thresh = strategy_config["rsi_sell_threshold"]
            stop_loss_pct = strategy_config["stop_loss_pct"]
            
            for idx in range(completed_bars_count):
                bar_timestamp = df_today.index[idx]
                bar = df_today.iloc[idx]
                bar_price = float(bar["Close"])
                
                # Fetch price history up to this bar's timestamp
                bar_loc = df_warm.index.get_loc(bar_timestamp)
                price_history = df_warm["Close"].iloc[:bar_loc + 1].tolist()
                
                # Calculate indicators
                sma20, sma50, rsi = calculate_rolling_indicators(price_history)
                trend = "UPTREND" if bar_price > sma50 else "DOWNTREND"
                
                # Check signals
                timestamp_str = bar_timestamp.tz_convert("Asia/Kolkata").strftime('%H:%M:%S') if bar_timestamp.tz is not None else bar_timestamp.strftime('%H:%M:%S')
                
                # Evaluate Sell
                if warm_held_qty > 0:
                    unrealized_pnl_pct = (bar_price - warm_avg_buy_price) / warm_avg_buy_price if warm_avg_buy_price > 0 else 0.0
                    
                    if unrealized_pnl_pct <= -stop_loss_pct:
                        print(f"[{timestamp_str}] [WARM-UP] SELL SIGNAL (Stop Loss) | Price: Rs. {bar_price:.2f} | PnL: {unrealized_pnl_pct*100:.2f}%", flush=True)
                        warm_held_qty = 0
                        warm_avg_buy_price = 0.0
                    elif rsi >= sell_thresh:
                        print(f"[{timestamp_str}] [WARM-UP] SELL SIGNAL (RSI Overbought) | Price: Rs. {bar_price:.2f} | RSI: {rsi}", flush=True)
                        warm_held_qty = 0
                        warm_avg_buy_price = 0.0
                # Evaluate Buy
                else:
                    if rsi <= buy_thresh:
                        print(f"[{timestamp_str}] [WARM-UP] BUY SIGNAL (RSI Oversold) | Price: Rs. {bar_price:.2f} | RSI: {rsi}", flush=True)
                        warm_held_qty = 100 
                        warm_avg_buy_price = bar_price
            
            logger.info("Warm-up backfill completed.")
        else:
            logger.info("No completed bars for today yet. Skipping warm-up backfill.")
    else:
        logger.warning("Could not download history for warm-up.")
        
    print("\n" + "="*60, flush=True)
    print("--- WARM-UP COMPLETED: STARTING LIVE TICK POLING ---", flush=True)
    print("="*60 + "\n", flush=True)
    
    # Track supervisor runs (every 10 minutes)
    last_supervisor_time = time.time()
    SUPERVISOR_INTERVAL_SEC = 600.0  # 10 minutes
    
    tick_count = 0
    
    # Start polling loop
    while True:
        try:
            # Check market hours (NSE/BSE open Monday to Friday, 9:15 AM to 3:30 PM IST)
            import datetime
            now_ist = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
            is_weekend = now_ist.weekday() >= 5
            is_out_of_hours = now_ist.time() < datetime.time(9, 15) or now_ist.time() > datetime.time(15, 30)
            
            # Download live data
            df = yf.download(TICKER, period="2d", interval="1m", progress=False)
            if df.empty:
                logger.warning(f"No market data returned for {TICKER}. Retrying in {interval_sec}s...")
                time.sleep(interval_sec)
                continue
                
            # Clean MultiIndex columns
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
                
            # Sort by datetime and drop NaNs
            df = df.sort_index().dropna(subset=["Close", "Volume"])
            if df.empty:
                logger.warning(f"Market data after cleaning is empty. Retrying in {interval_sec}s...")
                time.sleep(interval_sec)
                continue
                
            current_bar = df.iloc[-1]
            curr_price = float(current_bar["Close"])
            curr_volume = int(current_bar["Volume"])
            
            tick_count += 1
            timestamp_str = now_ist.strftime('%H:%M:%S')
            
            # Fetch price history to calculate indicators
            price_history = df["Close"].tolist()
            sma20, sma50, rsi = calculate_rolling_indicators(price_history)
            trend = "UPTREND" if curr_price > sma50 else "DOWNTREND"
            
            # Log state
            market_hours_status = "CLOSED/WEEKEND" if (is_weekend or is_out_of_hours) else "OPEN"
            print(f"[{timestamp_str}] Live Tick {tick_count} (Market: {market_hours_status}) | Price: Rs. {curr_price:.2f} | RSI: {rsi} | Trend: {trend} | Bias: {strategy_config['bias'].upper()}", flush=True)
            
            # Retrieve threshold config
            buy_thresh = strategy_config["rsi_buy_threshold"]
            sell_thresh = strategy_config["rsi_sell_threshold"]
            stop_loss_pct = strategy_config["stop_loss_pct"]
            current_time = time.time()
            
            # Fetch portfolio update every 15 ticks or immediately after a trade to reduce backend API traffic
            if tick_count == 1 or tick_count % 15 == 0 or (current_time - last_trade_time < 5.0):
                cash, holdings = fetch_portfolio()
                
            fetched_held_qty = 0
            fetched_avg_buy_price = 0.0
            for h in holdings:
                h_sym = h.get("symbol", "").replace(".NS", "").replace(".BO", "").strip().upper()
                if h_sym == SYMBOL:
                    fetched_held_qty = int(h.get("quantity", 0))
                    fetched_avg_buy_price = float(h.get("avgPrice", 0.0))
                    break
                    
            # Sync logic with cooldown of 15 seconds to allow backend DB transactions to settle
            if local_held_qty is None or (current_time - last_trade_time > 15.0):
                local_held_qty = fetched_held_qty
                local_avg_buy_price = fetched_avg_buy_price
                
            held_qty = local_held_qty
            avg_buy_price = local_avg_buy_price
            
            # 1. Evaluate Stop Loss (Always active if we hold stock)
            unrealized_pnl_pct = 0.0
            if held_qty > 0:
                unrealized_pnl_pct = (curr_price - avg_buy_price) / avg_buy_price if avg_buy_price > 0 else 0.0
                
            if held_qty > 0 and unrealized_pnl_pct <= -stop_loss_pct:
                logger.warning(f"[STRATEGY] [WARNING] Triggering STOP LOSS for {SYMBOL}! Held qty: {held_qty} @ average price {avg_buy_price:.2f} (Current Price: {curr_price:.2f}, PnL: {unrealized_pnl_pct*100:.2f}%)")
                success, details = execute_sell(TICKER, held_qty, curr_price)
                if success:
                    last_trade_time = current_time
                    last_sell_time = current_time
                    local_held_qty = 0
                    local_avg_buy_price = 0.0
                    trade_log.append(f"SELL (Stop Loss) {held_qty} shares @ {curr_price:.2f}")
                    tx = {
                        "timestamp": timestamp_str,
                        "symbol": SYMBOL,
                        "action": "SELL",
                        "quantity": held_qty,
                        "price": curr_price,
                        "total_value": held_qty * curr_price,
                        "type": "Stop Loss",
                        "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                    executed_transactions.append(tx)
                    save_live_transaction(tx)
            
            # 2. Evaluate RSI Overbought scaling sell (cooldown of 60 seconds)
            elif held_qty > 0 and rsi >= sell_thresh:
                if current_time - last_sell_time > 60.0:
                    sell_fraction = strategy_config.get("sell_fraction", 0.5)
                    sell_qty = int(held_qty * sell_fraction)
                    if sell_qty > 0:
                        logger.info(f"[STRATEGY] RSI {rsi} exceeds sell threshold {sell_thresh}! Scaling out: Selling {sell_qty} shares ({sell_fraction*100:.1f}%).")
                        success, details = execute_sell(TICKER, sell_qty, curr_price)
                        if success:
                            last_trade_time = current_time
                            last_sell_time = current_time
                            local_held_qty = held_qty - sell_qty
                            local_avg_buy_price = avg_buy_price if local_held_qty > 0 else 0.0
                            trade_log.append(f"SELL (RSI Overbought) {sell_qty} shares @ {curr_price:.2f}")
                            tx = {
                                "timestamp": timestamp_str,
                                "symbol": SYMBOL,
                                "action": "SELL",
                                "quantity": sell_qty,
                                "price": curr_price,
                                "total_value": sell_qty * curr_price,
                                "type": f"RSI Overbought (Fraction: {sell_fraction:.2f})",
                                "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                            }
                            executed_transactions.append(tx)
                            save_live_transaction(tx)
                            
            # 3. Evaluate RSI Oversold scaling buy (cooldown of 60 seconds)
            elif rsi <= buy_thresh:
                if current_time - last_buy_time > 60.0:
                    buy_fraction = strategy_config.get("buy_fraction", 0.5)
                    max_alloc = cash * ALLOCATION_PCT * buy_fraction
                    buy_qty = int(max_alloc // curr_price)
                    if buy_qty > 0:
                        logger.info(f"[STRATEGY] RSI {rsi} below buy threshold {buy_thresh}! Scaling in: Buying {buy_qty} shares ({buy_fraction*100:.1f}%).")
                        success, details = execute_buy(TICKER, buy_qty, curr_price)
                        if success:
                            last_trade_time = current_time
                            last_buy_time = current_time
                            new_qty = held_qty + buy_qty
                            new_avg_price = ((held_qty * avg_buy_price) + (buy_qty * curr_price)) / new_qty
                            local_held_qty = new_qty
                            local_avg_buy_price = new_avg_price
                            trade_log.append(f"BUY {buy_qty} shares @ {curr_price:.2f}")
                            tx = {
                                "timestamp": timestamp_str,
                                "symbol": SYMBOL,
                                "action": "BUY",
                                "quantity": buy_qty,
                                "price": curr_price,
                                "total_value": buy_qty * curr_price,
                                "type": f"RSI Oversold (Fraction: {buy_fraction:.2f})",
                                "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                            }
                            executed_transactions.append(tx)
                            save_live_transaction(tx)
                    else:
                        logger.warning(f"[STRATEGY] [WARNING] RSI {rsi} is oversold but cash allocation (Rs. {max_alloc:.2f}) is too low to buy a share (Price: Rs. {curr_price:.2f})")
                        
            # 3. Periodically run the CrewAI Strategy Supervisor asynchronously in the background (every 10 mins)
            current_time = time.time()
            if current_time - last_supervisor_time >= SUPERVISOR_INTERVAL_SEC:
                if not supervisor_running:
                    supervisor_running = True
                    last_supervisor_time = current_time
                    print("\n" + "-"*50, flush=True)
                    print("--- LAUNCHING CREWAI STRATEGY SUPERVISOR IN BACKGROUND ---", flush=True)
                    print("-"*50, flush=True)
                    
                    # Collect last 10 minutes of bars for supervisor context
                    recent_bars = df.iloc[-10:]
                    market_context_list = []
                    for t, r in recent_bars.iterrows():
                        t_ist = t.tz_convert("Asia/Kolkata") if t.tz is not None else t
                        market_context_list.append(f"  - {t_ist.strftime('%H:%M:%S')}: Price {r['Close']:.2f}, Volume {int(r['Volume'])}")
                    market_context_str = "\n".join(market_context_list)
                    
                    cash, holdings = fetch_portfolio()
                    performance_context_str = f"Available Cash: Rs. {cash:.2f}\n"
                    performance_context_str += f"Current Holdings count: {len(holdings)}\n"
                    performance_context_str += "Recent Live Trades Log:\n"
                    if trade_log:
                        for log_item in trade_log[-5:]:
                            performance_context_str += f"  - {log_item}\n"
                    else:
                        performance_context_str += "  - No trades executed in this run yet.\n"
                    
                    # Spawn background thread
                    t = threading.Thread(
                        target=run_supervisor_async,
                        args=(market_context_str, performance_context_str),
                        daemon=True
                    )
                    t.start()
                else:
                    logger.info("[SUPERVISOR] Previous optimization task is still running in background, skipping trigger.")

                
        except KeyboardInterrupt:
            print("\nExiting live trading loop cleanly on user request.", flush=True)
            break
        except Exception as e:
            logger.error(f"Error in live trading loop: {str(e)}")
            
        time.sleep(interval_sec)
        
    print("\n" + "="*60, flush=True)
    print("=== LIVE TRADING STOPPED ===", flush=True)
    cash, holdings = fetch_portfolio()
    final_holdings_value = 0.0
    for h in holdings:
        h_qty = float(h.get("quantity", 0))
        h_sym = h.get("symbol", "").replace(".NS", "").replace(".BO", "").strip().upper()
        if h_sym == SYMBOL:
            price = curr_price if 'curr_price' in locals() else float(h.get("currentPrice", 0.0))
        else:
            price = float(h.get("currentPrice", 0.0))
        final_holdings_value += h_qty * price
        
    final_total_value = cash + final_holdings_value
    total_pnl = final_total_value - initial_total_value
    pnl_pct = (total_pnl / initial_total_value) * 100 if initial_total_value > 0 else 0.0
    
    print(f"Initial Portfolio Value: Rs. {initial_total_value:.2f} (Cash: Rs. {initial_cash:.2f}, Holdings: Rs. {initial_holdings_value:.2f})", flush=True)
    print(f"Final Portfolio Value:   Rs. {final_total_value:.2f} (Cash: Rs. {cash:.2f}, Holdings: Rs. {final_holdings_value:.2f})", flush=True)
    print(f"Total PnL:               Rs. {total_pnl:+.2f} ({pnl_pct:+.3f}%)", flush=True)
    print(f"Trades executed in this run: {len(trade_log)}", flush=True)
    print("="*60 + "\n", flush=True)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Simulated/Live Intraday Streaming Trader")
    parser.add_argument("--symbol", type=str, default="EMUDHRA", help="Stock symbol or ticker (e.g. EMUDHRA or EMUDHRA.NS) (default: EMUDHRA)")
    parser.add_argument("--bars", type=int, default=375, help="Maximum number of bars to simulate (default: 375)")
    parser.add_argument("--interval", type=float, default=5.0, help="Delay between bars/polling interval in seconds (default: 5.0)")
    parser.add_argument("--live", action="store_true", help="Run in live market mode instead of simulation")
    parser.add_argument("--sensitivity", type=str, choices=["conservative", "moderate", "aggressive"], default="moderate",
                        help="Trading sensitivity profile: conservative, moderate, or aggressive (default: moderate)")
    args = parser.parse_args()
    
    # Dynamically update the global symbol and ticker based on the CLI argument
    raw_symbol = args.symbol.upper()
    TICKER = raw_symbol if (raw_symbol.endswith(".NS") or raw_symbol.endswith(".BO")) else f"{raw_symbol}.NS"
    SYMBOL = TICKER.replace(".NS", "").replace(".BO", "")
    
    # Configure trading sensitivity profile settings
    SENSITIVITY_PROFILES = {
        "conservative": {
            "rsi_buy_threshold": 25,
            "rsi_sell_threshold": 65,
            "stop_loss_pct": 0.01,
            "allocation_pct": 0.05
        },
        "moderate": {
            "rsi_buy_threshold": 30,
            "rsi_sell_threshold": 70,
            "stop_loss_pct": 0.02,
            "allocation_pct": 0.10
        },
        "aggressive": {
            "rsi_buy_threshold": 35,
            "rsi_sell_threshold": 75,
            "stop_loss_pct": 0.03,
            "allocation_pct": 0.20
        }
    }
    
    # Load configuration: check symbol-specific config first, fallback to general config
    symbol_config_file = f"config_{SYMBOL}.json"
    loaded_config_file = None
    for path in [symbol_config_file, "config.json"]:
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    strategy_config.update(json.load(f))
                    loaded_config_file = path
                    break
            except Exception as e:
                logger.warning(f"Could not load strategy config from {path}: {str(e)}")
                
    import sys
    has_sensitivity_arg = any(arg.startswith("--sensitivity") for arg in sys.argv)
    
    if has_sensitivity_arg or not loaded_config_file:
        SENSITIVITY_PROFILE_NAME = args.sensitivity
        profile = SENSITIVITY_PROFILES[SENSITIVITY_PROFILE_NAME]
        strategy_config.update({
            "rsi_buy_threshold": profile["rsi_buy_threshold"],
            "rsi_sell_threshold": profile["rsi_sell_threshold"],
            "stop_loss_pct": profile["stop_loss_pct"]
        })
        ALLOCATION_PCT = profile["allocation_pct"]
        logger.info(f"Using default sensitivity profile '{SENSITIVITY_PROFILE_NAME.upper()}' overrides")
    else:
        logger.info(f"Successfully loaded configuration from {loaded_config_file}")
        # Inferred from loaded config values
        if strategy_config["rsi_buy_threshold"] <= 25:
            SENSITIVITY_PROFILE_NAME = "conservative"
            ALLOCATION_PCT = 0.05
        elif strategy_config["rsi_buy_threshold"] >= 35:
            SENSITIVITY_PROFILE_NAME = "aggressive"
            ALLOCATION_PCT = 0.20
        else:
            SENSITIVITY_PROFILE_NAME = "moderate"
            ALLOCATION_PCT = 0.10
            
    logger.info(f"Active trading configuration | Profile: {SENSITIVITY_PROFILE_NAME.upper()} | Buy Thresh: {strategy_config['rsi_buy_threshold']} | Sell Thresh: {strategy_config['rsi_sell_threshold']} | SL: {strategy_config['stop_loss_pct']*100:.1f}% | Cash Allocation: {ALLOCATION_PCT*100:.1f}%")
    
    if args.live:
        run_live_trading(interval_sec=args.interval)
    else:
        run_simulation(max_bars=args.bars, interval_sec=args.interval)

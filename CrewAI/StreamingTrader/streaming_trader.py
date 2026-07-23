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
import websocket
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
ALLOCATION_PCT = 1.0  # Default allocation: 100%
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
    "take_profit_pct": 0.008,        # Auto-exit at +0.8% gain (aggressive scalp target)
    "trailing_stop_pct": 0.003,      # Trailing stop activates after entry (0.3%)
    "min_signal_score": 2,
    "bias": "neutral",
    "buy_fraction": 1.0,
    "sell_fraction": 1.0,
    "cooldown_sec": 0.0
}

last_config_mtime = 0.0

def reload_config_if_changed():
    global strategy_config, last_config_mtime
    config_file = "config.json"
    if os.path.exists(config_file):
        try:
            mtime = os.path.getmtime(config_file)
            if mtime > last_config_mtime:
                with open(config_file, "r") as f:
                    new_config = json.load(f)
                    strategy_config.update(new_config)
                last_config_mtime = mtime
                logger.info(f"[CONFIG] Dynamically reloaded updated parameters from config.json: {strategy_config}")
        except Exception as e:
            pass

def get_rolling_rsi_percentiles(price_history, period=14, window=None):
    if window is None:
        window = int(strategy_config.get("rsi_window", 20))
    closes = np.array(price_history, dtype=float)
    if len(closes) < period + 2:
        return 45, 55
        
    rsis = []
    start_idx = max(0, len(closes) - window - period - 1)
    for i in range(start_idx + period, len(closes)):
        delta = np.diff(closes[i - period: i + 1])
        gain = np.mean(delta[delta > 0]) if any(delta > 0) else 1e-9
        loss = np.mean(-delta[delta < 0]) if any(delta < 0) else 1e-9
        rsis.append(100 - (100 / (1 + gain / loss)))
        
    if not rsis:
        return 45, 55
    rsi_40 = int(np.percentile(rsis, 40))
    rsi_60 = int(np.percentile(rsis, 60))
    # Clamp to reasonable ranges to avoid extreme values
    rsi_40 = max(25, min(rsi_40, 58))
    rsi_60 = max(35, min(rsi_60, 75))
    
    # Ensure minimum gap of 4 points between thresholds
    if rsi_60 - rsi_40 < 4:
        rsi_60 = rsi_40 + 4
        
    return rsi_40, rsi_60

def save_config_if_changed():
    global strategy_config, last_config_mtime
    config_file = "config.json"
    try:
        if os.path.exists(config_file):
            with open(config_file, "r") as f:
                disk_config = json.load(f)
            changed = False
            for k, v in strategy_config.items():
                if disk_config.get(k) != v:
                    changed = True
                    break
            if changed:
                with open(config_file, "w") as f:
                    json.dump(strategy_config, f, indent=4)
                last_config_mtime = os.path.getmtime(config_file)
        else:
            with open(config_file, "w") as f:
                json.dump(strategy_config, f, indent=4)
            last_config_mtime = os.path.getmtime(config_file)
    except Exception as e:
        pass


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
            
            config_file = "config.json"
            with open(config_file, "w") as f:
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

def auto_generate_config(symbol: str, ticker: str) -> dict:
    """
    Analyze 60 days of daily history + 5 days of intraday data to auto-compute
    optimal trading parameters for a specific stock.
    Returns a config dict and saves it to config_{SYMBOL}.json.
    """
    print("\n" + "="*60)
    print(f"[AUTO-CONFIG] Analyzing historical data for {symbol} ...")
    print("="*60)

    try:
        # --- Download 60 days of daily OHLCV data ---
        df_daily = yf.download(ticker, period="60d", interval="1d", progress=False)
        if df_daily.empty:
            raise ValueError("Could not download 60d daily data")
        if isinstance(df_daily.columns, pd.MultiIndex):
            df_daily.columns = df_daily.columns.get_level_values(0)

        closes_d = df_daily["Close"].values.astype(float)
        highs_d  = df_daily["High"].values.astype(float)
        lows_d   = df_daily["Low"].values.astype(float)
        n_d = len(closes_d)

        # --- Daily RSI-14 series ---
        def rsi_series(closes, period=14):
            rsis = []
            for i in range(period, len(closes)):
                delta = np.diff(closes[i - period: i + 1])
                gain = np.mean(delta[delta > 0]) if any(delta > 0) else 1e-9
                loss = np.mean(-delta[delta < 0]) if any(delta < 0) else 1e-9
                rsis.append(100 - (100 / (1 + gain / loss)))
            return np.array(rsis)

        daily_rsi = rsi_series(closes_d)

        # RSI thresholds from historical distribution (40th and 60th percentile for high-frequency trades)
        rsi_buy  = int(np.percentile(daily_rsi, 40)) if len(daily_rsi) > 0 else 45
        rsi_sell = int(np.percentile(daily_rsi, 60)) if len(daily_rsi) > 0 else 55
        # Clamp to narrow high-frequency trading ranges close to median
        rsi_buy  = max(40, min(rsi_buy,  55))
        rsi_sell = max(50, min(rsi_sell, 65))

        # --- Intraday-focused parameters computed from 5-day 1-minute data ---
        stop_loss_pct = 0.008  # Default 0.8% fallback
        
        # --- Trend bias: SMA20 vs SMA50 on daily closes ---
        sma20_d = float(np.mean(closes_d[-20:])) if n_d >= 20 else float(closes_d[-1])
        sma50_d = float(np.mean(closes_d[-50:])) if n_d >= 50 else sma20_d
        last_close_d = float(closes_d[-1])

        # Bullish: SMA20 > SMA50 AND price above SMA20 (trend + momentum)
        if sma20_d > sma50_d and last_close_d > sma20_d:
            bias = "bullish"
        elif sma20_d < sma50_d and last_close_d < sma20_d:
            bias = "bearish"
        else:
            bias = "neutral"

        try:
            df_intra = yf.download(ticker, period="5d", interval="1m", progress=False)
            if not df_intra.empty:
                if isinstance(df_intra.columns, pd.MultiIndex):
                    df_intra.columns = df_intra.columns.get_level_values(0)
                intra_closes = df_intra["Close"].values.astype(float)
                
                # 1. Volatility-based Stop Loss: standard deviation of 15-minute price returns
                returns_15m = np.diff(intra_closes[::15]) / intra_closes[::15][:-1]
                if len(returns_15m) > 0:
                    vol_15m = np.std(returns_15m)
                    # 3.0x standard deviation allows normal breathing room, capped at 1.8%
                    stop_loss_pct = round(max(0.004, min(vol_15m * 3.0, 0.018)), 4)
                
                # 2. Intraday RSI distribution percentiles for High Frequency
                intra_rsi = rsi_series(intra_closes, period=14)
                if len(intra_rsi) > 0:
                    rsi_buy = int(np.percentile(intra_rsi, 40))
                    rsi_sell = int(np.percentile(intra_rsi, 60))
                    # Clamp to narrow high-frequency trading ranges for 1-minute chart
                    rsi_buy  = max(42, min(rsi_buy,  55))
                    rsi_sell = max(50, min(rsi_sell, 65))
        except Exception as ex:
            logger.warning(f"Could not compute intraday metrics: {str(ex)}. Falling back to daily metrics.")
            # Fallback based on daily ATR %
            if n_d >= 15:
                tr_list = []
                for i in range(1, min(15, n_d)):
                    tr = max(highs_d[-i] - lows_d[-i],
                             abs(highs_d[-i] - closes_d[-i-1]),
                             abs(lows_d[-i]  - closes_d[-i-1]))
                    tr_list.append(tr)
                atr = float(np.mean(tr_list))
                last_close = float(closes_d[-1])
                atr_pct = atr / last_close
                stop_loss_pct = round(max(0.005, min(atr_pct * 0.5, 0.02)), 4)
            else:
                stop_loss_pct = 0.01

        # --- Build final config ---
        config = {
            "rsi_buy_threshold":  rsi_buy,
            "rsi_sell_threshold": rsi_sell,
            "stop_loss_pct":      stop_loss_pct,
            "bias":               bias,
            "buy_fraction":       1.0,
            "sell_fraction":      1.0,
            "min_signal_score":   2,
            "pause_ai":           False,
            "cooldown_sec":       0.0
        }

        # --- Print analysis report ---
        trend_label = "UPTREND" if sma20_d > sma50_d else "DOWNTREND"
        print(f"  Symbol              : {symbol}")
        print(f"  Daily bars analyzed : {n_d} days")
        print(f"  60D Trend (SMA)     : {trend_label} (SMA20={sma20_d:.2f}, SMA50={sma50_d:.2f})")
        print(f"  Last Close          : Rs. {last_close_d:.2f}")
        print(f"  RSI 40th pct (Buy)  : {rsi_buy}  (frequent buy zone)")
        print(f"  RSI 60th pct (Sell) : {rsi_sell}  (frequent sell zone)")
        print(f"  ATR-based Stop Loss : {stop_loss_pct*100:.2f}%")
        print(f"  Tactical Bias       : {bias.upper()}")
        print("="*60 + "\n")

        # --- Save to config.json ---
        config_path = "config.json"
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4)
        print(f"[AUTO-CONFIG] Saved computed config to {config_path}")

        return config

    except Exception as e:
        logger.error(f"[AUTO-CONFIG] Failed to analyze {symbol}: {str(e)}. Using defaults.")
        return {}


def calculate_rolling_indicators(price_history, volume_history=None):
    """Compute SMA20, SMA50, RSI-14, MACD, Bollinger Bands, and avg volume."""
    closes = np.array(price_history, dtype=float)
    n = len(closes)
    if n < 1:
        return 0.0, 0.0, 50.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0

    sma20 = float(np.mean(closes[-20:])) if n >= 20 else float(closes[-1])
    sma50 = float(np.mean(closes[-50:])) if n >= 50 else sma20

    # RSI-14
    rsi = 50.0
    if n >= 15:
        delta = np.diff(closes[-15:])
        gain = np.mean(delta[delta > 0]) if any(delta > 0) else 1e-9
        loss = np.mean(-delta[delta < 0]) if any(delta < 0) else 1e-9
        rsi = float(100 - (100 / (1 + gain / loss)))

    # MACD (EMA12 - EMA26, Signal = EMA9 of MACD)
    def ema(arr, period):
        if len(arr) < period:
            return float(np.mean(arr))
        k = 2 / (period + 1)
        result = float(np.mean(arr[:period]))
        for price in arr[period:]:
            result = price * k + result * (1 - k)
        return result

    macd_line = 0.0
    signal_line = 0.0
    macd_histogram = 0.0
    if n >= 26:
        ema12 = ema(closes, 12)
        ema26 = ema(closes, 26)
        macd_line = ema12 - ema26
        # For signal, compute MACD series over last 35 bars then take EMA9
        if n >= 35:
            macd_series = []
            for i in range(n - 35, n):
                e12 = ema(closes[:i+1], 12)
                e26 = ema(closes[:i+1], 26)
                macd_series.append(e12 - e26)
            signal_line = ema(np.array(macd_series), 9)
        else:
            signal_line = macd_line
        macd_histogram = macd_line - signal_line

    # Bollinger Bands (20-period, 2 std)
    bb_upper, bb_lower, bb_mid = sma20, sma20, sma20
    if n >= 20:
        std20 = float(np.std(closes[-20:]))
        bb_upper = sma20 + 2 * std20
        bb_lower = sma20 - 2 * std20
        bb_mid = sma20

    # Average volume (20-bar)
    avg_volume_ratio = 1.0
    if volume_history and len(volume_history) >= 20:
        vols = np.array(volume_history[-20:], dtype=float)
        avg_vol = float(np.mean(vols[:-1])) if len(vols) > 1 else float(vols[-1])
        curr_vol = float(vols[-1])
        avg_volume_ratio = (curr_vol / avg_vol) if avg_vol > 0 else 1.0

    return (round(sma20, 2), round(sma50, 2), round(rsi, 2),
            round(macd_line, 4), round(signal_line, 4), round(macd_histogram, 4),
            round(bb_upper, 2), round(bb_lower, 2), round(avg_volume_ratio, 2))


def calculate_momentum_score(price_history, rsi, macd_histogram, bb_upper, bb_lower,
                              curr_price, vol_ratio, buy_thresh, sell_thresh):
    """
    Compute a fast 0-6 momentum score for aggressive entry/exit decisions.
    Each condition contributes 1 point regardless of trend direction.
    BUY score: high = strong buy. SELL score: high = strong sell.
    Returns (buy_score, sell_score, signals_list)
    """
    buy_signals = []
    sell_signals = []

    # 1. RSI position
    if rsi <= buy_thresh:
        buy_signals.append(f"RSI-LOW:{rsi:.1f}")
    if rsi >= sell_thresh:
        sell_signals.append(f"RSI-HIGH:{rsi:.1f}")

    # 2. MACD histogram direction
    if macd_histogram > 0:
        buy_signals.append("MACD+")
    elif macd_histogram < 0:
        sell_signals.append("MACD-")

    # 3. Bollinger Band position
    if curr_price <= bb_lower:
        buy_signals.append("BB-LOWER")
    if curr_price >= bb_upper:
        sell_signals.append("BB-UPPER")

    # 4. Volume spike (high volume = conviction in either direction)
    if vol_ratio >= 1.5:
        buy_signals.append(f"VOL:{vol_ratio:.1f}x")
        sell_signals.append(f"VOL:{vol_ratio:.1f}x")

    # 5. Short-term price momentum (last 3 bars slope)
    if len(price_history) >= 4:
        recent = price_history[-4:]
        slope = (recent[-1] - recent[0]) / (recent[0] if recent[0] != 0 else 1)
        if slope > 0.0005:   # rising: favour sell (take profit)
            sell_signals.append(f"MOM+{slope*100:.2f}%")
        elif slope < -0.0005:  # falling: favour buy (mean reversion)
            buy_signals.append(f"MOM-{abs(slope)*100:.2f}%")

    # 6. Mid-BB bounce (price in lower half of BB = buy pressure)
    bb_mid = (bb_upper + bb_lower) / 2
    if bb_lower < curr_price < bb_mid:
        buy_signals.append("BB-MID-LOW")
    elif bb_mid < curr_price < bb_upper:
        sell_signals.append("BB-MID-HIGH")

    return len(buy_signals), len(sell_signals), buy_signals, sell_signals

def run_simulation(max_bars: int = 375, interval_sec: float = 60.0, no_supervisor: bool = False):
    global strategy_config, supervisor_running, backend_online, simulated_cash, simulated_holdings
    
    # Force simulation mode (no backend, 100k balance)
    backend_online = False
    simulated_cash = 100000.0
    simulated_holdings = []
    
    # Per-trade state for trailing stop
    peak_price_since_buy = 0.0
    
    # Initialize / clear transactions.json
    transactions_file = "transactions.json"
    try:
        with open(transactions_file, "w", encoding="utf-8") as f:
            json.dump([], f, indent=4, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to initialize transactions file: {str(e)}")
    
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
    volume_history = []
    prev_macd_hist = 0.0  # Track MACD histogram for crossover detection
    for timestamp, bar in stream_df.iterrows():
        reload_config_if_changed()
        bar_count += 1
        curr_price = float(bar["Close"])
        curr_volume = int(bar["Volume"])
        price_history.append(curr_price)
        volume_history.append(curr_volume)

        # Calculate all indicators
        (sma20, sma50, rsi,
         macd_line, signal_line, macd_histogram,
         bb_upper, bb_lower, vol_ratio) = calculate_rolling_indicators(price_history, volume_history)
        trend = "UPTREND" if curr_price > sma50 else "DOWNTREND"

        # Dynamic Bias Assignment — skipped entirely in always_buy (aggressive) mode
        bias_setting = strategy_config.get("bias", "dynamic").lower()
        if bias_setting not in ("always_buy",) and (bias_setting == "dynamic" or strategy_config.get("dynamic_bias", False)):
            sma_trend_bullish = sma20 > sma50
            if sma_trend_bullish and curr_price > sma20:
                strategy_config["bias"] = "bullish"
            elif not sma_trend_bullish and curr_price < sma20:
                strategy_config["bias"] = "bearish"
            else:
                strategy_config["bias"] = "neutral"

        # Detect MACD crossover direction
        macd_bull_cross = (prev_macd_hist <= 0 and macd_histogram > 0)  # crossed up
        macd_bear_cross = (prev_macd_hist >= 0 and macd_histogram < 0)  # crossed down
        prev_macd_hist = macd_histogram

        # BB signal flags
        bb_oversold  = curr_price <= bb_lower
        bb_overbought = curr_price >= bb_upper

        # Trend filter: SMA20 > SMA50 = uptrend aligned
        trend_bullish = sma20 > sma50

        # Signal indicator summary for display
        macd_str = f"MACD:{'(+)' if macd_histogram > 0 else '(-)'}{macd_histogram:+.3f}"
        bb_str   = f"BB:{'LOW' if bb_oversold else 'HIGH' if bb_overbought else 'MID'}"
        vol_str  = f"VOL:{vol_ratio:.1f}x"

        print(f"\n[{timestamp.strftime('%H:%M:%S')}] Bar {bar_count}/{max_bars} | "
              f"Price: Rs. {curr_price:.2f} | RSI: {rsi} | {macd_str} | {bb_str} | {vol_str} | "
              f"Trend: {trend} | Bias: {strategy_config['bias'].upper()}")

        # Dynamic RSI Update
        if strategy_config.get("dynamic_rsi", True):
            dyn_buy, dyn_sell = get_rolling_rsi_percentiles(price_history)
            offset = int(strategy_config.get("rsi_sell_offset", 4))
            dyn_sell = dyn_buy + offset
            strategy_config["rsi_buy_threshold"] = dyn_buy
            strategy_config["rsi_sell_threshold"] = dyn_sell
            save_config_if_changed()

        # Check Strategy Config
        buy_thresh  = strategy_config["rsi_buy_threshold"]
        sell_thresh = strategy_config["rsi_sell_threshold"]
        stop_loss_pct = strategy_config["stop_loss_pct"]
        min_score = int(strategy_config.get("min_signal_score", 2))
        bias = strategy_config.get("bias", "neutral").lower()
        # In ranging/neutral markets require stronger confirmation (3 signals) to avoid whipsaw
        if bias == "neutral":
            min_score = max(min_score, 3)

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
        is_last_bar = (bar_count == max_bars) or (bar_count == len(stream_df))

        # Pull per-bar config values
        take_profit_pct  = float(strategy_config.get("take_profit_pct",  0.008))
        trailing_stop_pct = float(strategy_config.get("trailing_stop_pct", 0.003))
        is_aggressive = (bias == "always_buy")

        # Compute momentum score (used in aggressive mode for signal confirmation)
        mom_buy_score, mom_sell_score, mom_buy_sigs, mom_sell_sigs = calculate_momentum_score(
            price_history, rsi, macd_histogram, bb_upper, bb_lower,
            curr_price, vol_ratio, buy_thresh, sell_thresh
        )

        # 1. Evaluate SELL (Take-Profit, Trailing-Stop, Stop-Loss, Multi-Signal, or End of Day)
        if held_qty > 0:
            # Track peak price for trailing stop
            if curr_price > peak_price_since_buy:
                peak_price_since_buy = curr_price

            unrealized_pnl_pct = (curr_price - avg_buy_price) / avg_buy_price if avg_buy_price > 0 else 0.0
            trailing_drawdown   = (peak_price_since_buy - curr_price) / peak_price_since_buy if peak_price_since_buy > 0 else 0.0

            if is_last_bar:
                unrealized_eod = unrealized_pnl_pct
                logger.info(f"[STRATEGY] Market Close Square-Off — Selling {held_qty} shares @ Rs. {curr_price:.2f} | PnL: {unrealized_eod*100:+.2f}%")
                success, details = execute_sell(TICKER, held_qty, curr_price)
                if success:
                    peak_price_since_buy = 0.0
                    trade_log.append(f"SELL (Square-off) {held_qty} shares @ {curr_price:.2f}")
                    tx = {
                        "timestamp": timestamp.strftime('%H:%M:%S'),
                        "symbol": SYMBOL,
                        "action": "SELL",
                        "quantity": held_qty,
                        "price": curr_price,
                        "total_value": held_qty * curr_price,
                        "type": f"Square-off ({unrealized_eod*100:+.2f}%)",
                        "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                    executed_transactions.append(tx)
                    save_simulated_transaction(tx)

            # --- Take-Profit: lock gains immediately at target ---
            elif unrealized_pnl_pct >= take_profit_pct:
                tp_pct = unrealized_pnl_pct * 100
                logger.info(f"[STRATEGY] TAKE-PROFIT locked at {tp_pct:.2f}% — Selling {held_qty} shares @ Rs. {curr_price:.2f}")
                success, details = execute_sell(TICKER, held_qty, curr_price)
                if success:
                    peak_price_since_buy = 0.0
                    trade_log.append(f"SELL (Take-Profit +{tp_pct:.2f}%) {held_qty} shares @ {curr_price:.2f}")
                    tx = {
                        "timestamp": timestamp.strftime('%H:%M:%S'),
                        "symbol": SYMBOL,
                        "action": "SELL",
                        "quantity": held_qty,
                        "price": curr_price,
                        "total_value": held_qty * curr_price,
                        "type": f"Take-Profit (+{tp_pct:.2f}%)",
                        "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                    executed_transactions.append(tx)
                    save_simulated_transaction(tx)
                    # --- Immediate re-entry in aggressive mode if momentum still bullish ---
                    if is_aggressive and mom_buy_score >= 1:
                        cash, _ = fetch_portfolio()
                        buy_fraction = strategy_config.get("buy_fraction", 1.0)
                        reentry_qty = int(cash * ALLOCATION_PCT * buy_fraction // curr_price)
                        if reentry_qty > 0:
                            logger.info(f"[STRATEGY] AGGRESSIVE RE-ENTRY after TP: Buying {reentry_qty} shares @ Rs. {curr_price:.2f}")
                            re_ok, re_det = execute_buy(TICKER, reentry_qty, curr_price)
                            if re_ok:
                                peak_price_since_buy = curr_price
                                trade_log.append(f"BUY (Re-entry after TP) {reentry_qty} shares @ {curr_price:.2f}")
                                re_tx = {
                                    "timestamp": timestamp.strftime('%H:%M:%S'),
                                    "symbol": SYMBOL,
                                    "action": "BUY",
                                    "quantity": reentry_qty,
                                    "price": curr_price,
                                    "total_value": reentry_qty * curr_price,
                                    "type": "Re-entry (Post Take-Profit)",
                                    "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                                }
                                executed_transactions.append(re_tx)
                                save_simulated_transaction(re_tx)

            # --- Trailing Stop: protects gains after peak ---
            elif unrealized_pnl_pct > 0 and trailing_drawdown >= trailing_stop_pct:
                ts_pnl = unrealized_pnl_pct * 100
                logger.warning(f"[STRATEGY] TRAILING-STOP hit (drew down {trailing_drawdown*100:.2f}% from peak Rs. {peak_price_since_buy:.2f}) — PnL: {ts_pnl:+.2f}% — Selling {held_qty} shares @ Rs. {curr_price:.2f}")
                success, details = execute_sell(TICKER, held_qty, curr_price)
                if success:
                    peak_price_since_buy = 0.0
                    trade_log.append(f"SELL (Trailing-Stop {ts_pnl:+.2f}%) {held_qty} shares @ {curr_price:.2f}")
                    tx = {
                        "timestamp": timestamp.strftime('%H:%M:%S'),
                        "symbol": SYMBOL,
                        "action": "SELL",
                        "quantity": held_qty,
                        "price": curr_price,
                        "total_value": held_qty * curr_price,
                        "type": f"Trailing-Stop ({ts_pnl:+.2f}%)",
                        "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                    executed_transactions.append(tx)
                    save_simulated_transaction(tx)

            # --- Hard Stop-Loss ---
            elif unrealized_pnl_pct <= -stop_loss_pct:
                logger.warning(f"[STRATEGY] STOP-LOSS triggered ({unrealized_pnl_pct*100:.2f}%) — selling {held_qty} shares @ Rs. {curr_price:.2f}")
                success, details = execute_sell(TICKER, held_qty, curr_price)
                if success:
                    peak_price_since_buy = 0.0
                    trade_log.append(f"SELL (Stop Loss) {held_qty} shares @ {curr_price:.2f}")
                    tx = {
                        "timestamp": timestamp.strftime('%H:%M:%S'),
                        "symbol": SYMBOL,
                        "action": "SELL",
                        "quantity": held_qty,
                        "price": curr_price,
                        "total_value": held_qty * curr_price,
                        "type": "Stop Loss",
                        "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                    executed_transactions.append(tx)
                    save_simulated_transaction(tx)
                    # --- Immediate re-entry in aggressive mode ---
                    if is_aggressive and mom_buy_score >= 1:
                        cash, _ = fetch_portfolio()
                        buy_fraction = strategy_config.get("buy_fraction", 1.0)
                        reentry_qty = int(cash * ALLOCATION_PCT * buy_fraction // curr_price)
                        if reentry_qty > 0:
                            logger.info(f"[STRATEGY] AGGRESSIVE RE-ENTRY after SL: Buying {reentry_qty} shares @ Rs. {curr_price:.2f}")
                            re_ok, re_det = execute_buy(TICKER, reentry_qty, curr_price)
                            if re_ok:
                                peak_price_since_buy = curr_price
                                trade_log.append(f"BUY (Re-entry after SL) {reentry_qty} shares @ {curr_price:.2f}")
                                re_tx = {
                                    "timestamp": timestamp.strftime('%H:%M:%S'),
                                    "symbol": SYMBOL,
                                    "action": "BUY",
                                    "quantity": reentry_qty,
                                    "price": curr_price,
                                    "total_value": reentry_qty * curr_price,
                                    "type": "Re-entry (Post Stop-Loss)",
                                    "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                                }
                                executed_transactions.append(re_tx)
                                save_simulated_transaction(re_tx)

            else:
                # --- Multi-signal SELL scoring (standard path) ---
                sell_signals = list(mom_sell_sigs) if is_aggressive else []
                if not is_aggressive:
                    if rsi >= sell_thresh:
                        sell_signals.append(f"RSI:{rsi}")
                    if macd_bear_cross:
                        sell_signals.append("MACD-BearCross")
                    if bb_overbought:
                        sell_signals.append("BB-Upper")
                    if not trend_bullish and macd_histogram < 0:
                        sell_signals.append("Trend-Down+MACD")

                sell_threshold = 1 if is_aggressive else min_score
                if len(sell_signals) >= sell_threshold:
                    sell_fraction = strategy_config.get("sell_fraction", 1.0)
                    sell_qty = int(held_qty * sell_fraction)
                    if sell_qty > 0:
                        reasons = ", ".join(sell_signals)
                        unrealized_pct = unrealized_pnl_pct * 100
                        logger.info(f"[STRATEGY] SELL SIGNAL [{len(sell_signals)}/{sell_threshold}] ({reasons}) — PnL: {unrealized_pct:+.2f}% — Selling {sell_qty} shares @ Rs. {curr_price:.2f}")
                        success, details = execute_sell(TICKER, sell_qty, curr_price)
                        if success:
                            if sell_qty == held_qty:
                                peak_price_since_buy = 0.0
                            trade_log.append(f"SELL (Multi-Signal: {reasons}) {sell_qty} shares @ {curr_price:.2f}")
                            tx = {
                                "timestamp": timestamp.strftime('%H:%M:%S'),
                                "symbol": SYMBOL,
                                "action": "SELL",
                                "quantity": sell_qty,
                                "price": curr_price,
                                "total_value": sell_qty * curr_price,
                                "type": f"Multi-Signal SELL ({reasons})",
                                "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                            }
                            executed_transactions.append(tx)
                            save_simulated_transaction(tx)

        # 2. Evaluate BUY
        #    - Standard mode: blocked when bearish
        #    - Aggressive mode (always_buy): NEVER blocked — trade in any market condition
        else:
            # Gate check: in standard mode, skip buy when bias is bearish
            buy_allowed = (bias == "always_buy") or (not is_last_bar and bias != "bearish")

            if buy_allowed and not is_last_bar:
                if is_aggressive:
                    # Aggressive: use momentum score — buy on ANY buy signal
                    buy_score_threshold = max(1, min_score - 1)
                    buy_signals = list(mom_buy_sigs)
                    # Also include classic crossover signals
                    if macd_bull_cross:
                        buy_signals.append("MACD-BullCross")
                    if bb_oversold:
                        buy_signals.append("BB-Lower")
                    if rsi <= buy_thresh:
                        buy_signals.append(f"RSI:{rsi:.1f}")
                else:
                    # Standard multi-signal BUY scoring
                    buy_score_threshold = min_score
                    buy_signals = []
                    if rsi <= buy_thresh:
                        buy_signals.append(f"RSI:{rsi}")
                    if macd_bull_cross:
                        buy_signals.append("MACD-BullCross")
                    if bb_oversold:
                        buy_signals.append("BB-Lower")
                    if vol_ratio >= 1.5:
                        buy_signals.append(f"VolSpike:{vol_ratio:.1f}x")
                    if trend_bullish:
                        buy_signals.append("Trend-Up")

                if len(buy_signals) >= buy_score_threshold:
                    buy_fraction = strategy_config.get("buy_fraction", 1.0)
                    max_alloc = cash * ALLOCATION_PCT * buy_fraction
                    buy_qty = int(max_alloc // curr_price)
                    if buy_qty > 0:
                        reasons = ", ".join(buy_signals)
                        logger.info(f"[STRATEGY] BUY SIGNAL [{len(buy_signals)}/{buy_score_threshold} score] ({reasons}) — Buying {buy_qty} shares @ Rs. {curr_price:.2f}")
                        success, details = execute_buy(TICKER, buy_qty, curr_price)
                        if success:
                            peak_price_since_buy = curr_price
                            trade_log.append(f"BUY (Multi-Signal: {reasons}) {buy_qty} shares @ {curr_price:.2f}")
                            tx = {
                                "timestamp": timestamp.strftime('%H:%M:%S'),
                                "symbol": SYMBOL,
                                "action": "BUY",
                                "quantity": buy_qty,
                                "price": curr_price,
                                "total_value": buy_qty * curr_price,
                                "type": f"Multi-Signal BUY ({reasons})",
                                "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                            }
                            executed_transactions.append(tx)
                            save_simulated_transaction(tx)
                    else:
                        logger.warning(f"[STRATEGY] Multi-signal BUY confirmed but cash (Rs. {max_alloc:.2f}) too low for price Rs. {curr_price:.2f}")

        # 3. Periodically run the CrewAI Strategy Supervisor asynchronously in the background
        skip_supervisor = no_supervisor or strategy_config.get("pause_ai", False) or strategy_config.get("disable_ai", False)
        if not skip_supervisor and bar_count % SUPERVISOR_INTERVAL_BARS == 0:
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
    transactions_file = "transactions.json"
    try:
        with open(transactions_file, "w", encoding="utf-8") as f:
            json.dump(executed_transactions, f, indent=4, ensure_ascii=False)
        logger.info(f"Saved simulated transactions report to {transactions_file}")
    except Exception as e:
        logger.error(f"Failed to save transactions file: {str(e)}")

def save_simulated_transaction(tx_item):
    transactions_file = "transactions.json"
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
        logger.error(f"Failed to save simulated transaction to file: {str(e)}")

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

def run_live_trading(interval_sec: float = 10.0, no_supervisor: bool = False):
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
                sma20, sma50, rsi = calculate_rolling_indicators(price_history)[:3]
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
    
    # Pre-fetch history to maintain 1m bars
    df = yf.download(TICKER, period="2d", interval="1m", progress=False)
    if not df.empty and isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    if not df.empty:
        df = df.sort_index().dropna(subset=["Close", "Volume"])
    
    current_minute = None
    if not df.empty:
        current_minute = df.index[-1].strftime("%Y-%m-%d %H:%M")

    # Connect to websocket
    try:
        ws = websocket.create_connection("ws://localhost:4141")
        ws.send(json.dumps({"action": "subscribe", "symbols": [SYMBOL]}))
        logger.info(f"Connected to WS 4141 for {SYMBOL} (yf ticker: {TICKER})")
    except Exception as e:
        logger.error(f"Websocket connection failed: {e}")
        return
    
    # Start polling loop
    last_eval_time = 0.0
    while True:
        try:
            reload_config_if_changed()
            # Check market hours (NSE/BSE open Monday to Friday, 9:15 AM to 3:30 PM IST)
            import datetime
            now_ist = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
            is_weekend = now_ist.weekday() >= 5
            is_out_of_hours = now_ist.time() < datetime.time(9, 15) or now_ist.time() > datetime.time(15, 30)
            
            # Receive live tick via websocket
            msg = ws.recv()
            data = json.loads(msg)
            if data.get("type") != "LIVE_TICK":
                continue
                
            curr_price = float(data["ltp"])
            curr_volume = 0  # WebSocket might not give tick volume, fallback to 0
            
            try:
                tick_time = pd.to_datetime(data["timestamp"])
                if tick_time.tzinfo is None:
                    tick_time = tick_time.tz_localize('UTC')
                tick_time = tick_time.tz_convert('Asia/Kolkata')
            except Exception:
                tick_time = now_ist
                
            minute_str = tick_time.strftime("%Y-%m-%d %H:%M")
            
            if current_minute == minute_str and not df.empty:
                # Update current minute's close price
                df.iloc[-1, df.columns.get_loc("Close")] = curr_price
            else:
                current_minute = minute_str
                # Create a new bar
                new_row = pd.DataFrame({"Close": [curr_price], "Volume": [0]}, index=[tick_time])
                df = pd.concat([df, new_row])
                
            current_bar = df.iloc[-1]
            curr_volume = int(current_bar.get("Volume", 0))
            
            tick_count += 1
            timestamp_str = now_ist.strftime('%H:%M:%S')
            
            # Fetch price history to calculate indicators
            price_history = df["Close"].tolist()
            sma20, sma50, rsi = calculate_rolling_indicators(price_history)[:3]
            trend = "UPTREND" if curr_price > sma50 else "DOWNTREND"
            
            # Dynamic Bias Assignment
            bias_setting = strategy_config.get("bias", "dynamic").lower()
            if bias_setting == "dynamic" or strategy_config.get("dynamic_bias", False):
                sma_trend_bullish = sma20 > sma50
                if sma_trend_bullish and curr_price > sma20:
                    strategy_config["bias"] = "bullish"
                elif not sma_trend_bullish and curr_price < sma20:
                    strategy_config["bias"] = "bearish"
                else:
                    strategy_config["bias"] = "neutral"
            
            # Dynamic RSI Update
            if strategy_config.get("dynamic_rsi", True):
                dyn_buy, dyn_sell = get_rolling_rsi_percentiles(price_history)
                offset = int(strategy_config.get("rsi_sell_offset", 4))
                dyn_sell = dyn_buy + offset
                strategy_config["rsi_buy_threshold"] = dyn_buy
                strategy_config["rsi_sell_threshold"] = dyn_sell
                save_config_if_changed()
            
            # Log state
            market_hours_status = "CLOSED/WEEKEND" if (is_weekend or is_out_of_hours) else "OPEN"
            print(f"[{timestamp_str}] Live Tick {tick_count} (Market: {market_hours_status}) | Price: Rs. {curr_price:.2f} | RSI: {rsi} | Trend: {trend} | Bias: {strategy_config['bias'].upper()}", flush=True)
            
            # Retrieve threshold config
            buy_thresh = strategy_config["rsi_buy_threshold"]
            sell_thresh = strategy_config["rsi_sell_threshold"]
            stop_loss_pct = strategy_config["stop_loss_pct"]
            cooldown_sec = float(strategy_config.get("cooldown_sec", 60.0))
            current_time = time.time()
            
            # Sync logic with cooldown of 15 seconds to allow backend DB transactions to settle
            if local_held_qty is None or (current_time - last_trade_time > 15.0):
                # Fetch fresh portfolio from backend to perform accurate sync
                cash, holdings = fetch_portfolio()
                
                fetched_held_qty = 0
                fetched_avg_buy_price = 0.0
                for h in holdings:
                    h_sym = h.get("symbol", "").replace(".NS", "").replace(".BO", "").strip().upper()
                    if h_sym == SYMBOL:
                        fetched_held_qty = int(h.get("quantity", 0))
                        fetched_avg_buy_price = float(h.get("avgPrice", 0.0))
                        break
                local_held_qty = fetched_held_qty
                local_avg_buy_price = fetched_avg_buy_price
            else:
                # Periodic updates / immediate post-trade updates
                if tick_count % 15 == 0 or (current_time - last_trade_time < 5.0):
                    cash, holdings = fetch_portfolio()
                
            held_qty = local_held_qty
            avg_buy_price = local_avg_buy_price
            
            # Resolve per-tick config values
            take_profit_pct   = float(strategy_config.get("take_profit_pct",  0.008))
            trailing_stop_pct = float(strategy_config.get("trailing_stop_pct", 0.003))
            current_bias      = strategy_config.get("bias", "neutral").lower()
            is_aggressive_live = (current_bias == "always_buy")

            # Compute momentum score for aggressive entries
            volume_history_live = df["Volume"].tolist()
            _, _ , _, indicators_full = calculate_rolling_indicators(price_history, volume_history_live), None, None, None
            full_inds = calculate_rolling_indicators(price_history, volume_history_live)
            sma20_l, sma50_l, rsi_l, macd_l, sig_l, macd_hist_l, bb_up_l, bb_dn_l, vr_l = full_inds
            mom_buy_score, mom_sell_score, mom_buy_sigs, mom_sell_sigs = calculate_momentum_score(
                price_history, rsi_l, macd_hist_l, bb_up_l, bb_dn_l,
                curr_price, vr_l, buy_thresh, sell_thresh
            )

            # Track peak for trailing stop
            if held_qty > 0:
                if not hasattr(run_live_trading, '_peak_price') or local_avg_buy_price != getattr(run_live_trading, '_last_avg', -1):
                    run_live_trading._peak_price = curr_price
                    run_live_trading._last_avg = local_avg_buy_price
                if curr_price > run_live_trading._peak_price:
                    run_live_trading._peak_price = curr_price
                live_peak = run_live_trading._peak_price
            else:
                run_live_trading._peak_price = 0.0
                run_live_trading._last_avg = 0.0
                live_peak = 0.0

            # 1. Evaluate Stop-Loss / Take-Profit / Trailing-Stop
            unrealized_pnl_pct = 0.0
            if held_qty > 0:
                unrealized_pnl_pct = (curr_price - avg_buy_price) / avg_buy_price if avg_buy_price > 0 else 0.0
            trailing_drawdown_live = (live_peak - curr_price) / live_peak if live_peak > 0 else 0.0

            def _do_live_sell(qty, sell_type, pnl_pct=None):
                """Helper: execute sell, log transaction, update local state."""
                success, details = execute_sell(TICKER, qty, curr_price)
                if success:
                    last_trade_time_val = current_time
                    pnl_str = f" ({pnl_pct*100:+.2f}%)" if pnl_pct is not None else ""
                    trade_log.append(f"SELL ({sell_type}{pnl_str}) {qty} shares @ {curr_price:.2f}")
                    tx = {
                        "timestamp": timestamp_str,
                        "symbol": SYMBOL,
                        "action": "SELL",
                        "quantity": qty,
                        "price": curr_price,
                        "total_value": qty * curr_price,
                        "type": f"{sell_type}{pnl_str}",
                        "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                    executed_transactions.append(tx)
                    save_live_transaction(tx)
                return success

            def _do_live_buy(qty, buy_type):
                """Helper: execute buy, log transaction, update local state."""
                success, details = execute_buy(TICKER, qty, curr_price)
                if success:
                    trade_log.append(f"BUY ({buy_type}) {qty} shares @ {curr_price:.2f}")
                    tx = {
                        "timestamp": timestamp_str,
                        "symbol": SYMBOL,
                        "action": "BUY",
                        "quantity": qty,
                        "price": curr_price,
                        "total_value": qty * curr_price,
                        "type": buy_type,
                        "datetime_real": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                    executed_transactions.append(tx)
                    save_live_transaction(tx)
                return success

            if held_qty > 0 and unrealized_pnl_pct >= take_profit_pct:
                # --- Take-Profit ---
                logger.info(f"[STRATEGY] LIVE TAKE-PROFIT at {unrealized_pnl_pct*100:.2f}% — Selling {held_qty} shares @ Rs. {curr_price:.2f}")
                if _do_live_sell(held_qty, "Take-Profit", unrealized_pnl_pct):
                    last_trade_time = current_time; last_sell_time = current_time
                    local_held_qty = 0; local_avg_buy_price = 0.0
                    run_live_trading._peak_price = 0.0
                    # Immediate re-entry in aggressive mode
                    if is_aggressive_live and mom_buy_score >= 1:
                        cash, _ = fetch_portfolio()
                        re_qty = int(cash * ALLOCATION_PCT * strategy_config.get("buy_fraction", 1.0) // curr_price)
                        if re_qty > 0:
                            logger.info(f"[STRATEGY] LIVE RE-ENTRY after TP: Buying {re_qty} shares @ Rs. {curr_price:.2f}")
                            if _do_live_buy(re_qty, "Re-entry Post-TP"):
                                last_buy_time = current_time; last_trade_time = current_time
                                local_held_qty = re_qty; local_avg_buy_price = curr_price
                                run_live_trading._peak_price = curr_price

            elif held_qty > 0 and unrealized_pnl_pct > 0 and trailing_drawdown_live >= trailing_stop_pct:
                # --- Trailing Stop ---
                logger.warning(f"[STRATEGY] LIVE TRAILING-STOP hit (drew down {trailing_drawdown_live*100:.2f}% from peak Rs. {live_peak:.2f})")
                if _do_live_sell(held_qty, "Trailing-Stop", unrealized_pnl_pct):
                    last_trade_time = current_time; last_sell_time = current_time
                    local_held_qty = 0; local_avg_buy_price = 0.0
                    run_live_trading._peak_price = 0.0

            elif held_qty > 0 and unrealized_pnl_pct <= -stop_loss_pct:
                # --- Hard Stop-Loss ---
                logger.warning(f"[STRATEGY] [WARNING] LIVE STOP-LOSS for {SYMBOL}! PnL: {unrealized_pnl_pct*100:.2f}%")
                if _do_live_sell(held_qty, "Stop Loss", unrealized_pnl_pct):
                    last_trade_time = current_time; last_sell_time = current_time
                    local_held_qty = 0; local_avg_buy_price = 0.0
                    run_live_trading._peak_price = 0.0
                    # Immediate re-entry in aggressive mode
                    if is_aggressive_live and mom_buy_score >= 1:
                        cash, _ = fetch_portfolio()
                        re_qty = int(cash * ALLOCATION_PCT * strategy_config.get("buy_fraction", 1.0) // curr_price)
                        if re_qty > 0:
                            logger.info(f"[STRATEGY] LIVE RE-ENTRY after SL: Buying {re_qty} shares @ Rs. {curr_price:.2f}")
                            if _do_live_buy(re_qty, "Re-entry Post-SL"):
                                last_buy_time = current_time; last_trade_time = current_time
                                local_held_qty = re_qty; local_avg_buy_price = curr_price
                                run_live_trading._peak_price = curr_price

            elif held_qty > 0:
                # --- Multi-signal / momentum SELL (no hard exit triggered) ---
                if current_time - last_sell_time > cooldown_sec:
                    if is_aggressive_live:
                        sell_signals = list(mom_sell_sigs)
                        sell_threshold = 1
                    else:
                        sell_signals = [f"RSI:{rsi}" if rsi >= sell_thresh else None]
                        sell_signals = [s for s in sell_signals if s]
                        sell_threshold = 1

                    # Only sell on signals if we are in profit (> 0.1%) to avoid 0-profit HFT churn
                    if len(sell_signals) >= sell_threshold and unrealized_pnl_pct > 0.001:
                        sell_fraction = strategy_config.get("sell_fraction", 1.0)
                        sell_qty = int(held_qty * sell_fraction)
                        if sell_qty > 0:
                            reasons = ", ".join(sell_signals)
                            logger.info(f"[STRATEGY] LIVE SELL ({reasons}) — PnL: {unrealized_pnl_pct*100:+.2f}% — Selling {sell_qty} shares @ Rs. {curr_price:.2f}")
                            if _do_live_sell(sell_qty, f"Signal-SELL ({reasons})", unrealized_pnl_pct):
                                last_trade_time = current_time; last_sell_time = current_time
                                local_held_qty = max(0, held_qty - sell_qty)
                                local_avg_buy_price = avg_buy_price if local_held_qty > 0 else 0.0

            # 2. Evaluate BUY
            #    - Standard: blocked when bearish
            #    - Aggressive (always_buy): trades in ANY market condition
            elif held_qty == 0:
                buy_allowed = (is_aggressive_live) or (current_bias != "bearish")
                if buy_allowed and current_time - last_buy_time > cooldown_sec:
                    if is_aggressive_live:
                        buy_signals = list(mom_buy_sigs)
                        buy_threshold = 1
                        if macd_hist_l > 0:
                            buy_signals.append("MACD+")
                        if rsi_l <= buy_thresh:
                            buy_signals.append(f"RSI:{rsi_l:.1f}")
                    else:
                        buy_signals = [f"RSI:{rsi}" if rsi <= buy_thresh else None]
                        buy_signals = [s for s in buy_signals if s]
                        buy_threshold = 1

                    if len(buy_signals) >= buy_threshold:
                        buy_fraction = strategy_config.get("buy_fraction", 1.0)
                        max_alloc = cash * ALLOCATION_PCT * buy_fraction
                        buy_qty = int(max_alloc // curr_price)
                        if buy_qty > 0:
                            reasons = ", ".join(buy_signals)
                            logger.info(f"[STRATEGY] LIVE BUY ({reasons}) — Buying {buy_qty} shares @ Rs. {curr_price:.2f}")
                            if _do_live_buy(buy_qty, f"Signal-BUY ({reasons})"):
                                last_trade_time = current_time; last_buy_time = current_time
                                local_held_qty = buy_qty; local_avg_buy_price = curr_price
                                run_live_trading._peak_price = curr_price
                        else:
                            logger.warning(f"[STRATEGY] [WARNING] BUY signal but cash (Rs. {max_alloc:.2f}) too low (Price: Rs. {curr_price:.2f})")
                        
            # 3. Periodically run the CrewAI Strategy Supervisor asynchronously in the background (every 10 mins)
            skip_supervisor = no_supervisor or strategy_config.get("pause_ai", False) or strategy_config.get("disable_ai", False)
            if not skip_supervisor and (current_time - last_supervisor_time >= SUPERVISOR_INTERVAL_SEC):
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
    parser.add_argument("--interval", type=float, default=None, help="Delay between bars/polling interval in seconds (default: 5.0 for live, 0.01 for simulation)")
    parser.add_argument("--live", action="store_true", help="Run in live market mode instead of simulation")
    parser.add_argument("--no-ai", action="store_true", help="Disable the CrewAI strategy supervisor optimization")
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
            "rsi_buy_threshold": 52,       # Near midpoint — fires on almost any dip
            "rsi_sell_threshold": 56,       # Tight gap: scalp micro-bounces
            "stop_loss_pct": 0.005,         # Tight 0.5% hard stop
            "take_profit_pct": 0.008,       # Lock gains at +0.8%
            "trailing_stop_pct": 0.003,     # 0.3% trailing stop to protect gains
            "min_signal_score": 1,          # Fire on any single momentum signal
            "bias": "always_buy",           # Never blocked by bearish/neutral gate
            "cooldown_sec": 0,              # No cooldown — maximum trade frequency
            "allocation_pct": 1.0           # Deploy full capital each trade
        }
    }
    
    # Load configuration from single global config.json
    config_file = "config.json"
    loaded_config_file = None
    auto_config_skipped = False

    # Check if manual lock is enabled in config.json
    if os.path.exists(config_file):
        try:
            with open(config_file, "r") as f:
                existing = json.load(f)
            if existing.get("pause_ai", False):
                strategy_config.update(existing)
                loaded_config_file = config_file
                auto_config_skipped = True
                logger.info(f"[AUTO-CONFIG] Manual lock detected (pause_ai=true) in {config_file}. Skipping auto-analysis.")
        except Exception as e:
            logger.warning(f"Could not read {config_file}: {str(e)}")

    if not auto_config_skipped:
        # Run historical analysis to auto-generate optimal config, which writes to config.json
        generated = auto_generate_config(SYMBOL, TICKER)
        if generated:
            strategy_config.update(generated)
            loaded_config_file = config_file
        else:
            # Fallback to load existing config.json
            if os.path.exists(config_file):
                try:
                    with open(config_file, "r") as f:
                        strategy_config.update(json.load(f))
                        loaded_config_file = config_file
                except Exception as e:
                    logger.warning(f"Could not load fallback strategy config from {config_file}: {str(e)}")
                
    import sys
    has_sensitivity_arg = any(arg.startswith("--sensitivity") for arg in sys.argv)
    
    if has_sensitivity_arg or not loaded_config_file:
        SENSITIVITY_PROFILE_NAME = args.sensitivity
        profile = SENSITIVITY_PROFILES[SENSITIVITY_PROFILE_NAME]
        # Apply ALL profile keys to strategy_config (includes take_profit_pct, trailing_stop_pct, bias, cooldown_sec etc.)
        for k, v in profile.items():
            if k != "allocation_pct":
                strategy_config[k] = v
        ALLOCATION_PCT = profile["allocation_pct"]
        logger.info(f"Using sensitivity profile '{SENSITIVITY_PROFILE_NAME.upper()}' overrides: {profile}")
    else:
        logger.info(f"Successfully loaded configuration from {loaded_config_file}")
        # Inferred from loaded config values
        if strategy_config["rsi_buy_threshold"] <= 25:
            SENSITIVITY_PROFILE_NAME = "conservative"
            ALLOCATION_PCT = 0.05
        elif strategy_config.get("bias", "neutral").lower() == "always_buy" or strategy_config["rsi_buy_threshold"] >= 45:
            SENSITIVITY_PROFILE_NAME = "aggressive"
            ALLOCATION_PCT = 1.0
        else:
            SENSITIVITY_PROFILE_NAME = "moderate"
            ALLOCATION_PCT = 0.10

            
    # Force cash allocation to always be 100% (1.0)
    ALLOCATION_PCT = 1.0
            
    logger.info(f"Active trading configuration | Profile: {SENSITIVITY_PROFILE_NAME.upper()} | Buy Thresh: {strategy_config['rsi_buy_threshold']} | Sell Thresh: {strategy_config['rsi_sell_threshold']} | SL: {strategy_config['stop_loss_pct']*100:.1f}% | Cash Allocation: {ALLOCATION_PCT*100:.1f}%")
    
    if args.live:
        interval_sec = args.interval if args.interval is not None else 5.0
        run_live_trading(interval_sec=interval_sec, no_supervisor=args.no_ai)
    else:
        interval_sec = args.interval if args.interval is not None else 0.01
        run_simulation(max_bars=args.bars, interval_sec=interval_sec, no_supervisor=args.no_ai)

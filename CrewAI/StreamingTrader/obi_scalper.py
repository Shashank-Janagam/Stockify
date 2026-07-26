import os
import sys
import json
import time
import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import requests
import logging
from dotenv import load_dotenv
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

load_dotenv()

latest_dashboard_state = {}

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OBI Scalper Dashboard</title>
    <style>
        body { margin: 0; font-family: 'Inter', sans-serif; background-color: #0f172a; color: #f8fafc; overflow: hidden; }
        .glass-panel { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        .container { max-width: 1000px; margin: 40px auto; display: flex; flex-direction: column; gap: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; }
        .title { font-size: 24px; font-weight: bold; color: #38bdf8; }
        .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
        .metric-card { text-align: center; }
        .metric-value { font-size: 28px; font-weight: bold; margin-top: 5px; }
        .metric-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
        
        .order-book-container { display: flex; gap: 30px; margin-top: 20px; }
        .order-book-side { flex: 1; }
        .order-book-header { font-size: 14px; font-weight: bold; margin-bottom: 15px; text-align: center; letter-spacing: 1px; }
        .bids-header { color: #4ade80; }
        .asks-header { color: #f87171; }
        .ob-row { display: flex; justify-content: space-between; padding: 8px 15px; margin-bottom: 5px; background: rgba(255,255,255,0.03); border-radius: 6px; font-family: monospace; font-size: 16px; }
        .ob-row.bid { color: #4ade80; border-left: 3px solid #4ade80; }
        .ob-row.ask { color: #f87171; border-right: 3px solid #f87171; }
        
        .imbalance-section { margin-top: 30px; }
        .imbalance-header { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 10px; }
        .imbalance-bar-container { height: 24px; background: #334155; border-radius: 12px; overflow: hidden; display: flex; }
        .imbalance-bid-bar { background: linear-gradient(90deg, transparent, #4ade80); transition: width 0.3s ease; }
        .imbalance-ask-bar { background: linear-gradient(270deg, transparent, #f87171); transition: width 0.3s ease; }
        .imbalance-center { width: 2px; background: #fff; height: 100%; z-index: 10; }
        
        .up { color: #4ade80; }
        .down { color: #f87171; }
        .flat { color: #fbbf24; }
    </style>
</head>
<body>
    <div class="container">
        <div class="glass-panel header">
            <div class="title">OBI Scalper Terminal</div>
            <div id="status" style="font-size: 14px; color: #94a3b8;">Connecting...</div>
        </div>
        
        <div class="glass-panel metrics-grid">
            <div class="metric-card">
                <div class="metric-label">Symbol</div>
                <div id="m-symbol" class="metric-value">--</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">LTP (Rs.)</div>
                <div id="m-price" class="metric-value">--</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Realized PnL</div>
                <div id="m-pnl" class="metric-value">--</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Cash (Rs.)</div>
                <div id="m-cash" class="metric-value">--</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Position</div>
                <div id="m-position" class="metric-value flat">FLAT</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Total Trades</div>
                <div id="m-trades" class="metric-value">0</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Tick Progress</div>
                <div id="m-progress" class="metric-value">--</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Imbalance Ratio</div>
                <div id="m-imbalance" class="metric-value">0.000</div>
            </div>
        </div>
        
        <div class="glass-panel imbalance-section">
            <div class="imbalance-header">
                <div class="down">SELL PRESSURE (Asks)</div>
                <div class="up">BUY PRESSURE (Bids)</div>
            </div>
            <div class="imbalance-bar-container" id="imb-container">
                <div class="imbalance-ask-bar" id="imb-ask" style="width: 50%;"></div>
                <div class="imbalance-bid-bar" id="imb-bid" style="width: 50%;"></div>
            </div>
        </div>
        
        <div class="order-book-container">
            <div class="glass-panel order-book-side">
                <div class="order-book-header bids-header">BIDS (Buyers)</div>
                <div class="ob-row"><span style="color:#94a3b8;font-size:12px;">Qty</span><span style="color:#94a3b8;font-size:12px;">Price (Rs.)</span></div>
                <div id="bids-list"></div>
            </div>
            
            <div class="glass-panel order-book-side">
                <div class="order-book-header asks-header">ASKS (Sellers)</div>
                <div class="ob-row"><span style="color:#94a3b8;font-size:12px;">Price (Rs.)</span><span style="color:#94a3b8;font-size:12px;">Qty</span></div>
                <div id="asks-list"></div>
            </div>
        </div>
    </div>

    <script>
        async function fetchState() {
            try {
                const res = await fetch('/state');
                const data = await res.json();
                
                if (data && data.symbol) {
                    document.getElementById('status').innerText = 'LIVE \u25CF';
                    document.getElementById('status').style.color = '#4ade80';
                    
                    document.getElementById('m-symbol').innerText = data.symbol;
                    document.getElementById('m-price').innerText = data.price.toFixed(2);
                    
                    const pnlEl = document.getElementById('m-pnl');
                    pnlEl.innerText = (data.pnl >= 0 ? '+' : '') + data.pnl.toFixed(2);
                    pnlEl.className = 'metric-value ' + (data.pnl >= 0 ? 'up' : 'down');
                    
                    document.getElementById('m-cash').innerText = data.cash.toFixed(2);
                    
                    const posEl = document.getElementById('m-position');
                    if (data.position) {
                        posEl.innerText = 'LONG (' + data.position.qty + ' @ ' + data.position.buy_price.toFixed(2) + ')';
                        posEl.className = 'metric-value up';
                    } else {
                        posEl.innerText = 'FLAT';
                        posEl.className = 'metric-value flat';
                    }
                    
                    document.getElementById('m-trades').innerText = data.trades_count;
                    document.getElementById('m-progress').innerText = data.tick_idx + ' / ' + data.total_ticks;
                    
                    const imbEl = document.getElementById('m-imbalance');
                    imbEl.innerText = (data.imbalance >= 0 ? '+' : '') + data.imbalance.toFixed(4);
                    imbEl.className = 'metric-value ' + (data.imbalance > 0.75 ? 'up' : (data.imbalance < -0.75 ? 'down' : 'flat'));
                    
                    // Imbalance Bar (Mapping -1 to 1 into percentages)
                    const bidPct = Math.max(0, Math.min(100, (data.imbalance + 1.0) / 2.0 * 100));
                    const askPct = 100 - bidPct;
                    document.getElementById('imb-ask').style.width = askPct + '%';
                    document.getElementById('imb-bid').style.width = bidPct + '%';
                    
                    // Order Book
                    let bidsHtml = '';
                    for(let i=0; i<5; i++) {
                        bidsHtml += '<div class="ob-row bid"><span>' + data.bid_depth.qty[i] + '</span><span>' + data.bid_depth.price[i].toFixed(2) + '</span></div>';
                    }
                    document.getElementById('bids-list').innerHTML = bidsHtml;
                    
                    let asksHtml = '';
                    for(let i=0; i<5; i++) {
                        asksHtml += '<div class="ob-row ask"><span>' + data.ask_depth.price[i].toFixed(2) + '</span><span>' + data.ask_depth.qty[i] + '</span></div>';
                    }
                    document.getElementById('asks-list').innerHTML = asksHtml;
                }
            } catch (err) {
                document.getElementById('status').innerText = 'OFFLINE \u25CB';
                document.getElementById('status').style.color = '#f87171';
            }
        }
        
        setInterval(fetchState, 250);
        fetchState();
    </script>
</body>
</html>
"""

class DashboardHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass
        
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(HTML_TEMPLATE.encode('utf-8'))
        elif self.path == '/state':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(latest_dashboard_state).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_dashboard_server():
    server_address = ('', 8080)
    httpd = HTTPServer(server_address, DashboardHandler)
    print("\\n\\033[96m🚀 Web Dashboard running at http://localhost:8080\\033[0m")
    httpd.serve_forever()

threading.Thread(target=run_dashboard_server, daemon=True).start()


# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("obi_scalper_live")

# Backend URLs
BACKEND_URL = "http://localhost:4000"
BYPASS_HEADERS = {"x-bypass-auth": "true", "Content-Type": "application/json"}

# Global state for Live trading
backend_online = True
simulated_cash = 100000.0  # Default local balance: 10M Rs
simulated_holdings = []

# ANSI Terminal Styling Codes
COLOR_GREEN = "\033[92m"
COLOR_RED = "\033[91m"
COLOR_YELLOW = "\033[93m"
COLOR_CYAN = "\033[96m"
COLOR_BLUE = "\033[94m"
COLOR_RESET = "\033[0m"
COLOR_BOLD = "\033[1m"

def render_dashboard(symbol, tick_idx, total_ticks, price, imbalance, bid_depth, ask_depth, position, cash, trades_count, pnl):
    global latest_dashboard_state
    latest_dashboard_state = {
        "symbol": symbol,
        "tick_idx": tick_idx,
        "total_ticks": total_ticks,
        "price": price,
        "imbalance": imbalance,
        "bid_depth": bid_depth,
        "ask_depth": ask_depth,
        "position": position,
        "cash": cash,
        "trades_count": trades_count,
        "pnl": pnl
    }
    
    # Tiny terminal log to confirm activity without cluttering the screen
    pos_str = f"LONG ({position['qty']})" if position else "FLAT"
    print(f"\\r[LIVE TICK {tick_idx}] {symbol} @ Rs. {price:.2f} | Pos: {pos_str} | PnL: Rs. {pnl:+.2f} | Imbalance: {imbalance:+.2f}    ", end="", flush=True)
def simulate_ticks_and_order_book(df_bars, ticks_per_bar):
    """
    Generates tick prices, bid/ask depths, and imbalances from 1-minute bars.
    Price is nudged by order book pressure to establish a real causal signal.
    """
    ticks_per_bar = max(1, ticks_per_bar)
    all_prices = []
    all_imbalances = []
    all_bid_depths = []
    all_ask_depths = []
    all_trends = []
    
    overall_idx = 0
    tick_history = []
    
    for _, bar in df_bars.iterrows():
        open_p = float(bar["Open"])
        high_p = float(bar["High"])
        low_p = float(bar["Low"])
        close_p = float(bar["Close"])
        
        # Base ticks (linear interpolation)
        segment1 = np.linspace(open_p, low_p, ticks_per_bar // 3)
        segment2 = np.linspace(low_p, high_p, ticks_per_bar // 3)
        segment3 = np.linspace(high_p, close_p, ticks_per_bar - 2 * (ticks_per_bar // 3))
        base_ticks = np.concatenate([segment1, segment2, segment3])
        
        for base_price in base_ticks:
            # 1. Simulate order book pressure wave
            t = overall_idx / 12.0
            wave_imbalance = 2.5 * np.sin(t) + np.random.normal(0, 0.5)
            
            # 2. Causal Nudge: OBI pressure drives price shifts
            nudge = 0.04 * wave_imbalance
            price = round(float(base_price + nudge), 2)
            price = max(low_p, min(price, high_p))
            
            all_prices.append(price)
            tick_history.append(price)
            
            # 3. Trend SMA-20 filter
            trend_bullish = True
            if len(tick_history) >= 20:
                sma20_tick = np.mean(tick_history[-20:])
                trend_bullish = price > sma20_tick
            all_trends.append(trend_bullish)
            
            # 4. Generate Level 5 depths and sizes
            spread = 0.05
            bid_px = [round(price - spread - i * 0.05, 2) for i in range(5)]
            ask_px = [round(price + spread + i * 0.05, 2) for i in range(5)]
            
            bid_qtys = []
            ask_qtys = []
            for i in range(5):
                decay = 0.85 ** i
                b_base = np.random.randint(800, 2500) * decay
                a_base = np.random.randint(800, 2500) * decay
                
                if wave_imbalance > 0:
                    b_qty = b_base * (1 + wave_imbalance * 2.5)
                    a_qty = a_base * (1 / (1 + wave_imbalance * 1.5))
                else:
                    b_qty = b_base * (1 / (1 + abs(wave_imbalance) * 1.5))
                    a_qty = a_base * (1 + abs(wave_imbalance) * 2.5)
                    
                bid_qtys.append(max(50, int(b_qty)))
                ask_qtys.append(max(50, int(a_qty)))
                
            total_bid_qty = sum(bid_qtys)
            total_ask_qty = sum(ask_qtys)
            imbalance = (total_bid_qty - total_ask_qty) / (total_bid_qty + total_ask_qty)
            
            all_imbalances.append(imbalance)
            all_bid_depths.append({"price": bid_px, "qty": bid_qtys})
            all_ask_depths.append({"price": ask_px, "qty": ask_qtys})
            
            overall_idx += 1
            
    return all_prices, all_imbalances, all_bid_depths, all_ask_depths, all_trends

def build_features_and_targets(prices, imbalances, trends, bid_depths, ask_depths, lookahead=10, target_profit=0.20, stop_loss=0.15):
    features = []
    targets = []
    
    for t in range(20, len(prices) - lookahead):
        imb = imbalances[t]
        tr = 1 if trends[t] else 0
        mom5 = prices[t] - prices[t-5]
        mom10 = prices[t] - prices[t-10]
        
        b_q1 = bid_depths[t]["qty"][0]
        a_q1 = ask_depths[t]["qty"][0]
        ratio = b_q1 / (a_q1 + 1e-5)
        
        features.append([imb, tr, mom5, mom10, ratio])
        
        # Triple-barrier labeling: did we hit target_profit before stop_loss?
        label = 0
        for future_p in prices[t+1:t+lookahead+1]:
            pnl = future_p - prices[t]
            if pnl >= target_profit:
                label = 1
                break
            if pnl <= -stop_loss:
                label = 0
                break
        targets.append(label)
        
    return np.array(features), np.array(targets)

def train_ai_model(df_train_bars, ticks_per_bar, target_profit=0.20, stop_loss=0.15):
    prices, imbalances, bid_depths, ask_depths, trends = simulate_ticks_and_order_book(df_train_bars, ticks_per_bar)
    X, y = build_features_and_targets(
        prices, imbalances, trends, bid_depths, ask_depths,
        target_profit=target_profit, stop_loss=stop_loss
    )
    if len(X) < 100:
        return None
        
    # Chronological validation split (no shuffle)
    X_tr, X_val, y_tr, y_val = train_test_split(X, y, test_size=0.2, shuffle=False)
    
    model = RandomForestClassifier(n_estimators=100, max_depth=6, class_weight="balanced", random_state=42)
    model.fit(X_tr, y_tr)
    
    print("\n" + "=" * 48)
    print("   AI MODEL VALIDATION PERFORMANCE (DAY 1 HOLDOUT)")
    print("=" * 48)
    y_pred = model.predict(X_val)
    print(classification_report(y_val, y_pred, zero_division=0))
    print("=" * 48 + "\n")
    
    # Retrain on the entire Day 1 set to maximize pattern coverage
    model.fit(X, y)
    return model

def run_obi_scalping(symbol="SBIN", tick_delay=0.05, imbalance_threshold=0.75, target_profit=None, stop_loss=None, target_pct=0.0005, sl_pct=0.000375, ai_threshold=0.52, ticks_per_bar=20, seed=42, use_ai=True):
    ticker = symbol if (symbol.endswith(".NS") or symbol.endswith(".BO")) else f"{symbol}.NS"
    clean_symbol = ticker.replace(".NS", "").replace(".BO", "")
    
    if seed is not None:
        np.random.seed(seed)
        
    # 1. Download 2 days of 1-minute data to feed the tick simulation & AI training
    print(f"Initializing dynamic tick simulator for {ticker} ...")
    df = yf.download(ticker, period="2d", interval="1m", progress=False)
    if df.empty:
        print("Failed to download historical data.")
        sys.exit(1)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
        
    # Partition data into train and simulation sets
    unique_dates = sorted(list(set(df.index.date)))
    if len(unique_dates) >= 2:
        df_train = df[df.index.date == unique_dates[-2]].copy()
        df_day = df[df.index.date == unique_dates[-1]].copy()
    else:
        # Split single day: first 70% for training, last 30% for simulation
        split_idx = int(len(df) * 0.7)
        df_train = df.iloc[:split_idx].copy()
        df_day = df.iloc[split_idx:].copy()
        
    # 2. Setup trading variables
    cash = 10000000.0
    initial_cash = cash
    position = None  # None or {"buy_price": float, "qty": int}
    trades_count = 0
    realized_pnl = 0.0
    trade_log = []
    
    # Calculate dynamic target/stop loss based on the stock's average price
    avg_price = float(df_day["Close"].mean())
    if target_profit is None:
        target_profit = avg_price * target_pct
        print(f"Using dynamic target profit: Rs. {target_profit:.4f} ({target_pct * 100:.4f}% of avg price Rs. {avg_price:.2f})")
    else:
        print(f"Using fixed target profit: Rs. {target_profit:.4f}")
        
    if stop_loss is None:
        stop_loss = avg_price * sl_pct
        print(f"Using dynamic stop loss: Rs. {stop_loss:.4f} ({sl_pct * 100:.4f}% of avg price Rs. {avg_price:.2f})")
    else:
        print(f"Using fixed stop loss: Rs. {stop_loss:.4f}")
        
    # Train the AI model on Day 1's tick data
    ai_model = None
    if use_ai:
        print("Training AI entry filter model on historical tick data...")
        ai_model = train_ai_model(df_train, ticks_per_bar, target_profit=target_profit, stop_loss=stop_loss)
        if ai_model is not None:
            print("AI model trained successfully.")
        else:
            print("Failed to train AI model. Proceeding without AI filter.")
            
    # Simulate ticks for the simulation day (Day 2)
    all_prices, all_imbalances, all_bid_depths, all_ask_depths, all_trends = simulate_ticks_and_order_book(df_day, ticks_per_bar)
    total_ticks = len(all_prices)
    
    # Create or clean transaction file
    tx_file = "obi_transactions.json"
    with open(tx_file, "w") as f:
        json.dump([], f, indent=4)
        
    print(f"Generated {total_ticks} tick path steps. Starting simulation terminal...")
    time.sleep(1.5)
    
    # Tick simulation loop
    tick_history = []
    for idx, price in enumerate(all_prices):
        tick_history.append(price)
        imbalance = all_imbalances[idx]
        bid_depth = all_bid_depths[idx]
        ask_depth = all_ask_depths[idx]
        trend_bullish = all_trends[idx]
        
        current_ask = ask_depth["price"][0]
        current_bid = bid_depth["price"][0]
        
        # 4. Evaluate strategy rules
        if position:
            # Check target profit (Scalp exit)
            pnl_tick = current_bid - position["buy_price"]
            if pnl_tick >= target_profit:
                # Sell and take profit
                sell_val = position["qty"] * current_bid
                cash += sell_val
                realized_pnl += (sell_val - (position["qty"] * position["buy_price"]))
                trades_count += 1
                
                tx = {
                    "action": "SELL",
                    "price": current_bid,
                    "qty": position["qty"],
                    "value": sell_val,
                    "type": f"TAKE PROFIT (+Rs. {pnl_tick:.2f})",
                    "time_idx": idx
                }
                trade_log.append(tx)
                position = None
                
            # Check stop loss
            elif pnl_tick <= -stop_loss:
                # Sell and take loss
                sell_val = position["qty"] * current_bid
                cash += sell_val
                realized_pnl += (sell_val - (position["qty"] * position["buy_price"]))
                trades_count += 1
                
                tx = {
                    "action": "SELL",
                    "price": current_bid,
                    "qty": position["qty"],
                    "value": sell_val,
                    "type": f"STOP LOSS (-Rs. {abs(pnl_tick):.2f})",
                    "time_idx": idx
                }
                trade_log.append(tx)
                position = None
        else:
            # Check for entry signal (OBI Crosses +0.75 + Bullish Trend Filter)
            if imbalance >= imbalance_threshold and trend_bullish:
                # Evaluate AI model entry filter
                use_trade = True
                if ai_model is not None:
                    # Prepare feature vector for the model
                    mom5 = price - tick_history[-5] if len(tick_history) >= 5 else 0
                    mom10 = price - tick_history[-10] if len(tick_history) >= 10 else 0
                    b_q1 = bid_depth["qty"][0]
                    a_q1 = ask_depth["qty"][0]
                    ratio = b_q1 / (a_q1 + 1e-5)
                    
                    feat = np.array([[imbalance, 1 if trend_bullish else 0, mom5, mom10, ratio]])
                    pred_prob = ai_model.predict_proba(feat)[0][1]
                    use_trade = pred_prob >= ai_threshold
                
                if use_trade:
                    # Instant buy at Market Ask Price
                    buy_qty = int((cash * 0.95) // current_ask)
                    if buy_qty > 0:
                        cost = buy_qty * current_ask
                        cash -= cost
                        position = {"buy_price": current_ask, "qty": buy_qty}
                        
                        tx = {
                            "action": "BUY",
                            "price": current_ask,
                            "qty": buy_qty,
                            "value": cost,
                            "type": "IMBALANCE ENTRY" + (" (AI Approved)" if ai_model is not None else ""),
                            "time_idx": idx
                        }
                        trade_log.append(tx)
                        
        # Render dynamic visual dashboard
        render_dashboard(
            clean_symbol, 
            idx + 1, 
            total_ticks, 
            price, 
            imbalance, 
            bid_depth, 
            ask_depth, 
            position, 
            cash, 
            trades_count, 
            realized_pnl
        )
        
        # Small delay for real-time visual update speed
        time.sleep(tick_delay)
        
    # Square-off at the end of loop
    if position:
        sell_val = position["qty"] * all_prices[-1]
        cash += sell_val
        realized_pnl += (sell_val - (position["qty"] * position["buy_price"]))
        trades_count += 1
        tx = {
            "action": "SELL",
            "price": all_prices[-1],
            "qty": position["qty"],
            "value": sell_val,
            "type": "EOD SQUARE-OFF",
            "time_idx": total_ticks
        }
        trade_log.append(tx)
        position = None
        
    # Save all transactions
    with open(tx_file, "w") as f:
        json.dump(trade_log, f, indent=4)
        
    # Final terminal dashboard report
    clear_screen()
    print(f"{COLOR_CYAN}{COLOR_BOLD}========================================================================{COLOR_RESET}")
    print(f"{COLOR_CYAN}{COLOR_BOLD}                 OBI SCALPER SIMULATION COMPLETE                        {COLOR_RESET}")
    print(f"{COLOR_CYAN}{COLOR_BOLD}========================================================================{COLOR_RESET}")
    print(f"  Stock Target Symbol : {clean_symbol}")
    print(f"  Total Trades        : {trades_count}")
    print(f"  Starting Balance    : Rs. {initial_cash:.2f}")
    print(f"  Ending Balance      : Rs. {cash:.2f}")
    
    # Calculate win rate
    wins = 0
    losses = 0
    for i in range(1, len(trade_log), 2):
        if i < len(trade_log):
            sell = trade_log[i]
            if "TAKE PROFIT" in sell["type"] or "EOD SQUARE-OFF" in sell["type"] and sell["price"] > trade_log[i-1]["price"]:
                wins += 1
            else:
                losses += 1
                
    win_rate = (wins / (wins + losses) * 100) if (wins + losses) > 0 else 0
    print(f"  Win Rate            : {COLOR_GREEN}{win_rate:.1f}%{COLOR_RESET} ({wins} wins, {losses} losses)")
    print(f"  Total Net profit    : {COLOR_GREEN if realized_pnl >= 0 else COLOR_RED}Rs. {realized_pnl:+.2f} ({realized_pnl/initial_cash*100:+.3f}%){COLOR_RESET}")
    print(f"  Report saved to     : {tx_file}")
    print(f"{COLOR_CYAN}========================================================================{COLOR_RESET}\n")


def fetch_portfolio(clean_symbol=None):
    """Fetches real-time portfolio balance and holdings from Express backend. Falls back to local simulation."""
    global backend_online, simulated_cash, simulated_holdings
    
    if not backend_online:
        return simulated_cash, simulated_holdings
        
    cash = simulated_cash
    holdings = simulated_holdings
    
    try:
        res = requests.get(f"{BACKEND_URL}/api/getBalance/getBalance", headers=BYPASS_HEADERS, timeout=10)
        if res.status_code == 200:
            cash = float(res.json().get("cash", 0.0))
            backend_online = True
            simulated_cash = cash
            
            res_h = requests.get(f"{BACKEND_URL}/api/portfolio/summary", headers=BYPASS_HEADERS, timeout=10)
            if res_h.status_code == 200:
                holdings = res_h.json().get("holdings", [])
                
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
        logger.warning(f"[Portfolio] Backend API unreachable ({str(e)}). Switching to local simulated tracking.")
        backend_online = False
            
    return cash, simulated_holdings


def execute_buy(ticker: str, clean_symbol: str, quantity: int, current_price: float):
    """Submits buy order to Express backend. Falls back to local simulation."""
    global backend_online, simulated_cash, simulated_holdings
    
    if backend_online:
        url = f"{BACKEND_URL}/api/orderExecution/buy"
        body = {
            "symbol": ticker,
            "quantity": quantity,
            "product_type": "Delivery",
            "category": "OBI Algo"
        }
        try:
            res = requests.post(url, json=body, headers=BYPASS_HEADERS, timeout=10)
            if res.status_code == 200:
                res_data = res.json()
                logger.info(f"[EXECUTION] BUY SUCCESS: {quantity} shares of {clean_symbol} at Rs. {res_data.get('buyPricePerShare')}")
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
        found = False
        for h in simulated_holdings:
            if h["symbol"] == clean_symbol:
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
                "symbol": clean_symbol,
                "quantity": quantity,
                "avgPrice": round(current_price, 2),
                "currentPrice": current_price
            })
        logger.info(f"[LOCAL SIMULATION] BUY SUCCESS: {quantity} shares of {clean_symbol} at Rs. {current_price:.2f} (Simulated cash balance: Rs. {simulated_cash:.2f})")
        return True, {"buyPricePerShare": current_price, "status": "SIMULATED"}
    else:
        logger.error(f"[LOCAL SIMULATION] BUY FAILED: Insufficient simulated balance (Need Rs. {cost:.2f}, Have Rs. {simulated_cash:.2f})")
        return False, "Insufficient balance"


def execute_sell(ticker: str, clean_symbol: str, quantity: int, current_price: float):
    """Submits sell order to Express backend. Falls back to local simulation."""
    global backend_online, simulated_cash, simulated_holdings
    
    if backend_online:
        url = f"{BACKEND_URL}/api/sellStock/sell"
        body = {
            "symbol": ticker,
            "quantity": quantity,
            "sl_enabled": False,
            "product_type": "Delivery",
            "category": "OBI Algo"
        }
        try:
            res = requests.post(url, json=body, headers=BYPASS_HEADERS, timeout=10)
            if res.status_code == 200:
                res_data = res.json()
                logger.info(f"[EXECUTION] SELL SUCCESS: {quantity} shares of {clean_symbol} at Rs. {res_data.get('sellPricePerShare')}")
                return True, res_data
            else:
                logger.error(f"[EXECUTION] SELL FAILED (API Status {res.status_code}): {res.text}")
                return False, res.text
        except Exception as e:
            logger.error(f"[EXECUTION] SELL EXCEPTION: {str(e)}")
            
    # Local Simulation Fallback
    revenue = quantity * current_price
    for i, h in enumerate(simulated_holdings):
        if h["symbol"] == clean_symbol:
            old_qty = h["quantity"]
            if old_qty >= quantity:
                new_qty = old_qty - quantity
                simulated_cash += revenue
                if new_qty == 0:
                    simulated_holdings.pop(i)
                else:
                    h["quantity"] = new_qty
                logger.info(f"[LOCAL SIMULATION] SELL SUCCESS: {quantity} shares of {clean_symbol} at Rs. {current_price:.2f} (Simulated cash balance: Rs. {simulated_cash:.2f})")
                return True, {"sellPricePerShare": current_price, "status": "SIMULATED"}
            else:
                logger.error(f"[LOCAL SIMULATION] SELL FAILED: Not enough shares held (Need {quantity}, Have {old_qty})")
                return False, "Not enough shares"
                
    logger.error(f"[LOCAL SIMULATION] SELL FAILED: Stock {clean_symbol} is not held in portfolio.")
    return False, "Stock not held"

def fetch_historical_data(symbol="TCS.NS"):
    try:
        data = yf.download(symbol, period="2d", interval="1m")
        if data.empty:
            logger.error(f"Failed to download historical data for {symbol}.")
            return None
        return data
    except Exception as e:
        logger.error(f"Exception downloading historical data: {e}")
        return None

def run_live_obi_scalping(symbol="SBIN", polling_interval=5.0, imbalance_threshold=0.75, target_profit=None, stop_loss=None, target_pct=0.0005, sl_pct=0.000375, ai_threshold=0.52, ticks_per_bar=20, seed=42, use_ai=True):
    global backend_online
    backend_online = False  # Explicitly disable backend server usage
    
    ticker = symbol if (symbol.endswith(".NS") or symbol.endswith(".BO")) else f"{symbol}.NS"
    clean_symbol = ticker.replace(".NS", "").replace(".BO", "")
    
    if seed is not None:
        np.random.seed(seed)
        
    print(f"Initializing Live OBI Scalper for {ticker} ...")
    df = fetch_historical_data(ticker)
    
    df_train = None
    if df is not None and not df.empty:
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
            
        unique_dates = sorted(list(set(df.index.date)))
        if len(unique_dates) >= 2:
            df_train = df[df.index.date == unique_dates[-2]].copy()
        else:
            split_idx = int(len(df) * 0.7)
            df_train = df.iloc[:split_idx].copy()
        
        avg_price = float(df["Close"].mean())
    else:
        avg_price = 2235.0 # fallback
        
    # Query portfolio details
    cash, holdings = fetch_portfolio(clean_symbol)
    initial_cash = cash
    
    avg_price = float(df["Close"].mean())
    if target_profit is None:
        target_profit = avg_price * target_pct
        print(f"Using dynamic target profit: Rs. {target_profit:.4f} ({target_pct * 100:.4f}% of avg price Rs. {avg_price:.2f})")
    else:
        print(f"Using fixed target profit: Rs. {target_profit:.4f}")
        
    if stop_loss is None:
        stop_loss = avg_price * sl_pct
        print(f"Using dynamic stop loss: Rs. {stop_loss:.4f} ({sl_pct * 100:.4f}% of avg price Rs. {avg_price:.2f})")
    else:
        print(f"Using fixed stop loss: Rs. {stop_loss:.4f}")
        
    # Train the AI model on Day 1's tick data
    ai_model = None
    if use_ai:
        print("Training AI entry filter model on historical tick data...")
        ai_model = train_ai_model(df_train, ticks_per_bar, target_profit=target_profit, stop_loss=stop_loss)
        if ai_model is not None:
            print("AI model trained successfully.")
        else:
            print("Failed to train AI model. Proceeding without AI filter.")
            
    print(f"AI/Strategy Setup Completed. Entering live market polling loop (interval = {polling_interval}s)...")
    time.sleep(1.5)
    
    tick_history = []
    trade_log = []
    trades_count = 0
    realized_pnl = 0.0
    
    tx_file = "obi_live_transactions.json"
    with open(tx_file, "w") as f:
        json.dump([], f, indent=4)
        
    overall_idx = 0
    
    import websocket
    try:
        ws = websocket.create_connection("ws://localhost:4141")
        ws.send(json.dumps({"action": "subscribe", "symbols": [clean_symbol]}))
        print(f"Connected to WS 4141 for {clean_symbol}")
    except Exception as e:
        print(f"Websocket connection failed: {e}")
        return

    while True:
        try:
            try:
                msg = ws.recv()
            except Exception as e:
                logger.error(f"Websocket error: {e}. Reconnecting in 3s...")
                time.sleep(3)
                try:
                    ws = websocket.create_connection("ws://localhost:4141")
                    ws.send(json.dumps({"action": "subscribe", "symbols": [clean_symbol]}))
                except Exception:
                    pass
                continue
            
            import datetime
            now_ist = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
            is_weekend = now_ist.weekday() >= 5
            is_out_of_hours = now_ist.time() < datetime.time(9, 15) or now_ist.time() > datetime.time(15, 30)
            
            data = json.loads(msg)
            if data.get("type") != "LIVE_TICK":
                continue
                
            price = round(float(data["ltp"]), 2)
            tick_history.append(price)
            
            if "bids" in data and "asks" in data and len(data["bids"]) > 0:
                bids_sorted = sorted(data["bids"], key=lambda x: x["price"], reverse=True)
                asks_sorted = sorted(data["asks"], key=lambda x: x["price"])
                
                bid_px = [b["price"] for b in bids_sorted[:5]]
                bid_qtys = [b["qty"] for b in bids_sorted[:5]]
                
                ask_px = [a["price"] for a in asks_sorted[:5]]
                ask_qtys = [a["qty"] for a in asks_sorted[:5]]
                
                while len(bid_px) < 5:
                    bid_px.append(0.0)
                    bid_qtys.append(0)
                while len(ask_px) < 5:
                    ask_px.append(0.0)
                    ask_qtys.append(0)
                
                total_bid_qty = data.get("total_bid_qty") or sum(bid_qtys)
                total_ask_qty = data.get("total_ask_qty") or sum(ask_qtys)
                imbalance = (total_bid_qty - total_ask_qty) / (total_bid_qty + total_ask_qty) if (total_bid_qty + total_ask_qty) > 0 else 0
                
                bid_depth = {"price": bid_px, "qty": bid_qtys}
                ask_depth = {"price": ask_px, "qty": ask_qtys}
            else:
                t = overall_idx / 2.0
                wave_imbalance = 2.5 * np.sin(t) + np.random.normal(0, 0.5)
                
                nudge = 0.04 * wave_imbalance
                price = round(float(price + nudge), 2)
                
                spread = 0.05
                bid_px = [round(price - spread - i * 0.05, 2) for i in range(5)]
                ask_px = [round(price + spread + i * 0.05, 2) for i in range(5)]
                
                bid_qtys = []
                ask_qtys = []
                for i in range(5):
                    decay = 0.85 ** i
                    b_base = np.random.randint(800, 2500) * decay
                    a_base = np.random.randint(800, 2500) * decay
                    
                    if wave_imbalance > 0:
                        b_qty = b_base * (1 + wave_imbalance * 2.5)
                        a_qty = a_base * (1 / (1 + wave_imbalance * 1.5))
                    else:
                        b_qty = b_base * (1 / (1 + abs(wave_imbalance) * 1.5))
                        a_qty = a_base * (1 + abs(wave_imbalance) * 2.5)
                        
                    bid_qtys.append(max(50, int(b_qty)))
                    ask_qtys.append(max(50, int(a_qty)))
                    
                total_bid_qty = sum(bid_qtys)
                total_ask_qty = sum(ask_qtys)
                imbalance = (total_bid_qty - total_ask_qty) / (total_bid_qty + total_ask_qty)
                
                bid_depth = {"price": bid_px, "qty": bid_qtys}
                ask_depth = {"price": ask_px, "qty": ask_qtys}
                
            trend_bullish = True
            if len(tick_history) >= 20:
                sma20_tick = np.mean(tick_history[-20:])
                trend_bullish = price > sma20_tick
            
            current_ask = ask_depth["price"][0]
            current_bid = bid_depth["price"][0]
            
            cash, holdings = fetch_portfolio(clean_symbol)
            
            position = None
            for h in holdings:
                if h["symbol"] == clean_symbol:
                    position = {"buy_price": h["avgPrice"], "qty": h["quantity"]}
                    break
                    
            if position:
                pnl_tick = current_bid - position["buy_price"]
                
                if pnl_tick >= target_profit:
                    success, details = execute_sell(ticker, clean_symbol, position["qty"], current_bid)
                    if success:
                        trades_count += 1
                        realized_pnl += (position["qty"] * pnl_tick)
                        tx = {
                            "action": "SELL",
                            "price": current_bid,
                            "qty": position["qty"],
                            "value": position["qty"] * current_bid,
                            "type": f"TAKE PROFIT (+Rs. {pnl_tick:.2f})",
                            "timestamp": now_ist.strftime('%H:%M:%S')
                        }
                        trade_log.append(tx)
                        position = None
                        
                elif pnl_tick <= -stop_loss:
                    success, details = execute_sell(ticker, clean_symbol, position["qty"], current_bid)
                    if success:
                        trades_count += 1
                        realized_pnl += (position["qty"] * pnl_tick)
                        tx = {
                            "action": "SELL",
                            "price": current_bid,
                            "qty": position["qty"],
                            "value": position["qty"] * current_bid,
                            "type": f"STOP LOSS (-Rs. {abs(pnl_tick):.2f})",
                            "timestamp": now_ist.strftime('%H:%M:%S')
                        }
                        trade_log.append(tx)
                        position = None
            else:
                if imbalance >= imbalance_threshold and trend_bullish:
                    use_trade = True
                    if ai_model is not None:
                        mom5 = price - tick_history[-5] if len(tick_history) >= 5 else 0
                        mom10 = price - tick_history[-10] if len(tick_history) >= 10 else 0
                        b_q1 = bid_depth["qty"][0]
                        a_q1 = ask_depth["qty"][0]
                        ratio = b_q1 / (a_q1 + 1e-5)
                        
                        feat = np.array([[imbalance, 1 if trend_bullish else 0, mom5, mom10, ratio]])
                        pred_prob = ai_model.predict_proba(feat)[0][1]
                        use_trade = pred_prob >= ai_threshold
                        
                    if use_trade:
                        buy_qty = int((cash * 0.95) // current_ask)
                        if buy_qty > 0:
                            success, details = execute_buy(ticker, clean_symbol, buy_qty, current_ask)
                            if success:
                                position = {"buy_price": current_ask, "qty": buy_qty}
                                tx = {
                                    "action": "BUY",
                                    "price": current_ask,
                                    "qty": buy_qty,
                                    "value": buy_qty * current_ask,
                                    "type": "IMBALANCE ENTRY" + (" (AI Approved)" if ai_model is not None else ""),
                                    "timestamp": now_ist.strftime('%H:%M:%S')
                                }
                                trade_log.append(tx)
                                
            with open(tx_file, "w") as f:
                json.dump(trade_log, f, indent=4)
                
            render_dashboard(
                clean_symbol,
                overall_idx + 1,
                "LIVE (Press Ctrl+C to Exit)",
                price,
                imbalance,
                bid_depth,
                ask_depth,
                position,
                cash,
                trades_count,
                realized_pnl
            )
            
            overall_idx += 1
            
        except KeyboardInterrupt:
            print("\nExiting live OBI scalper loop cleanly on user request.", flush=True)
            break
        except Exception as e:
            logger.error(f"Error in live OBI loop: {str(e)}")
            time.sleep(polling_interval)
            
    # Final square-off
    cash, holdings = fetch_portfolio(clean_symbol)
    position = None
    for h in holdings:
        if h["symbol"] == clean_symbol:
            position = {"buy_price": h["avgPrice"], "qty": h["quantity"]}
            break
            
    if position:
        print("\nSquaring off remaining position...")
        execute_sell(ticker, clean_symbol, position["qty"], price)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="OBI Scalping High Frequency Simulation")
    parser.add_argument("--symbol", type=str, default="SBIN", help="Stock symbol to simulate (default: SBIN)")
    parser.add_argument("--delay", type=float, default=0.03, help="Tick refresh delay in seconds (default: 0.03)")
    parser.add_argument("--target", type=float, default=None, help="Profit target scalp spread in Rs (default: None, fallback to dynamic target-pct)")
    parser.add_argument("--sl", type=float, default=None, help="Stop loss trigger in Rs (default: None, fallback to dynamic sl-pct)")
    parser.add_argument("--target-pct", type=float, default=0.0005, help="Target profit as a fraction of the stock price (default: 0.0005)")
    parser.add_argument("--sl-pct", type=float, default=0.000375, help="Stop loss as a fraction of the stock price (default: 0.000375)")
    parser.add_argument("--ai-threshold", type=float, default=0.52, help="Minimum AI probability to approve a trade (default: 0.52)")
    parser.add_argument("--ticks-per-bar", type=int, default=20, help="Number of ticks simulated per 1-minute bar (default: 20)")
    parser.add_argument("--seed", type=int, default=42, help="Seed value for reproducibility (default: 42)")
    parser.add_argument("--use-ai", action=argparse.BooleanOptionalAction, default=True, help="Toggle AI entry filter (default: True)")
    parser.add_argument("--live", action="store_true", help="Run in live market polling mode")
    parser.add_argument("--interval", type=float, default=5.0, help="Polling interval in seconds for live mode (default: 5.0)")
    parser.add_argument("--threshold", type=float, default=0.40, help="Imbalance entry threshold between 0 and 1 (default: 0.40)")
    args = parser.parse_args()
    
    if args.live:
        run_live_obi_scalping(
            symbol=args.symbol,
            polling_interval=args.interval,
            imbalance_threshold=args.threshold,
            target_profit=args.target,
            stop_loss=args.sl,
            target_pct=args.target_pct,
            sl_pct=args.sl_pct,
            ai_threshold=args.ai_threshold,
            ticks_per_bar=args.ticks_per_bar,
            seed=args.seed,
            use_ai=args.use_ai
        )
    else:
        run_obi_scalping(
            symbol=args.symbol, 
            tick_delay=args.delay,
            imbalance_threshold=args.threshold,
            target_profit=args.target, 
            stop_loss=args.sl,
            target_pct=args.target_pct,
            sl_pct=args.sl_pct,
            ai_threshold=args.ai_threshold,
            ticks_per_bar=args.ticks_per_bar,
            seed=args.seed,
            use_ai=args.use_ai
        )

from indicator_engine.dsl import DSLEvaluator, LogicalCondition
import pandas as pd
import asyncio
import json
import re
import os
from urllib.parse import urlsplit
from datetime import datetime
from pymongo import MongoClient
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
router = APIRouter()
# --- LIVE SERVER LOGIC ---

MONGO_URI = "mongodb+srv://shashijanagam2004_db_user:hg00fvxTmkNkOdj8@stocks.ugz3urv.mongodb.net/?appName=stocks"

def get_latest_strategy(user_id=None, strategy_name=None):
    client = MongoClient(MONGO_URI)
    try:
        db = client.get_default_database()
    except Exception:
        db = client.get_database("test")
        
    collection = db['paperbull_strategies']
    
    query = {}
    if user_id:
        query["userId"] = user_id
    else:
        query["userId"] = "27R0gbrHLfTOhVwKuTdpIhYEFwr1" # Fallback
        
    if strategy_name:
        query["name"] = strategy_name
        
    strategy = collection.find_one(query, sort=[("createdAt", -1)])
    return strategy

def map_condition(db_cond):
    if 'logic' in db_cond or 'operator' in db_cond:
        op = db_cond.get('logic', db_cond.get('operator'))
        return {
            'operator': op,
            'conditions': [map_condition(c) for c in db_cond.get('conditions', [])]
        }
    else:
        ind = db_cond.get('left', db_cond.get('indicator'))
        params = db_cond.get('left_params', db_cond.get('params', {}))
        comp = db_cond.get('op', db_cond.get('comparison'))
        
        if db_cond.get('right_type') == 'indicator':
            val = {
                'indicator': db_cond.get('right'),
                'params': db_cond.get('right_params', {})
            }
        else:
            val = db_cond.get('right_value', db_cond.get('value'))
            
        return {
            'indicator': ind,
            'params': params,
            'comparison': comp,
            'value': val
        }

client_tasks = {}

# --- MODE CONFIGURATION ---
# "simulate" -> connects to ws://localhost:8765  (paper trading simulator)
# "upstox"   -> connects to ws://localhost:4141  (live Upstox data feed)
DATA_SOURCE_URLS = {
    "simulate": "ws://localhost:8765",
    # Set UPSTOX_WS_URL in deployment (for Docker: ws://upstox-backend:4141).
    "upstox":   os.getenv("UPSTOX_WS_URL", "ws://localhost:4141"),
}


def get_upstox_api_base():
    """Return the HTTP API host matching the configured Upstox WebSocket host."""
    configured = os.getenv("UPSTOX_API_BASE_URL")
    if configured:
        return configured.rstrip("/")

    parsed = urlsplit(DATA_SOURCE_URLS["upstox"])
    scheme = "https" if parsed.scheme == "wss" else "http"
    return f"{scheme}://{parsed.netloc}" if parsed.netloc else "http://localhost:4141"

async def connect_data_feed(websocket, symbol, visual_indicators=None, user_id=None, strategy_name=None, allocated_capital=0, mode="simulate"):
    if visual_indicators is None:
        visual_indicators = []
        
    strategy = get_latest_strategy(user_id, strategy_name)
    if not strategy:
        print(f"[ERROR] No strategy found in MongoDB for user {user_id} and name {strategy_name}.")
        return

    try:
        # Check new schema first (buyDsl/sellDsl as stringified JSON)
        if 'buyDsl' in strategy:
            import json
            entry_cond = json.loads(strategy['buyDsl']) if isinstance(strategy['buyDsl'], str) else strategy['buyDsl']
            exit_cond = json.loads(strategy['sellDsl']) if isinstance(strategy.get('sellDsl'), str) else strategy.get('sellDsl', {})
        else:
            # Fallback for old schema
            entry_cond = strategy.get('config', {}).get('entry', {})
            exit_cond = strategy.get('config', {}).get('exit', {})
        
        if not entry_cond:
            entry_cond = {'logic': 'AND', 'conditions': []}
        if not exit_cond:
            exit_cond = {'logic': 'AND', 'conditions': []}
            
        buy_cond = LogicalCondition(**map_condition(entry_cond))
        sell_cond = LogicalCondition(**map_condition(exit_cond))
    except Exception as e:
        print(f"[ERROR] Failed to parse strategy: {e}")
        return

    evaluator = DSLEvaluator()
    
    # New strategies persist stop-loss settings as stopLoss: {type, value}.
    # Keep the legacy fields supported for older MongoDB documents.
    try:
        stop_loss = strategy.get('stopLoss') or strategy.get('stop_loss')
        if isinstance(stop_loss, dict):
            stop_loss_value = stop_loss.get('value')
            sl_pct = float(stop_loss_value) / 100.0 if stop_loss_value not in (None, '') else None
            sl_type = str(stop_loss.get('type', 'FIXED_PCT')).lower()
        else:
            legacy_pct = strategy.get('stopLossPct')
            sl_pct = float(legacy_pct) / 100.0 if legacy_pct not in (None, '') else None
            sl_type = str(strategy.get('stopLossType', 'fixed')).lower()

        if sl_type in ('trailing_pct', 'trailing-percent', 'trailing_percent'):
            sl_type = 'trailing'
        elif sl_type != 'trailing':
            sl_type = 'fixed'
    except (TypeError, ValueError):
        sl_pct = None
        sl_type = 'fixed'
    
    # Resolve the WebSocket URI based on the selected mode
    uri = DATA_SOURCE_URLS.get(mode, DATA_SOURCE_URLS["simulate"])
    
    # Parse visual indicators from frontend (e.g. "indicator_ema_period20" -> ("EMA", 20))
    import re
    visual_reqs = []
    for vi in visual_indicators:
        vi_low = vi.lower()
        if 'sma' in vi_low: name = 'SMA'
        elif 'ema' in vi_low: name = 'EMA'
        elif 'rsi' in vi_low: name = 'RSI'
        else: continue
        
        match = re.search(r'\d+', vi_low)
        period = int(match.group()) if match else 14
        visual_reqs.append((name, period))
    
    print(f"[INFO] Started Live AutoTrading for {symbol} | Mode: {mode.upper()} | URI: {uri} | Strategy ID: {strategy.get('_id')}")

    # --- UPSTOX MODE: ensure symbol is registered in websocket.js before connecting ---
    upstox_resolved_key = None
    if mode == 'upstox':
        import urllib.request
        import gzip
        
        UPSTOX_API_BASE = get_upstox_api_base()
        
        try:
            # Step 1: Try to resolve symbol via the running websocket.js HTTP API
            resolve_url = f"{UPSTOX_API_BASE}/api/resolve/{symbol}"
            with urllib.request.urlopen(resolve_url, timeout=5) as resp:
                resolve_data = json.loads(resp.read().decode())
                if resolve_data.get('found'):
                    upstox_resolved_key = resolve_data['instrument_key']
                    print(f"[UPSTOX] Resolved {symbol} → {upstox_resolved_key}")
        except Exception as e:
            print(f"[UPSTOX] Symbol {symbol} not in subscriptions.json, searching Upstox instruments...")

        if not upstox_resolved_key:
            # Step 2: Look up the symbol in Upstox's instruments JSON and inject it dynamically
            try:
                instruments_url = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
                with urllib.request.urlopen(instruments_url, timeout=15) as resp:
                    raw = resp.read()
                gz_data = gzip.decompress(raw)
                instruments = json.loads(gz_data.decode())
                
                found_inst = None
                sym_upper = symbol.upper()
                for inst in instruments:
                    ts = (inst.get('trading_symbol') or '').upper()
                    nm = (inst.get('name') or '').upper()
                    if ts == sym_upper or nm == sym_upper or ts.startswith(sym_upper):
                        if inst.get('instrument_type') in ('EQUITY', 'EQ', 'INDEX', None):
                            found_inst = inst
                            break
                            
                if found_inst:
                    instrument_key = found_inst['instrument_key']
                    name = found_inst.get('name', symbol)
                    print(f"[UPSTOX] Found in Upstox instruments: {symbol} → {instrument_key}")
                    # Step 3: Inject into the running websocket.js server
                    subscribe_url = f"{UPSTOX_API_BASE}/api/subscribe"
                    payload = json.dumps({"symbol": symbol, "instrument_key": instrument_key, "name": name}).encode()
                    req = urllib.request.Request(subscribe_url, data=payload,
                                                headers={"Content-Type": "application/json"}, method="POST")
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        sub_result = json.loads(resp.read().decode())
                        if sub_result.get('ok'):
                            upstox_resolved_key = instrument_key
                            print(f"[UPSTOX] ✅ Dynamically subscribed {symbol} → {instrument_key}")
                else:
                    print(f"[UPSTOX] ⚠️ Could not find {symbol} in NSE instruments. Will try anyway.")
            except Exception as e:
                print(f"[UPSTOX] ⚠️ Instrument lookup failed: {e}. Will try to connect anyway.")

    try:
        async with websockets.connect(uri) as upstream_ws:
            # Both simulate and upstox servers accept the same subscribe message format
            sub_msg = {"action": "subscribe", "symbols": [symbol], "reset": False}
            await upstream_ws.send(json.dumps(sub_msg))
            
            history = []
            current_candle = None
            
            warmed_up = False
            hist_df_warmed = None
            
            shares_held = 0
            current_capital = float(allocated_capital)
            buy_price = 0.0
            highest_price = 0.0
            
            # Fetch historical data in advance
            try:
                import yfinance as yf
                fetch_sym = f"{symbol}.NS" if not symbol.endswith(".NS") else symbol
                ticker = yf.Ticker(fetch_sym)
                hist_df = ticker.history(period="5d", interval="1m")
                if not hist_df.empty:
                    hist_df_warmed = hist_df
            except Exception as e:
                print(f"[WARN] Could not fetch warmup data: {e}")

            while True:
                message = await upstream_ws.recv()
                data = json.loads(message)
                
                # --- Symbol matching ---
                # Upstox emits: { "type": "LIVE_TICK", "symbol": "RELIANCE", "ltp": ..., ... }
                # Simulate emits: { "symbol": "RELIANCE", "ltp": ..., ... }
                # We normalise both to a plain uppercase stock name for comparison.
                tick_symbol_raw = data.get('symbol', '')
                tick_symbol = tick_symbol_raw.upper().replace('.NS', '')
                target_symbol = symbol.upper().replace('.NS', '')
                
                symbol_match = (
                    tick_symbol == target_symbol
                    or data.get('symbolNS', '').upper().replace('.NS', '') == target_symbol
                    # Upstox instrument_key e.g. "NSE_EQ|INE001A01036" — fall back to symbol field
                    or (mode == 'upstox' and data.get('type') == 'LIVE_TICK' and tick_symbol == target_symbol)
                )
                
                if symbol_match:
                    tick_price = data.get('ltp', data.get('price'))
                    if not tick_price:
                        continue
                        
                    tick_time = data.get('timestamp')
                    tick_dt = pd.to_datetime(tick_time) if tick_time else datetime.now()
                    
                    if not warmed_up:
                        warmed_up = True
                        if hist_df_warmed is not None:
                            try:
                                # Truncate history to strictly before the live tick
                                t_dt = tick_dt
                                if t_dt.tzinfo is None and hist_df_warmed.index.tzinfo is not None:
                                    t_dt = t_dt.tz_localize(hist_df_warmed.index.tzinfo)
                                
                                valid_hist = hist_df_warmed[hist_df_warmed.index < t_dt].iloc[-100:]
                                for idx, row in valid_hist.iterrows():
                                    dt_val = idx.to_pydatetime() if hasattr(idx, 'to_pydatetime') else idx
                                    if getattr(dt_val, 'tzinfo', None):
                                        dt_val = dt_val.replace(tzinfo=None)
                                        
                                    history.append({
                                        'date': dt_val,
                                        'open': row['Open'],
                                        'high': row['High'],
                                        'low': row['Low'],
                                        'close': row['Close'],
                                        'volume': row['Volume']
                                    })
                                print(f"[INFO] Warmed up live feed with {len(history)} historical candles.")
                                
                                # Stream history to frontend
                                try:
                                    def get_inds(conds):
                                        found = []
                                        try:
                                            for c in conds:
                                                for side in ['left', 'right']:
                                                    if isinstance(c.get(side), dict) and c[side].get('type') == 'indicator':
                                                        found.append((c[side].get('name'), int(c[side].get('period', 14))))
                                        except Exception:
                                            pass
                                        return found
                                        
                                    req_inds = set(get_inds(buy_cond) + get_inds(sell_cond) + visual_reqs)
                                    hist_df_send = pd.DataFrame(history)
                                    hist_df_send.set_index('date', inplace=True)
                                    
                                    for i, (dt_idx, hist_row) in enumerate(hist_df_send.iterrows()):
                                        slice_df = hist_df_send.iloc[:i+1]
                                        hist_indicators = {}
                                        for ind_name, ind_period in req_inds:
                                            if len(slice_df) > ind_period:
                                                try:
                                                    hist_indicators[f"{ind_name}_{ind_period}"] = float(
                                                        evaluator.registry.calculate(ind_name, slice_df, {"period": ind_period}).iloc[-1]
                                                    )
                                                except Exception:
                                                    pass

                                        payload = {
                                            "symbol": symbol,
                                            "timestamp": dt_idx.isoformat() + "Z",
                                            "ltp": float(hist_row['close']),
                                            "price": float(hist_row['close']),
                                            "indicators": hist_indicators,
                                            "candle_minute_ts": dt_idx.isoformat() + "Z",
                                            "candle_new": True,
                                            "signals": {"BUY": False, "SELL": False}
                                        }
                                        await websocket.send_text(json.dumps(payload))
                                except Exception as e:
                                    print(f"[WARN] Error streaming history: {e}")
                                    
                            except Exception as e:
                                print(f"[WARN] Warmup truncation error: {e}")
                        
                    # Robust time parsing: Upstox sends ms unix timestamp (UTC), Simulate sends ISO string (Local)
                    if isinstance(tick_time, (int, float)) or (isinstance(tick_time, str) and tick_time.isdigit()):
                        tick_dt_parsed = pd.to_datetime(int(tick_time), unit='ms').tz_localize('UTC').tz_convert('Asia/Kolkata').replace(tzinfo=None)
                    else:
                        if getattr(tick_dt, 'tzinfo', None) is not None:
                            # Convert any UTC / aware timestamps to IST before making them naive
                            tick_dt_parsed = tick_dt.tz_convert('Asia/Kolkata').replace(tzinfo=None)
                        else:
                            tick_dt_parsed = tick_dt

                        
                    candle_minute = tick_dt_parsed.replace(second=0, microsecond=0)
                    candle_minute_ts = candle_minute.isoformat() + "Z"
                    
                    if current_candle is None or current_candle['date'] != candle_minute:
                        if current_candle is not None:
                            history.append(current_candle)
                            if len(history) > 500:
                                history.pop(0)
                        current_candle = {
                            'date': candle_minute,
                            'open': float(tick_price),
                            'high': float(tick_price),
                            'low': float(tick_price),
                            'close': float(tick_price),
                            'volume': float(data.get('volume', 0))
                        }
                        candle_new = True
                    else:
                        current_candle['high'] = max(current_candle['high'], float(tick_price))
                        current_candle['low'] = min(current_candle['low'], float(tick_price))
                        current_candle['close'] = float(tick_price)
                        current_candle['volume'] += float(data.get('volume', 0))
                        candle_new = False
                        
                    candles_for_eval = history + [current_candle]
                    df = pd.DataFrame(candles_for_eval)
                    df.set_index('date', inplace=True)
                    
                    latest_buy = False
                    latest_sell = False
                    indicators = {}
                    
                    try:
                        buy_eval = evaluator.evaluate(buy_cond, df)
                        sell_eval = evaluator.evaluate(sell_cond, df)
                        latest_buy = bool(buy_eval['signal'].iloc[-1])
                        latest_sell = bool(sell_eval['signal'].iloc[-1])
                        
                        # Fallback try-except for get_inds in case buy_cond is an object
                        def get_inds(conds):
                            found = []
                            try:
                                for c in conds:
                                    for side in ['left', 'right']:
                                        if isinstance(c.get(side), dict) and c[side].get('type') == 'indicator':
                                            found.append((c[side].get('name'), int(c[side].get('period', 14))))
                            except Exception:
                                pass
                            return found
                            
                        req_inds = set(get_inds(buy_cond) + get_inds(sell_cond) + visual_reqs)
                        for name, period in req_inds:
                            if len(df) > period:
                                key = f"{name}_{period}"
                                try:
                                    indicators[key] = float(evaluator.registry.calculate(name, df, {"period": period}).iloc[-1])
                                except Exception as e:
                                    print(f"[DEBUG] Error calculating {key}: {e}")
                            
                        buy_str = "YES" if latest_buy else "NO"
                        sell_str = "YES" if latest_sell else "NO"
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] {symbol} LTP: {tick_price} | BUY: {buy_str} | SELL: {sell_str}")
                    except Exception as e:
                        print(f"[DEBUG] Eval error: {e}")
                        
                    try:
                        trade_executed = None
                        sl_triggered = False
                        
                        if shares_held > 0 and sl_pct is not None and sl_pct > 0:
                            if sl_type == 'trailing':
                                if tick_price > highest_price:
                                    highest_price = tick_price
                                if tick_price <= highest_price * (1 - sl_pct):
                                    sl_triggered = True
                            else: # fixed
                                if tick_price <= buy_price * (1 - sl_pct):
                                    sl_triggered = True
                                    
                        if sl_triggered and shares_held > 0:
                            trade_value = shares_held * tick_price
                            current_capital += trade_value
                            trade_executed = {"side": "SELL", "price": tick_price, "qty": shares_held, "capital_remaining": current_capital, "isAlgo": True, "symbol": symbol, "reason": f"{'Trailing' if sl_type == 'trailing' else 'Fixed'} SL Hit"}
                            shares_held = 0
                            buy_price = 0.0
                            highest_price = 0.0
                            
                        elif latest_buy and shares_held == 0 and current_capital >= tick_price:
                            import math
                            qty = math.floor(current_capital / tick_price)
                            if qty > 0:
                                shares_held = qty
                                trade_value = qty * tick_price
                                current_capital -= trade_value
                                trade_executed = {"side": "BUY", "price": tick_price, "qty": qty, "capital_remaining": current_capital, "isAlgo": True, "symbol": symbol, "reason": "Strategy BUY Condition Met"}
                                buy_price = tick_price
                                highest_price = tick_price
                        elif latest_sell and shares_held > 0:
                            trade_value = shares_held * tick_price
                            current_capital += trade_value
                            trade_executed = {"side": "SELL", "price": tick_price, "qty": shares_held, "capital_remaining": current_capital, "isAlgo": True, "symbol": symbol, "reason": "Strategy SELL Condition Met"}
                            shares_held = 0
                            buy_price = 0.0
                            highest_price = 0.0
                            
                        payload = {
                            "symbol": symbol,
                            "timestamp": candle_minute_ts,
                            "ltp": tick_price,
                            "price": tick_price,
                            "candle_minute_ts": candle_minute_ts,
                            "candle_new": candle_new,
                            "signals": {"BUY": latest_buy, "SELL": latest_sell},
                            "indicators": indicators
                        }
                        if trade_executed:
                            payload["trade_executed"] = trade_executed
                            
                        await websocket.send_text(json.dumps(payload))
                    except TypeError as te:
                        print(f"[ERROR] JSON Serialization failed: {te}")
                    except Exception:
                        print(f"[FRONTEND] Client disconnected during feed loop")
                        break
                        
    except asyncio.CancelledError:
        print(f"Stopped trading for {symbol}")
    except websockets.exceptions.ConnectionClosed:
        print(f"Data stream ended for {symbol}, sending completion signal")
        try:
            await websocket.send_text(json.dumps({"action": "completed"}))
        except:
            pass
    except Exception as e:
        print(f"Feed error: {e}")
        try:
            await websocket.send_text(json.dumps({"action": "completed"}))
        except:
            pass

from fastapi import WebSocket, WebSocketDisconnect
import asyncio

@router.websocket("/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_ip = websocket.client.host if websocket.client else "Unknown"
    print(f"[FRONTEND] Client connected: {client_ip}")
    try:
        while True:
            message = await websocket.receive_text()
            try:
                data = json.loads(message)
                if data.get("action") == "subscribe":
                    symbols = data.get("symbols", [])
                    requested_inds = data.get("indicators", [])
                    strategy_name = data.get("strategyName")
                    user_id = data.get("userId")
                    allocated_capital = data.get("allocatedCapital", 0)
                    # "mode" can be "simulate" (default) or "upstox" — sent by the frontend
                    data_mode = data.get("mode", "simulate")
                    if data_mode not in ("simulate", "upstox"):
                        data_mode = "simulate"
                    if symbols:
                        symbol = symbols[0].replace('.NS', '').upper()
                        print(f"[FRONTEND] Requested deploy for {symbol} | Mode: {data_mode.upper()} | Indicators: {requested_inds}, Strategy: {strategy_name}, Capital: {allocated_capital}")
                        
                        if websocket in client_tasks:
                            client_tasks[websocket].cancel()
                            
                        client_tasks[websocket] = asyncio.create_task(
                            connect_data_feed(websocket, symbol, requested_inds, user_id, strategy_name, allocated_capital, mode=data_mode)
                        )
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[FRONTEND] WS Error: {e}")
    finally:
        if websocket in client_tasks:
            client_tasks[websocket].cancel()
            del client_tasks[websocket]
        print(f"[FRONTEND] Client disconnected: {client_ip}")

from fastapi import WebSocket, WebSocketDisconnect
import asyncio

@router.websocket("/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_ip = websocket.client.host if websocket.client else "Unknown"
    print(f"[FRONTEND] Client connected: {client_ip}")
    try:
        while True:
            message = await websocket.receive_text()
            try:
                data = json.loads(message)
                if data.get("action") == "subscribe":
                    symbols = data.get("symbols", [])
                    requested_inds = data.get("indicators", [])
                    strategy_name = data.get("strategyName")
                    user_id = data.get("userId")
                    allocated_capital = data.get("allocatedCapital", 0)
                    # "mode" can be "simulate" (default) or "upstox" — sent by the frontend
                    data_mode = data.get("mode", "simulate")
                    if data_mode not in ("simulate", "upstox"):
                        data_mode = "simulate"
                    if symbols:
                        symbol = symbols[0].replace('.NS', '').upper()
                        print(f"[FRONTEND] Requested deploy for {symbol} | Mode: {data_mode.upper()} | Indicators: {requested_inds}, Strategy: {strategy_name}, Capital: {allocated_capital}")
                        
                        if websocket in client_tasks:
                            client_tasks[websocket].cancel()
                            
                        client_tasks[websocket] = asyncio.create_task(
                            connect_data_feed(websocket, symbol, requested_inds, user_id, strategy_name, allocated_capital, mode=data_mode)
                        )
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[FRONTEND] WS Error: {e}")
    finally:
        if websocket in client_tasks:
            client_tasks[websocket].cancel()
            del client_tasks[websocket]
        print(f"[FRONTEND] Client disconnected: {client_ip}")



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

            # Time-of-day filter: skip dangerous session boundaries
            if is_out_of_hours or is_weekend:
                print(f"[{timestamp_str}] Market CLOSED — skipping tick.", flush=True)
                continue
            live_time = now_ist.time()
            import datetime as _dt_live
            if live_time < _dt_live.time(9, 20) or live_time >= _dt_live.time(15, 15):
                print(f"[{timestamp_str}] Session boundary — skipping (9:15-9:20 open gap / 3:15-3:30 close risk).", flush=True)
                continue

            # Fetch price history and cap to 200 bars
            price_history = df["Close"].tolist()[-200:]
            sma20, sma50, rsi = calculate_rolling_indicators(price_history)[:3]

            # Fast EMA trend (more responsive than SMA on 1m)
            closes_arr_quick = np.array(price_history, dtype=float)
            ema9_quick  = _ema(closes_arr_quick, 9)  if len(closes_arr_quick) >= 9  else float(closes_arr_quick[-1])
            ema21_quick = _ema(closes_arr_quick, 21) if len(closes_arr_quick) >= 21 else float(closes_arr_quick[-1])
            trend = "UPTREND" if ema9_quick > ema21_quick else "DOWNTREND"

            # Dynamic Bias Assignment (EMA-based)
            bias_setting = strategy_config.get("bias", "dynamic").lower()
            if bias_setting not in ("always_buy",) and (bias_setting == "dynamic" or strategy_config.get("dynamic_bias", False)):
                if ema9_quick > ema21_quick and curr_price > ema9_quick:
                    strategy_config["bias"] = "bullish"
                elif ema9_quick < ema21_quick and curr_price < ema9_quick:
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
            print(f"[{timestamp_str}] Live Tick {tick_count} | Price: Rs. {curr_price:.2f} | RSI: {rsi} | Trend: {trend} | EMA9/21: {ema9_quick:.2f}/{ema21_quick:.2f} | Bias: {strategy_config['bias'].upper()}", flush=True)

            # Retrieve threshold config
            buy_thresh = strategy_config["rsi_buy_threshold"]
            sell_thresh = strategy_config["rsi_sell_threshold"]
            stop_loss_pct = strategy_config["stop_loss_pct"]
            # Enforce minimum 30s cooldown even in aggressive mode
            cooldown_sec = max(30.0, float(strategy_config.get("cooldown_sec", 30.0)))
            current_time = time.time()
            
            # Portfolio sync: only block on FIRST tick to initialise, then use background thread
            if local_held_qty is None:
                # First tick only — block to seed initial state
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
                logger.info(f"[PORTFOLIO] Initial sync: Cash=Rs.{simulated_cash:.2f}, {SYMBOL} qty={local_held_qty}, avg=Rs.{local_avg_buy_price:.2f}")
            elif current_time - last_trade_time > 15.0 or tick_count % 30 == 0:
                # Every 30 ticks OR 15s after a trade — background refresh (non-blocking)
                fetch_portfolio_background()
                with _portfolio_lock:
                    cash = simulated_cash
                    holdings = simulated_holdings
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
                # Between refreshes: read the latest locally-cached values (thread-safe)
                with _portfolio_lock:
                    cash = simulated_cash
                
            held_qty = local_held_qty
            avg_buy_price = local_avg_buy_price
            
            # Resolve per-tick config values
            take_profit_pct   = float(strategy_config.get("take_profit_pct",  0.012))  # 1.2% TP = 2:1 R:R
            trailing_stop_pct = float(strategy_config.get("trailing_stop_pct", 0.004))
            current_bias      = strategy_config.get("bias", "neutral").lower()
            is_aggressive_live = (current_bias == "always_buy")

            # Compute momentum score — single call, cap history first
            volume_history_live = df["Volume"].tolist()[-200:]
            price_history_capped = price_history[-200:]
            full_inds = calculate_rolling_indicators(price_history_capped, volume_history_live)
            sma20_l, sma50_l, rsi_l, macd_l, sig_l, macd_hist_l, bb_up_l, bb_dn_l, vr_l = full_inds

            # EMA-based fast trend and VWAP for live mode
            closes_arr_l = np.array(price_history_capped, dtype=float)
            ema9_l  = _ema(closes_arr_l, 9)  if len(closes_arr_l) >= 9  else float(closes_arr_l[-1])
            ema21_l = _ema(closes_arr_l, 21) if len(closes_arr_l) >= 21 else float(closes_arr_l[-1])
            vwap_l  = calculate_vwap(price_history_capped, volume_history_live)
            atr_l   = calculate_atr(price_history_capped, period=14)
            atr_pct_l = (atr_l / curr_price) if curr_price > 0 else 0.0
            is_choppy_regime_l = atr_pct_l < 0.0003

            mom_buy_score, mom_sell_score, mom_buy_sigs, mom_sell_sigs = calculate_momentum_score(
                price_history_capped, rsi_l, macd_hist_l, bb_up_l, bb_dn_l,
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
                    # Controlled re-entry after TP: require strong momentum AND below VWAP
                    if is_aggressive_live and mom_buy_score >= 3 and curr_price < vwap_l:
                        cash, _ = fetch_portfolio()
                        re_qty = int(cash * ALLOCATION_PCT * strategy_config.get("buy_fraction", 1.0) // curr_price)
                        if re_qty > 0:
                            logger.info(f"[STRATEGY] LIVE CONTROLLED RE-ENTRY after TP (score={mom_buy_score}, below VWAP={vwap_l:.2f}): Buying {re_qty} shares @ Rs. {curr_price:.2f}")
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
                    # Strict re-entry guard after SL: require very strong momentum + VWAP discount
                    if is_aggressive_live and mom_buy_score >= 3 and curr_price < vwap_l * 0.999:
                        cash, _ = fetch_portfolio()
                        re_qty = int(cash * ALLOCATION_PCT * strategy_config.get("buy_fraction", 1.0) // curr_price)
                        if re_qty > 0:
                            logger.info(f"[STRATEGY] LIVE GUARDED RE-ENTRY after SL (score={mom_buy_score}, below VWAP={vwap_l:.2f}): Buying {re_qty} shares @ Rs. {curr_price:.2f}")
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
            #    - VWAP filter: only buy when price is at or below VWAP (discount zone)
            elif held_qty == 0:
                buy_allowed = (is_aggressive_live) or (current_bias != "bearish")
                # ATR regime check for live mode
                live_min_score = 1 if is_aggressive_live else 2
                if is_choppy_regime_l:
                    live_min_score += 2  # require stronger confirmation in flat markets

                if buy_allowed and current_time - last_buy_time > cooldown_sec:
                    if is_aggressive_live:
                        buy_signals = list(mom_buy_sigs)
                        if macd_hist_l > 0:
                            buy_signals.append("MACD+")
                        if rsi_l <= buy_thresh:
                            buy_signals.append(f"RSI:{rsi_l:.1f}")
                        if ema9_l > ema21_l:
                            buy_signals.append("EMA-Bullish")
                        # VWAP filter: only buy below VWAP (price at a discount)
                        if curr_price > vwap_l * 1.001:
                            buy_signals = []  # above VWAP — no buy edge
                        buy_threshold = live_min_score
                    else:
                        buy_signals = [f"RSI:{rsi}" if rsi <= buy_thresh else None]
                        buy_signals = [s for s in buy_signals if s]
                        if ema9_quick > ema21_quick:
                            buy_signals.append("EMA-Bullish")
                        if curr_price > vwap_l * 1.002:
                            buy_signals = [s for s in buy_signals if "RSI" not in s]
                        buy_threshold = live_min_score

                    if len(buy_signals) >= buy_threshold:
                        buy_fraction = strategy_config.get("buy_fraction", 1.0)
                        max_alloc = cash * ALLOCATION_PCT * buy_fraction
                        buy_qty = int(max_alloc // curr_price)
                        if buy_qty > 0:
                            reasons = ", ".join(buy_signals)
                            logger.info(f"[STRATEGY] LIVE BUY ({reasons}, VWAP={vwap_l:.2f}) — Buying {buy_qty} shares @ Rs. {curr_price:.2f}")
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
            logger.error(f"Error in live trading loop: {str(e)}. Retrying on next tick...")

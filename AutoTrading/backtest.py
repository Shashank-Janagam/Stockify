from fastapi import FastAPI, APIRouter, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import pandas as pd
from indicator_engine.dsl import DSLEvaluator, LogicalCondition
from typing import Dict, Any, List, Optional, Union
import json
from datetime import datetime, timedelta

router = APIRouter()

DEFAULT_BUY_STRATEGY = {
    "operator": "AND",
    "conditions": [
        {
            "indicator": "EMA",
            "params": {"period": 20},
            "comparison": ">",
            "value": {
                "indicator": "EMA",
                "params": {"period": 50}
            }
        }
    ]
}

DEFAULT_SELL_STRATEGY = {
    "operator": "OR",
    "conditions": [
        {
            "indicator": "EMA",
            "params": {"period": 20},
            "comparison": "<",
            "value": {
                "indicator": "EMA",
                "params": {"period": 50}
            }
        }
    ]
}

def normalize_condition_tree(cond, default_strategy):
    if cond is None:
        return default_strategy
    if isinstance(cond, str):
        try:
            cond = json.loads(cond)
        except Exception:
            return default_strategy
    if isinstance(cond, list):
        if not cond:
            return default_strategy
        return {
            "operator": "AND",
            "conditions": [normalize_single_node(c) for c in cond if c]
        }
    if isinstance(cond, dict):
        if not cond:
            return default_strategy
        return normalize_single_node(cond, default_strategy)
    return default_strategy

def normalize_single_node(node, fallback=DEFAULT_BUY_STRATEGY):
    if not isinstance(node, dict):
        return fallback

    # Check if this node is a logical group (operator / logic + conditions)
    if 'operator' in node or 'logic' in node or 'conditions' in node:
        op = str(node.get('operator') or node.get('logic') or 'AND').strip().upper()
        if op not in ('AND', 'OR'):
            op = 'AND'
        sub_conds = node.get('conditions', [])
        if not isinstance(sub_conds, list):
            sub_conds = [sub_conds] if sub_conds else []
        norm_sub = [normalize_single_node(c) for c in sub_conds if c]
        if not norm_sub:
            norm_sub = fallback.get('conditions', [])
        return {
            "operator": op,
            "conditions": norm_sub
        }

    # Otherwise, it's a comparison condition
    ind = node.get('indicator') or node.get('left') or 'EMA'
    params = node.get('params') or node.get('left_params') or {}
    if not isinstance(params, dict):
        params = {}
    comp = node.get('comparison') or node.get('op') or '>'
    if comp not in ('>', '<', '>=', '<=', '==', '!='):
        comp = '>'

    val = node.get('value')
    if val is None:
        val = node.get('right_value')

    if node.get('right_type') == 'indicator' or (isinstance(val, dict) and ('indicator' in val or 'right' in val)):
        r_ind = val.get('indicator') or val.get('right') if isinstance(val, dict) else node.get('right') or 'EMA'
        r_params = val.get('params') or val.get('right_params') or {} if isinstance(val, dict) else node.get('right_params') or {}
        if not isinstance(r_params, dict):
            r_params = {}
        val = {
            "indicator": str(r_ind),
            "params": r_params
        }
    else:
        try:
            val = float(val) if val is not None else 50.0
        except (ValueError, TypeError):
            val = 50.0

    return {
        "indicator": str(ind),
        "params": params,
        "comparison": comp,
        "value": val
    }

@router.get("/health")
def health_check():
    return {"status": "AutoTrading Python Engine is LIVE!"}

@router.post("/evaluate")
async def evaluate_strategy(request: Request):
    try:
        try:
            req_data = await request.json()
        except Exception:
            req_data = {}
        if not isinstance(req_data, dict):
            req_data = {}

        # 1. Parse Tickers / Symbols
        ticker_val = (
            req_data.get("ticker")
            or req_data.get("symbol")
            or req_data.get("tickers")
            or req_data.get("symbols")
            or "RELIANCE.NS"
        )
        if isinstance(ticker_val, list):
            tickers = [str(t).strip() for t in ticker_val if str(t).strip()]
        else:
            tickers = [t.strip() for t in str(ticker_val).split(',') if t.strip()]
        if not tickers:
            tickers = ["RELIANCE.NS"]

        # 2. Parse Dates
        end_date = req_data.get("end_date") or req_data.get("endDate")
        if not end_date or not str(end_date).strip():
            end_date = datetime.now().strftime("%Y-%m-%d")
        else:
            end_date = str(end_date).strip()

        start_date = req_data.get("start_date") or req_data.get("startDate")
        if not start_date or not str(start_date).strip():
            try:
                end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                start_date = (end_dt - timedelta(days=365)).strftime("%Y-%m-%d")
            except Exception:
                start_date = "2023-01-01"
        else:
            start_date = str(start_date).strip()

        # 3. Capital
        cap_val = req_data.get("initial_capital") if req_data.get("initial_capital") is not None else req_data.get("initialCapital")
        if cap_val is None:
            cap_val = req_data.get("capital", 100000.0)
        try:
            total_initial_capital = float(cap_val)
        except (ValueError, TypeError):
            total_initial_capital = 100000.0

        # 4. Stop Loss
        sl_val = req_data.get("stop_loss_pct") if req_data.get("stop_loss_pct") is not None else req_data.get("stopLossPct")
        if sl_val is None:
            sl_val = req_data.get("stop_loss", 0.05)
        try:
            stop_loss_pct = float(sl_val)
            if stop_loss_pct > 1.0:
                stop_loss_pct = stop_loss_pct / 100.0
        except (ValueError, TypeError):
            stop_loss_pct = 0.05

        stop_loss_type = str(req_data.get("stop_loss_type") or req_data.get("stopLossType") or "fixed").lower()
        if "trailing" in stop_loss_type:
            stop_loss_type = "trailing"
        else:
            stop_loss_type = "fixed"

        # 5. Timeframe
        timeframe = str(req_data.get("timeframe") or req_data.get("interval") or "1D").upper()

        # 6. Strategies
        raw_buy = (
            req_data.get("buy_strategy")
            or req_data.get("buyStrategy")
            or req_data.get("entry_conditions")
            or req_data.get("entryConditions")
            or req_data.get("buyDsl")
        )
        raw_sell = (
            req_data.get("sell_strategy")
            or req_data.get("sellStrategy")
            or req_data.get("exit_conditions")
            or req_data.get("exitConditions")
            or req_data.get("sellDsl")
        )

        norm_buy = normalize_condition_tree(raw_buy, DEFAULT_BUY_STRATEGY)
        norm_sell = normalize_condition_tree(raw_sell, DEFAULT_SELL_STRATEGY)

        try:
            buy_cond = LogicalCondition(**norm_buy)
        except Exception:
            buy_cond = LogicalCondition(**DEFAULT_BUY_STRATEGY)
            norm_buy = DEFAULT_BUY_STRATEGY

        try:
            sell_cond = LogicalCondition(**norm_sell)
        except Exception:
            sell_cond = LogicalCondition(**DEFAULT_SELL_STRATEGY)
            norm_sell = DEFAULT_SELL_STRATEGY

        evaluator = DSLEvaluator()

        capital_per_ticker = total_initial_capital / len(tickers)
        total_final_capital = 0
        total_trades_count = 0
        stock_reports = []

        for idx, ticker in enumerate(tickers):
            tf_map = {"1M": "1m", "5M": "5m", "15M": "15m", "1H": "1h", "1D": "1d", "1W": "1wk"}
            yf_interval = tf_map.get(timeframe, "1d")

            yf_end = end_date
            try:
                end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                yf_end = (end_dt + timedelta(days=1)).strftime("%Y-%m-%d")
            except Exception:
                pass

            df = yf.download(ticker, start=start_date, end=yf_end, interval=yf_interval, progress=False)
            if df.empty:
                continue

            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            df.columns = [str(c).lower() for c in df.columns]

            df.dropna(subset=['close'], inplace=True)
            if df.empty:
                continue

            # Extract indicators and thresholds to attach to frontend
            used_indicators = {}
            def extract_indicators(cond_dict):
                if not isinstance(cond_dict, dict):
                    return
                if 'operator' in cond_dict and 'conditions' in cond_dict:
                    for c in cond_dict.get('conditions', []):
                        extract_indicators(c)
                elif 'indicator' in cond_dict:
                    ind = cond_dict.get('indicator')
                    params = cond_dict.get('params', {}) or {}
                    if ind and ind != 'Close':
                        key = f"{ind}_{'_'.join(f'{k}{v}' for k,v in params.items())}"
                        try:
                            res = evaluator.registry.calculate(ind, df, params)
                            if isinstance(res, pd.DataFrame):
                                for col in res.columns:
                                    used_indicators[f"{key}_{col}"] = res[col]
                            else:
                                used_indicators[key] = res
                        except Exception:
                            pass

                    val = cond_dict.get('value')
                    if isinstance(val, dict) and 'indicator' in val:
                        extract_indicators(val)
                    elif isinstance(val, (int, float)):
                        key = f"Threshold_{val}"
                        used_indicators[key] = float(val)

            extract_indicators(norm_buy)
            extract_indicators(norm_sell)

            for k, v in used_indicators.items():
                df[k] = v

            try:
                buy_eval = evaluator.evaluate(buy_cond, df)
                sell_eval = evaluator.evaluate(sell_cond, df)
                df['buy_signal'] = buy_eval['signal'].fillna(False).astype(bool)
                df['buy_reason'] = buy_eval['reason'].fillna('')
                df['sell_signal'] = sell_eval['signal'].fillna(False).astype(bool)
                df['sell_reason'] = sell_eval['reason'].fillna('')
            except Exception:
                df['buy_signal'] = False
                df['buy_reason'] = ''
                df['sell_signal'] = False
                df['sell_reason'] = ''

            capital = capital_per_ticker
            shares_held = 0
            buy_price = 0.0
            highest_price = 0.0
            trades = 0

            trade_log = []
            price_history = []

            for date, row in df.iterrows():
                current_price = float(row['close'])
                if pd.isna(current_price):
                    continue
                date_str = str(date)

                point = {"date": date_str, "price": round(current_price, 2)}
                for k in used_indicators.keys():
                    val = row.get(k)
                    if not pd.isna(val):
                        point[k] = round(float(val), 2)

                price_history.append(point)

                # 0. Update Trailing High
                if shares_held > 0:
                    highest_price = max(highest_price, current_price)

                # 1. Stop Loss
                if shares_held > 0:
                    sl_price = highest_price * (1 - stop_loss_pct) if stop_loss_type == 'trailing' else buy_price * (1 - stop_loss_pct)
                    if current_price <= sl_price:
                        sell_value = shares_held * current_price
                        trade_pnl = sell_value - (shares_held * buy_price)
                        capital += sell_value
                        trades += 1
                        sl_name = "Trailing Stop" if stop_loss_type == 'trailing' else "Stop Loss"
                        trade_log.append({
                            "ticker": ticker,
                            "type": "STOP_LOSS",
                            "date": date_str,
                            "price": round(current_price, 2),
                            "shares": shares_held,
                            "pnl": round(trade_pnl, 2),
                            "capital": round(capital, 2),
                            "reason": f"{sl_name} Hit (-{round(stop_loss_pct*100, 2)}%)"
                        })
                        shares_held = 0
                        buy_price = 0.0
                        highest_price = 0.0
                        continue

                # 2. Buy Signal
                if row['buy_signal'] and shares_held == 0:
                    shares_held = int(capital // current_price)
                    if shares_held > 0:
                        cost = shares_held * current_price
                        capital -= cost
                        buy_price = current_price
                        highest_price = current_price
                        reason_str = row.get('buy_reason', 'Strategy BUY Condition Met')
                        trade_log.append({
                            "ticker": ticker,
                            "type": "BUY",
                            "date": date_str,
                            "price": round(buy_price, 2),
                            "shares": shares_held,
                            "cost": round(cost, 2),
                            "reason": reason_str
                        })

                # 3. Intraday Square Off (15:15)
                elif hasattr(date, 'hour') and date.hour == 15 and date.minute >= 15 and shares_held > 0:
                    sell_value = shares_held * current_price
                    trade_pnl = sell_value - (shares_held * buy_price)
                    capital += sell_value
                    trades += 1
                    trade_log.append({
                        "ticker": ticker,
                        "type": "SELL",
                        "date": date_str,
                        "price": round(current_price, 2),
                        "shares": shares_held,
                        "pnl": round(trade_pnl, 2),
                        "capital": round(capital, 2),
                        "reason": "Intraday Square Off (15:15)"
                    })
                    shares_held = 0
                    buy_price = 0.0
                    highest_price = 0.0

            if shares_held > 0:
                current_price = float(df.iloc[-1]['close'])
                sell_value = shares_held * current_price
                trade_pnl = sell_value - (shares_held * buy_price)
                capital += sell_value
                trades += 1
                trade_log.append({
                    "ticker": ticker,
                    "type": "AUTO_CLOSE",
                    "date": str(df.index[-1]),
                    "price": round(current_price, 2),
                    "shares": shares_held,
                    "pnl": round(trade_pnl, 2),
                    "capital": round(capital, 2),
                    "reason": "Backtest Period Ended"
                })

            total_final_capital += capital
            total_trades_count += trades

            stock_pnl = capital - capital_per_ticker
            stock_roi = (stock_pnl / capital_per_ticker) * 100 if capital_per_ticker > 0 else 0

            stock_reports.append({
                "ticker": ticker,
                "summary": {
                    "trades": trades,
                    "initial_capital": round(capital_per_ticker, 2),
                    "final_capital": round(capital, 2),
                    "total_pnl": round(stock_pnl, 2),
                    "roi": round(stock_roi, 2)
                },
                "trade_log": trade_log,
                "price_history": price_history
            })

        total_pnl = total_final_capital - total_initial_capital
        roi = (total_pnl / total_initial_capital) * 100 if total_initial_capital > 0 else 0

        return {
            "success": True,
            "portfolio_summary": {
                "tickers": ",".join(tickers),
                "trades": total_trades_count,
                "initial_capital": round(total_initial_capital, 2),
                "final_capital": round(total_final_capital, 2),
                "total_pnl": round(total_pnl, 2),
                "roi": round(roi, 2)
            },
            "stock_reports": stock_reports
        }

    except Exception as e:
        return {"error": str(e)}



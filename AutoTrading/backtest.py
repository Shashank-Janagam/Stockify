from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import pandas as pd
from indicator_engine.dsl import DSLEvaluator, LogicalCondition
from typing import Dict, Any, List
import json

from fastapi import APIRouter
router = APIRouter()



class EvaluateRequest(BaseModel):
    ticker: str
    start_date: str
    end_date: str
    buy_strategy: Dict[str, Any]
    sell_strategy: Dict[str, Any]
    initial_capital: float = 100000.0
    stop_loss_pct: float = 0.05
    stop_loss_type: str = "fixed"
    timeframe: str = "1D"

@router.get("/health")
def health_check():
    return {"status": "AutoTrading Python Engine is LIVE!"}

@router.post("/evaluate")
def evaluate_strategy(req: EvaluateRequest):
    try:
        tickers = [t.strip() for t in req.ticker.split(',') if t.strip()]
        if not tickers:
            return {"error": "No tickers provided"}

        # Convert raw dictionaries back into our DSL Models!
        buy_cond = LogicalCondition(**req.buy_strategy)
        sell_cond = LogicalCondition(**req.sell_strategy)
        evaluator = DSLEvaluator()

        total_initial_capital = req.initial_capital
        capital_per_ticker = total_initial_capital / len(tickers)
        
        total_final_capital = 0
        total_trades_count = 0
        
        stock_reports = []

        for idx, ticker in enumerate(tickers):
            # Map frontend timeframe to yfinance interval
            tf_map = {"1M": "1m", "5M": "5m", "15M": "15m", "1H": "1h", "1D": "1d", "1W": "1wk"}
            yf_interval = tf_map.get(req.timeframe.upper(), "1d")

            # yfinance 'end' date is exclusive. To actually include the user's selected end_date
            # (which is crucial for single-day backtests), we MUST add 1 day to it.
            yf_end = req.end_date
            try:
                from datetime import datetime, timedelta
                end_dt = datetime.strptime(req.end_date, "%Y-%m-%d")
                yf_end = (end_dt + timedelta(days=1)).strftime("%Y-%m-%d")
            except Exception:
                pass

            df = yf.download(ticker, start=req.start_date, end=yf_end, interval=yf_interval, progress=False)
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
                if 'operator' in cond_dict and 'conditions' in cond_dict:
                    for c in cond_dict['conditions']:
                        extract_indicators(c)
                elif 'indicator' in cond_dict:
                    ind = cond_dict['indicator']
                    params = cond_dict.get('params', {})
                    if ind != 'Close':
                        key = f"{ind}_{'_'.join(f'{k}{v}' for k,v in params.items())}"
                        try:
                            res = evaluator.registry.calculate(ind, df, params)
                            if isinstance(res, pd.DataFrame):
                                for col in res.columns:
                                    used_indicators[f"{key}_{col}"] = res[col]
                            else:
                                used_indicators[key] = res
                        except: pass
                    
                    val = cond_dict.get('value')
                    if isinstance(val, dict) and 'indicator' in val:
                        extract_indicators(val)
                    elif isinstance(val, (int, float)):
                        key = f"Threshold_{val}"
                        used_indicators[key] = float(val)

            extract_indicators(req.buy_strategy)
            extract_indicators(req.sell_strategy)
            
            for k, v in used_indicators.items():
                df[k] = v

            buy_eval = evaluator.evaluate(buy_cond, df)
            sell_eval = evaluator.evaluate(sell_cond, df)
            
            df['buy_signal'] = buy_eval['signal'].fillna(False).astype(bool)
            df['buy_reason'] = buy_eval['reason'].fillna('')
            df['sell_signal'] = sell_eval['signal'].fillna(False).astype(bool)
            df['sell_reason'] = sell_eval['reason'].fillna('')

            capital = capital_per_ticker
            shares_held = 0
            buy_price = 0.0
            highest_price = 0.0
            trades = 0
            
            trade_log = []
            price_history = []

            for date, row in df.iterrows():
                current_price = float(row['close'])
                if pd.isna(current_price): continue
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
                    sl_price = highest_price * (1 - req.stop_loss_pct) if req.stop_loss_type == 'trailing' else buy_price * (1 - req.stop_loss_pct)
                    if current_price <= sl_price:
                        sell_value = shares_held * current_price
                        trade_pnl = sell_value - (shares_held * buy_price)
                        capital += sell_value
                        trades += 1
                        sl_name = "Trailing Stop" if req.stop_loss_type == 'trailing' else "Stop Loss"
                        trade_log.append({"ticker": ticker, "type": "STOP_LOSS", "date": date_str, "price": round(current_price, 2), "shares": shares_held, "pnl": round(trade_pnl, 2), "capital": round(capital, 2), "reason": f"{sl_name} Hit (-{req.stop_loss_pct*100}%)"})
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
                        trade_log.append({"ticker": ticker, "type": "BUY", "date": date_str, "price": round(buy_price, 2), "shares": shares_held, "cost": round(cost, 2), "reason": reason_str})
                        
                # 3. Sell Signal
                elif row['sell_signal'] and shares_held > 0:
                    sell_value = shares_held * current_price
                    trade_pnl = sell_value - (shares_held * buy_price)
                    capital += sell_value
                    trades += 1
                    reason_str = row.get('sell_reason', 'Strategy SELL Condition Met')
                    trade_log.append({"ticker": ticker, "type": "SELL", "date": date_str, "price": round(current_price, 2), "shares": shares_held, "pnl": round(trade_pnl, 2), "capital": round(capital, 2), "reason": reason_str})
                    shares_held = 0
                    buy_price = 0.0
                    highest_price = 0.0

            if shares_held > 0:
                current_price = float(df.iloc[-1]['close'])
                sell_value = shares_held * current_price
                trade_pnl = sell_value - (shares_held * buy_price)
                capital += sell_value
                trades += 1
                trade_log.append({"ticker": ticker, "type": "AUTO_CLOSE", "date": str(df.index[-1]), "price": round(current_price, 2), "shares": shares_held, "pnl": round(trade_pnl, 2), "capital": round(capital, 2), "reason": "Backtest Period Ended"})

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
                "tickers": req.ticker,
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


import websockets
from pymongo import MongoClient
from indicator_engine.dsl import DSLEvaluator, LogicalCondition
import asyncio
import json
import pandas as pd
from datetime import datetime
import argparse


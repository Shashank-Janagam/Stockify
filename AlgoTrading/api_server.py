"""
api_server.py — Standalone FastAPI Server for AlgoTrading
=========================================================
Supports custom 8-parameter strategy configuration, backtesting, live previews,
and dynamic strategy registration.
"""
import sys
import os
import math
import logging
import threading
import asyncio
import json
import requests
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Any, Union, Dict, List
from dataclasses import asdict
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from Algos import (
    BacktestEngine, Candle, strategy_registry, indicator_engine,
    SizingMode, RiskConfig
)
from Algos.strategies import *

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AlgoAPI")

app = FastAPI(title="AlgoTrading API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class BacktestRequest(BaseModel):
    symbol: str
    period: Optional[str] = "1y"
    interval: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    initial_capital: Optional[float] = 100000.0
    strategy: Optional[str] = "CustomStrategy"
    strategy_name: Optional[str] = None
    config: Optional[Any] = None
    strategy_config: Optional[dict] = None

class BacktestAllRequest(BaseModel):
    symbol: str
    period: Optional[str] = "1y"
    interval: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    initial_capital: Optional[float] = 100000.0

class IndicatorPreviewRequest(BaseModel):
    symbol: str
    period: Optional[str] = "3mo"
    interval: Optional[str] = None
    indicator_name: Optional[str] = "Formula"
    formula: Optional[str] = None
    params: Optional[dict] = None

def resolve_interval(days: int, custom_interval: str = None) -> str:
    """
    Selects minimum possible interval to get data:
    - <= 7d (1d, 5d, 7d, single_day): '1m'
    - <= 60d (1mo): '2m'
    - 6m, 1y, 2y, 3y, 4y, 5y (<= 1825d): '1h'
    - > 5y (max): '1d'
    """
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

def load_candles(symbol: str, period: str = None, start: str = None, end: str = None, interval: str = None) -> list[Candle]:
    import yfinance as yf
    import datetime
    # Suppress yfinance logging manually inside the function
    logging.getLogger('yfinance').setLevel(logging.CRITICAL)
    
    clean_sym = symbol.strip().upper()
    ticker_sym = f"{clean_sym}.NS" if ("." not in clean_sym and not clean_sym.startswith("^")) else clean_sym
    ticker = yf.Ticker(ticker_sym)
    
    if start or end:
        try:
            if not end:
                end_dt = datetime.datetime.now()
            else:
                end_dt = datetime.datetime.strptime(end[:10], "%Y-%m-%d")
                
            if not start:
                start_dt = end_dt - datetime.timedelta(days=365)
            else:
                start_dt = datetime.datetime.strptime(start[:10], "%Y-%m-%d")
            
            target_days = max(1, (end_dt - start_dt).days + 1)
            selected_interval = resolve_interval(target_days, interval)
            
            # Lookback padding so EMA 50, EMA 200, RSI, etc. have sufficient warmup
            if selected_interval == "1m":
                pad_days = 6 # max 7d for 1m
            elif selected_interval in ["2m", "5m", "15m", "30m"]:
                pad_days = 55 # max 60d for intraday
            elif selected_interval in ["60m", "1h"]:
                pad_days = 180
            else:
                pad_days = 365 # 1d, 5d, etc.
                
            padded_start = (start_dt - datetime.timedelta(days=pad_days)).strftime("%Y-%m-%d")
            end_fetch_dt = (end_dt + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
            
            df = ticker.history(start=padded_start, end=end_fetch_dt, interval=selected_interval)
        except Exception as e:
            logger.warning(f"Error loading candles for custom date range ({start} to {end}): {e}")
            df = ticker.history(period="1y", interval=resolve_interval(365, interval))
    else:
        period_str = (period or "1y").lower().strip()
        period_map = {
            "1d": 1, "5d": 5, "7d": 7, "1mo": 30, "3mo": 90, "6mo": 180,
            "1y": 365, "2y": 730, "5y": 1825, "max": 9999
        }
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

    if df is None or df.empty:
        return []
    
    candles = []
    for idx, row in df.iterrows():
        if row.get("Close") is None or (isinstance(row["Close"], float) and math.isnan(row["Close"])):
            continue
        candles.append(Candle(
            timestamp=str(idx),
            open=float(row["Open"]),
            high=float(row["High"]),
            low=float(row["Low"]),
            close=float(row["Close"]),
            volume=float(row.get("Volume", 0.0))
        ))
    return candles

@app.get("/schema/capabilities")
def get_capabilities():
    """
    Returns full metadata about built-in indicators, mathematical formula capabilities,
    available comparators, logical operators, and registered strategies.
    Used by PaperBull's visual strategy builder.
    """
    return {
        "indicators": [
            {"name": "SMA", "params": {"period": 20}},
            {"name": "EMA", "params": {"period": 20}},
            {"name": "RSI", "params": {"period": 14}},
            {"name": "MACD", "params": {"fast": 12, "slow": 26, "signal": 9}},
            {"name": "BollingerBands", "params": {"period": 20, "std_dev": 2.0}},
            {"name": "ATR", "params": {"period": 14}},
            {"name": "VWAP", "params": {}},
            {"name": "SuperTrend", "params": {"period": 10, "multiplier": 3.0}},
            {"name": "ADX", "params": {"period": 14}},
            {"name": "Stochastic", "params": {"k_period": 14, "d_period": 3}},
            {"name": "OBV", "params": {}},
            {"name": "ROC", "params": {"period": 10}},
            {"name": "CCI", "params": {"period": 20}},
            {"name": "WilliamsR", "params": {"period": 14}},
            {"name": "HullMA", "params": {"period": 20}},
            {"name": "DonchianChannels", "params": {"period": 20}},
            {"name": "KeltnerChannels", "params": {"period": 20, "multiplier": 1.5}},
            {"name": "Ichimoku", "params": {"tenkan": 9, "kijun": 26, "senkou_b": 52}},
            {"name": "PSAR", "params": {"af_start": 0.02, "af_max": 0.2}},
            {"name": "MoneyFlowIndex", "params": {"period": 14}},
            {"name": "PivotPoints", "params": {"mode": "standard"}},
            {"name": "RollingHighest", "params": {"period": 20}},
            {"name": "RollingLowest", "params": {"period": 20}},
            {"name": "Formula", "params": {"formula": "(close - open) / open * 100"}},
        ],
        "comparators": ["GreaterThan", "LessThan", "CrossAbove", "CrossBelow", "Between", "AtOrAbove", "AtOrBelow"],
        "logical_operators": ["AND", "OR", "NOT", "AT_LEAST"],
        "strategies": strategy_registry.list_all(),
    }

@app.post("/indicators/preview")
async def preview_indicator(req: IndicatorPreviewRequest):
    """
    Calculates and previews an indicator (or custom formula) on real market data.
    """
    try:
        candles = load_candles(req.symbol, period=req.period, interval=req.interval)
        if not candles:
            raise HTTPException(status_code=400, detail=f"No candle data available for {req.symbol}")
        
        ind_name = req.indicator_name or "Formula"
        params = req.params or {}
        if req.formula:
            ind_name = "Formula"
            params["formula"] = req.formula
            
        result = indicator_engine.calculate(ind_name, candles, symbol=req.symbol, use_cache=False, **params)
        
        # Serialize dataclass if needed
        data = asdict(result) if hasattr(result, "__dataclass_fields__") else result
        
        return {
            "success": True,
            "symbol": req.symbol,
            "indicator": ind_name,
            "candles_count": len(candles),
            "timestamps": [c.timestamp for c in candles],
            "close_prices": [c.close for c in candles],
            "data": data
        }
    except Exception as e:
        logger.error(f"Indicator preview failed: {e}")
        return {"success": False, "error": str(e)}

@app.post("/backtest")
async def run_backtest(req: BacktestRequest):
    logger.info(f"Received backtest request for symbol: {req.symbol}, strategy: {req.strategy_name}")
    try:
        strat_name = req.strategy_name or req.strategy or "JsonStrategy"
        strat_config = req.strategy_config or req.config
        
        # Position sizing resolution
        sizing_mode = "PERCENT_EQUITY"
        sizing_kwargs = {}
        if strat_config and isinstance(strat_config, dict):
            sz = strat_config.get("position_sizing", {})
            if isinstance(sz, dict):
                sizing_mode = sz.get("mode", "PERCENT_EQUITY")
                sizing_kwargs = {
                    "percent_equity": sz.get("percent_equity", 10.0),
                    "fixed_qty": sz.get("fixed_qty", 10),
                    "risk_per_trade_pct": sz.get("risk_per_trade_pct", 1.0)
                }

        if req.strategy_config or (req.config and (isinstance(req.config, dict) or (isinstance(req.config, str) and req.config.strip().startswith("{")))):
            cls = strategy_registry.get("JsonStrategy")
            strategy_instance = cls(params={"strategy_config": req.strategy_config or req.config})
        else:
            if strat_name not in strategy_registry.list_all():
                raise HTTPException(status_code=400, detail=f"Strategy {strat_name} not found.")
            cls = strategy_registry.get(strat_name)
            params = {"config": req.config} if req.config else {}
            strategy_instance = cls(params=params)
        
        # Timeframe resolution
        interval = req.interval
        if not interval and strat_config and isinstance(strat_config, dict):
            tf = strat_config.get("timeframe", {})
            if isinstance(tf, dict) and tf.get("interval"):
                interval = tf.get("interval")

        # Load Data with warmup lookback
        candles = load_candles(req.symbol, period=req.period, start=req.start_date, end=req.end_date, interval=interval)
        if len(candles) < 15:
            raise HTTPException(status_code=400, detail=f"Not enough historical data for {req.symbol} (got {len(candles)} candles). The strategy requires at least 15 trading candles to calculate indicators.")

        # Determine target date range
        target_start = ""
        target_end = ""
        if req.start_date:
            target_start = req.start_date[:10]
            target_end = (req.end_date or req.start_date)[:10]
        elif (req.period or "").lower().strip() == "1d" and candles:
            target_start = candles[-1].timestamp[:10]
            target_end = candles[-1].timestamp[:10]
        elif (req.period or "").lower().strip() == "5d" and candles:
            unique_days = sorted(list(set(c.timestamp[:10] for c in candles)))
            target_start = unique_days[-5] if len(unique_days) >= 5 else unique_days[0]
            target_end = unique_days[-1]

        # Run Backtest with dynamic sizing & capital
        init_cap = req.initial_capital or 100000.0
        warm_up = min(50, max(5, len(candles) // 4)) if len(candles) < 60 else 50
        engine = BacktestEngine(
            initial_capital=init_cap,
            warm_up_period=warm_up,
            sizing_mode=sizing_mode,
            sizing_kwargs=sizing_kwargs
        )
        report = engine.run(
            strategy_instance, 
            candles, 
            symbol=req.symbol,
            target_start_str=target_start,
            target_end_str=target_end
        )
        
        # ── Extract Indicator Series for Frontend Chart Overlay ─────────────────
        visible_ts_set = set(pt["x"] for pt in report.price_data)
        indicator_series = []
        cache = getattr(strategy_instance, "_indicator_cache", {})
        
        INDICATOR_COLORS = {
            "ema_50":  {"color": "#38bdf8", "label": "Fast EMA (50)",  "width": 1.5},
            "ema_20":  {"color": "#06b6d4", "label": "Fast EMA (20)",  "width": 1.5},
            "ema_100": {"color": "#a78bfa", "label": "EMA (100)",      "width": 1.5},
            "ema_200": {"color": "#f59e0b", "label": "Slow EMA (200)", "width": 1.5},
            "sma_50":  {"color": "#818cf8", "label": "SMA (50)",       "width": 1.5},
            "sma_200": {"color": "#fb923c", "label": "SMA (200)",      "width": 1.5},
            "rsi_14":  {"color": "#34d399", "label": "RSI (14)",       "width": 1.5},
        }
        
        def safe_float(v):
            """Convert to float, returning None for nan/inf so JSON won't crash."""
            try:
                f = float(v)
                if math.isnan(f) or math.isinf(f):
                    return None
                return f
            except (TypeError, ValueError):
                return None
        
        for key, series in cache.items():
            if not isinstance(series, list) or len(series) == 0:
                continue
            
            # Convert series to safe floats (skip entirely if non-numeric)
            float_series = []
            for v in series:
                sf = safe_float(v)
                float_series.append(sf)
            
            if not any(v is not None for v in float_series):
                continue  # all nan — skip this indicator
            
            # Align series with candles — series may be shorter (warmup period)
            offset = len(candles) - len(float_series)
            points = []
            for i, val in enumerate(float_series):
                if val is None:
                    continue  # skip nan warmup points
                candle_idx = i + offset
                if 0 <= candle_idx < len(candles):
                    c_ts = candles[candle_idx].timestamp
                    # Only include indicator point if it belongs to the visible report window
                    if not visible_ts_set or c_ts in visible_ts_set:
                        points.append({"x": c_ts, "y": val})
            
            meta = INDICATOR_COLORS.get(key)
            if not meta:
                label = key.upper().replace("_", " ")
                color = "#38bdf8"
                if key.startswith("ema_"):
                    p_num = key.split("_")[1]
                    label = f"EMA ({p_num})"
                    color = "#38bdf8" if int(p_num) <= 50 else ("#f59e0b" if int(p_num) >= 200 else "#a78bfa")
                elif key.startswith("sma_"):
                    p_num = key.split("_")[1]
                    label = f"SMA ({p_num})"
                    color = "#818cf8"
                elif key.startswith("rsi_"):
                    label = f"RSI ({key.split('_')[1]})"
                    color = "#34d399"
                meta = {"color": color, "label": label, "width": 1.5}

            indicator_series.append({
                "key":    key,
                "label":  meta["label"],
                "color":  meta["color"],
                "width":  meta["width"],
                "values": points
            })
        
        # Sanitize the report dataclass — replace any nan/inf in numeric fields
        report_dict = asdict(report)
        
        def sanitize_dict(obj):
            if isinstance(obj, dict):
                return {k: sanitize_dict(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [sanitize_dict(i) for i in obj]
            elif isinstance(obj, float):
                if math.isnan(obj) or math.isinf(obj):
                    return None
                return obj
            return obj
        
        return {"success": True, "report": sanitize_dict(report_dict), "indicator_series": indicator_series}
        
    except Exception as e:
        logger.error(f"Backtest failed: {e}")
        return {"success": False, "error": str(e)}

@app.post("/backtest/all")
async def run_backtest_all(req: BacktestAllRequest):
    logger.info(f"Received backtest-all request: {req}")
    try:
        candles = load_candles(req.symbol, period=req.period, start=req.start_date, end=req.end_date, interval=req.interval)
        if len(candles) < 15:
            raise HTTPException(status_code=400, detail=f"Not enough historical data for {req.symbol} (got {len(candles)} candles). The strategy requires at least 15 trading candles to calculate indicators.")

        reports = []
        strategies = [s for s in strategy_registry.list_all() if s not in ("JsonStrategy", "CustomStrategy")]
        warm_up = min(50, max(5, len(candles) // 4)) if len(candles) < 60 else 50
        for strat_name in strategies:
            try:
                cls = strategy_registry.get(strat_name)
                strategy_instance = cls(params={})
                engine = BacktestEngine(initial_capital=req.initial_capital or 100000.0, warm_up_period=warm_up)
                report = engine.run(strategy_instance, candles, symbol=req.symbol)
                reports.append(asdict(report))
            except Exception as e:
                logger.error(f"Strategy {strat_name} failed in backtest all: {e}")

        return {"success": True, "reports": reports}
    except Exception as e:
        logger.error(f"Backtest All failed: {e}")
        return {"success": False, "error": str(e)}

# ── Strategy Projects Persistence ───────────────────────────────────────────
import json
import uuid
import datetime

PROJECTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saved_strategy_projects.json")

class StrategyProject(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    symbol: Optional[str] = "TCS"
    timeframe: Optional[dict] = None
    initial_capital: Optional[float] = 100000.0
    strategy_config: Optional[dict] = None
    last_report: Optional[dict] = None

class ExecuteProjectRequest(BaseModel):
    symbol: str
    strategy_config: dict
    period: Optional[str] = "5d"
    interval: Optional[str] = None
    initial_capital: Optional[float] = 100000.0

def _load_projects_file() -> list[dict]:
    if os.path.exists(PROJECTS_FILE):
        try:
            with open(PROJECTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def _save_projects_file(projects: list[dict]):
    try:
        with open(PROJECTS_FILE, "w", encoding="utf-8") as f:
            json.dump(projects, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save projects file: {e}")

@app.get("/strategies/projects")
def list_strategy_projects():
    """List all saved strategy projects."""
    projects = _load_projects_file()
    return {"success": True, "projects": projects}

@app.post("/strategies/projects")
def save_strategy_project(proj: StrategyProject):
    """Create or update a strategy project."""
    projects = _load_projects_file()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    proj_id = proj.id or str(uuid.uuid4())
    existing_idx = next((i for i, p in enumerate(projects) if p.get("id") == proj_id), -1)
    
    proj_dict = proj.dict()
    proj_dict["id"] = proj_id
    proj_dict["updated_at"] = now_iso
    if existing_idx >= 0:
        proj_dict["created_at"] = projects[existing_idx].get("created_at", now_iso)
        projects[existing_idx] = proj_dict
    else:
        proj_dict["created_at"] = proj.created_at or now_iso
        projects.insert(0, proj_dict)
        
    _save_projects_file(projects)
    return {"success": True, "project": proj_dict}

@app.delete("/strategies/projects/{project_id}")
def delete_strategy_project(project_id: str):
    """Delete a saved strategy project by ID."""
    projects = _load_projects_file()
    new_projects = [p for p in projects if p.get("id") != project_id]
    _save_projects_file(new_projects)
    return {"success": True, "deleted_id": project_id}

@app.post("/strategies/execute")
async def execute_strategy(req: ExecuteProjectRequest):
    """
    Execute strategy on latest market candles for immediate signal evaluation and paper execution.
    """
    logger.info(f"Executing strategy {req.strategy_config.get('name', 'Custom')} on {req.symbol}")
    try:
        cls = strategy_registry.get("JsonStrategy")
        strategy_instance = cls(params={"strategy_config": req.strategy_config})
        
        interval = req.interval
        if not interval and isinstance(req.strategy_config, dict):
            tf = req.strategy_config.get("timeframe", {})
            if isinstance(tf, dict) and tf.get("interval"):
                interval = tf.get("interval")
                
        candles = load_candles(req.symbol, period=req.period or "5d", interval=interval)
        if len(candles) < 15:
            raise HTTPException(status_code=400, detail=f"Not enough market data to execute strategy for {req.symbol}")

        engine = BacktestEngine(initial_capital=req.initial_capital or 100000.0, warm_up_period=min(50, len(candles) // 4))
        report = engine.run(strategy_instance, candles, symbol=req.symbol)
        
        latest_signal = report.signals[-1] if report.signals else None
        
        return {
            "success": True,
            "symbol": req.symbol,
            "candles_analyzed": len(candles),
            "latest_candle": {
                "timestamp": candles[-1].timestamp,
                "close": candles[-1].close,
                "volume": candles[-1].volume
            },
            "latest_signal": latest_signal,
            "total_signals_generated": len(report.signals),
            "executed_trades": report.trades,
            "final_equity": report.final_equity,
            "total_return_pct": report.total_return_pct
        }
    except Exception as e:
        logger.error(f"Strategy execution failed: {e}")
        return {"success": False, "error": str(e)}

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "AlgoTrading API v2.0"}


# ══════════════════════════════════════════════════════════════════════════════
# PaperBull Strategy Studio — Native API Endpoints
# ══════════════════════════════════════════════════════════════════════════════

class PaperBullVisualRequest(BaseModel):
    """Payload from the Visual Strategy Builder UI."""
    universe: dict       # {market, min_price, max_price, min_volume, ranking, top_n}
    entry: dict          # {conditions: [{indicator, params, op, value}], weight}
    exit: dict           # {conditions: [{indicator, params, op, value}], weight, square_off_time}
    portfolio: dict      # {capital, interval, start, end, warm_up_days}
    strategy_name: Optional[str] = "VisualStrategy"

class PaperBullCodeRequest(BaseModel):
    """Payload from the Python Code Editor UI."""
    code: str            # Full Python class source inheriting from Strategy
    portfolio: dict      # {capital, market, symbols, interval, start, end, warm_up_days}
    strategy_name: Optional[str] = "CodeStrategy"


def _serialize_report(report) -> dict:
    """Convert a PaperBull BacktestReport or MultiSymbolReport to JSON-safe dict."""
    if report is None:
        return {}

    base = {
        "strategy_name": getattr(report, "strategy_name", ""),
        "period_from":   getattr(report, "period_from", ""),
        "period_to":     getattr(report, "period_to", ""),
        "initial_capital":   getattr(report, "initial_capital", 0),
        "final_equity":      getattr(report, "final_equity", 0),
        "total_return_pct":  round(getattr(report, "total_return_pct", 0), 3),
        "total_trades":      getattr(report, "total_trades", 0),
        "wins":              getattr(report, "wins", 0),
        "losses":            getattr(report, "losses", 0),
        "win_rate_pct":      round(getattr(report, "win_rate_pct", 0), 2),
        "gross_profit":      round(getattr(report, "gross_profit", 0), 2),
        "gross_loss":        round(getattr(report, "gross_loss", 0), 2),
        "profit_factor":     round(getattr(report, "profit_factor", 0), 3),
        "max_drawdown_pct":  round(getattr(report, "max_drawdown_pct", 0), 2),
        "sharpe_ratio":      round(getattr(report, "sharpe_ratio", 0), 3),
        "equity_curve":      getattr(report, "equity_curve", []),
        "trades":            getattr(report, "trades", []),
        "per_symbol":        getattr(report, "per_symbol", {}),
        "symbols":           getattr(report, "symbols", []),
        "price_data":        getattr(report, "price_data", {}),
    }
    return base


@app.post("/paperbull/backtest/visual")
async def paperbull_backtest_visual(req: PaperBullVisualRequest):
    """
    Run a Visual-Builder strategy from a JSON config.
    Translates the UI form into a PaperBull Strategy class dynamically.
    """
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    try:
        from paperbull import Strategy, run_backtest
        from paperbull.stock_list import StockList

        universe_cfg = req.universe
        entry_cfg    = req.entry
        exit_cfg     = req.exit
        port_cfg     = req.portfolio

        # ── Collect which indicators are used in conditions ──────────────────
        all_conditions = (
            entry_cfg.get("conditions", []) +
            exit_cfg.get("conditions", [])
        )
        indicator_keys: list[dict] = []
        seen_keys: set = set()
        for cond in all_conditions:
            for side in [
                {"type": cond.get("left_type", "indicator"), "name": cond.get("left") or cond.get("indicator", ""), "params": cond.get("left_params") or cond.get("params") or {}},
                {"type": cond.get("right_type", "value"),   "name": cond.get("right", ""),  "params": cond.get("right_params") or {}},
            ]:
                if side["type"] in ("indicator",) and side["name"]:
                    key = f"{side['name']}_{side['params'].get('period','')}"
                    if key not in seen_keys:
                        seen_keys.add(key)
                        indicator_keys.append({"name": side["name"], "params": side["params"], "key": key})

        # Tracking dict: sym → { indicator_key → [{date, value}] }
        _indicator_records: dict = {}

        class VisualBuilderStrategy(Strategy):
            def initialize(self):
                self.set_capital(float(port_cfg.get("capital", 100_000)))

            def universe(self, stocks: StockList) -> StockList:
                filtered = stocks.filter(
                    min_price  = float(universe_cfg.get("min_price", 0))   or None,
                    max_price  = float(universe_cfg.get("max_price", 0))   or None,
                    min_volume = float(universe_cfg.get("min_volume", 0))  or None,
                )
                ranking = universe_cfg.get("ranking", "momentum_3m")
                top_n   = int(universe_cfg.get("top_n", 10))
                return filtered.sort_by(ranking, ascending=False).top(top_n)

            def _eval_operand(self, sym: str, data, op_type: str, name: str, params: dict, fallback_val: float = None):
                op_type = (op_type or "indicator").lower()
                name_clean = (name or "").upper().strip()

                if op_type == "price" or name_clean in ("CLOSE", "OPEN", "HIGH", "LOW", "VOLUME"):
                    if name_clean == "OPEN": return getattr(data, "open", None)
                    if name_clean == "HIGH": return getattr(data, "high", None)
                    if name_clean == "LOW": return getattr(data, "low", None)
                    if name_clean == "VOLUME": return getattr(data, "volume", None)
                    return getattr(data, "close", None)

                if op_type == "value":
                    return float(fallback_val) if fallback_val is not None else None

                # Indicator calculation via self.indicator facade
                try:
                    if name_clean == "RSI":
                        period = int(params.get("period", 14))
                        return self.indicator.RSI(sym, period)
                    elif name_clean == "EMA":
                        period = int(params.get("period", 50))
                        return self.indicator.EMA(sym, period)
                    elif name_clean == "SMA":
                        period = int(params.get("period", 20))
                        return self.indicator.SMA(sym, period)
                    elif name_clean == "VWAP":
                        return self.indicator.VWAP(sym)
                    elif name_clean == "ATR":
                        period = int(params.get("period", 14))
                        return self.indicator.ATR(sym, period)
                    elif name_clean == "ADX":
                        period = int(params.get("period", 14))
                        return self.indicator.ADX(sym, period)
                    elif name_clean in ("MACD", "MACD_LINE"):
                        res = self.indicator.MACD(sym, fast=int(params.get("fast", 12)), slow=int(params.get("slow", 26)), signal=int(params.get("signal", 9)))
                        return res.macd if res else None
                    elif name_clean in ("MACD_SIGNAL", "SIGNAL"):
                        res = self.indicator.MACD(sym, fast=int(params.get("fast", 12)), slow=int(params.get("slow", 26)), signal=int(params.get("signal", 9)))
                        return res.signal if res else None
                    elif name_clean in ("BB_UPPER", "BOLLINGER_UPPER"):
                        res = self.indicator.BB(sym, period=int(params.get("period", 20)), std=float(params.get("std", 2.0)))
                        return res.upper if res else None
                    elif name_clean in ("BB_LOWER", "BOLLINGER_LOWER"):
                        res = self.indicator.BB(sym, period=int(params.get("period", 20)), std=float(params.get("std", 2.0)))
                        return res.lower if res else None
                    elif name_clean in ("BB_MIDDLE", "BOLLINGER_MIDDLE"):
                        res = self.indicator.BB(sym, period=int(params.get("period", 20)), std=float(params.get("std", 2.0)))
                        return res.middle if res else None
                    elif name_clean in ("SUPERTREND", "SUPER_TREND"):
                        res = self.indicator.SuperTrend(sym, period=int(params.get("period", 10)), multiplier=float(params.get("multiplier", 3.0)))
                        return res.supertrend if res else None
                    elif hasattr(self.indicator, name):
                        func = getattr(self.indicator, name)
                        return func(sym, **{k: int(v) if str(v).isdigit() else float(v) for k, v in params.items()}) if params else func(sym)
                except Exception as ex:
                    logger.debug(f"Indicator calculation error for {name} on {sym}: {ex}")
                    return None
                return None

            def _check_condition(self, sym: str, data, cond: dict) -> bool:
                # Left side operand
                left_type   = cond.get("left_type") or ("price" if cond.get("left") in ("Close", "Open", "High", "Low") else "indicator")
                left_name   = cond.get("left") or cond.get("indicator") or "RSI"
                left_params = cond.get("left_params") or cond.get("params") or {}
                left_val    = self._eval_operand(sym, data, left_type, left_name, left_params)

                if left_val is None:
                    return False

                # Right side operand
                right_type   = cond.get("right_type") or ("value" if "value" in cond and cond.get("right") is None else "indicator")
                right_name   = cond.get("right") or ""
                right_params = cond.get("right_params") or {}
                raw_val      = cond.get("value")

                if right_type == "value":
                    right_val = float(raw_val) if raw_val is not None else 0.0
                else:
                    right_val = self._eval_operand(sym, data, right_type, right_name, right_params, raw_val)

                if right_val is None:
                    return False

                op = cond.get("op", "<")
                if op in ("<", "less"): return left_val < right_val
                if op in ("<=", "less_equal"): return left_val <= right_val
                if op in (">", "greater"): return left_val > right_val
                if op in (">=", "greater_equal"): return left_val >= right_val
                if op in ("==", "equals"): return abs(left_val - right_val) < 1e-6
                if op in ("crosses_above", "Crosses Above"): return left_val > right_val
                if op in ("crosses_below", "Crosses Below"): return left_val < right_val
                return False

            def on_data(self, data):
                sym    = data.symbol
                in_pos = sym in self.portfolio.holdings

                # ── Record indicator values for this bar ──────────────────────
                date_str = str(getattr(data, "timestamp", getattr(data, "date", "")))
                if sym not in _indicator_records:
                    _indicator_records[sym] = {}
                for ik in indicator_keys:
                    k = ik["key"]
                    if k not in _indicator_records[sym]:
                        _indicator_records[sym][k] = []
                    try:
                        val = self._eval_operand(sym, data, "indicator", ik["name"], ik["params"])
                        _indicator_records[sym][k].append({
                            "date": date_str,
                            "value": round(float(val), 4) if val is not None else None,
                            "indicator": ik["name"],
                            "params": ik["params"],
                        })
                    except Exception:
                        _indicator_records[sym][k].append({"date": date_str, "value": None})

                # ── Square-off logic ──────────────────────────────────────────
                sq_time = exit_cfg.get("square_off_time", "")
                if sq_time and sq_time.replace(":", "") in date_str.replace(":", ""):
                    if in_pos:
                        self.sell(sym)
                    return

                # ── Evaluate entry conditions ─────────────────────────────────
                if not in_pos:
                    conditions = entry_cfg.get("conditions", [])
                    logic      = entry_cfg.get("logic", "AND").upper()

                    if conditions:
                        results = [self._check_condition(sym, data, c) for c in conditions]
                        should_buy = any(results) if logic == "OR" else all(results)
                    else:
                        should_buy = False

                    if should_buy:
                        weight = float(entry_cfg.get("weight", 0.20))
                        self.buy(sym, weight)

                # ── Evaluate exit conditions ──────────────────────────────────
                elif in_pos:
                    conditions = exit_cfg.get("conditions", [])
                    logic      = exit_cfg.get("logic", "AND").upper()

                    if conditions:
                        results = [self._check_condition(sym, data, c) for c in conditions]
                        should_sell = any(results) if logic == "OR" else all(results)
                    else:
                        should_sell = False

                    if should_sell:
                        sell_weight = float(exit_cfg.get("weight", 1.0))
                        self.sell(sym, sell_weight)

        report = run_backtest(
            strategy     = VisualBuilderStrategy(),
            market       = universe_cfg.get("market")   or None,
            symbols      = port_cfg.get("symbols")      or None,
            symbol       = port_cfg.get("symbol")       or None,
            start        = port_cfg.get("start",   "2024-01-01"),
            end          = port_cfg.get("end",     "2025-01-01"),
            capital      = float(port_cfg.get("capital", 100_000)),
            warm_up_days = int(port_cfg.get("warm_up_days", 60)),
            interval     = port_cfg.get("interval", "1d"),
        )
        serialized = _serialize_report(report)
        serialized["indicator_data"] = _indicator_records
        return {"success": True, "report": serialized}

    except Exception as e:
        logger.error(f"[PaperBull Visual] Backtest failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/paperbull/backtest/code")

async def paperbull_backtest_code(req: PaperBullCodeRequest):
    """
    Run a Python-code strategy from the Code Editor.
    Executes user-submitted Python code in a restricted namespace.
    The code must define a class inheriting from Strategy.
    """
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    try:
        from paperbull import Strategy, run_backtest

        port_cfg = req.portfolio

        import math
        import numpy as np
        import paperbull

        # ── Safe execution namespace ──────────────────────────────────────────
        namespace = {
            "Strategy": Strategy,
            "paperbull": paperbull,
            "math": math,
            "np": np,
            "numpy": np,
            "__name__": "__main__",
            "__builtins__": __builtins__,
        }

        exec(req.code, namespace)

        # ── Find the user's Strategy subclass ─────────────────────────────────
        strategy_cls = None
        for name, obj in namespace.items():
            if (
                isinstance(obj, type)
                and issubclass(obj, Strategy)
                and obj is not Strategy
            ):
                strategy_cls = obj
                break

        if strategy_cls is None:
            raise HTTPException(
                status_code=400,
                detail="No Strategy subclass found in the code. Define a class that inherits from Strategy."
            )

        report = run_backtest(
            strategy     = strategy_cls(),
            market       = port_cfg.get("market")    or None,
            symbols      = port_cfg.get("symbols")   or None,
            symbol       = port_cfg.get("symbol")    or None,
            start        = port_cfg.get("start",   "2024-01-01"),
            end          = port_cfg.get("end",     "2025-01-01"),
            capital      = float(port_cfg.get("capital", 100_000)),
            warm_up_days = int(port_cfg.get("warm_up_days", 60)),
            interval     = port_cfg.get("interval", "1d"),
        )
        return {"success": True, "report": _serialize_report(report)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PaperBull Code] Backtest failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class PaperBullLiveRequest(BaseModel):
    strategy_name: Optional[str] = "LiveStrategy"
    mode: Optional[str] = "visual"  # "visual" | "code"
    config: Optional[dict] = None
    code: Optional[str] = None
    symbol: str
    interval: Optional[str] = "1d"
    capital: Optional[float] = 100000.0


class PaperBullScanUniverseRequest(BaseModel):
    strategy_name: Optional[str] = "UniverseScanStrategy"
    mode: Optional[str] = "visual"
    config: Optional[dict] = None
    code: Optional[str] = None
    market: Optional[str] = "NIFTY50"
    top_n: Optional[int] = 10
    interval: Optional[str] = "1d"
    capital: Optional[float] = 100000.0


# In-memory candle cache for live evaluations (prevents Yahoo Finance rate-limiting)
# TTL is interval-aware: 1d → 300s, 1h → 180s, 15m/5m → 90s, 1m → 45s
_live_candle_cache: dict[str, tuple[float, list]] = {}

_CACHE_TTL_MAP = {
    "1d": 300, "1day": 300, "daily": 300,
    "1h": 180, "60m": 180,
    "15m": 90, "30m": 90, "5m": 90,
    "1m": 45,
}


def _evaluate_symbol_live(
    sym: str,
    config: dict,
    capital: float,
    interval: str = "1d",
    live_ltp: float = None,
    candles_history: list = None
) -> dict:
    from Algos.core.base_strategy import Candle
    from paperbull.runner import _fetch_candles
    from paperbull.indicator_facade import IndicatorFacade
    from Algos.strategies.json_strategy import JsonStrategy
    from datetime import datetime, timedelta
    import time
    import math

    clean_sym = sym.strip().upper()
    ticker_sym = f"{clean_sym}.NS" if ("." not in clean_sym and not clean_sym.startswith("^")) else clean_sym

    # If candle history is directly provided (e.g. from historical replay engine or live tick buffer)
    if candles_history:
        candles = [c for c in candles_history]
    elif "auto_trader" in globals() and auto_trader._candle_buffers.get(clean_sym):
        candles = list(auto_trader._candle_buffers[clean_sym])
    else:
        cache_key = f"{ticker_sym}_{interval}"
        cached = _live_candle_cache.get(cache_key)
        now_ts = time.time()
        ttl = _CACHE_TTL_MAP.get(str(interval).lower(), 300)  # interval-aware TTL (default 5 min)
        if cached and (now_ts - cached[0] < ttl) and cached[1]:
            candles = [c for c in cached[1]]
        else:
            warm_up = int(config.get("portfolio", {}).get("warm_up_days", 60))
            now_dt = datetime.now()
            start_str = (now_dt - timedelta(days=warm_up * 3)).strftime("%Y-%m-%d")
            end_str = (now_dt + timedelta(days=1)).strftime("%Y-%m-%d")

            candles, _ = _fetch_candles(ticker_sym, start_str, end_str, warm_up, interval)
            if not candles and ticker_sym != clean_sym:
                candles, _ = _fetch_candles(clean_sym, start_str, end_str, warm_up, interval)

            if candles:
                _live_candle_cache[cache_key] = (now_ts, list(candles))

    if not candles:
        raise ValueError(f"Could not load live candle data for {sym}")

    last_candle = candles[-1]
    prev_candle = candles[-2] if len(candles) > 1 else last_candle

    # Inject real-time tick LTP if available
    ltp = float(live_ltp) if (live_ltp is not None and float(live_ltp) > 0) else float(last_candle.close)
    if live_ltp is not None and float(live_ltp) > 0:
        last_candle = Candle(
            timestamp=last_candle.timestamp,
            open=last_candle.open,
            high=max(last_candle.high, ltp),
            low=min(last_candle.low, ltp),
            close=ltp,
            volume=last_candle.volume
        )
        candles[-1] = last_candle

    prev_close = prev_candle.close
    change_pct = round(((ltp - prev_close) / prev_close) * 100, 2) if prev_close > 0 else 0.0

    # Determine strategy configuration type: JsonStrategy schema vs PaperBull schema
    is_json_strategy = bool(
        config.get("strategy_config")
        or config.get("indicators")
        or config.get("entry_rules")
        or config.get("exit_rules")
        or (isinstance(config.get("entry"), dict) and "type" in config.get("entry", {}))
    )

    if is_json_strategy:
        strat_cfg = config.get("strategy_config") or config
        strat = JsonStrategy(params={"strategy_config": strat_cfg})
        strat.initialize()
        strat.calculate_indicators(candles)

        entry_sig = strat.generate_entry_signal(candles, ltp)
        exit_sig  = strat.generate_exit_signal(candles, ltp)

        should_buy  = (entry_sig.type.value == "BUY")
        should_sell = (exit_sig.type.value == "SELL")

        signal = "HOLD"
        if should_buy and not should_sell:
            signal = "BUY"
        elif should_sell:
            signal = "SELL"

        # Format indicators snapshot from strat._indicator_cache
        indicators = {}
        for k, v in getattr(strat, "_indicator_cache", {}).items():
            if isinstance(v, list) and v:
                for val in reversed(v):
                    if val is not None and not (isinstance(val, float) and math.isnan(val)):
                        indicators[k] = round(float(val), 2)
                        break
            elif isinstance(v, (int, float)) and not math.isnan(v):
                indicators[k] = round(float(v), 2)

        entry_evals = [{
            "left_label": "Entry Rules",
            "op": strat_cfg.get("entry_rules", {}).get("type", "OR"),
            "right_label": entry_sig.reason or ("Conditions Met" if should_buy else "Waiting"),
            "passed": should_buy
        }]
        exit_evals = [{
            "left_label": "Exit Rules",
            "op": strat_cfg.get("exit_rules", {}).get("type", "OR"),
            "right_label": exit_sig.reason or ("Conditions Met" if should_sell else "Holding"),
            "passed": should_sell
        }]

        pos_cfg = strat_cfg.get("position_sizing", {})
        weight = float(pos_cfg.get("percent_equity", 20)) / 100.0 if pos_cfg.get("percent_equity") else 0.20
        fixed_qty = int(pos_cfg.get("fixed_qty", 0))
        if fixed_qty > 0:
            rec_qty = fixed_qty
            alloc_capital = fixed_qty * ltp
        else:
            alloc_capital = capital * weight
            rec_qty = max(1, int(alloc_capital / ltp)) if ltp > 0 else 0
        estimated_cost = round(rec_qty * ltp, 2)

    else:
        entry_cfg = config.get("entry", {})
        exit_cfg  = config.get("exit", {})

        ind_facade = IndicatorFacade()
        ind_facade._set_candles(sym, candles)

        def eval_operand(op_type: str, name: str, params: dict, fallback_val: float = None):
            op_type = (op_type or "indicator").lower()
            name_clean = (name or "").upper().strip()

            if op_type == "price" or name_clean in ("CLOSE", "OPEN", "HIGH", "LOW", "VOLUME"):
                if name_clean == "OPEN": return last_candle.open
                if name_clean == "HIGH": return last_candle.high
                if name_clean == "LOW": return last_candle.low
                if name_clean == "VOLUME": return last_candle.volume
                return last_candle.close

            if op_type == "value":
                return float(fallback_val) if fallback_val is not None else None

            try:
                if name_clean == "RSI":
                    return ind_facade.RSI(sym, int(params.get("period", 14)))
                elif name_clean == "EMA":
                    return ind_facade.EMA(sym, int(params.get("period", 50)))
                elif name_clean == "SMA":
                    return ind_facade.SMA(sym, int(params.get("period", 20)))
                elif name_clean == "VWAP":
                    return ind_facade.VWAP(sym)
                elif name_clean == "ATR":
                    return ind_facade.ATR(sym, int(params.get("period", 14)))
                elif name_clean == "ADX":
                    return ind_facade.ADX(sym, int(params.get("period", 14)))
                elif name_clean in ("MACD", "MACD_LINE"):
                    res = ind_facade.MACD(sym, fast=int(params.get("fast", 12)), slow=int(params.get("slow", 26)), signal=int(params.get("signal", 9)))
                    return res.macd if res else None
                elif name_clean in ("MACD_SIGNAL", "SIGNAL"):
                    res = ind_facade.MACD(sym, fast=int(params.get("fast", 12)), slow=int(params.get("slow", 26)), signal=int(params.get("signal", 9)))
                    return res.signal if res else None
                elif name_clean in ("BB_UPPER", "BOLLINGER_UPPER"):
                    res = ind_facade.BB(sym, period=int(params.get("period", 20)), std=float(params.get("std", 2.0)))
                    return res.upper if res else None
                elif name_clean in ("BB_LOWER", "BOLLINGER_LOWER"):
                    res = ind_facade.BB(sym, period=int(params.get("period", 20)), std=float(params.get("std", 2.0)))
                    return res.lower if res else None
                elif name_clean in ("SUPERTREND", "SUPER_TREND"):
                    res = ind_facade.SuperTrend(sym, period=int(params.get("period", 10)), multiplier=float(params.get("multiplier", 3.0)))
                    return res.supertrend if res else None
            except Exception:
                return None
            return None

        def check_cond(cond: dict):
            left_type   = cond.get("left_type") or ("price" if cond.get("left") in ("Close", "Open", "High", "Low") else "indicator")
            left_name   = cond.get("left") or cond.get("indicator") or "RSI"
            left_params = cond.get("left_params") or cond.get("params") or {}
            left_val    = eval_operand(left_type, left_name, left_params)

            right_type   = cond.get("right_type") or ("value" if "value" in cond and cond.get("right") is None else "indicator")
            right_name   = cond.get("right") or ""
            right_params = cond.get("right_params") or {}
            raw_val      = cond.get("value")
            right_val    = float(raw_val) if right_type == "value" and raw_val is not None else eval_operand(right_type, right_name, right_params, raw_val)

            op = cond.get("op", "<")
            passed = False
            if left_val is not None and right_val is not None:
                if op in ("<", "less"): passed = (left_val < right_val)
                elif op in ("<=", "less_equal"): passed = (left_val <= right_val)
                elif op in (">", "greater"): passed = (left_val > right_val)
                elif op in (">=", "greater_equal"): passed = (left_val >= right_val)
                elif op in ("==", "equals"): passed = abs(left_val - right_val) < 1e-6
                elif op in ("crosses_above", "Crosses Above"): passed = (left_val > right_val)
                elif op in ("crosses_below", "Crosses Below"): passed = (left_val < right_val)

            left_label = f"{left_name}{('(' + str(left_params.get('period')) + ')') if left_params.get('period') else ''}"
            right_label = f"{right_name}{('(' + str(right_params.get('period')) + ')') if right_params.get('period') else ''}" if right_type != "value" else str(raw_val)

            return {
                "left_label": left_label,
                "left_value": round(left_val, 2) if left_val is not None else None,
                "op": op,
                "right_label": right_label,
                "right_value": round(right_val, 2) if right_val is not None else None,
                "passed": passed,
            }

        # Evaluate Entry
        entry_conds = entry_cfg.get("conditions", [])
        entry_logic = entry_cfg.get("logic", "AND").upper()
        entry_evals = [check_cond(c) for c in entry_conds] if entry_conds else []
        should_buy = (any(e["passed"] for e in entry_evals) if entry_logic == "OR" else all(e["passed"] for e in entry_evals)) if entry_evals else False

        # Evaluate Exit
        exit_conds = exit_cfg.get("conditions", [])
        exit_logic = exit_cfg.get("logic", "AND").upper()
        exit_evals = [check_cond(c) for c in exit_conds] if exit_conds else []
        should_sell = (any(e["passed"] for e in exit_evals) if exit_logic == "OR" else all(e["passed"] for e in exit_evals)) if exit_evals else False

        signal = "HOLD"
        if should_buy and not should_sell:
            signal = "BUY"
        elif should_sell:
            signal = "SELL"

        weight = float(entry_cfg.get("weight", 0.20))
        alloc_capital = capital * weight
        rec_qty = int(alloc_capital / ltp) if ltp > 0 else 0
        estimated_cost = round(rec_qty * ltp, 2)

        # Core indicator snapshots + dynamic condition indicators
        indicators = {
            "RSI_14": round(ind_facade.RSI(sym, 14), 2) if ind_facade.RSI(sym, 14) is not None else None,
            "EMA_50": round(ind_facade.EMA(sym, 50), 2) if ind_facade.EMA(sym, 50) is not None else None,
            "SMA_20": round(ind_facade.SMA(sym, 20), 2) if ind_facade.SMA(sym, 20) is not None else None,
            "VWAP": round(ind_facade.VWAP(sym), 2) if ind_facade.VWAP(sym) is not None else None,
        }

        for cond in (entry_conds + exit_conds):
            l_name = cond.get("left") or cond.get("indicator")
            l_params = cond.get("left_params") or cond.get("params") or {}
            if l_name and l_name not in ("Close", "Open", "High", "Low", "Volume"):
                val = eval_operand("indicator", l_name, l_params)
                if val is not None:
                    p_tag = f"({l_params['period']})" if "period" in l_params else ""
                    indicators[f"{l_name}{p_tag}"] = round(val, 2)

            if cond.get("right_type") == "indicator" and cond.get("right"):
                r_name = cond.get("right")
                r_params = cond.get("right_params") or {}
                val = eval_operand("indicator", r_name, r_params)
                if val is not None:
                    p_tag = f"({r_params['period']})" if "period" in r_params else ""
                    indicators[f"{r_name}{p_tag}"] = round(val, 2)

    return {
        "success": True,
        "symbol": sym,
        "ltp": round(ltp, 2),
        "change_pct": change_pct,
        "high": round(last_candle.high, 2),
        "low": round(last_candle.low, 2),
        "volume": last_candle.volume,
        "timestamp": last_candle.timestamp,
        "signal": signal,
        "weight": weight,
        "recommended_qty": rec_qty,
        "estimated_cost": estimated_cost,
        "entry_conditions": entry_evals,
        "exit_conditions": exit_evals,
        "entry_matched": should_buy,
        "exit_matched": should_sell,
        "indicators": indicators,
    }


@app.post("/paperbull/live/evaluate")
async def paperbull_live_evaluate(req: PaperBullLiveRequest):
    """
    Evaluate strategy entry/exit conditions and indicators on live market stock data.
    """
    try:
        config = req.config or {}
        result = _evaluate_symbol_live(
            sym     = req.symbol,
            config  = config,
            capital = float(req.capital or 100000.0),
            interval= req.interval or "1d",
        )
        return result
    except Exception as e:
        logger.error(f"[PaperBull Live Evaluate] Error for {req.symbol}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/paperbull/live/scan-universe")
async def paperbull_live_scan_universe(req: PaperBullScanUniverseRequest):
    """
    Scan an entire market universe (e.g. NIFTY50) against a strategy.
    Uses a thread pool for concurrent evaluation — all symbols are evaluated
    in parallel so a full NIFTY50 scan takes ~12 s instead of ~100 s.
    """
    import concurrent.futures, math

    def _sanitize(obj):
        """Recursively replace float NaN / ±Inf with None so json.dumps doesn't choke."""
        if isinstance(obj, float):
            return None if (math.isnan(obj) or math.isinf(obj)) else obj
        if isinstance(obj, dict):
            return {k: _sanitize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_sanitize(v) for v in obj]
        return obj

    try:
        from paperbull.stock_list import MARKET_PRESETS

        market  = (req.market or "NIFTY50").upper()
        top_n   = req.top_n or 10
        symbols = MARKET_PRESETS.get(market, MARKET_PRESETS.get("NIFTY50", []))[:top_n]
        config  = req.config or {}
        capital = float(req.capital or 100000.0)
        interval = req.interval or "1d"

        def _scan_one(sym: str):
            try:
                res = _evaluate_symbol_live(sym, config, capital, interval)
                raw = sym.replace(".NS", "").replace(".BO", "")
                res["company_name"] = raw
                return _sanitize(res)
            except Exception as ex:
                logger.debug(f"[Scan] Failed {sym}: {ex}")
                return None

        # Run all symbols concurrently with up to 8 threads
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(_scan_one, sym) for sym in symbols]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        results = [r for r in results if r is not None]

        # Sort: BUYs first, then SELLs, then HOLDs
        order = {"BUY": 0, "SELL": 1, "HOLD": 2}
        results.sort(key=lambda x: order.get(x.get("signal", "HOLD"), 2))

        return {"success": True, "market": market, "scanned_count": len(results), "results": results}

    except Exception as e:
        logger.error(f"[PaperBull Scan Universe] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  AUTOMATED LIVE TRADING BOT ENGINE (UPSTOX WEBSOCKET INTEGRATION)
# ══════════════════════════════════════════════════════════════════════════════

class AutoTradeStartRequest(BaseModel):
    strategy_id: str
    strategy_name: str
    user_id: Optional[str] = "default_user"
    config: dict
    symbols: Optional[list[str]] = None
    capital: Optional[float] = 100000.0
    interval: Optional[str] = "1d"
    use_websocket: Optional[bool] = False   # Set True only for live Upstox feed; False for replay-only


class AutoTradeStopRequest(BaseModel):
    strategy_id: str


from datetime import datetime as dt


class AutoTraderManager:
    """
    Manages a background daemon thread connected to Upstox WebSocket feed (port 4141),
    tracks active strategy bots, evaluates live market ticks in real-time,
    and automatically executes BUY/SELL orders with rate-limiting and logging.
    """

    def __init__(self, ws_url: str = "ws://127.0.0.1:4141"):
        self.ws_url = ws_url
        self.active_bots: dict[str, dict] = {}
        self.last_ticks: dict[str, dict] = {}
        self.cooldowns: dict[str, float] = {}  # key: f"{strat_id}_{symbol}" -> timestamp
        self.recent_logs: list[dict] = []
        self.recent_executions: list[dict] = []
        self.ws_connected: bool = False
        self.use_live_ws: bool = False          # True when Upstox WS feed is active
        self._ws_client = None
        self._thread: Optional[threading.Thread] = None
        self._loop = None
        self._running: bool = False

        # Rolling per-symbol candle buffers (seeded at bot registration, updated each tick)
        # key: raw symbol (no .NS) → list[Candle]
        self._candle_buffers: dict[str, list] = {}

    def log(self, message: str, level: str = "INFO", details: dict = None):
        import time
        entry = {
            "time": dt.now().strftime("%H:%M:%S"),
            "timestamp": time.time(),
            "level": level,
            "message": message,
            "details": details or {},
        }
        self.recent_logs.insert(0, entry)
        if len(self.recent_logs) > 200:
            self.recent_logs.pop()
        logger.info(f"[AutoTrader] {message}")

    def start(self):
        """Starts the background worker thread for Upstox WebSocket feed."""
        if self._thread is None or not self._thread.is_alive():
            self._running = True
            self.use_live_ws = True
            self._thread = threading.Thread(target=self._thread_entry, daemon=True)
            self._thread.start()
            self.log(f"AutoTrader background worker thread started for {self.ws_url}")

    def _thread_entry(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._ws_consumer_loop())
        except Exception as e:
            logger.error(f"[AutoTrader Thread] Exited: {e}")

    async def _ws_consumer_loop(self):
        import websockets
        while self._running:
            try:
                self.log(f"Connecting to Upstox WebSocket feed at {self.ws_url}...")
                async with websockets.connect(self.ws_url, ping_interval=20, ping_timeout=20) as ws:
                    self._ws_client = ws
                    self.ws_connected = True
                    self.log("Connected to Upstox WebSocket feed (Port 4141)!")

                    # Resubscribe all active bot symbols
                    await self._sync_subscriptions()

                    async for raw_msg in ws:
                        if not self._running:
                            break
                        try:
                            msg = json.loads(raw_msg)
                            self._handle_tick_message(msg)
                        except Exception as e:
                            logger.debug(f"Error handling tick message: {e}")
                        await asyncio.sleep(0.001)

            except Exception as e:
                self.ws_connected = False
                self._ws_client = None
                logger.warning(f"[AutoTrader] Upstox WS disconnected: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)

    async def _sync_subscriptions(self):
        if not self._ws_client or not self.ws_connected:
            return

        all_symbols = set()
        for bot in self.active_bots.values():
            for s in bot.get("symbols", []):
                clean_sym = s.replace(".NS", "").replace(".BO", "").strip().upper()
                if clean_sym:
                    all_symbols.add(clean_sym)

        if all_symbols:
            sub_payload = {"action": "subscribe", "symbols": list(all_symbols)}
            await self._ws_client.send(json.dumps(sub_payload))
            self.log(f"Subscribed Upstox feed to {len(all_symbols)} symbols: {', '.join(all_symbols)}")

    def trigger_sync_subscriptions(self):
        if self._loop and self._loop.is_running() and self._ws_client and self.ws_connected:
            asyncio.run_coroutine_threadsafe(self._sync_subscriptions(), self._loop)

    def register_bot(self, req: AutoTradeStartRequest) -> dict:
        from paperbull.stock_list import MARKET_PRESETS
        from paperbull.runner import _fetch_candles
        from Algos.core.base_strategy import Candle
        from datetime import datetime as _dt2, timedelta

        strat_id = req.strategy_id
        symbols = req.symbols or []
        cfg = req.config or {}
        strat_cfg = cfg.get("strategy_config") or cfg

        if not symbols:
            # Prioritize universe market and symbol lists over single symbol
            if strat_cfg.get("symbols") and len(strat_cfg.get("symbols")) > 0:
                symbols = strat_cfg.get("symbols")
            elif cfg.get("symbols") and len(cfg.get("symbols")) > 0:
                symbols = cfg.get("symbols")
            elif strat_cfg.get("universe", {}).get("symbols") and len(strat_cfg.get("universe", {}).get("symbols")) > 0:
                symbols = strat_cfg.get("universe", {}).get("symbols")
            elif strat_cfg.get("universe", {}).get("market") or cfg.get("universe", {}).get("market"):
                mkt = (strat_cfg.get("universe", {}).get("market") or cfg.get("universe", {}).get("market") or "NIFTY50").upper()
                symbols = MARKET_PRESETS.get(mkt, MARKET_PRESETS["NIFTY50"])
            elif cfg.get("symbol"):
                symbols = [cfg.get("symbol")]
            elif strat_cfg.get("symbol"):
                symbols = [strat_cfg.get("symbol")]
            else:
                symbols = MARKET_PRESETS["NIFTY50"]

        # Normalize symbols with .NS
        norm_symbols = []
        for s in symbols:
            s_clean = s.strip().upper()
            s_ns = f"{s_clean}.NS" if ("." not in s_clean and not s_clean.startswith("^")) else s_clean
            norm_symbols.append(s_ns)
        symbols = norm_symbols

        market = (strat_cfg.get("universe", {}).get("market") or "NIFTY50").upper()
        interval = req.interval or "1d"

        bot_data = {
            "strategy_id": strat_id,
            "strategy_name": req.strategy_name,
            "user_id": req.user_id or "default_user",
            "config": req.config,
            "symbols": symbols,
            "market": market,
            "capital": req.capital or 100000.0,
            "remaining_capital": req.capital or 100000.0,
            "interval": interval,
            "status": "RUNNING",
            "started_at": dt.now().isoformat(),
            "trade_count": 0,
            "last_signal": "NONE",
            "last_evaluated_at": None,
            "pnl": 0.0,
            "executions": [],
            "holdings": {},
            "equity_curve": [],
            "use_live_ws": req.use_websocket or False,
            "signals_history": [],
        }

        self.active_bots[strat_id] = bot_data
        self.log(f"Started Auto-Trading Bot for '{req.strategy_name}' | Universe: {market} ({len(symbols)} stocks) | Mode: {'⚡ LIVE WS' if req.use_websocket else '💾 Simulation/Replay'}")

        # ── Seed per-symbol rolling candle buffers ─────────────────────────────
        # Pre-fetch warm-up candles for each symbol in a background thread pool
        def _seed_buffers(syms, intv):
            import concurrent.futures, time
            warm_up = int((strat_cfg.get("portfolio", {}) or {}).get("warm_up_days", 60))
            now_dt = _dt2.now()
            start_str = (now_dt - timedelta(days=warm_up * 3)).strftime("%Y-%m-%d")
            end_str = (now_dt + timedelta(days=1)).strftime("%Y-%m-%d")

            def _fetch_one(sym_ns):
                raw = sym_ns.replace(".NS", "").replace(".BO", "").strip().upper()
                if raw in self._candle_buffers and len(self._candle_buffers[raw]) > 0:
                    return
                cache_key = f"{sym_ns}_{intv}"
                cached = _live_candle_cache.get(cache_key)
                if cached and cached[1]:
                    self._candle_buffers[raw] = list(cached[1])
                    return
                try:
                    candles, _ = _fetch_candles(sym_ns, start_str, end_str, warm_up, intv)
                    if not candles:
                        candles, _ = _fetch_candles(raw, start_str, end_str, warm_up, intv)
                    if candles:
                        self._candle_buffers[raw] = list(candles)
                        _live_candle_cache[cache_key] = (time.time(), list(candles))
                        logger.info(f"[AutoTrader] Seeded {len(candles)} {intv} candles for {raw}")
                except Exception as ex:
                    logger.warning(f"[AutoTrader] Buffer seed failed for {raw}: {ex}")

            with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
                list(pool.map(_fetch_one, syms))

        threading.Thread(target=_seed_buffers, args=(symbols, interval), daemon=True).start()

        self.trigger_sync_subscriptions()
        return bot_data

    def unregister_bot(self, strategy_id: str) -> bool:
        if strategy_id in self.active_bots:
            bot = self.active_bots.pop(strategy_id)
            self.log(f"Stopped Auto-Trading Bot for strategy '{bot.get('strategy_name')}'")
            self.trigger_sync_subscriptions()
            return True
        return False

    def _update_candle_buffer(self, raw_sym: str, ltp: float, msg: dict):
        """Append a synthetic 1-tick candle to the rolling buffer from a live WS tick."""
        from Algos.core.base_strategy import Candle
        ts_str = msg.get("timestamp") or dt.now().strftime("%Y-%m-%d %H:%M:%S")
        # Treat each tick as a 1-min micro-candle; H/L from WS if available else use ltp
        h = float(msg.get("high") or ltp)
        l = float(msg.get("low") or ltp)
        o = float(msg.get("open") or ltp)
        buf = self._candle_buffers.setdefault(raw_sym, [])
        buf.append(Candle(timestamp=ts_str, open=o, high=h, low=l, close=ltp, volume=float(msg.get("volume") or 0)))
        # Keep buffer bounded (last 2000 candles is plenty for any indicator warmup)
        if len(buf) > 2000:
            buf.pop(0)

    def _handle_tick_message(self, msg: dict, candles_history: list = None):
        if msg.get("type") != "LIVE_TICK":
            return

        raw_sym = msg.get("symbol", "").upper()
        if not raw_sym:
            return

        sym_ns = f"{raw_sym}.NS"
        ltp = float(msg.get("ltp", 0))
        if ltp <= 0:
            return

        ts = msg.get("timestamp") or dt.now().strftime("%Y-%m-%d %H:%M:%S")
        self.last_ticks[sym_ns] = {
            "symbol": sym_ns,
            "raw_symbol": raw_sym,
            "ltp": ltp,
            "prev_close": msg.get("prev_close"),
            "high": msg.get("high"),
            "low": msg.get("low"),
            "timestamp": ts,
        }

        # Update rolling candle buffer for live WS ticks (not replay — replay provides full candles_history)
        is_replay = bool(msg.get("is_replay"))
        if not is_replay:
            self._update_candle_buffer(raw_sym, ltp, msg)

        if not self.active_bots:
            return

        import time
        now = time.time()

        for strat_id, bot in list(self.active_bots.items()):
            bot_syms = bot.get("symbols", [])
            match_sym = None
            for s in bot_syms:
                if s.upper() == sym_ns or s.upper() == raw_sym or s.upper().replace(".NS", "") == raw_sym:
                    match_sym = s
                    break

            if match_sym:
                # For live ticks, pass the rolling buffer so no Yahoo Finance call is needed
                live_buf = list(self._candle_buffers.get(raw_sym, []))

                if not is_replay:
                    holdings = bot.get("holdings", {})
                    is_held = any(k.upper().replace(".NS", "") == raw_sym for k in holdings.keys())
                    cooldown_limit = 0.5 if is_held else 1.5

                    cooldown_key = f"{strat_id}_{match_sym}"
                    last_time = self.cooldowns.get(cooldown_key, 0)
                    if now - last_time < cooldown_limit:
                        continue
                    self.cooldowns[cooldown_key] = now

                # Execute evaluation: synchronous in replay mode for timeline order, background thread in live mode
                if is_replay:
                    self._evaluate_and_execute_worker(bot, match_sym, ltp, candles_history=candles_history, is_replay=True)
                else:
                    # Pass rolling buffer so evaluation never falls back to Yahoo Finance
                    threading.Thread(
                        target=self._evaluate_and_execute_worker,
                        args=(bot, match_sym, ltp, live_buf if live_buf else None, False),
                        daemon=True
                    ).start()

    def _evaluate_and_execute_worker(self, bot: dict, sym: str, current_ltp: float, candles_history: list = None, is_replay: bool = False):
        import requests
        try:
            strat_id   = bot["strategy_id"]
            strat_name = bot["strategy_name"]
            config     = bot["config"]
            capital    = bot["capital"]

            # ── Canonical position check ──────────────────────────────────
            holdings = bot.setdefault("holdings", {})
            sym_clean = sym.upper().replace(".NS", "")
            matched_holding_key = None
            for k in list(holdings.keys()):
                if k.upper().replace(".NS", "") == sym_clean:
                    matched_holding_key = k
                    break

            in_position = (matched_holding_key is not None) and (holdings[matched_holding_key].get("qty", 0) > 0)

            # Evaluate strategy with injected real-time tick price and candle history
            res = _evaluate_symbol_live(
                sym=sym,
                config=config,
                capital=capital,
                interval=bot.get("interval", "1d"),
                live_ltp=current_ltp,
                candles_history=candles_history
            )

            bot["last_evaluated_at"] = dt.now().strftime("%H:%M:%S")
            bot["last_evaluated_symbol"] = sym
            bot["last_signal"] = res.get("signal", "HOLD")
            bot["last_indicators"] = res.get("indicators", {})
            bot["last_entry_conditions"] = res.get("entry_conditions", [])
            bot["last_exit_conditions"] = res.get("exit_conditions", [])
            bot["entry_matched"] = res.get("entry_matched", False)
            bot["exit_matched"] = res.get("exit_matched", False)

            signal = res.get("signal", "HOLD")
            price  = current_ltp or res.get("ltp", 0)

            action    = None
            qty       = 0
            pnl_trade = 0.0

            # ── Record signal in per-bot history ──────────────────────────────
            sig_hist_entry = {
                "time": dt.now().strftime("%H:%M:%S"),
                "symbol": sym.replace(".NS", ""),
                "signal": signal,
                "price": round(price, 2),
            }
            sig_hist = bot.setdefault("signals_history", [])
            sig_hist.insert(0, sig_hist_entry)
            if len(sig_hist) > 20:
                sig_hist.pop()

            if signal == "BUY" and not in_position:
                strat_cfg = config.get("strategy_config") or config
                pos_cfg = strat_cfg.get("position_sizing", {})
                weight = float(pos_cfg.get("percent_equity", 20)) / 100.0 if pos_cfg.get("percent_equity") else float(config.get("entry", {}).get("weight", 0.20))
                fixed_qty = int(pos_cfg.get("fixed_qty", 0))

                avail_cash = bot.get("remaining_capital", capital)
                if fixed_qty > 0:
                    qty = fixed_qty
                else:
                    alloc_cash = min(avail_cash, capital * weight)
                    qty = max(1, int(alloc_cash / price)) if price > 0 else 0

                cost = round(qty * price, 2)
                # Hard guard: only execute if we can afford it (prevents negative remaining_capital)
                if qty > 0 and cost <= avail_cash and avail_cash >= price:
                    action = "BUY"
                    holdings[sym] = {"qty": qty, "avg_price": price, "cost": cost}
                    bot["remaining_capital"] = round(avail_cash - cost, 2)

            elif (signal == "SELL" or res.get("exit_matched", False)) and in_position:
                h_data    = holdings[matched_holding_key]
                qty       = h_data["qty"]
                cost      = h_data["cost"]
                action    = "SELL"
                proceeds  = round(qty * price, 2)
                pnl_trade = round(proceeds - cost, 2)

                bot["pnl"] = round(bot.get("pnl", 0.0) + pnl_trade, 2)
                bot["remaining_capital"] = round(bot.get("remaining_capital", capital) + proceeds, 2)

                del holdings[matched_holding_key]

            if action and qty > 0:
                total_val = round(qty * price, 2)

                exec_record = {
                    "strategyId":       strat_id,
                    "strategyName":     strat_name,
                    "userId":           bot.get("user_id", "default_user"),
                    "symbol":           sym.upper(),
                    "action":           action,
                    "quantity":         qty,
                    "price":            price,
                    "value":            total_val,
                    "orderType":        "MARKET",
                    "status":           "EXECUTED",
                    "isAutomated":      True,
                    "isReplay":         is_replay,
                    "executedAt":       dt.now().isoformat(),
                    "signalDetails":    res,
                    "pnl":              pnl_trade if action == "SELL" else 0.0,
                    "cumulativePnl":    bot.get("pnl", 0.0),
                    "remainingCapital": bot.get("remaining_capital", capital),
                }

                self.recent_executions.insert(0, exec_record)
                if len(self.recent_executions) > 200:
                    self.recent_executions.pop()

                bot.setdefault("executions", []).insert(0, exec_record)
                bot["trade_count"] = bot.get("trade_count", 0) + 1

                # ── Update Equity Curve ────────────────────────────────────
                holdings_val = sum(
                    (self.last_ticks.get(s, {}).get("ltp") or self.last_ticks.get(f"{s.replace('.NS','')}.NS", {}).get("ltp") or h["avg_price"]) * h["qty"]
                    for s, h in holdings.items()
                )
                total_equity = round(bot.get("remaining_capital", capital) + holdings_val, 2)
                bot.setdefault("equity_curve", []).append({
                    "time": dt.now().strftime("%H:%M:%S"),
                    "equity": total_equity,
                })
                if len(bot["equity_curve"]) > 200:
                    bot["equity_curve"].pop(0)

                pnl_str = f" | Realized PnL: ₹{pnl_trade:+,.2f}" if action == "SELL" else ""
                self.log(
                    f"{'📈' if action == 'BUY' else '📉'} [AUTO-TRADE] {action} {qty}x {sym} @ ₹{price:.2f}{pnl_str} "
                    f"| Total PnL: ₹{bot.get('pnl', 0.0):+,.2f} | Cash: ₹{bot.get('remaining_capital', capital):,.0f}",
                    level="SUCCESS",
                    details=exec_record,
                )

                try:
                    requests.post("http://localhost:4000/api/paperbull/live/execute", json=exec_record, timeout=2)
                except Exception as ex:
                    logger.debug(f"Could not forward execution to Stockify-Backend: {ex}")

        except Exception as e:
            logger.error(f"[AutoTrader] Bot evaluation error for {sym}: {e}", exc_info=True)

    def get_status(self) -> dict:
        # Calculate dynamic unrealized & total PnL for each active bot
        for bot in self.active_bots.values():
            holdings = bot.get("holdings", {})
            unrealized = 0.0
            holdings_val = 0.0
            for s, h in holdings.items():
                tick_ltp = (
                    self.last_ticks.get(s, {}).get("ltp")
                    or self.last_ticks.get(f"{s.replace('.NS','')}.NS", {}).get("ltp")
                    or h.get("avg_price", 0.0)
                )
                cur_val = tick_ltp * h.get("qty", 0)
                holdings_val += cur_val
                unrealized += (tick_ltp - h.get("avg_price", 0.0)) * h.get("qty", 0)

            bot["unrealized_pnl"] = round(unrealized, 2)
            bot["realized_pnl"]   = round(bot.get("pnl", 0.0), 2)
            bot["total_pnl"]      = round(bot.get("pnl", 0.0) + unrealized, 2)
            bot["total_equity"]   = round(bot.get("remaining_capital", bot.get("capital", 100000.0)) + holdings_val, 2)

        # Attach replay status if the engine is available (set by module-level singleton)
        replay_info = None
        try:
            replay_info = replay_engine.get_replay_status()
        except NameError:
            pass  # replay_engine not yet defined (first call before singleton is set)

        return {
            "success": True,
            "ws_url": self.ws_url,
            "ws_connected": self.ws_connected,
            "use_live_ws": self.use_live_ws,
            "active_bots_count": len(self.active_bots),
            "active_bots": list(self.active_bots.values()),
            "last_ticks_count": len(self.last_ticks),
            "last_ticks": list(self.last_ticks.values()),
            "recent_logs": self.recent_logs[:50],
            "recent_executions": self.recent_executions[:100],
            "replay": replay_info,
        }

    def get_executions(self, strategy_id: str = None) -> list:
        if strategy_id:
            return [e for e in self.recent_executions if e.get("strategyId") == strategy_id]
        return self.recent_executions[:200]


# ══════════════════════════════════════════════════════════════════════════════
#  HISTORICAL TICK REPLAY ENGINE  (simulate live trading on previous 1-day data)
# ══════════════════════════════════════════════════════════════════════════════

class HistoricalReplayEngine:
    """
    Fetches 1-minute candle data for all symbols being tracked by active bots
    and replays them tick-by-tick through the AutoTraderManager pipeline with
    in-memory rolling candle buffer injection.
    """

    def __init__(self, auto_trader_ref):
        self._at = auto_trader_ref           # reference to AutoTraderManager singleton
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # ── State (read by get_status) ────────────────────────────────────
        self.is_replaying: bool  = False
        self.replay_date: str    = ""
        self.speed: float        = 30.0
        self.current_index: int  = 0
        self.total_candles: int  = 0
        self.simulated_time: str = ""
        self.symbols_loaded: list = []
        self.error: str          = ""

    # ── Public API ────────────────────────────────────────────────────────

    def start(self, speed: float = 30.0, replay_date: str = None) -> dict:
        """Start replay.  Returns immediately; replay runs in a background thread."""
        if self.is_replaying:
            return {"success": False, "error": "Replay already in progress. Stop first."}

        if not self._at.active_bots:
            return {"success": False, "error": "No active bots. Deploy a strategy first."}

        self.speed          = max(0.1, float(speed))
        self.current_index  = 0
        self.total_candles  = 0
        self.simulated_time = ""
        self.error          = ""
        self._stop_event.clear()

        # Resolve symbols from all active bots
        all_symbols: set = set()
        for bot in self._at.active_bots.values():
            for s in bot.get("symbols", []):
                all_symbols.add(s)
        self.symbols_loaded = sorted(all_symbols)

        # Resolve replay date
        self.replay_date = replay_date or self._last_trading_day()

        self._thread = threading.Thread(
            target=self._replay_worker,
            args=(list(all_symbols), self.replay_date, self.speed),
            daemon=True,
        )
        self._thread.start()
        logger.info(f"[Replay] Starting replay of {self.replay_date} for {len(all_symbols)} symbols at {self.speed}x speed")
        return {"success": True, "replay_date": self.replay_date, "speed": self.speed}

    def stop(self) -> dict:
        """Signal the replay worker to stop."""
        if not self.is_replaying:
            return {"success": False, "error": "No active replay."}
        self._stop_event.set()
        self.is_replaying = False
        self._at.log("⏹ Historical replay stopped by user.", level="WARNING")
        return {"success": True}

    def get_replay_status(self) -> dict:
        pct = round((self.current_index / self.total_candles) * 100, 1) if self.total_candles > 0 else 0.0
        return {
            "is_replaying":  self.is_replaying,
            "replay_date":   self.replay_date,
            "speed":         self.speed,
            "current":       self.current_index,
            "total":         self.total_candles,
            "pct":           pct,
            "simulated_time": self.simulated_time,
            "symbols_count": len(self.symbols_loaded),
            "error":         self.error,
        }

    # ── Internal helpers ─────────────────────────────────────────────────

    @staticmethod
    def _last_trading_day() -> str:
        """Return the most-recent weekday (Mon-Fri) relative to today."""
        import datetime
        d = datetime.date.today()
        d -= datetime.timedelta(days=1)
        while d.weekday() >= 5:  # 5=Sat, 6=Sun
            d -= datetime.timedelta(days=1)
        return d.strftime("%Y-%m-%d")

    def _fetch_1m_candles(self, symbol: str, date_str: str) -> tuple[list, list, str]:
        """Fetch warm-up candles and target day candles for replay."""
        import yfinance as yf
        import math
        from Algos.core.base_strategy import Candle

        clean_sym = symbol.strip().upper()
        ticker_sym = f"{clean_sym}.NS" if ("." not in clean_sym and not clean_sym.startswith("^")) else clean_sym

        logging.getLogger("yfinance").setLevel(logging.CRITICAL)
        try:
            ticker = yf.Ticker(ticker_sym)
            # auto_adjust=False: do NOT adjust OHLC for dividends/splits on intraday 1m data
            # — adjusted prices would not match real traded LTP values from Upstox feed
            df = ticker.history(period="7d", interval="1m", auto_adjust=False)
        except Exception as e:
            logger.warning(f"[Replay] Could not fetch 1m data for {ticker_sym}: {e}")
            return [], [], date_str

        if df is None or df.empty:
            return [], [], date_str

        all_candles = []
        for idx, row in df.iterrows():
            close_val = row.get("Close")
            if close_val is None or (isinstance(close_val, float) and math.isnan(close_val)):
                continue
            all_candles.append(Candle(
                timestamp = str(idx),
                open      = float(row["Open"]),
                high      = float(row["High"]),
                low       = float(row["Low"]),
                close     = float(close_val),
                volume    = float(row.get("Volume", 0.0)),
            ))

        day_dates = sorted(list(set(c.timestamp[:10] for c in all_candles)))
        target_date = date_str if (date_str in day_dates) else (day_dates[-1] if day_dates else date_str)

        warm_up = [c for c in all_candles if c.timestamp[:10] < target_date]
        replay_day = [c for c in all_candles if c.timestamp[:10] == target_date]

        return warm_up, replay_day, target_date

    def _replay_worker(self, symbols: list, date_str: str, speed: float):
        """Background thread: load candles for all symbols, interleave by time, replay."""
        import time

        self.is_replaying = True
        self._at.log(f"🔁 Fetching 1-min data for {len(symbols)} symbols on {date_str}…", level="INFO")
        self._at.ws_connected = True

        sym_warmup: dict[str, list] = {}
        sym_replay: dict[str, list] = {}
        resolved_date = date_str

        def _fetch_one_symbol(sym):
            raw = sym.replace(".NS", "").replace(".BO", "").strip().upper()
            w, r, actual_d = self._fetch_1m_candles(raw, date_str)
            return raw, w, r, actual_d

        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            future_to_sym = {executor.submit(_fetch_one_symbol, s): s for s in symbols}
            for future in concurrent.futures.as_completed(future_to_sym):
                if self._stop_event.is_set():
                    break
                try:
                    raw, warm_up, replay_candles, actual_date = future.result()
                    if replay_candles:
                        sym_warmup[raw] = warm_up
                        sym_replay[raw] = replay_candles
                        resolved_date = actual_date
                        logger.info(f"[Replay] {raw}: {len(replay_candles)} candles loaded (date: {actual_date}, warm-up: {len(warm_up)})")
                    else:
                        logger.warning(f"[Replay] No 1m data for {raw} on {date_str}")
                except Exception as exc:
                    logger.warning(f"[Replay] Error loading {future_to_sym[future]}: {exc}")

        if not sym_replay or self._stop_event.is_set():
            self.error = "No 1-minute candle data found for selected symbols / date."
            self.is_replaying = False
            self._at.ws_connected = False
            self._at.log(f"⚠️ Replay aborted: {self.error}", level="ERROR")
            return

        self.replay_date = resolved_date

        # Rolling candle buffer per symbol initialized with historical warm-up candles
        sym_buffers: dict[str, list] = {raw: list(w) for raw, w in sym_warmup.items()}

        # ── Build an interleaved timeline: (timestamp_str, symbol, candle, prev_close) ──
        timeline: list = []
        for sym, candles in sym_replay.items():
            prev_close = sym_warmup[sym][-1].close if sym_warmup.get(sym) else candles[0].open
            for candle in candles:
                timeline.append((candle.timestamp, sym, candle, prev_close))
                prev_close = candle.close

        timeline.sort(key=lambda x: x[0])
        self.total_candles = len(timeline)

        self._at.log(
            f"🎬 Replay started: {resolved_date} | {len(sym_replay)} symbols | "
            f"{self.total_candles} ticks | Speed {speed}x",
            level="SUCCESS",
        )

        sleep_per_candle = max(0.005, 60.0 / speed)

        for i, (ts_str, raw_sym, candle, prev_close) in enumerate(timeline):
            if self._stop_event.is_set():
                break

            self.current_index = i + 1

            # Append candle to rolling buffer
            sym_buffers.setdefault(raw_sym, []).append(candle)

            try:
                import re
                m = re.search(r"(\d{2}:\d{2})", ts_str)
                self.simulated_time = m.group(1) if m else ts_str[:16]
            except Exception:
                self.simulated_time = ts_str[:16]

            tick_msg = {
                "type":       "LIVE_TICK",
                "symbol":     raw_sym,
                "ltp":        candle.close,
                "open":       candle.open,
                "high":       candle.high,
                "low":        candle.low,
                "volume":     candle.volume,
                "prev_close": prev_close,
                "timestamp":  ts_str,
                "is_replay":  True,
            }

            self._at._handle_tick_message(tick_msg, candles_history=list(sym_buffers[raw_sym]))

            if (i + 1) % 30 == 0 or i == 0 or (i + 1) == self.total_candles:
                pct = round(((i + 1) / self.total_candles) * 100, 1)
                self._at.log(
                    f"🔁 Replay {pct}% — simulated time {self.simulated_time} ({i+1}/{self.total_candles} ticks)",
                    level="INFO",
                )

            time.sleep(sleep_per_candle)

        if not self._stop_event.is_set():
            self.current_index = self.total_candles
            self._at.log(
                f"✅ Replay complete! Replayed {self.total_candles} ticks for {resolved_date} at {speed}x.",
                level="SUCCESS",
            )

        self.is_replaying    = False
        self._at.ws_connected = False


# Singleton AutoTrader Manager
auto_trader = AutoTraderManager()

# Singleton Replay Engine (references auto_trader)
replay_engine = HistoricalReplayEngine(auto_trader)


@app.post("/paperbull/autotrade/start")
def autotrade_start(req: AutoTradeStartRequest):
    """Deploy a strategy bot.
    - use_websocket=false (default): Simulation / Replay mode — no Upstox WS needed.
    - use_websocket=true: Live market mode — connects to Upstox WS on port 4141.
    """
    try:
        # Only connect to Upstox WebSocket when explicitly requested (live market hours)
        if req.use_websocket:
            auto_trader.start()
        bot = auto_trader.register_bot(req)
        return {"success": True, "message": f"Auto-trading bot started for {req.strategy_name} ({'LIVE WS' if req.use_websocket else 'Simulation'})", "bot": bot}
    except Exception as e:
        logger.error(f"[AutoTrade Start] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class ManualTickRequest(BaseModel):
    symbol: str
    ltp: float
    timestamp: Optional[str] = None
    prev_close: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    volume: Optional[float] = None


@app.post("/paperbull/autotrade/tick")
def autotrade_inject_tick(req: ManualTickRequest):
    """Manually inject a live tick into the AutoTrader pipeline.
    Useful for testing strategy evaluation without the Upstox WebSocket.
    Triggers the same evaluation path as a real live tick.
    """
    try:
        clean = req.symbol.strip().upper().replace(".NS", "").replace(".BO", "")
        tick_msg = {
            "type": "LIVE_TICK",
            "symbol": clean,
            "ltp": req.ltp,
            "prev_close": req.prev_close,
            "high": req.high or req.ltp,
            "low": req.low or req.ltp,
            "volume": req.volume or 0,
            "timestamp": req.timestamp or dt.now().strftime("%Y-%m-%d %H:%M:%S"),
            "is_replay": False,
        }
        auto_trader._handle_tick_message(tick_msg)
        return {"success": True, "message": f"Tick injected for {clean} @ ₹{req.ltp}"}
    except Exception as e:
        logger.error(f"[Inject Tick] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/paperbull/autotrade/stop")
def autotrade_stop(req: AutoTradeStopRequest):
    """Stop an active automated trading bot."""
    try:
        stopped = auto_trader.unregister_bot(req.strategy_id)
        return {"success": True, "stopped": stopped, "message": "Auto-trading bot stopped"}
    except Exception as e:
        logger.error(f"[AutoTrade Stop] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/paperbull/autotrade/stop-all")
def autotrade_stop_all():
    """Stop all active trading bots (and any active replay)."""
    try:
        count = len(auto_trader.active_bots)
        for sid in list(auto_trader.active_bots.keys()):
            auto_trader.unregister_bot(sid)
        # Also stop any active replay
        if replay_engine.is_replaying:
            replay_engine.stop()
        return {"success": True, "stopped_count": count, "message": f"Stopped {count} bots"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Replay Routes ─────────────────────────────────────────────────────────────

class ReplayStartRequest(BaseModel):
    speed: Optional[float] = 30.0       # playback multiplier — any positive number, e.g. 500, 1000
    replay_date: Optional[str] = None   # "YYYY-MM-DD"; None = auto last trading day


@app.post("/paperbull/autotrade/replay/start")
def autotrade_replay_start(req: ReplayStartRequest):
    """Start historical tick replay on the previous trading day's 1-minute data.

    Requires at least one active bot.  Does NOT require Upstox WebSocket — the replay
    engine feeds ticks directly into the strategy evaluation pipeline.

    Speed examples (one 1-min candle replayed every N seconds):
      1x    =  60.0 s/candle  (real-time)
      30x   =   2.0 s/candle  (default — full day in ~2 min)
      100x  =   0.6 s/candle
      500x  =   0.12 s/candle (full day in ~22 s)
      1000x =   0.06 s/candle (full day in ~11 s)
    """
    try:
        result = replay_engine.start(speed=req.speed or 30.0, replay_date=req.replay_date)
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("error", "Could not start replay"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Replay Start] {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/paperbull/autotrade/replay/stop")
def autotrade_replay_stop():
    """Stop the currently running historical replay."""
    try:
        result = replay_engine.stop()
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("error", "No active replay"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/paperbull/autotrade/replay/status")
def autotrade_replay_status():
    """Get the current replay progress and metadata."""
    try:
        return {"success": True, **replay_engine.get_replay_status()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/paperbull/autotrade/status")
def autotrade_status():
    """Get live status, monitored symbols, ticks, and executions of the auto-trading engine."""
    try:
        return auto_trader.get_status()
    except Exception as e:
        logger.error(f"[AutoTrade Status] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/paperbull/autotrade/executions")
def autotrade_executions(strategy_id: Optional[str] = None):
    """Get paginated execution history, optionally filtered by strategy."""
    try:
        execs = auto_trader.get_executions(strategy_id)
        return {"success": True, "executions": execs, "count": len(execs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    logger.info("Starting AlgoTrading FastAPI Server on port 5001...")
    uvicorn.run("api_server:app", host="0.0.0.0", port=5001, reload=True)



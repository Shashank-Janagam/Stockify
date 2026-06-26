# -*- coding: utf-8 -*-
"""
Stockify  XGBoost Ensemble Signal Server  +  Groq LLM Re-Verification
server2.py  |  FastAPI  (port 8001)

Endpoints
---------
GET /predict/{symbol}   -> signal, confidence, features, price history, llm_analysis
GET /health             -> { status: ok }

Run:
    uvicorn server2:app --reload --port 8001
"""

import sys, io, warnings, logging, time, os
from functools import lru_cache
from typing import Optional

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
warnings.filterwarnings("ignore")

# Load .env early so GROQ_API_KEY is available
from dotenv import load_dotenv
load_dotenv()

import yfinance as yf
import pandas as pd
import numpy as np

from ta.momentum import RSIIndicator, StochasticOscillator, WilliamsRIndicator
from ta.trend import MACD, SMAIndicator, EMAIndicator, ADXIndicator, CCIIndicator
from ta.volatility import BollingerBands, AverageTrueRange
from ta.volume import OnBalanceVolumeIndicator, MFIIndicator

from xgboost import XGBClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.preprocessing import RobustScaler
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import accuracy_score

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from groq import Groq

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger("stockify2")

# -------------------------------------------------------
# CONFIG
# -------------------------------------------------------
DATA_PERIOD   = "7y"
DATA_END      = "2026-06-15"
HISTORY_DAYS  = 90          # trading days returned for chart
CACHE_TTL_S   = 3600        # 1-hour model cache per symbol

GROQ_API_KEY  = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL    = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# In-memory cache: { symbol: { "ts": float, "payload": dict } }
_MODEL_CACHE: dict = {}

app = FastAPI(title="Stockify XGBoost Signal API", version="2.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# -------------------------------------------------------
# 1. Data Loading
# -------------------------------------------------------
def load_data(symbol: str) -> pd.DataFrame:
    ticker = symbol.upper()
    if not ticker.endswith((".NS", ".BO")):
        ticker += ".NS"

    log.info("Downloading %s ...", ticker)
    df = yf.download(ticker, period=DATA_PERIOD, end=DATA_END,
                     interval="1d", auto_adjust=True, progress=False)

    if df.empty:
        raise HTTPException(404, detail=f"No data for {ticker}. Check the symbol.")

    # Flatten MultiIndex columns (newer yfinance)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    for col in df.columns:
        if isinstance(df[col], pd.DataFrame):
            df[col] = df[col].iloc[:, 0]
        df[col] = df[col].astype(float)

    df.dropna(inplace=True)
    return df


# -------------------------------------------------------
# 2. Feature Engineering
# -------------------------------------------------------
def add_features(df: pd.DataFrame) -> pd.DataFrame:
    close = df["Close"].squeeze()
    high  = df["High"].squeeze()
    low   = df["Low"].squeeze()
    vol   = df["Volume"].squeeze()

    df["return"]     = close.pct_change()
    df["return_2d"]  = close.pct_change(2)
    df["return_3d"]  = close.pct_change(3)
    df["return_5d"]  = close.pct_change(5)
    df["return_10d"] = close.pct_change(10)
    df["return_1w"]  = close.pct_change(5)
    df["return_1m"]  = close.pct_change(21)

    for lag in [1, 2, 3, 5, 7, 10]:
        df[f"lag_ret_{lag}"] = df["return"].shift(lag)

    df["rsi_14"]  = RSIIndicator(close, window=14).rsi()
    df["rsi_7"]   = RSIIndicator(close, window=7).rsi()
    df["rsi_21"]  = RSIIndicator(close, window=21).rsi()

    stoch = StochasticOscillator(high, low, close)
    df["stoch_k"] = stoch.stoch()
    df["stoch_d"] = stoch.stoch_signal()
    df["williams_r"] = WilliamsRIndicator(high, low, close).williams_r()

    macd = MACD(close)
    df["macd"]        = macd.macd()
    df["macd_signal"] = macd.macd_signal()
    df["macd_diff"]   = macd.macd_diff()

    for w in [10, 20, 50, 100, 200]:
        df[f"sma_{w}"] = SMAIndicator(close, window=w).sma_indicator()
        df[f"ema_{w}"] = EMAIndicator(close, window=w).ema_indicator()

    for w in [20, 50, 200]:
        df[f"close_vs_sma{w}"] = close / df[f"sma_{w}"] - 1

    adx = ADXIndicator(high, low, close)
    df["adx"]     = adx.adx()
    df["adx_pos"] = adx.adx_pos()
    df["adx_neg"] = adx.adx_neg()

    df["cci_14"] = CCIIndicator(high, low, close, window=14).cci()
    df["cci_20"] = CCIIndicator(high, low, close, window=20).cci()

    bb20 = BollingerBands(close, window=20)
    df["bb_high_20"]  = bb20.bollinger_hband()
    df["bb_low_20"]   = bb20.bollinger_lband()
    df["bb_pct_20"]   = bb20.bollinger_pband()
    df["bb_width_20"] = bb20.bollinger_wband()

    bb10 = BollingerBands(close, window=10)
    df["bb_pct_10"] = bb10.bollinger_pband()

    df["atr_14"] = AverageTrueRange(high, low, close, window=14).average_true_range()
    df["atr_7"]  = AverageTrueRange(high, low, close, window=7).average_true_range()

    df["hist_vol_10"] = df["return"].rolling(10).std() * np.sqrt(252)
    df["hist_vol_20"] = df["return"].rolling(20).std() * np.sqrt(252)

    df["obv"]       = OnBalanceVolumeIndicator(close, vol).on_balance_volume()
    df["mfi_14"]    = MFIIndicator(high, low, close, vol, window=14).money_flow_index()
    df["vol_sma20"] = vol.rolling(20).mean()
    df["vol_ratio"] = vol / df["vol_sma20"]

    open_ = df["Open"].squeeze()
    df["body"]       = (close - open_).abs() / close
    df["upper_wick"] = (high - close.clip(lower=open_)) / close
    df["lower_wick"] = (close.clip(upper=open_) - low) / close

    for w in [5, 10, 20]:
        df[f"roll_mean_{w}"] = close.rolling(w).mean()
        df[f"roll_std_{w}"]  = close.rolling(w).std()
        df[f"roll_skew_{w}"] = df["return"].rolling(w).skew()
        df[f"roll_kurt_{w}"] = df["return"].rolling(w).kurt()
        df[f"roll_max_{w}"]  = close.rolling(w).max()
        df[f"roll_min_{w}"]  = close.rolling(w).min()
        df[f"rng_pct_{w}"]   = (df[f"roll_max_{w}"] - df[f"roll_min_{w}"]) / close

    df["rsi_macd"] = df["rsi_14"] * df["macd_diff"]
    df["adx_atr"]  = df["adx"]    * df["atr_14"]
    df["vol_ret"]  = df["vol_ratio"] * df["return"]

    df.dropna(inplace=True)
    return df


# -------------------------------------------------------
# 3. Target
# -------------------------------------------------------
def create_target(df: pd.DataFrame, horizon: int = 1) -> pd.DataFrame:
    close = df["Close"].squeeze()
    fwd   = close.pct_change(horizon).shift(-horizon)
    threshold = 0.002
    df["future_return"] = fwd
    df["target"] = np.where(fwd > threshold, 1,
                   np.where(fwd < -threshold, 0, np.nan))
    df.dropna(subset=["target", "future_return"], inplace=True)
    df["target"] = df["target"].astype(int)
    return df


# -------------------------------------------------------
# 4. Train Ensemble
# -------------------------------------------------------
DROP_COLS = {"target", "future_return", "Open", "High", "Low",
             "Close", "Volume", "Dividends", "Stock Splits"}

def train_model(df: pd.DataFrame):
    features = [c for c in df.columns if c not in DROP_COLS]
    X = df[features].values
    y = df["target"].values

    # Walk-forward CV
    tscv = TimeSeriesSplit(n_splits=5)
    cv_scores = []
    for tr_idx, val_idx in tscv.split(X):
        Xtr, Xval = X[tr_idx], X[val_idx]
        ytr, yval = y[tr_idx], y[val_idx]
        sc = RobustScaler()
        xgb_tmp = XGBClassifier(
            n_estimators=300, max_depth=6, learning_rate=0.03,
            subsample=0.8, colsample_bytree=0.8,
            eval_metric="logloss", random_state=42)
        xgb_tmp.fit(sc.fit_transform(Xtr), ytr,
                    eval_set=[(sc.transform(Xval), yval)], verbose=False)
        cv_scores.append(accuracy_score(yval, xgb_tmp.predict(sc.transform(Xval))))

    cv_mean = float(np.mean(cv_scores))
    log.info("Walk-forward CV accuracy: %.4f", cv_mean)

    # Final scaler + ensemble
    scaler = RobustScaler()
    X_s = scaler.fit_transform(X)

    xgb = XGBClassifier(
        n_estimators=500, max_depth=6, learning_rate=0.02,
        subsample=0.8, colsample_bytree=0.7, min_child_weight=3,
        gamma=0.1, reg_alpha=0.1, reg_lambda=1.5,
        eval_metric="logloss", random_state=42)
    rf  = RandomForestClassifier(
        n_estimators=300, max_depth=10, min_samples_leaf=5,
        max_features="sqrt", random_state=42, n_jobs=-1)
    gb  = GradientBoostingClassifier(
        n_estimators=200, max_depth=5, learning_rate=0.05,
        subsample=0.8, random_state=42)

    ensemble  = VotingClassifier([("xgb", xgb), ("rf", rf), ("gb", gb)],
                                 voting="soft", weights=[3, 2, 2])
    calibrated = CalibratedClassifierCV(ensemble, cv=3, method="isotonic")
    calibrated.fit(X_s, y)

    train_acc = float(accuracy_score(y, calibrated.predict(X_s)))

    # XGBoost feature importances (from the inner model)
    xgb.fit(X_s, y)
    importances = dict(zip(features,
                           [round(float(v), 6) for v in xgb.feature_importances_]))

    return calibrated, scaler, features, cv_mean, train_acc, importances


# -------------------------------------------------------
# 5. Predict
# -------------------------------------------------------
def predict_signal(model, scaler, df: pd.DataFrame, features: list):
    X_latest = df[features].iloc[-1:].values
    prob = model.predict_proba(scaler.transform(X_latest))[0][1]
    log.info("Buy probability: %.4f", prob)
    if prob > 0.62:
        signal = "BUY"
    elif prob < 0.38:
        signal = "SELL"
    else:
        signal = "HOLD"
    return signal, round(float(prob), 4)


# -------------------------------------------------------
# 6. Groq LLM Re-Verification
# -------------------------------------------------------
def groq_verify(
    symbol: str,
    signal: str,
    buy_prob: float,
    cv_acc: float,
    snapshot: dict,
    top_features: list,
    current_price: float,
) -> dict:
    """
    Send the ML result + indicator snapshot to Groq for a second-opinion analysis.
    Returns a structured dict: { verdict, confidence, rationale, risk_level, key_factors, disclaimer }
    """
    if not GROQ_API_KEY:
        return {
            "verdict": signal,
            "confidence": "N/A",
            "rationale": "Groq API key not configured. Set GROQ_API_KEY in .env",
            "risk_level": "UNKNOWN",
            "key_factors": [],
            "disclaimer": "LLM verification unavailable.",
            "llm_available": False,
        }

    top5 = top_features[:5]
    top5_str = ", ".join(f"{n} ({v:.4f})" for n, v in top5)

    prompt = f"""You are an expert quantitative analyst and risk manager reviewing an ML-generated stock trading signal for an Indian equity (NSE/BSE).

**Stock**: {symbol}
**Current Price**: ₹{current_price:,.2f}
**ML Model Signal**: {signal}
**ML Buy Probability**: {buy_prob*100:.1f}%
**Walk-forward CV Accuracy**: {cv_acc*100:.1f}%

**Live Technical Indicators (latest bar)**:
- RSI (14): {snapshot['rsi_14']:.1f}  [Overbought >70, Oversold <30]
- Stochastic %K: {snapshot['stoch_k']:.1f}
- ADX: {snapshot['adx']:.1f}  [Trending >25, Strong >40]
- MACD Diff: {snapshot['macd_diff']:.4f}  [Positive = bullish momentum]
- Bollinger %B (20): {snapshot['bb_pct_20']:.2f}  [>0.8 = near upper band]
- ATR (14): ₹{snapshot['atr_14']:.2f}  [Volatility]
- Volume Ratio vs 20d avg: {snapshot['vol_ratio']:.2f}x
- Price vs SMA20: {snapshot['close_vs_sma20']*100:+.2f}%
- Price vs SMA200: {snapshot['close_vs_sma200']*100:+.2f}%

**Top-5 ML Feature Importances**: {top5_str}

**Your task**: As an independent analyst, re-verify this signal. Consider:
1. Do the technical indicators corroborate or contradict the ML signal?
2. What is the overall market structure (trending/ranging/volatile)?
3. What are the key risk factors a trader should know?
4. What is your final verdict?

Respond ONLY in valid JSON with this exact structure (no markdown, no extra text):
{{
  "verdict": "BUY" | "SELL" | "HOLD" | "CAUTION",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "rationale": "<2-3 sentence explanation>",
  "risk_level": "HIGH" | "MEDIUM" | "LOW",
  "key_factors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "disclaimer": "For educational purposes only. Not financial advice."
}}"""

    try:
        client = Groq(api_key=GROQ_API_KEY)
        chat   = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system",
                 "content": "You are a senior quantitative analyst. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=512,
        )
        raw = chat.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        import json
        result = json.loads(raw)
        result["llm_available"] = True
        log.info("Groq verdict: %s | confidence: %s", result.get("verdict"), result.get("confidence"))
        return result

    except Exception as exc:
        log.warning("Groq LLM error: %s", exc)
        return {
            "verdict": signal,
            "confidence": "N/A",
            "rationale": f"LLM call failed: {exc}",
            "risk_level": "UNKNOWN",
            "key_factors": [],
            "disclaimer": "LLM verification failed. ML signal shown as-is.",
            "llm_available": False,
        }


# -------------------------------------------------------
# 7. Build Full Payload  (cached per symbol)
# -------------------------------------------------------
def build_payload(symbol: str) -> dict:
    now = time.time()
    cached = _MODEL_CACHE.get(symbol)
    if cached and (now - cached["ts"]) < CACHE_TTL_S:
        log.info("Cache hit for %s", symbol)
        return cached["payload"]

    df_raw = load_data(symbol)
    df     = add_features(df_raw.copy())
    df     = create_target(df, horizon=1)

    t0 = time.time()
    model, scaler, features, cv_acc, train_acc, importances = train_model(df)
    elapsed = round(time.time() - t0, 1)
    log.info("Model trained in %.1fs", elapsed)

    signal, buy_prob = predict_signal(model, scaler, df, features)

    # Price history for chart (last HISTORY_DAYS rows)
    hist_df     = df_raw.tail(HISTORY_DAYS)
    hist_dates  = [d.strftime("%Y-%m-%d") for d in hist_df.index]
    hist_close  = [round(float(p), 2) for p in hist_df["Close"].values.flatten()]
    hist_open   = [round(float(p), 2) for p in hist_df["Open"].values.flatten()]
    hist_high   = [round(float(p), 2) for p in hist_df["High"].values.flatten()]
    hist_low    = [round(float(p), 2) for p in hist_df["Low"].values.flatten()]
    hist_vol    = [int(v) for v in hist_df["Volume"].values.flatten()]

    current_price = hist_close[-1]

    # Latest indicator snapshot
    last = df.iloc[-1]
    snapshot = {
        "rsi_14":          round(float(last.get("rsi_14", 50)), 2),
        "macd_diff":       round(float(last.get("macd_diff", 0)), 4),
        "adx":             round(float(last.get("adx", 25)), 2),
        "bb_pct_20":       round(float(last.get("bb_pct_20", 0.5)), 4),
        "atr_14":          round(float(last.get("atr_14", 0)), 2),
        "vol_ratio":       round(float(last.get("vol_ratio", 1)), 3),
        "stoch_k":         round(float(last.get("stoch_k", 50)), 2),
        "close_vs_sma20":  round(float(last.get("close_vs_sma20", 0)), 4),
        "close_vs_sma200": round(float(last.get("close_vs_sma200", 0)), 4),
    }

    # Top-20 feature importances
    top_features = sorted(importances.items(), key=lambda x: x[1], reverse=True)[:20]

    # ── Groq LLM Re-Verification ──────────────────────────────────────────────
    log.info("Calling Groq LLM for re-verification of %s ...", symbol)
    llm_analysis = groq_verify(
        symbol=symbol,
        signal=signal,
        buy_prob=buy_prob,
        cv_acc=cv_acc,
        snapshot=snapshot,
        top_features=top_features,
        current_price=current_price,
    )

    payload = {
        "symbol":        symbol.upper(),
        "current_price": current_price,
        "signal":        signal,
        "buy_prob":      buy_prob,
        "sell_prob":     round(1 - buy_prob, 4),
        "accuracy": {
            "cv_mean":  round(cv_acc, 4),
            "train":    round(train_acc, 4),
        },
        "indicators":    snapshot,
        "top_features":  top_features,
        "history": {
            "dates":  hist_dates,
            "close":  hist_close,
            "open":   hist_open,
            "high":   hist_high,
            "low":    hist_low,
            "volume": hist_vol,
        },
        "meta": {
            "data_rows":     len(df),
            "feature_count": len(features),
            "train_elapsed": elapsed,
        },
        "llm_analysis":  llm_analysis,
    }

    _MODEL_CACHE[symbol] = {"ts": now, "payload": payload}
    return payload


# -------------------------------------------------------
# ENDPOINTS
# -------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "server": "server2",
        "model": "XGBoost-Ensemble-v2.1",
        "llm": GROQ_MODEL if GROQ_API_KEY else "not configured",
    }


@app.get("/predict/{symbol}")
def predict(symbol: str):
    try:
        return build_payload(symbol.strip().upper())
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Error processing %s", symbol)
        raise HTTPException(500, detail=str(exc))


# -------------------------------------------------------
# STANDALONE  (python server2.py)
# -------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server2:app", host="0.0.0.0", port=8001, reload=False)
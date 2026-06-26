"""
PaperBull – Deterministic Hybrid Forecast Backend
server1.py  |  FastAPI + Keras LSTM + Groq LLM

Key design decisions that guarantee reproducible results
────────────────────────────────────────────────────────
1. SEEDS EVERYWHERE  – numpy, random, tensorflow all seeded before any model work.
2. LLM NEVER PREDICTS PRICES – Groq runs at temperature=0 and returns ONLY a
   structured JSON sentiment payload (-1..+1 score + report fields).  Prices are
   computed in Python, not by the model.
3. BOUNDED ADJUSTMENT – LLM score is clamped and scaled by MAX_SENTIMENT_SHIFT
   (3 %).  A bullish LLM can push an LSTM price up by at most 3 %; a bearish one
   down by at most 3 %.  No hallucinated 20 % swings.
4. DETERMINISTIC DATA WINDOW – we always use exactly SEQUENCE_LEN + FORECAST_DAYS
   trading days, fetched once, cached for the request lifetime.

Run:
    uvicorn server1:app --reload --port 8000
"""

import os, json, re, random, logging
import numpy as np
import pandas as pd
import yfinance as yf

# ── seed EVERYTHING before importing tensorflow ──────────────────────────────
SEED = 42
os.environ["PYTHONHASHSEED"]     = str(SEED)
os.environ["TF_DETERMINISTIC_OPS"] = "1"
random.seed(SEED)
np.random.seed(SEED)

import tensorflow as tf
tf.random.set_seed(SEED)

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
from sklearn.preprocessing import MinMaxScaler

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger("paperbull")

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
GROQ_API_KEY        = ""
GROQ_MODEL          = "llama-3.3-70b-versatile"
SEQUENCE_LEN        = 60          # look-back window for LSTM
FORECAST_DAYS       = 5           # prediction horizon
EPOCHS              = 50
BATCH_SIZE          = 16
MAX_SENTIMENT_SHIFT = 0.03        # LLM can adjust price by at most ±3 %
DATA_PERIOD         = "1y"        # 1 year of daily data

app = FastAPI(title="PaperBull Forecast API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

groq_client = Groq(api_key=GROQ_API_KEY)

# ─────────────────────────────────────────────────────────────────────────────
# DATA FETCH
# ─────────────────────────────────────────────────────────────────────────────
def fetch_data(symbol: str) -> pd.DataFrame:
    """Download OHLCV from Yahoo Finance for NSE/BSE symbols (always up to today)."""
    ticker = symbol.upper()
    ticker = ticker + ".NS"          # default to NSE

    # Always fetch up to today so the model trains on current data
    today = pd.Timestamp.today().strftime("%Y-%m-%d")
    log.info("Fetching %s up to %s …", ticker, today)
    df = yf.download(ticker, start="2024-01-01", end=today, interval="1d",
                     auto_adjust=True, progress=False)
    if df.empty:
        raise HTTPException(status_code=404,
                            detail=f"No data found for {ticker}. "
                                   "Check the symbol or try adding .BO for BSE.")
    df.dropna(inplace=True)
    return df

# ─────────────────────────────────────────────────────────────────────────────
# TECHNICAL INDICATORS  (used as extra LLM context, not model features)
# ─────────────────────────────────────────────────────────────────────────────
def compute_indicators(df: pd.DataFrame) -> dict:
    close = df["Close"].values.flatten()
    # Simple Moving Averages
    sma20  = float(np.mean(close[-20:]))
    sma50  = float(np.mean(close[-50:])) if len(close) >= 50 else sma20
    # RSI-14
    delta  = np.diff(close[-15:])
    gain   = np.mean(delta[delta > 0]) if any(delta > 0) else 1e-9
    loss   = np.mean(-delta[delta < 0]) if any(delta < 0) else 1e-9
    rsi    = 100 - (100 / (1 + gain / loss))
    # 20-day volatility (annualised)
    returns   = np.diff(np.log(close[-21:]))
    vol_daily = float(np.std(returns))
    vol_ann   = vol_daily * np.sqrt(252) * 100
    # ATR proxy
    highs  = df["High"].values.flatten()[-20:]
    lows   = df["Low"].values.flatten()[-20:]
    atr    = float(np.mean(highs - lows))
    # Support / Resistance: 20-day low / high
    support    = float(np.min(lows))
    resistance = float(np.max(highs))

    return {
        "sma20": round(sma20, 2), "sma50": round(sma50, 2),
        "rsi": round(rsi, 1), "volatility_pct": round(vol_ann, 1),
        "atr": round(atr, 2), "support": round(support, 2),
        "resistance": round(resistance, 2),
    }

# ─────────────────────────────────────────────────────────────────────────────
# LSTM  (deterministic, seeded, MULTI-FEATURE)
# ─────────────────────────────────────────────────────────────────────────────
FEATURES = ["Close", "Volume", "MA10", "EMA10", "RSI"]
HISTORY_DAYS = 30   # trading days of history to return for the chart

def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add technical indicator columns and drop NaN rows."""
    df = df.copy()
    df["MA10"]  = df["Close"].rolling(window=10).mean()
    df["EMA10"] = df["Close"].ewm(span=10).mean()
    delta = df["Close"].diff()
    gain  = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss  = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs    = gain / loss
    df["RSI"] = 100 - (100 / (1 + rs))
    df.dropna(inplace=True)
    return df


def build_sequences_multi(scaled: np.ndarray, seq_len: int, pred_days: int):
    """Build (X, y) where X uses all features and y is only Close (col 0)."""
    X, y = [], []
    for i in range(seq_len, len(scaled) - pred_days):
        X.append(scaled[i - seq_len:i])          # all features
        y.append(scaled[i:i + pred_days, 0])     # only Close
    return np.array(X), np.array(y)


def train_and_predict(df: pd.DataFrame) -> dict:
    """
    Train multi-feature LSTM on historical data, predict next FORECAST_DAYS
    close prices.  Returns { prices: [...], std_devs: [...] }
    """
    # Re-seed inside function so each call is identical given same data
    np.random.seed(SEED)
    tf.random.set_seed(SEED)
    random.seed(SEED)

    feat_df = prepare_features(df)
    data    = feat_df[FEATURES].values              # shape (N, 5)
    n_features = data.shape[1]

    # Scale all features together
    scaler = MinMaxScaler()
    data_scaled = scaler.fit_transform(data)        # shape (N, 5)

    X, y = build_sequences_multi(data_scaled, SEQUENCE_LEN, FORECAST_DAYS)

    # 80/20 train/val split, no shuffle → deterministic
    split   = int(len(X) * 0.8)
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    model = Sequential([
        LSTM(64, return_sequences=True,
             input_shape=(SEQUENCE_LEN, n_features)),
        Dropout(0.2),
        LSTM(64, return_sequences=False),
        Dropout(0.2),
        Dense(32, activation="relu"),
        Dense(FORECAST_DAYS),                       # predict 5 days at once
    ])
    model.compile(optimizer="adam", loss="mse")

    es = EarlyStopping(monitor="val_loss", patience=8,
                       restore_best_weights=True, verbose=0)
    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=EPOCHS, batch_size=BATCH_SIZE,
        callbacks=[es], verbose=0,
        shuffle=False,                              # deterministic
    )

    # Predict from the last SEQUENCE_LEN rows (all features)
    last_seq = data_scaled[-SEQUENCE_LEN:].reshape(1, SEQUENCE_LEN, n_features)
    raw_pred = model.predict(last_seq, verbose=0).flatten()   # shape (5,)

    # Inverse-transform: build a dummy array with all feature columns
    dummy = np.zeros((FORECAST_DAYS, n_features))
    dummy[:, 0] = raw_pred                          # col 0 = Close
    prices_arr  = scaler.inverse_transform(dummy)[:, 0]
    prices      = [round(float(p), 2) for p in prices_arr]

    # ── PRICE ANCHOR ────────────────────────────────────────────────────────
    # The LSTM's last known close comes from the training data's final row.
    # If there's a gap between that date and today's live price, all forecast
    # prices will be offset by that gap.  We correct by scaling all forecast
    # prices proportionally: ratio = live_price / lstm_last_close.
    # The caller must pass live_current_price; we return raw prices here and
    # anchor in train_and_predict after receiving the live price.
    lstm_last_close = float(feat_df["Close"].values.flatten()[-1])

    # Estimate uncertainty from validation residuals
    val_preds   = model.predict(X_val, verbose=0)   # shape (M, 5)
    # Inverse-transform val predictions & actuals for Close
    dummy_val_pred = np.zeros((len(val_preds) * FORECAST_DAYS, n_features))
    dummy_val_pred[:, 0] = val_preds.flatten()
    dummy_val_act  = np.zeros((len(y_val) * FORECAST_DAYS, n_features))
    dummy_val_act[:, 0]  = y_val.flatten()
    inv_pred = scaler.inverse_transform(dummy_val_pred)[:, 0]
    inv_act  = scaler.inverse_transform(dummy_val_act)[:, 0]
    residuals = inv_act - inv_pred

    base_std = float(np.std(residuals))
    std_devs = [round(base_std * (1 + 0.1 * i), 2) for i in range(FORECAST_DAYS)]

    return {"prices": prices, "std_devs": std_devs, "lstm_last_close": lstm_last_close}

# ─────────────────────────────────────────────────────────────────────────────
# GROQ LLM  – sentiment ONLY, temperature=0
# ─────────────────────────────────────────────────────────────────────────────
SENTIMENT_SYSTEM = """You are a quantitative equity analyst for Indian markets (NSE/BSE).
You will receive technical data for a stock and LSTM price forecasts.
Your job: assess short-term market sentiment and explain the bull/bear case.

STRICT OUTPUT FORMAT – respond with ONLY a valid JSON object. Do not include markdown formatting or backticks.
The JSON object must follow this schema:
{
  "sentiment_score": 0.15,
  "confidence": 75,
  "direction": "bullish",
  "verdict": "A brief one-sentence verdict.",
  "summary": "A two to three sentence summary analyzing indicators.",
  "bull_case": "The primary bull case argument.",
  "bear_case": "The primary bear case argument.",
  "risk_level": "medium"
}

Rules for fields:
- sentiment_score: must be a float between -1.0 (very bearish) and 1.0 (very bullish). This is the ONLY number that influences price adjustment. Be calibrated.
- confidence: must be an integer between 1 and 100 reflecting how clear the technical picture is.
- direction: must be exactly one of "bullish", "bearish", or "neutral".
- verdict: one crisp, clear sentence.
- summary: two to three sentences of analysis. Do NOT invent new price targets. The LSTM model owns price prediction.
- bull_case: one sentence explaining the bullish factors.
- bear_case: one sentence explaining the bearish factors.
- risk_level: must be exactly one of "low", "medium", or "high".
"""

def run_llm_sentiment(symbol: str, current_price: float,
                      lstm_prices: list, indicators: dict) -> dict:
    """
    Call Groq at temperature=0 for a deterministic JSON sentiment payload.
    Falls back gracefully if the API is unavailable.
    """
    sma_signal = "above SMA20" if current_price > indicators["sma20"] else "below SMA20"
    rsi_signal = (
        "overbought (RSI > 70)" if indicators["rsi"] > 70
        else "oversold (RSI < 30)" if indicators["rsi"] < 30
        else "neutral zone"
    )
    trend = "uptrend" if current_price > indicators["sma50"] else "downtrend"

    user_msg = f"""Stock: {symbol}
Current price: ₹{current_price:.2f}
Trend vs SMA50: {trend} | {sma_signal}
RSI-14: {indicators['rsi']} ({rsi_signal})
Annualised volatility: {indicators['volatility_pct']}%
ATR (20-day): ₹{indicators['atr']}
Support: ₹{indicators['support']} | Resistance: ₹{indicators['resistance']}
LSTM 5-day forecast: {lstm_prices}
(Day 1 is tomorrow, Day 5 is the 5th trading day from now)

Provide your sentiment assessment strictly as JSON."""

    raw = None
    try:
        resp = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": SENTIMENT_SYSTEM},
                {"role": "user",   "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=0,          # ← deterministic
            max_tokens=512,
        )
        raw = resp.choices[0].message.content.strip()
        # Find first '{' and last '}' to extract the JSON payload robustly
        start_idx = raw.find('{')
        end_idx = raw.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            raw = raw[start_idx:end_idx+1]
        else:
            raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        
        return json.loads(raw)

    except Exception as exc:
        log.warning("LLM sentiment execution/parsing failed: %s. Raw response: %r", exc, raw)
        return {
            "sentiment_score": 0.0,
            "confidence": 50,
            "direction": "neutral",
            "verdict": "Unable to retrieve LLM analysis. Showing LSTM forecast only.",
            "summary": "LLM sentiment analysis unavailable. The LSTM model prices are shown as-is.",
            "bull_case": "Technical indicators may support upside if momentum builds.",
            "bear_case": "Lack of confirmed trend may indicate consolidation or reversal risk.",
            "risk_level": "medium",
        }

# ─────────────────────────────────────────────────────────────────────────────
# PRICE COMBINER  – deterministic formula
# ─────────────────────────────────────────────────────────────────────────────
def combine_prices(lstm_prices: list, sentiment_score: float,
                   std_devs: list) -> dict:
    """
    Compute LLM-adjusted prices, lower bound, upper bound.

    Formula:
        adjusted = lstm × (1 + clamp(score, -1, 1) × MAX_SENTIMENT_SHIFT)
        lower    = adjusted − 1.645 × std  (90 % confidence, one-sided)
        upper    = adjusted + 1.645 × std
    """
    score    = float(np.clip(sentiment_score, -1.0, 1.0))
    factor   = 1.0 + score * MAX_SENTIMENT_SHIFT
    z        = 1.645   # 90 % interval

    adjusted, lower, upper = [], [], []
    for price, std in zip(lstm_prices, std_devs):
        adj   = round(price * factor, 2)
        adjusted.append(adj)
        lower.append(round(adj - z * std, 2))
        upper.append(round(adj + z * std, 2))

    return {"prices": adjusted, "lower": lower, "upper": upper}

# ─────────────────────────────────────────────────────────────────────────────
# FORECAST ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/forecast/{symbol}")
def forecast(symbol: str):
    print("calling..")
    # 1. Fetch data
    df            = fetch_data(symbol)
    close_prices  = df["Close"].values.flatten()
    current_price = float(close_prices[-1])

    if len(close_prices) < SEQUENCE_LEN + 10:
        raise HTTPException(status_code=422,
                            detail=f"Need at least {SEQUENCE_LEN + 10} trading days "
                                   "of data. Try a symbol with longer history.")

    # 2. LSTM prediction (seeded, deterministic, multi-feature)
    log.info("Training LSTM for %s …", symbol)
    lstm_result       = train_and_predict(df)
    lstm_prices_raw   = lstm_result["prices"]
    std_devs          = lstm_result["std_devs"]
    lstm_last_close   = lstm_result["lstm_last_close"]

    # ── Anchor: scale LSTM predictions to today's real price ────────────────
    # LSTM predicts relative to its last training close.  If the live price
    # has moved since then, we scale all forecast prices proportionally.
    anchor_ratio = current_price / lstm_last_close if lstm_last_close > 0 else 1.0
    lstm_prices  = [round(p * anchor_ratio, 2) for p in lstm_prices_raw]
    std_devs     = [round(s * anchor_ratio, 2) for s in std_devs]
    log.info("Anchor ratio %.4f (live ₹%.2f / lstm_last ₹%.2f)",
             anchor_ratio, current_price, lstm_last_close)

    # 3. Technical indicators (for LLM context)
    indicators = compute_indicators(df)

    # 4. Groq LLM sentiment at temperature=0
    log.info("Running LLM sentiment …")
    llm_payload = run_llm_sentiment(
        symbol.upper(), current_price, lstm_prices, indicators
    )
    sentiment_score = float(llm_payload.get("sentiment_score", 0.0))
    confidence      = int(llm_payload.get("confidence", 50))

    # 5. Combine deterministically
    combined = combine_prices(lstm_prices, sentiment_score, std_devs)

    # 6. Chart labels – forecast days
    last_date  = df.index[-1]
    bdays      = pd.bdate_range(start=last_date, periods=FORECAST_DAYS + 1,
                                freq="B")[1:]
    labels     = [d.strftime("%b %d") for d in bdays]

    # 7. Historical data – last HISTORY_DAYS trading days for the chart
    hist_df     = df.tail(HISTORY_DAYS)
    hist_dates  = [d.strftime("%b %d") for d in hist_df.index]
    hist_prices = [round(float(p), 2) for p in hist_df["Close"].values.flatten()]

    return {
        "symbol":        symbol.upper(),
        "current_price": round(current_price, 2),
        "lstm_prices":   lstm_prices,
        "forecast": {
            "prices":     combined["prices"],
            "lower":      combined["lower"],
            "upper":      combined["upper"],
            "direction":  llm_payload.get("direction", "neutral"),
            "confidence": confidence,
        },
        "report": {
            "verdict":          llm_payload.get("verdict", "—"),
            "summary":          llm_payload.get("summary", "—"),
            "bull_case":        llm_payload.get("bull_case", "—"),
            "bear_case":        llm_payload.get("bear_case", "—"),
            "risk_level":       llm_payload.get("risk_level", "medium"),
            "support_level":    indicators["support"],
            "resistance_level": indicators["resistance"],
        },
        "history": {
            "dates":  hist_dates,
            "prices": hist_prices,
        },
        "chart_data": {"labels": labels},
        "meta": {
            "sentiment_score":         round(sentiment_score, 3),
            "max_sentiment_shift_pct": MAX_SENTIMENT_SHIFT * 100,
            "lstm_seed":               SEED,
            "data_points":             len(close_prices),
            "anchor_ratio":            round(anchor_ratio, 4),
            "lstm_last_close":         round(lstm_last_close, 2),
        },
    }


@app.get("/health")
def health():
    return {"status": "ok", "model": GROQ_MODEL}


# ─────────────────────────────────────────────────────────────────────────────
# PORTFOLIO FORECAST ENDPOINT  ← returns exact ForecastItem shape for frontend
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/portfolio-forecast/{symbol}")
def portfolio_forecast(symbol: str):
    """
    Returns a single ForecastItem matching the frontend interface:
    {
        symbol:      str            – clean symbol (no .NS)
        signal:      "BUY"|"HOLD"|"EXIT"
        target1D:    float          – adjusted price for day 1
        target7D:    float          – adjusted price for day 5
        uncertainty: float          – ± % band (from upper bound)
        narrative:   str            – one-sentence Groq verdict
        confidence:  int            – 0–100
    }
    """
    sym = symbol.upper().replace(".NS", "").replace(".BO", "")

    # 1. Fetch OHLCV data (always up to today via fetch_data)
    df = fetch_data(sym)
    close_prices  = df["Close"].values.flatten()
    current_price = float(close_prices[-1])

    if len(close_prices) < SEQUENCE_LEN + 10:
        raise HTTPException(
            status_code=422,
            detail=f"Need at least {SEQUENCE_LEN + 10} trading days of data."
        )

    # 2. LSTM prediction
    lstm_result     = train_and_predict(df)
    lstm_prices_raw = lstm_result["prices"]
    std_devs        = lstm_result["std_devs"]
    lstm_last_close = lstm_result["lstm_last_close"]

    # ── Anchor: scale LSTM output to live current price ───────────────────
    anchor_ratio = current_price / lstm_last_close if lstm_last_close > 0 else 1.0
    lstm_prices  = [round(p * anchor_ratio, 2) for p in lstm_prices_raw]
    std_devs     = [round(s * anchor_ratio, 2) for s in std_devs]
    log.info("[%s] Anchor ratio %.4f (live ₹%.2f / lstm_last ₹%.2f)",
             sym, anchor_ratio, current_price, lstm_last_close)

    # 3. Technical indicators for LLM context
    indicators = compute_indicators(df)

    # 4. Groq LLM sentiment
    llm = run_llm_sentiment(sym, current_price, lstm_prices, indicators)
    sentiment_score = float(llm.get("sentiment_score", 0.0))
    confidence      = int(llm.get("confidence", 50))
    direction       = llm.get("direction", "neutral")
    verdict         = llm.get("verdict", "Analysis complete.")

    # 5. Combine LSTM + LLM sentiment shift
    combined = combine_prices(lstm_prices, sentiment_score, std_devs)
    prices = combined["prices"]
    upper  = combined["upper"]

    # 6. Map direction → signal
    if direction == "bullish":
        signal = "BUY"
    elif direction == "bearish":
        signal = "EXIT"
    else:
        signal = "HOLD"

    # 7. target1D / target7D from anchored, sentiment-adjusted prices
    target1D = prices[0] if prices else current_price
    target7D = prices[4] if len(prices) > 4 else (prices[-1] if prices else current_price)

    # 8. Uncertainty = half-width of confidence band as % of target1D
    if target1D and upper:
        uncertainty = round(((upper[0] - target1D) / target1D) * 100, 1)
    else:
        uncertainty = round(float(std_devs[0]) / current_price * 100, 1) if std_devs else 2.0

    return {
        "symbol":      sym,
        "signal":      signal,
        "target1D":    round(target1D, 2),
        "target7D":    round(target7D, 2),
        "uncertainty": uncertainty,
        "narrative":   verdict,
        "confidence":  confidence,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server1:app", host="0.0.0.0", port=8000, reload=False)

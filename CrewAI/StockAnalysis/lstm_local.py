import os
import json
import re
import random
import logging
import numpy as np
import pandas as pd
import yfinance as yf
from dotenv import load_dotenv

# Seed everything before importing tensorflow
SEED = 42
os.environ["PYTHONHASHSEED"] = str(SEED)
os.environ["TF_DETERMINISTIC_OPS"] = "1"
random.seed(SEED)
np.random.seed(SEED)

import tensorflow as tf
tf.random.set_seed(SEED)

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
from sklearn.preprocessing import MinMaxScaler
from groq import Groq

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger("lstm_local")

# Config
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"
SEQUENCE_LEN = 60          # look-back window for LSTM
FORECAST_DAYS = 5           # prediction horizon
EPOCHS = 50
BATCH_SIZE = 16
MAX_SENTIMENT_SHIFT = 0.03        # LLM can adjust price by at most ±3%
HISTORY_DAYS = 30

FEATURES = ["Close", "Volume", "MA10", "EMA10", "RSI"]

# Initialize Groq client
if GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)
else:
    groq_client = None
    log.warning("GROQ_API_KEY not found in environment. Sentiment analysis fallback will be used.")

def fetch_data(symbol: str) -> pd.DataFrame:
    """Download OHLCV from Yahoo Finance for NSE/BSE symbols."""
    ticker = symbol.upper().strip()
    if not ticker.endswith(".NS") and not ticker.endswith(".BO"):
        ticker = f"{ticker}.NS"
        
    today = pd.Timestamp.today().strftime("%Y-%m-%d")
    log.info("Local LSTM: Fetching %s up to %s ...", ticker, today)
    df = yf.download(ticker, start="2024-01-01", end=today, interval="1d",
                     auto_adjust=True, progress=False)
    if df.empty:
        raise ValueError(f"No data found for {ticker}.")
    df.dropna(inplace=True)
    return df

def compute_indicators(df: pd.DataFrame) -> dict:
    close = df["Close"].values.flatten()
    sma20 = float(np.mean(close[-20:]))
    sma50 = float(np.mean(close[-50:])) if len(close) >= 50 else sma20
    
    # RSI-14
    delta = np.diff(close[-15:])
    gain = np.mean(delta[delta > 0]) if any(delta > 0) else 1e-9
    loss = np.mean(-delta[delta < 0]) if any(delta < 0) else 1e-9
    rsi = 100 - (100 / (1 + gain / loss))
    
    # 20-day volatility (annualised)
    returns = np.diff(np.log(close[-21:]))
    vol_daily = float(np.std(returns))
    vol_ann = vol_daily * np.sqrt(252) * 100
    
    # ATR proxy
    highs = df["High"].values.flatten()[-20:]
    lows = df["Low"].values.flatten()[-20:]
    atr = float(np.mean(highs - lows))
    
    # Support / Resistance: 20-day low / high
    support = float(np.min(lows))
    resistance = float(np.max(highs))

    return {
        "sma20": round(sma20, 2), "sma50": round(sma50, 2),
        "rsi": round(rsi, 1), "volatility_pct": round(vol_ann, 1),
        "atr": round(atr, 2), "support": round(support, 2),
        "resistance": round(resistance, 2),
    }

def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add technical indicator columns and drop NaN rows."""
    df = df.copy()
    df["MA10"] = df["Close"].rolling(window=10).mean()
    df["EMA10"] = df["Close"].ewm(span=10).mean()
    delta = df["Close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
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

def train_and_predict(df: pd.DataFrame, symbol: str) -> dict:
    """Train multi-feature LSTM on historical data, predict next Close prices."""
    np.random.seed(SEED)
    tf.random.set_seed(SEED)
    random.seed(SEED)

    feat_df = prepare_features(df)
    data = feat_df[FEATURES].values              # shape (N, 5)
    n_features = data.shape[1]

    scaler = MinMaxScaler()
    data_scaled = scaler.fit_transform(data)        # shape (N, 5)

    X, y = build_sequences_multi(data_scaled, SEQUENCE_LEN, FORECAST_DAYS)

    split = int(len(X) * 0.8)
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    # Cache directory relative to this script
    current_dir = os.path.dirname(os.path.abspath(__file__))
    cached_model_dir = os.path.join(current_dir, "cached_models")
    os.makedirs(cached_model_dir, exist_ok=True)
    model_path = os.path.join(cached_model_dir, f"{symbol.lower()}_lstm.keras")

    is_fresh = False
    if os.path.exists(model_path):
        try:
            from datetime import datetime
            mtime = datetime.fromtimestamp(os.path.getmtime(model_path))
            if mtime.date() == datetime.today().date():
                is_fresh = True
        except Exception as e:
            log.warning(f"Error checking cache freshness for {symbol}: {e}")

    if is_fresh:
        log.info(f"Loading cached LSTM model for {symbol} from {model_path}...")
        try:
            model = tf.keras.models.load_model(model_path)
        except Exception as e:
            log.warning(f"Failed to load cached model for {symbol}, falling back to training: {e}")
            is_fresh = False

    if not is_fresh:
        log.info(f"Training fresh LSTM model for {symbol}...")
        model = Sequential([
            LSTM(64, return_sequences=True, input_shape=(SEQUENCE_LEN, n_features)),
            Dropout(0.2),
            LSTM(64, return_sequences=False),
            Dropout(0.2),
            Dense(32, activation="relu"),
            Dense(FORECAST_DAYS),
        ])
        model.compile(optimizer="adam", loss="mse")

        es = EarlyStopping(monitor="val_loss", patience=8, restore_best_weights=True, verbose=0)
        model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=EPOCHS, batch_size=BATCH_SIZE,
            callbacks=[es], verbose=0,
            shuffle=False,
        )
        try:
            model.save(model_path)
            log.info(f"Saved trained LSTM model for {symbol} to {model_path}")
        except Exception as e:
            log.warning(f"Failed to save model cache for {symbol}: {e}")

    # Predict from the last SEQUENCE_LEN rows
    last_seq = data_scaled[-SEQUENCE_LEN:].reshape(1, SEQUENCE_LEN, n_features)
    raw_pred = model.predict(last_seq, verbose=0).flatten()

    # Inverse-transform Close column
    dummy = np.zeros((FORECAST_DAYS, n_features))
    dummy[:, 0] = raw_pred
    prices_arr = scaler.inverse_transform(dummy)[:, 0]
    prices = [round(float(p), 2) for p in prices_arr]

    lstm_last_close = float(feat_df["Close"].values.flatten()[-1])

    # Estimate uncertainty
    val_preds = model.predict(X_val, verbose=0)
    dummy_val_pred = np.zeros((len(val_preds) * FORECAST_DAYS, n_features))
    dummy_val_pred[:, 0] = val_preds.flatten()
    dummy_val_act = np.zeros((len(y_val) * FORECAST_DAYS, n_features))
    dummy_val_act[:, 0] = y_val.flatten()
    inv_pred = scaler.inverse_transform(dummy_val_pred)[:, 0]
    inv_act = scaler.inverse_transform(dummy_val_act)[:, 0]
    residuals = inv_act - inv_pred

    base_std = float(np.std(residuals))
    std_devs = [round(base_std * (1 + 0.1 * i), 2) for i in range(FORECAST_DAYS)]

    return {"prices": prices, "std_devs": std_devs, "lstm_last_close": lstm_last_close}

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
    """Call Groq for a deterministic JSON sentiment payload."""
    if not groq_client:
        return get_default_sentiment_payload()
        
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
            temperature=0,
            max_tokens=512,
        )
        raw = resp.choices[0].message.content.strip()
        start_idx = raw.find('{')
        end_idx = raw.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            raw = raw[start_idx:end_idx+1]
        else:
            raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        
        return json.loads(raw)

    except Exception as exc:
        log.warning("LLM sentiment execution/parsing failed: %s. Raw response: %r", exc, raw)
        return get_default_sentiment_payload()

def get_default_sentiment_payload() -> dict:
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

def combine_prices(lstm_prices: list, sentiment_score: float,
                   std_devs: list) -> dict:
    """Compute LLM-adjusted prices, lower bound, upper bound."""
    score = float(np.clip(sentiment_score, -1.0, 1.0))
    factor = 1.0 + score * MAX_SENTIMENT_SHIFT
    z = 1.645   # 90% interval

    adjusted, lower, upper = [], [], []
    for price, std in zip(lstm_prices, std_devs):
        adj = round(price * factor, 2)
        adjusted.append(adj)
        lower.append(round(adj - z * std, 2))
        upper.append(round(adj + z * std, 2))

    return {"prices": adjusted, "lower": lower, "upper": upper}

def get_lstm_forecast(symbol: str) -> dict:
    """Run local LSTM forecast pipeline and return structured forecast dict."""
    try:
        df = fetch_data(symbol)
        close_prices = df["Close"].values.flatten()
        current_price = float(close_prices[-1])

        if len(close_prices) < SEQUENCE_LEN + 10:
            raise ValueError(f"Need at least {SEQUENCE_LEN + 10} trading days of data for {symbol}.")

        log.info("Training local LSTM model for %s ...", symbol)
        lstm_result = train_and_predict(df, symbol)
        lstm_prices_raw = lstm_result["prices"]
        std_devs = lstm_result["std_devs"]
        lstm_last_close = lstm_result["lstm_last_close"]

        # Anchor forecast prices
        anchor_ratio = current_price / lstm_last_close if lstm_last_close > 0 else 1.0
        lstm_prices = [round(p * anchor_ratio, 2) for p in lstm_prices_raw]
        std_devs = [round(s * anchor_ratio, 2) for s in std_devs]

        # Calculate indicators
        indicators = compute_indicators(df)

        # Run LLM sentiment
        llm_payload = run_llm_sentiment(symbol, current_price, lstm_prices, indicators)
        sentiment_score = float(llm_payload.get("sentiment_score", 0.0))
        confidence = int(llm_payload.get("confidence", 50))

        # Combine
        combined = combine_prices(lstm_prices, sentiment_score, std_devs)

        return {
            "symbol": symbol.upper(),
            "current_price": round(current_price, 2),
            "forecast_available": True,
            "lstm_prices": lstm_prices,
            "forecast": {
                "prices": combined["prices"],
                "lower": combined["lower"],
                "upper": combined["upper"],
                "direction": llm_payload.get("direction", "neutral"),
                "confidence": confidence,
            },
            "report": {
                "verdict": llm_payload.get("verdict", "—"),
                "summary": llm_payload.get("summary", "—"),
                "bull_case": llm_payload.get("bull_case", "—"),
                "bear_case": llm_payload.get("bear_case", "—"),
                "risk_level": llm_payload.get("risk_level", "medium"),
                "support_level": indicators["support"],
                "resistance_level": indicators["resistance"],
            }
        }
    except Exception as e:
        log.error("Failed to run local LSTM forecast for %s: %s", symbol, str(e))
        return {
            "symbol": symbol.upper(),
            "forecast_available": False,
            "error": str(e)
        }

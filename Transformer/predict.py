"""
predict.py
----------
Phase 8 – Single-Step Prediction (Tomorrow's Close).

Loads the best saved model, fetches the latest 30 trading days of data,
and predicts the NEXT day's closing price.

Displays:
    • Today's Close    (last known close price)
    • Predicted Close  (tomorrow's forecast)
    • Expected Return  (% change)

Usage:
    python predict.py                          # uses config.TICKER
    python predict.py --ticker INFY.NS
"""

import argparse
import os
from datetime import datetime, timedelta

import numpy as np
import torch

import config
from data import download_stock_data
from indicators import add_indicators
from model import get_model
from preprocess import inverse_close, load_scaler
from utils import get_device, load_checkpoint, set_seed


# ─────────────────────────────────────────────────────────────────────────────
def predict_next_day(ticker: str = config.TICKER) -> dict:
    """Predict tomorrow's closing price for ``ticker``.

    Steps
    -----
    1. Download the most recent WINDOW_SIZE + 40 rows (extra rows for indicator
       warm-up so the final WINDOW_SIZE rows all have valid indicator values).
    2. Add technical indicators and drop NaN rows.
    3. Select the last WINDOW_SIZE rows as the inference window.
    4. Load the fitted scaler and apply the same normalisation.
    5. Run the model forward pass.
    6. Inverse-transform the prediction back to Rs..

    Returns
    -------
    dict with keys:
        today_close    : Last known Close price (Rs.).
        predicted_close: Tomorrow's forecast (Rs.).
        expected_return: Percentage change (%).
    """
    set_seed()
    device = get_device()

    # ── 1. Download recent data (fetch extra days for indicator warm-up) ──────
    # We need at least WINDOW_SIZE valid rows AFTER indicators are computed.
    # The longest look-back indicator is SMA_20 (20 rows) and Bollinger (20).
    # We fetch WINDOW_SIZE + 60 calendar days to be safe.
    # To predict for July 8, 2026, the look-back window must end on July 7, 2026.
    # Since yfinance's end date parameter is exclusive, we set end_date to July 8, 2026.
    end_date   = (datetime.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    start_date = (datetime.today() - timedelta(days=config.WINDOW_SIZE + 90)).strftime(
        "%Y-%m-%d"
    )

    print(f"\n[predict.py] Downloading recent data for {ticker} …")
    raw_df = download_stock_data(ticker, start=start_date, end=end_date)

    # ── 2. Feature engineering ────────────────────────────────────────────────
    featured = add_indicators(raw_df)
    featured.dropna(inplace=True)
    featured = featured[config.FEATURE_COLS]

    if len(featured) < config.WINDOW_SIZE:
        raise ValueError(
            f"Not enough data after indicator computation: "
            f"{len(featured)} rows (need {config.WINDOW_SIZE})."
        )

    # ── 3. Take the last WINDOW_SIZE rows as the inference window ─────────────
    window_df    = featured.iloc[-config.WINDOW_SIZE:]
    today_close  = float(featured["Close"].iloc[-1])   # last known Close Rs.

    # ── 4. Load scaler and normalise ──────────────────────────────────────────
    if not os.path.exists(config.SCALER_PATH):
        raise FileNotFoundError(
            f"Scaler not found at {config.SCALER_PATH}. Run train.py first."
        )
    scaler        = load_scaler(config.SCALER_PATH)
    window_scaled = scaler.transform(window_df.values)   # (WINDOW_SIZE, NUM_FEATURES)

    # Build tensor: (1, WINDOW_SIZE, NUM_FEATURES)
    x = torch.tensor(window_scaled, dtype=torch.float32).unsqueeze(0).to(device)

    # ── 5. Load model and infer ───────────────────────────────────────────────
    model_path = os.path.join(config.MODEL_DIR, "best_model.pt")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"Checkpoint not found at {model_path}. Run train.py first."
        )
    model = get_model(device)
    load_checkpoint(model, model_path, device)
    model.eval()

    with torch.no_grad():
        pred_scaled = model(x).cpu().numpy()         # shape (1,)

    # ── 6. Reconstruct predicted Close price ──────────────────────────────────
    pred_return     = float(pred_scaled[0])
    pred_close      = today_close * (1 + pred_return)
    expected_return = pred_return * 100.0

    # ── Display ───────────────────────────────────────────────────────────────
    sep = "=" * 48
    print(f"\n{sep}")
    print(f"  Transformer Forecast -- {ticker}")
    print(sep)
    print(f"  Today's Close    : Rs. {today_close:>10.2f}")
    print(f"  Predicted Close  : Rs. {pred_close:>10.2f}")
    arrow = "^" if expected_return >= 0 else "v"
    sign  = "+" if expected_return >= 0 else ""
    print(f"  Expected Return  :  {arrow} {sign}{expected_return:.2f}%")
    print(f"{sep}\n")

    return {
        "ticker":          ticker,
        "today_close":     round(today_close, 2),
        "predicted_close": round(pred_close, 2),
        "expected_return": round(expected_return, 4),
    }


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Predict tomorrow's closing price."
    )
    parser.add_argument(
        "--ticker", type=str, default=config.TICKER,
        help="Yahoo Finance ticker (default: %(default)s)"
    )
    args = parser.parse_args()
    result = predict_next_day(args.ticker)

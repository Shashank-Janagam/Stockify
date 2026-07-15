"""
evaluate.py
-----------
Phase 7 – Model Evaluation.

Loads the best saved model, runs inference on the test split,
inverse-transforms predictions back to Rs., and computes:
    • RMSE  – Root Mean Squared Error
    • MAE   – Mean Absolute Error
    • MAPE  – Mean Absolute Percentage Error
    • R²    – Coefficient of Determination

Also generates and saves the Predicted vs Actual close price plot.

Usage:
    python evaluate.py
    python evaluate.py --ticker TCS.NS
"""

import argparse
import os

import numpy as np
import torch
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

import config
from dataset import make_dataloaders
from model import get_model
from preprocess import build_preprocessed_splits, inverse_close, load_and_engineer, split_data
from utils import get_device, load_checkpoint, plot_predictions, set_seed


# ─────────────────────────────────────────────────────────────────────────────
# Metrics
# ─────────────────────────────────────────────────────────────────────────────
def compute_metrics(
    actuals: np.ndarray,
    predictions: np.ndarray,
) -> dict[str, float]:
    """Compute regression evaluation metrics.

    Parameters
    ----------
    actuals     : Ground-truth Close prices (real Rs. values).
    predictions : Model-predicted Close prices (real Rs. values).

    Returns
    -------
    dict with keys: RMSE, MAE, MAPE, R2
    """
    rmse = float(np.sqrt(mean_squared_error(actuals, predictions)))
    mae  = float(mean_absolute_error(actuals, predictions))
    mape = float(
        np.mean(np.abs((actuals - predictions) / (actuals + 1e-8))) * 100
    )
    r2   = float(r2_score(actuals, predictions))
    return {"RMSE": rmse, "MAE": mae, "MAPE": mape, "R2": r2}


# ─────────────────────────────────────────────────────────────────────────────
# Collect predictions from a DataLoader
# ─────────────────────────────────────────────────────────────────────────────
@torch.no_grad()
def get_predictions(
    model: torch.nn.Module,
    loader: torch.utils.data.DataLoader,
    device: torch.device,
) -> tuple[np.ndarray, np.ndarray]:
    """Run model inference over an entire DataLoader.

    Returns
    -------
    (all_actuals, all_predictions)  — both as 1-D NumPy arrays (scaled values).
    """
    model.eval()
    preds_list:   list[np.ndarray] = []
    actuals_list: list[np.ndarray] = []

    for X_batch, y_batch in loader:
        X_batch = X_batch.to(device)
        outputs = model(X_batch).cpu().numpy()
        preds_list.append(outputs)
        actuals_list.append(y_batch.numpy())

    return (
        np.concatenate(actuals_list, axis=0),
        np.concatenate(preds_list,   axis=0),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main evaluation function
# ─────────────────────────────────────────────────────────────────────────────
def evaluate(ticker: str = config.TICKER) -> dict[str, float]:
    """Load the best model and evaluate on the held-out test set.

    Parameters
    ----------
    ticker : Ticker symbol (used to locate the raw data CSV).

    Returns
    -------
    Metrics dict with RMSE, MAE, MAPE, R2.
    """
    set_seed()
    device = get_device()

    # ── Data ──────────────────────────────────────────────────────────────────
    csv_path = os.path.join(
        config.DATA_DIR, f"{ticker.replace('.', '_')}_raw.csv"
    )
    train_s, val_s, test_s, scaler, test_dates = build_preprocessed_splits(
        ticker, csv_path=csv_path
    )
    # We need the full split data again but build_preprocessed_splits accepts
    # csv_path via keyword – align call signature
    _, _, test_loader = make_dataloaders(train_s, val_s, test_s)

    # ── Load Model ────────────────────────────────────────────────────────────
    model      = get_model(device)
    model_path = os.path.join(config.MODEL_DIR, "best_model.pt")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"No checkpoint found at {model_path}. Run train.py first."
        )
    load_checkpoint(model, model_path, device)

    # ── Inference ─────────────────────────────────────────────────────────────
    actuals_scaled, preds_scaled = get_predictions(model, test_loader, device)

    # Reload original unscaled test DataFrame to get actual Close prices
    df = load_and_engineer(ticker, csv_path=csv_path)
    _, _, test_df = split_data(df)
    test_prices = test_df["Close"].values

    # The actual close prices correspond to index [WINDOW_SIZE:] of the test split
    actuals_real = test_prices[config.WINDOW_SIZE:]
    # Previous day's actual closes are index [WINDOW_SIZE-1 : -1]
    prev_prices  = test_prices[config.WINDOW_SIZE - 1 : -1]

    # Reconstruct predicted Close prices: Prev_Close * (1 + predicted_return)
    preds_real   = prev_prices * (1 + preds_scaled)

    # ── Metrics ───────────────────────────────────────────────────────────────
    metrics = compute_metrics(actuals_real, preds_real)
    print("\n" + "=" * 50)
    print(f"  Evaluation Results — {ticker}")
    print("=" * 50)
    print(f"  RMSE : Rs.{metrics['RMSE']:.2f}")
    print(f"  MAE  : Rs.{metrics['MAE']:.2f}")
    print(f"  MAPE : {metrics['MAPE']:.2f}%")
    print(f"  R²   : {metrics['R2']:.4f}")
    print("=" * 50)

    # ── Plot ──────────────────────────────────────────────────────────────────
    # Align dates with the dataset (dataset consumes window_size rows before first pred)
    pred_dates = test_dates[config.WINDOW_SIZE:] if test_dates is not None else None
    plot_path  = os.path.join(config.RESULTS_DIR, "predictions_vs_actual.png")
    plot_predictions(
        actuals_real, preds_real,
        dates=pred_dates,
        title=f"{ticker} — Transformer Predicted vs Actual Close",
        save_path=plot_path,
    )
    return metrics


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate the trained StockTransformer.")
    parser.add_argument("--ticker", default=config.TICKER)
    args = parser.parse_args()
    evaluate(args.ticker)

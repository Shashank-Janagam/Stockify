"""
preprocess.py
-------------
Phase 3 – Data Preprocessing.

Pipeline:
  1. Download raw OHLCV data (or load from CSV).
  2. Add technical indicators.
  3. Drop NaN rows caused by indicator look-back windows.
  4. Select the feature columns defined in config.FEATURE_COLS.
  5. Normalise with MinMaxScaler (fit on training slice only).
  6. Persist the fitted scaler to disk.
  7. Split into train / validation / test arrays.

The scaled NumPy arrays are used directly by dataset.py.
"""

import os
import pickle

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

import config
from data import download_stock_data, load_raw_csv
from indicators import add_indicators


# ─────────────────────────────────────────────────────────────────────────────
def load_and_engineer(
    ticker: str = config.TICKER,
    start: str = config.START_DATE,
    end: str = config.END_DATE,
    csv_path: str | None = None,
) -> pd.DataFrame:
    """Download (or load from CSV) raw data, calculate returns target, and add all indicators.

    Parameters
    ----------
    ticker   : Yahoo Finance ticker symbol.
    start    : Start date string.
    end      : End date string.
    csv_path : If provided and exists, load from CSV instead of downloading.

    Returns
    -------
    pd.DataFrame with all 15 feature columns + 'Target_Return' column and no NaN rows.
    """
    # Load or download raw data
    if csv_path and os.path.exists(csv_path):
        print(f"[preprocess.py] Loading raw data from {csv_path}")
        raw_df = load_raw_csv(csv_path)
    else:
        save_path = csv_path or os.path.join(
            config.DATA_DIR, f"{ticker.replace('.', '_')}_raw.csv"
        )
        raw_df = download_stock_data(ticker, start, end, save_path)

    # Compute daily return target
    raw_df["Target_Return"] = raw_df["Close"].pct_change()

    # Add technical indicators
    featured_df = add_indicators(raw_df)

    # Drop NaN rows produced by rolling windows and pct_change()
    before = len(featured_df)
    featured_df.dropna(inplace=True)
    print(
        f"[preprocess.py] Dropped {before - len(featured_df)} NaN rows "
        f"({len(featured_df)} rows remaining)."
    )

    # Verify all required feature columns are present
    missing = [c for c in config.FEATURE_COLS if c not in featured_df.columns]
    if missing:
        raise ValueError(f"[preprocess.py] Missing columns: {missing}")

    return featured_df[config.FEATURE_COLS + ["Target_Return"]]


def split_data(
    df: pd.DataFrame,
    train_ratio: float = config.TRAIN_RATIO,
    val_ratio: float = config.VAL_RATIO,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Time-aware sequential train / val / test split (no shuffling).

    Parameters
    ----------
    df          : Feature DataFrame.
    train_ratio : Fraction allocated to training.
    val_ratio   : Fraction allocated to validation.

    Returns
    -------
    (train_df, val_df, test_df) – three non-overlapping DataFrames.
    """
    n = len(df)
    train_end = int(n * train_ratio)
    val_end   = train_end + int(n * val_ratio)

    train_df = df.iloc[:train_end]
    val_df   = df.iloc[train_end:val_end]
    test_df  = df.iloc[val_end:]

    print(
        f"[preprocess.py] Split -> train={len(train_df)} | "
        f"val={len(val_df)} | test={len(test_df)}"
    )
    return train_df, val_df, test_df


def fit_and_scale(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    scaler_path: str = config.SCALER_PATH,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, MinMaxScaler]:
    """Fit MinMaxScaler on features only, keeping target returns unscaled.

    Parameters
    ----------
    train_df, val_df, test_df : DataFrames from split_data().
    scaler_path               : Path to save the fitted scaler.

    Returns
    -------
    (train_scaled, val_scaled, test_scaled, scaler)
    Each array has shape (N, num_features + 1). The first num_features columns
    are scaled, the last column is raw unscaled returns.
    """
    feat_cols = config.FEATURE_COLS
    scaler = MinMaxScaler(feature_range=(0, 1))

    # Scale input features
    train_feat_s = scaler.fit_transform(train_df[feat_cols].values)
    val_feat_s   = scaler.transform(val_df[feat_cols].values)
    test_feat_s  = scaler.transform(test_df[feat_cols].values)

    # Keep returns raw (unscaled)
    train_target = train_df[["Target_Return"]].values
    val_target   = val_df[["Target_Return"]].values
    test_target  = test_df[["Target_Return"]].values

    # Concatenate features and targets
    train_scaled = np.hstack([train_feat_s, train_target])
    val_scaled   = np.hstack([val_feat_s, val_target])
    test_scaled  = np.hstack([test_feat_s, test_target])

    # Persist the fitted scaler (it fits on features only)
    os.makedirs(os.path.dirname(scaler_path), exist_ok=True)
    with open(scaler_path, "wb") as f:
        pickle.dump(scaler, f)
    print(f"[preprocess.py] Scaler saved -> {scaler_path}")

    return train_scaled, val_scaled, test_scaled, scaler


def load_scaler(scaler_path: str = config.SCALER_PATH) -> MinMaxScaler:
    """Load a previously fitted scaler from disk."""
    with open(scaler_path, "rb") as f:
        return pickle.load(f)


def inverse_close(scaled_values: np.ndarray, scaler: MinMaxScaler) -> np.ndarray:
    """Inverse-transform only the Close column predictions."""
    scaled_values = np.array(scaled_values).flatten()
    dummy = np.zeros((len(scaled_values), config.NUM_FEATURES))
    dummy[:, config.CLOSE_IDX] = scaled_values
    return scaler.inverse_transform(dummy)[:, config.CLOSE_IDX]


# ─────────────────────────────────────────────────────────────────────────────
# Full pipeline convenience function
# ─────────────────────────────────────────────────────────────────────────────
def build_preprocessed_splits(
    ticker: str = config.TICKER,
    start: str = config.START_DATE,
    end: str = config.END_DATE,
    csv_path: str | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, MinMaxScaler, pd.Index]:
    """End-to-end convenience: download -> indicators -> scale -> split.

    Returns
    -------
    train_scaled, val_scaled, test_scaled, scaler, test_dates
    ``test_dates`` is the DatetimeIndex of the test slice (for plotting).
    """
    df = load_and_engineer(ticker, start, end, csv_path)
    train_df, val_df, test_df = split_data(df)
    train_s, val_s, test_s, scaler = fit_and_scale(train_df, val_df, test_df)
    return train_s, val_s, test_s, scaler, test_df.index


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    tr, va, te, sc, dates = build_preprocessed_splits()
    print("Train:", tr.shape, "  Val:", va.shape, "  Test:", te.shape)
    print("Test date range:", dates[0].date(), "->", dates[-1].date())

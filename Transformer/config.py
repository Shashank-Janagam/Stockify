"""
config.py
---------
Central configuration for the Transformer stock forecasting project.
All hyper-parameters and path settings live here so every other module
imports from a single source of truth.
"""

import os

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
DATA_DIR      = os.path.join(BASE_DIR, "data")
MODEL_DIR     = os.path.join(BASE_DIR, "models")
RESULTS_DIR   = os.path.join(BASE_DIR, "results")

# Create directories if they don't exist
for _dir in [DATA_DIR, MODEL_DIR, RESULTS_DIR]:
    os.makedirs(_dir, exist_ok=True)

# ─── Stock / Data Settings ───────────────────────────────────────────────────
TICKER      = "RELIANCE.NS"        # Default ticker (Indian stock)
START_DATE  = "2015-07-09"         # Historical data start
END_DATE    = "2026-07-07"         # Historical data end
CSV_PATH    = os.path.join(DATA_DIR, f"{TICKER.replace('.', '_')}_raw.csv")
SCALER_PATH = os.path.join(MODEL_DIR, "scaler.pkl")

# ─── Feature Engineering ─────────────────────────────────────────────────────
# Ordered list of feature columns the model will consume.
FEATURE_COLS = [
    "Open", "High", "Low", "Close", "Volume",
    "SMA_10", "SMA_20", "EMA_10", "EMA_20",
    "RSI", "MACD", "MACD_Signal",
    "BB_Upper", "BB_Lower", "ATR",
]

# Index of "Close" inside FEATURE_COLS (used to extract Close predictions)
CLOSE_IDX   = FEATURE_COLS.index("Close")
NUM_FEATURES = len(FEATURE_COLS)

# ─── Sliding Window ───────────────────────────────────────────────────────────
WINDOW_SIZE = 30          # Look-back: previous 30 trading days -> predict Day 31

# ─── Data Split Ratios ────────────────────────────────────────────────────────
TRAIN_RATIO = 0.70        # 70 % training
VAL_RATIO   = 0.15        # 15 % validation   (rest -> test)

# ─── Model Architecture ───────────────────────────────────────────────────────
D_MODEL     = 32          # Embedding dimension (must be divisible by N_HEADS)
N_HEADS     = 4           # Number of self-attention heads
N_LAYERS    = 2           # Number of stacked Transformer Encoder layers
DIM_FF      = 128         # Feed-forward inner dimension inside each encoder layer
DROPOUT     = 0.1         # Dropout probability

# ─── Training ─────────────────────────────────────────────────────────────────
BATCH_SIZE      = 64
EPOCHS          = 100
LEARNING_RATE   = 3e-4
WEIGHT_DECAY    = 1e-4    # L2 regularisation for Adam
GRAD_CLIP       = 1.0     # Max gradient norm for clipping
PATIENCE        = 20      # Early-stopping patience (epochs without improvement)
LR_STEP_SIZE    = 20      # StepLR: decay every N epochs
LR_GAMMA        = 0.5     # StepLR: multiply LR by this factor

# ─── Reproducibility ─────────────────────────────────────────────────────────
SEED = 42

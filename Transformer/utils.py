"""
utils.py
--------
Shared utility helpers used across the project:

  • Seed fixing for reproducibility
  • Device detection
  • Model checkpoint save / load
  • Loss curve plotting helper
"""

import os
import random
from typing import Any

import matplotlib
matplotlib.use("Agg")          # Non-interactive backend (safe for servers)
import matplotlib.pyplot as plt
import numpy as np
import torch

import config


# ─────────────────────────────────────────────────────────────────────────────
# Reproducibility
# ─────────────────────────────────────────────────────────────────────────────
def set_seed(seed: int = config.SEED) -> None:
    """Fix random seeds for Python, NumPy, and PyTorch (CPU + GPU).

    Note: Full determinism on GPU requires ``torch.use_deterministic_algorithms(True)``
    which may break some CUDA ops.  We skip that for training speed.
    """
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
    print(f"[utils.py] Random seed fixed to {seed}.")


# ─────────────────────────────────────────────────────────────────────────────
# Device
# ─────────────────────────────────────────────────────────────────────────────
def get_device() -> torch.device:
    """Return CUDA device if available, else CPU."""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[utils.py] Using device: {device}")
    return device


# ─────────────────────────────────────────────────────────────────────────────
# Model Checkpointing
# ─────────────────────────────────────────────────────────────────────────────
def save_checkpoint(
    model: torch.nn.Module,
    path: str,
    extra: dict[str, Any] | None = None,
) -> None:
    """Save model state dict (and optional metadata) to ``path``."""
    payload: dict[str, Any] = {"model_state": model.state_dict()}
    if extra:
        payload.update(extra)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    torch.save(payload, path)
    print(f"[utils.py] Checkpoint saved -> {path}")


def load_checkpoint(
    model: torch.nn.Module,
    path: str,
    device: torch.device,
) -> dict[str, Any]:
    """Load state dict from ``path`` into ``model`` and return the full payload."""
    payload = torch.load(path, map_location=device)
    model.load_state_dict(payload["model_state"])
    print(f"[utils.py] Checkpoint loaded <- {path}")
    return payload


# ─────────────────────────────────────────────────────────────────────────────
# Plotting helpers
# ─────────────────────────────────────────────────────────────────────────────
def plot_loss_curves(
    train_losses: list[float],
    val_losses: list[float],
    save_path: str | None = None,
) -> None:
    """Plot training and validation MSE loss curves.

    Parameters
    ----------
    train_losses : List of per-epoch training losses.
    val_losses   : List of per-epoch validation losses.
    save_path    : If provided, save figure to this path.
    """
    epochs = range(1, len(train_losses) + 1)

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(epochs, train_losses, label="Train Loss",      color="#3b82f6", linewidth=2)
    ax.plot(epochs, val_losses,   label="Validation Loss", color="#f97316",
            linewidth=2, linestyle="--")
    ax.set_xlabel("Epoch")
    ax.set_ylabel("MSE Loss")
    ax.set_title("Training & Validation Loss Curve")
    ax.legend()
    ax.grid(True, alpha=0.3)
    plt.tight_layout()

    if save_path:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        plt.savefig(save_path, dpi=150)
        print(f"[utils.py] Loss curve saved -> {save_path}")
    plt.show()
    plt.close(fig)


def plot_predictions(
    actuals: np.ndarray,
    predictions: np.ndarray,
    dates: Any | None = None,
    title: str = "Predicted vs Actual Close Price",
    save_path: str | None = None,
) -> None:
    """Overlay actual and predicted close prices on a single chart.

    Parameters
    ----------
    actuals     : Real Close prices (in Rs.).
    predictions : Model-predicted Close prices (in Rs.).
    dates       : Optional array of datetime labels for the x-axis.
    title       : Plot title.
    save_path   : If provided, save figure to this path.
    """
    fig, ax = plt.subplots(figsize=(14, 5))
    x = dates if dates is not None else range(len(actuals))

    ax.plot(x, actuals,     label="Actual",    color="#10b981", linewidth=1.5)
    ax.plot(x, predictions, label="Predicted", color="#ef4444",
            linewidth=1.5, linestyle="--")

    ax.set_title(title)
    ax.set_xlabel("Date" if dates is not None else "Sample Index")
    ax.set_ylabel("Close Price (Rs.)")
    ax.legend()
    ax.grid(True, alpha=0.3)
    plt.xticks(rotation=45)
    plt.tight_layout()

    if save_path:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        plt.savefig(save_path, dpi=150)
        print(f"[utils.py] Prediction plot saved -> {save_path}")
    plt.show()
    plt.close(fig)


def plot_candlestick(
    df_ohlc,
    title: str = "Candlestick Chart",
    save_path: str | None = None,
    n_days: int = 90,
) -> None:
    """Simple candlestick chart using matplotlib rectangles (last n_days rows).

    Parameters
    ----------
    df_ohlc   : DataFrame with columns Open, High, Low, Close and DatetimeIndex.
    title     : Plot title.
    save_path : If provided, save figure to this path.
    n_days    : Number of most-recent trading days to display.
    """
    df = df_ohlc.tail(n_days).copy()
    df.reset_index(inplace=True)

    fig, ax = plt.subplots(figsize=(14, 5))
    width = 0.6

    for i, row in df.iterrows():
        color = "#10b981" if row["Close"] >= row["Open"] else "#ef4444"
        # Candle body
        ax.bar(i, abs(row["Close"] - row["Open"]),
               bottom=min(row["Open"], row["Close"]),
               color=color, width=width, linewidth=0)
        # Wick
        ax.plot([i, i], [row["Low"], row["High"]], color=color, linewidth=1)

    # X-tick labels (every 10 days)
    step = max(1, n_days // 10)
    ax.set_xticks(range(0, len(df), step))
    ax.set_xticklabels(
        [df.loc[i, df.columns[0]].strftime("%Y-%m-%d")
         for i in range(0, len(df), step)],
        rotation=45, ha="right", fontsize=7,
    )
    ax.set_title(title)
    ax.set_ylabel("Price (Rs.)")
    ax.grid(True, alpha=0.25)
    plt.tight_layout()

    if save_path:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        plt.savefig(save_path, dpi=150)
        print(f"[utils.py] Candlestick chart saved -> {save_path}")
    plt.show()
    plt.close(fig)

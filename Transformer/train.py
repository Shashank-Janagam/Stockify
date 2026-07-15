"""
train.py
--------
Phase 6 – Training Pipeline.

Runs the full training loop with:
  • Adam optimiser + StepLR scheduler
  • MSELoss
  • Gradient clipping
  • Early stopping
  • Best-model checkpoint saving
  • Epoch-level console logging
  • Loss curve plotting at the end

Usage:
    python train.py                          # uses config defaults
    python train.py --ticker TCS.NS          # custom ticker
"""

import argparse
import os
import time

import torch
import torch.nn as nn
from torch.optim import Adam
from torch.optim.lr_scheduler import StepLR

import config
from dataset import make_dataloaders
from model import get_model
from preprocess import build_preprocessed_splits
from utils import get_device, plot_loss_curves, save_checkpoint, set_seed


# ─────────────────────────────────────────────────────────────────────────────
# Early Stopping Helper
# ─────────────────────────────────────────────────────────────────────────────
class EarlyStopping:
    """Stop training when validation loss stops improving.

    Parameters
    ----------
    patience  : Number of epochs to wait after last improvement.
    min_delta : Minimum change in val_loss to count as improvement.
    """

    def __init__(self, patience: int = config.PATIENCE, min_delta: float = 1e-6) -> None:
        self.patience   = patience
        self.min_delta  = min_delta
        self.best_loss  = float("inf")
        self.counter    = 0
        self.triggered  = False

    def step(self, val_loss: float) -> bool:
        """Call each epoch.  Returns True when training should stop."""
        if val_loss < self.best_loss - self.min_delta:
            self.best_loss = val_loss
            self.counter   = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.triggered = True
        return self.triggered


# ─────────────────────────────────────────────────────────────────────────────
# One epoch of training
# ─────────────────────────────────────────────────────────────────────────────
def train_one_epoch(
    model: nn.Module,
    loader: torch.utils.data.DataLoader,
    criterion: nn.Module,
    optimiser: torch.optim.Optimizer,
    device: torch.device,
    grad_clip: float = config.GRAD_CLIP,
) -> float:
    """Run one full training epoch and return the mean MSE loss."""
    model.train()
    total_loss = 0.0

    for X_batch, y_batch in loader:
        X_batch = X_batch.to(device)
        y_batch = y_batch.to(device)

        optimiser.zero_grad()
        preds = model(X_batch)                    # (batch,)
        loss  = criterion(preds, y_batch)
        loss.backward()

        # Gradient clipping — prevents exploding gradients in deep nets
        torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)

        optimiser.step()
        total_loss += loss.item() * len(y_batch)  # accumulate un-averaged loss

    return total_loss / len(loader.dataset)


# ─────────────────────────────────────────────────────────────────────────────
# One epoch of validation
# ─────────────────────────────────────────────────────────────────────────────
@torch.no_grad()
def evaluate_epoch(
    model: nn.Module,
    loader: torch.utils.data.DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> float:
    """Evaluate on val/test loader (no gradients).  Returns mean MSE loss."""
    model.eval()
    total_loss = 0.0

    for X_batch, y_batch in loader:
        X_batch = X_batch.to(device)
        y_batch = y_batch.to(device)
        preds   = model(X_batch)
        loss    = criterion(preds, y_batch)
        total_loss += loss.item() * len(y_batch)

    return total_loss / len(loader.dataset)


# ─────────────────────────────────────────────────────────────────────────────
# Main Training Function
# ─────────────────────────────────────────────────────────────────────────────
def train(
    ticker: str  = config.TICKER,
    start: str   = config.START_DATE,
    end: str     = config.END_DATE,
    epochs: int  = config.EPOCHS,
    lr: float    = config.LEARNING_RATE,
) -> None:
    """Full training pipeline.

    Parameters
    ----------
    ticker : Yahoo Finance ticker symbol.
    start  : Training data start date.
    end    : Training data end date.
    epochs : Maximum number of training epochs.
    lr     : Initial Adam learning rate.
    """
    set_seed()
    device = get_device()

    # ── Data ──────────────────────────────────────────────────────────────────
    csv_path = os.path.join(
        config.DATA_DIR, f"{ticker.replace('.', '_')}_raw.csv"
    )
    train_s, val_s, test_s, scaler, _ = build_preprocessed_splits(
        ticker, start, end, csv_path
    )
    train_loader, val_loader, _ = make_dataloaders(train_s, val_s, test_s)

    # ── Model ─────────────────────────────────────────────────────────────────
    model     = get_model(device)
    criterion = nn.MSELoss()
    optimiser = Adam(
        model.parameters(), lr=lr, weight_decay=config.WEIGHT_DECAY
    )
    # Decay LR by GAMMA every LR_STEP_SIZE epochs
    scheduler = StepLR(
        optimiser,
        step_size=config.LR_STEP_SIZE,
        gamma=config.LR_GAMMA,
    )

    early_stopping = EarlyStopping(patience=config.PATIENCE)

    best_val_loss  = float("inf")
    train_losses: list[float] = []
    val_losses:   list[float] = []

    best_model_path = os.path.join(config.MODEL_DIR, "best_model.pt")

    # ── Training Loop ─────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"  Training StockTransformer on {ticker}")
    print("=" * 60)

    t0 = time.time()
    for epoch in range(1, epochs + 1):
        train_loss = train_one_epoch(model, train_loader, criterion, optimiser, device)
        val_loss   = evaluate_epoch(model, val_loader, criterion, device)
        scheduler.step()

        train_losses.append(train_loss)
        val_losses.append(val_loss)

        # Console log every epoch
        lr_now = scheduler.get_last_lr()[0]
        print(
            f"Epoch [{epoch:>4}/{epochs}]  "
            f"Train Loss: {train_loss:.6f}  |  "
            f"Val Loss: {val_loss:.6f}  |  "
            f"LR: {lr_now:.2e}"
        )

        # Save checkpoint if this is the best model so far
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            save_checkpoint(
                model, best_model_path,
                extra={"epoch": epoch, "val_loss": val_loss},
            )

        # Early stopping check
        if early_stopping.step(val_loss):
            print(f"\n[train.py] Early stopping triggered at epoch {epoch}.")
            break

    elapsed = time.time() - t0
    print(f"\nTraining complete in {elapsed:.1f}s | Best val loss: {best_val_loss:.6f}")

    # ── Loss Curve ────────────────────────────────────────────────────────────
    loss_plot_path = os.path.join(config.RESULTS_DIR, "loss_curve.png")
    plot_loss_curves(train_losses, val_losses, save_path=loss_plot_path)


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the StockTransformer.")
    parser.add_argument("--ticker", default=config.TICKER)
    parser.add_argument("--start",  default=config.START_DATE)
    parser.add_argument("--end",    default=config.END_DATE)
    parser.add_argument("--epochs", type=int, default=config.EPOCHS)
    parser.add_argument("--lr",     type=float, default=config.LEARNING_RATE)
    args = parser.parse_args()

    train(args.ticker, args.start, args.end, args.epochs, args.lr)

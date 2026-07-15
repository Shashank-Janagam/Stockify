"""
dataset.py
----------
Phase 4 – Sliding Window PyTorch Dataset.

Converts a scaled NumPy array into (X, y) pairs:
    X : previous WINDOW_SIZE trading days  -> shape (WINDOW_SIZE, num_features)
    y : next day's Close price (scalar)    -> shape ()

The DataLoader wraps this dataset to produce batches of shape:
    X : (batch_size, WINDOW_SIZE, num_features)
    y : (batch_size,)
"""

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader

import config


class StockDataset(Dataset):
    """Sliding-window dataset for next-day close price prediction.

    Parameters
    ----------
    data        : Scaled 2-D NumPy array of shape (T, num_features).
    window_size : Number of past time-steps fed as input (default: config.WINDOW_SIZE).

    Example
    -------
    >>> ds = StockDataset(train_scaled, window_size=30)
    >>> x, y = ds[0]          # x.shape = (30, 15),  y.shape = ()
    """

    def __init__(
        self,
        data: np.ndarray,
        window_size: int = config.WINDOW_SIZE,
    ) -> None:
        self.window_size = window_size

        X_list: list[np.ndarray] = []
        y_list: list[float] = []

        # Slide a window across the time axis
        # data contains 15 features and 1 return column (index 15)
        for i in range(len(data) - window_size):
            X_list.append(data[i : i + window_size, :config.NUM_FEATURES])  # shape (W, F)
            y_list.append(data[i + window_size, config.NUM_FEATURES])       # raw Target_Return (scalar)

        # Convert to tensors once at init time for fast __getitem__ access
        self.X = torch.tensor(np.array(X_list), dtype=torch.float32)
        self.y = torch.tensor(np.array(y_list), dtype=torch.float32)

        print(
            f"[dataset.py] StockDataset created — "
            f"X: {tuple(self.X.shape)}, y: {tuple(self.y.shape)}"
        )

    def __len__(self) -> int:
        return len(self.X)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self.X[index], self.y[index]


# ─────────────────────────────────────────────────────────────────────────────
# Convenience factory
# ─────────────────────────────────────────────────────────────────────────────
def make_dataloaders(
    train_scaled: np.ndarray,
    val_scaled: np.ndarray,
    test_scaled: np.ndarray,
    batch_size: int = config.BATCH_SIZE,
    window_size: int = config.WINDOW_SIZE,
) -> tuple[DataLoader, DataLoader, DataLoader]:
    """Wrap the three data splits in DataLoaders.

    Training DataLoader shuffles samples every epoch.
    Validation and Test DataLoaders do NOT shuffle (for ordered evaluation).

    Returns
    -------
    (train_loader, val_loader, test_loader)
    """
    train_ds = StockDataset(train_scaled, window_size)
    val_ds   = StockDataset(val_scaled,   window_size)
    test_ds  = StockDataset(test_scaled,  window_size)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True,
                              drop_last=False, num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=batch_size, shuffle=False,
                              drop_last=False, num_workers=0)
    test_loader  = DataLoader(test_ds,  batch_size=batch_size, shuffle=False,
                              drop_last=False, num_workers=0)

    return train_loader, val_loader, test_loader


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import numpy as np

    # Smoke test with random data mimicking scaled features
    fake_data = np.random.rand(200, config.NUM_FEATURES).astype(np.float32)
    ds = StockDataset(fake_data)
    x, y = ds[0]
    print("Sample X shape:", x.shape)   # Expected: (30, 15)
    print("Sample y value:", y.item())  # Expected: scalar in [0, 1]

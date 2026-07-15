"""
model.py
--------
Phase 5 – Transformer Model.

Architecture
============

  Input: (batch, seq_len, num_features)
        │
  ┌─────▼──────────────────────────────────────────────────────┐
  │  Linear Embedding  — projects num_features -> d_model       │
  └─────┬──────────────────────────────────────────────────────┘
        │
  ┌─────▼──────────────────────────────────────────────────────┐
  │  Positional Encoding  — adds sinusoidal position info       │
  └─────┬──────────────────────────────────────────────────────┘
        │
  ┌─────▼──────────────────────────────────────────────────────┐
  │  TransformerEncoder  (n_layers × EncoderLayer)              │
  │  Each layer: Multi-Head Self-Attention + Feed-Forward + LN  │
  └─────┬──────────────────────────────────────────────────────┘
        │
  ┌─────▼──────────────────────────────────────────────────────┐
  │  Global Average Pooling  — mean over time dimension          │
  └─────┬──────────────────────────────────────────────────────┘
        │
  ┌─────▼──────────────────────────────────────────────────────┐
  │  FC Head: Linear(d_model, 32) -> ReLU -> Dropout -> Linear(1) │
  └─────┬──────────────────────────────────────────────────────┘
        │
  Output: (batch,)  <- single scalar (scaled Close price)

No pre-trained weights — built entirely from torch.nn primitives.
"""

import math

import torch
import torch.nn as nn

import config


# ─────────────────────────────────────────────────────────────────────────────
# Sinusoidal Positional Encoding
# ─────────────────────────────────────────────────────────────────────────────
class PositionalEncoding(nn.Module):
    """Injects fixed sinusoidal position information into the embedding.

    Formula (Vaswani et al. 2017):
        PE(pos, 2i)   = sin(pos / 10000^(2i / d_model))
        PE(pos, 2i+1) = cos(pos / 10000^(2i / d_model))

    Parameters
    ----------
    d_model : Embedding dimension.
    dropout : Dropout probability applied after adding positional encoding.
    max_len : Maximum sequence length to pre-compute positions for.
    """

    def __init__(
        self,
        d_model: int,
        dropout: float = 0.1,
        max_len: int = 500,
    ) -> None:
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        # Pre-compute the positional encoding matrix once
        pe = torch.zeros(max_len, d_model)                 # (max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)  # (max_len, 1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float)
            * (-math.log(10000.0) / d_model)
        )                                                   # (d_model/2,)

        pe[:, 0::2] = torch.sin(position * div_term)       # even dims -> sin
        pe[:, 1::2] = torch.cos(position * div_term)       # odd  dims -> cos

        # Register as a buffer (not a parameter -> not updated by optimiser)
        pe = pe.unsqueeze(0)                               # (1, max_len, d_model)
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Add positional encoding to input embeddings.

        Parameters
        ----------
        x : Tensor of shape (batch, seq_len, d_model).

        Returns
        -------
        Tensor of same shape with position info added.
        """
        x = x + self.pe[:, : x.size(1), :]   # broadcast over batch
        return self.dropout(x)


# ─────────────────────────────────────────────────────────────────────────────
# Transformer Forecaster
# ─────────────────────────────────────────────────────────────────────────────
class StockTransformer(nn.Module):
    """Transformer Encoder for next-day closing price regression.

    Parameters
    ----------
    num_features : Number of input features (config.NUM_FEATURES = 15).
    d_model      : Internal embedding dimension.
    n_heads      : Number of multi-head attention heads.
    n_layers     : Number of stacked TransformerEncoder layers.
    dim_ff       : Feed-forward sub-layer hidden dimension.
    dropout      : Dropout probability used in attention and FC layers.
    """

    def __init__(
        self,
        num_features: int = config.NUM_FEATURES,
        d_model: int      = config.D_MODEL,
        n_heads: int       = config.N_HEADS,
        n_layers: int      = config.N_LAYERS,
        dim_ff: int        = config.DIM_FF,
        dropout: float     = config.DROPOUT,
    ) -> None:
        super().__init__()

        # ── 1. Linear Projection: num_features -> d_model ─────────────────────
        self.input_proj = nn.Linear(num_features, d_model)

        # ── 2. Positional Encoding ────────────────────────────────────────────
        self.pos_enc = PositionalEncoding(d_model, dropout)

        # ── 3. Transformer Encoder Stack ──────────────────────────────────────
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=dim_ff,
            dropout=dropout,
            batch_first=True,   # Input shape: (batch, seq, feature)
            norm_first=False,   # Post-LayerNorm (standard)
        )
        self.encoder = nn.TransformerEncoder(
            encoder_layer,
            num_layers=n_layers,
            norm=nn.LayerNorm(d_model),   # Final LayerNorm after all layers
        )

        # ── 4. Regression Head ────────────────────────────────────────────────
        # Global Average Pooling is done in forward() (mean over seq dim)
        self.fc_head = nn.Sequential(
            nn.Linear(d_model, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
        )

        # ── Weight Initialisation (Xavier uniform) ────────────────────────────
        self._init_weights()

    def _init_weights(self) -> None:
        """Apply Xavier uniform initialisation to all linear layers."""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Parameters
        ----------
        x : Input tensor of shape (batch, seq_len, num_features).

        Returns
        -------
        Tensor of shape (batch,) — predicted scaled Close price.
        """
        # Project features to embedding space -> (batch, seq, d_model)
        x = self.input_proj(x)

        # Add sinusoidal positional encoding
        x = self.pos_enc(x)

        # Pass through stacked TransformerEncoder -> (batch, seq, d_model)
        x = self.encoder(x)

        # Global Average Pooling: collapse the sequence dimension
        x = x.mean(dim=1)                   # (batch, d_model)

        # Regression head -> (batch, 1) -> squeeze -> (batch,)
        x = self.fc_head(x).squeeze(-1)
        return x


# ─────────────────────────────────────────────────────────────────────────────
def get_model(device: torch.device) -> StockTransformer:
    """Instantiate and move the model to the target device."""
    model = StockTransformer()
    model.to(device)

    # Print parameter count
    total_params = sum(p.numel() for p in model.parameters())
    trainable    = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"[model.py] StockTransformer ready on {device} | "
          f"Parameters: {total_params:,} (trainable: {trainable:,})")
    return model


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model  = get_model(device)

    # Dummy forward pass
    dummy_input = torch.randn(16, config.WINDOW_SIZE, config.NUM_FEATURES).to(device)
    out = model(dummy_input)
    print("Output shape:", out.shape)  # Expected: torch.Size([16])

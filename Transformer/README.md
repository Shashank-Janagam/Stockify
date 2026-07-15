# Stock Transformer – Transformer-Based Stock Price Forecasting

A modular, production-ready **PyTorch Transformer** that predicts the **next day's closing price** of Indian stocks using 30 days of historical OHLCV + technical indicator data.

---

## 📁 Project Structure

```
stock_transformer/
├── config.py          ← All hyper-parameters & paths (edit here first)
├── data.py            ← Phase 1: download OHLCV data from Yahoo Finance
├── indicators.py      ← Phase 2: compute SMA, EMA, RSI, MACD, BB, ATR
├── preprocess.py      ← Phase 3: scaling, train/val/test split
├── dataset.py         ← Phase 4: PyTorch sliding-window Dataset + DataLoader
├── model.py           ← Phase 5: Transformer Encoder model (from scratch)
├── train.py           ← Phase 6: training loop, early stopping, checkpoints
├── evaluate.py        ← Phase 7: RMSE, MAE, MAPE, R², prediction plots
├── predict.py         ← Phase 8: single-shot "tomorrow's close" prediction
├── utils.py           ← Shared: seeding, device, checkpoints, plots
├── requirements.txt
└── README.md
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Edit `config.py` (Optional)

```python
TICKER      = "RELIANCE.NS"   # Change to TCS.NS, INFY.NS, HDFCBANK.NS, etc.
START_DATE  = "2018-01-01"
END_DATE    = "2024-12-31"
```

### 3. Download Data

```bash
python data.py --ticker RELIANCE.NS --start 2018-01-01 --end 2024-12-31
```

### 4. Train the Model

```bash
python train.py
```

Trains end-to-end:  data → indicators → preprocessing → LSTM → checkpoint saving.  
Outputs: `models/best_model.pt`, `results/loss_curve.png`.

### 5. Evaluate

```bash
python evaluate.py
```

Outputs: RMSE, MAE, MAPE, R² to console + `results/predictions_vs_actual.png`.

### 6. Predict Tomorrow's Close

```bash
python predict.py --ticker RELIANCE.NS
```

```
╔════════════════════════════════════════════╗
║  Transformer Forecast — RELIANCE.NS        ║
╠════════════════════════════════════════════╣
║  Today's Close    : ₹   2840.50            ║
║  Predicted Close  : ₹   2867.22            ║
║  Expected Return  :  ▲ +0.94%              ║
╚════════════════════════════════════════════╝
```

---

## 🧠 Model Architecture

```
Input (batch, 30, 15)
       │
Linear Embedding → (batch, 30, 64)
       │
Positional Encoding (sinusoidal, fixed)
       │
TransformerEncoder × 2 layers
  └── Multi-Head Self-Attention  (4 heads)
  └── Feed-Forward (dim=128)
  └── LayerNorm + Dropout
       │
Global Average Pooling → (batch, 64)
       │
FC Head: Linear(64→32) → ReLU → Dropout → Linear(32→1)
       │
Output (batch,)  ← predicted scaled Close
```

---

## 📊 Features (15 total)

| Category    | Features                              |
|-------------|---------------------------------------|
| OHLCV       | Open, High, Low, Close, Volume        |
| Trend       | SMA 10, SMA 20, EMA 10, EMA 20, MACD, MACD Signal |
| Momentum    | RSI (14)                              |
| Volatility  | Bollinger Upper, Bollinger Lower, ATR |

---

## ⚙️ Configuration Reference (`config.py`)

| Parameter      | Default        | Description                       |
|----------------|----------------|-----------------------------------|
| `WINDOW_SIZE`  | 30             | Look-back days                    |
| `BATCH_SIZE`   | 64             | Training batch size               |
| `EPOCHS`       | 100            | Max training epochs               |
| `LEARNING_RATE`| 1e-3           | Initial Adam LR                   |
| `D_MODEL`      | 64             | Embedding dimension               |
| `N_HEADS`      | 4              | Attention heads                   |
| `N_LAYERS`     | 2              | Transformer encoder layers        |
| `DIM_FF`       | 128            | Feed-forward hidden dim           |
| `DROPOUT`      | 0.1            | Dropout rate                      |
| `PATIENCE`     | 15             | Early-stopping patience           |
| `SEED`         | 42             | Random seed                       |

---

## 📂 Output Files

| File                                 | Description                   |
|--------------------------------------|-------------------------------|
| `data/<TICKER>_raw.csv`              | Downloaded OHLCV CSV          |
| `models/best_model.pt`               | Best checkpoint               |
| `models/scaler.pkl`                  | Fitted MinMaxScaler           |
| `results/loss_curve.png`             | Train/Val loss curve          |
| `results/predictions_vs_actual.png`  | Prediction overlay chart      |

---

## 🪙 Supported Indian Tickers

- `RELIANCE.NS` — Reliance Industries
- `TCS.NS` — Tata Consultancy Services
- `INFY.NS` — Infosys
- `HDFCBANK.NS` — HDFC Bank
- Any NSE ticker with `.NS` suffix

---

## 📝 Notes

- The model is trained **from scratch** with no pre-trained weights.
- The scaler is fitted **only on the training split** to prevent data leakage.
- The sliding window dataset produces sequences of shape `(30, 15)` → predicts a scalar Close.
- Early stopping with `patience=15` saves training time; the best model by val loss is always persisted.

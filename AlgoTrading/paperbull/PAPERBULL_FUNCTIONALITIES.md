# PaperBull-Native API — Complete Functional & Architectural Specification

The **PaperBull API** (`paperbull`) is an institutional-grade, user-friendly Python framework for building, testing, and automating algorithmic trading strategies. It acts as a clean facade on top of Stockify's high-performance quantitative execution, risk management, and backtesting engines.

---

## 1. Core Architectural Pillars

PaperBull divides quantitative trading into three decoupled, clean domains:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            1. UNIVERSE SELECTION                            │
│  "Which assets should my algorithm consider?"                               │
│  • Manual Basket    • Rule-Based Filtering    • Multi-Factor Alpha Scoring  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                            2. STRATEGY & SIGNALS                            │
│  "What should my algorithm do with those assets?"                           │
│  • Event-Driven (on_data)  • Technical Indicators  • Buy / Sell / Liquidate │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                            3. PORTFOLIO & RISK                              │
│  "How much capital should be allocated to each asset?"                      │
│  • Equal Weight  • Risk Parity  • Momentum  • Correlation  • Max Exposure   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Comprehensive Functional Breakdown

### A. Universe Selection Engine (`StockList`)
Located in [`paperbull/stock_list.py`](file:///c:/Users/shash/OneDrive/Documents/IOMP/Stockify/AlgoTrading/paperbull/stock_list.py).

PaperBull offers **3 distinct Universe Selection Paradigms**:

| Paradigm | Description | Code Example |
| :--- | :--- | :--- |
| **1. Manual Universe** | Explicit list of tickers. | `symbols=["RELIANCE.NS", "TCS.NS"]` |
| **2. Rule-Based Universe** | Filters market pools by price/volume rules and sorts by factor rankings. | `stocks.filter(min_price=100, min_volume=1M).sort_by("momentum_3m").top(15)` |
| **3. Algorithmic Universe** | Custom multi-factor scoring functions (e.g. Alpha Models combining momentum & volatility). | `stocks.score_by(lambda s: (s.momentum_3m * 0.7) - (s.volatility * 0.3)).top(5)` |

#### Screener Capabilities:
- **Numerical Filters**: `min_price`, `max_price`, `min_volume`, `max_volatility`, `min_momentum_3m`, `market_cap_between`.
- **Classification Filters**: `sector`, `index`.
- **Ranking Metrics**: `momentum_1m`, `momentum_3m`, `momentum_6m`, `momentum_1y`, `volatility`, `avg_volume`, `last_close`, `score`.
- **Slicing**: `.top(n)`, `.bottom(n)`.
- **Market Presets**: Built-in index definitions (`NIFTY50`, `NIFTY_BANK`, `NIFTY_IT`, `US_TECH`).
- **Live Previewing**: `stocks.preview()` prints tabular rankings before trading starts.

---

### B. Indicator Facade (`IndicatorFacade`)
Located in [`paperbull/indicator_facade.py`](file:///c:/Users/shash/OneDrive/Documents/IOMP/Stockify/AlgoTrading/paperbull/indicator_facade.py).

Accessed via `self.indicator.<NAME>(symbol, ...)` inside your strategy. Returns scalar floats or typed NamedTuples for immediate use in conditional statements:

| Category | Indicator | Syntax | Returns |
| :--- | :--- | :--- | :--- |
| **Momentum** | RSI | `self.indicator.RSI(sym, period=14)` | `float` (0–100) |
| | MACD | `self.indicator.MACD(sym, fast=12, slow=26, signal=9)` | `MACDResult(macd, signal, histogram)` |
| | ROC | `self.indicator.ROC(sym, period=10)` | `float` (% change) |
| | MOM | `self.indicator.MOM(sym, period=10)` | `float` (absolute price delta) |
| **Trend** | EMA | `self.indicator.EMA(sym, period=50)` | `float` |
| | SMA | `self.indicator.SMA(sym, period=20)` | `float` |
| | VWAP | `self.indicator.VWAP(sym)` | `float` |
| | ADX | `self.indicator.ADX(sym, period=14)` | `float` (trend strength 0–100) |
| | SuperTrend | `self.indicator.SuperTrend(sym, period=10, multiplier=3.0)` | `SuperTrendResult(supertrend, direction, upper_band, lower_band)` |
| **Volatility** | ATR | `self.indicator.ATR(sym, period=14)` | `float` (₹ True Range) |
| | Bollinger Bands | `self.indicator.BB(sym, period=20, std=2.0)` | `BBResult(upper, middle, lower, bandwidth, pct_b)` |
| | STD | `self.indicator.STD(sym, period=20)` | `float` (Standard Deviation) |
| **Volume** | OBV | `self.indicator.OBV(sym)` | `float` (On-Balance Volume) |
| | VolumeSMA | `self.indicator.VolumeSMA(sym, period=20)` | `float` (Moving Average Volume) |
| **Custom** | User Lambda | `self.indicator.custom(fn=lambda c: ..., sym, window=14)` | `float` |

---

### C. Strategy Base Class (`Strategy`)
Located in [`paperbull/strategy.py`](file:///c:/Users/shash/OneDrive/Documents/IOMP/Stockify/AlgoTrading/paperbull/strategy.py).

Provides an intuitive lifecycle and high-level order submission API:

#### 1. Lifecycle Hooks:
- `initialize()`: Run once at startup. Configure starting cash, resolution (`"daily"`), parameters.
- `universe(stocks)`: Receives a `StockList`, filters/scores it, and returns the active asset basket.
- `on_data(data)`: Event handler called on every bar. Contains `data.symbol`, `data.open`, `data.high`, `data.low`, `data.close`, `data.volume`, `data.timestamp`.
- `rebalance()`: Called on schedule (or manually) for weight rebalancing.
- `on_trade_executed(trade)`: Post-fill callback receiving execution price, volume, and realized PnL.

#### 2. Order Submission Methods:
- `self.buy(symbol, weight)`: Allocate a fractional weight of portfolio equity (e.g. `0.20` = 20% of equity).
- `self.sell(symbol, weight=1.0)`: Sell a fraction of the existing position (`1.0` = close full position).
- `self.liquidate(symbol=None)`: Immediately market-close one or all positions.
- `self.set_position_size(symbol, size_in_rupees)`: Target an exact rupee exposure.
- `self.rebalance_to(weights_dict)`: Transition the portfolio to a target asset allocation dict `{sym: weight}`.

---

### D. Portfolio & Weight Engine (`PortfolioEngine`)
Located in [`paperbull/portfolio_engine.py`](file:///c:/Users/shash/OneDrive/Documents/IOMP/Stockify/AlgoTrading/paperbull/portfolio_engine.py).

Accessed via `self.portfolio`:

#### 1. Real-Time State:
- `self.portfolio.cash`: Available uninvested capital.
- `self.portfolio.total_value`: Net portfolio liquidation value (cash + mark-to-market positions).
- `self.portfolio.holdings`: Dictionary of `{symbol: Holding}` with `.qty`, `.entry_price`, `.current_price`, `.value`, `.unrealised_pnl`, `.unrealised_pnl_pct`.
- `self.portfolio.drawdown()`: Current portfolio peak-to-trough drawdown %.
- `self.portfolio.sharpe(window=252)`: Rolling approximate Sharpe ratio.

#### 2. Quantitative Weight Optimizers:
All weight optimizers return `{symbol: weight}` normalized to $\le 1.0$:
- `equal_weights(symbols)`: $1/N$ equal allocation.
- `momentum_weights(symbols, lookback=90, max_weight=0.25)`: Weight proportional to positive relative returns.
- `correlation_weights(symbols, window=60, max_weight=0.10)`: Inverse-correlation allocation (rewards non-correlated diversification).
- `risk_parity_weights(symbols, window=60, max_weight=0.20)`: Allocate inversely proportional to asset volatility.
- `min_variance_weights(symbols, window=60, max_weight=0.25)`: Minimum variance allocation.

---

### E. Backtest Runner & Execution Engine (`runner.py`)
Located in [`paperbull/runner.py`](file:///c:/Users/shash/OneDrive/Documents/IOMP/Stockify/AlgoTrading/paperbull/runner.py).

The backtesting runner handles all historical data fetching, multi-symbol event loop synchronization, and risk enforcement:

```python
from paperbull import run_backtest

report = run_backtest(
    strategy     = MyStrategy(),
    market       = "NIFTY50",             # or symbols=["RELIANCE.NS", "TCS.NS"] or symbol="TCS.NS"
    start        = "2024-01-01",
    end          = "2025-01-01",
    capital      = 1_000_000,
    warm_up_days = 60,
    interval     = "1d",
)
```

#### Execution Engine Highlights:
- **Shared Cash Pool**: In multi-symbol backtests, all assets draw from and return capital to a single shared cash account.
- **Time-Aligned Event Loop**: Aligns diverse stock calendar dates so `on_data()` receives realistic market-wide bar snapshots.
- **Mark-to-Market Tracking**: Calculates continuous daily equity curves reflecting real-time unrealized and realized PnL.
- **Backtest Reports**: Generates full quantitative reports including Total Return %, Win Rate %, Profit Factor, Max Drawdown %, Sharpe Ratio, and Per-Symbol performance breakdowns.

---

## 3. Quick Reference Cheat Sheet

```python
from paperbull import Strategy, run_backtest

class QuantStrategy(Strategy):

    def initialize(self):
        self.set_capital(1_000_000)

    def universe(self, stocks):
        # 1. Select Universe
        return (
            stocks
            .filter(min_price=100, min_volume=1_000_000)
            .sort_by("momentum_3m", ascending=False)
            .top(5)
        )

    def on_data(self, data):
        sym = data.symbol
        # 2. Compute Indicators
        rsi = self.indicator.RSI(sym, 14)
        ema = self.indicator.EMA(sym, 50)

        in_pos = sym in self.portfolio.holdings

        # 3. Execute Signals
        if rsi and rsi < 30 and data.close > ema and not in_pos:
            self.buy(sym, 0.20)
        elif rsi and rsi > 70 and in_pos:
            self.sell(sym)

# 4. Run Backtest
if __name__ == "__main__":
    report = run_backtest(
        strategy = QuantStrategy(),
        symbols  = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "SBIN.NS"],
        start    = "2024-01-01",
        end      = "2025-01-01",
        capital  = 1_000_000,
    )
```

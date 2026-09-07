"""
run_algos.py — PaperBull Framework Runner
==========================================
This is your main entry point to use the trading framework.

Run Options:
  python run_algos.py backtest          → Run a backtest on historical data
  python run_algos.py paper             → Run live paper trading
  python run_algos.py list              → List all available strategies
  python run_algos.py backtest --all    → Backtest all 8 strategies

Requirements:
  pip install yfinance           (to fetch real historical OHLCV data)

If you don't have yfinance, synthetic candles are used instead.
"""

import sys
import os
import random

# ── Make the AlgoTrading directory importable ─────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ── Import the framework ──────────────────────────────────────────────────────
from Algos import (
    StrategyManager,
    BacktestEngine,
    Candle,
    strategy_registry,
    RiskConfig,
)
from Algos.strategies import (        # Triggers auto-registration of all 8 strategies
    EMAStrategy, RSIStrategy, MACDStrategy,
    BollingerBandsStrategy, SuperTrendStrategy,
    VWAPStrategy, MomentumStrategy, BreakoutStrategy,
)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION — Edit these values
# ─────────────────────────────────────────────────────────────────────────────

SYMBOL          = "KOTAKBANK"         # NSE symbol (used with yfinance as RELIANCE.NS)
INITIAL_CAPITAL = 100_000            # Starting paper capital in INR
STRATEGY_NAME   = "EMA"             # Strategy to use: EMA, RSI, MACD, BollingerBands,
                                     #                  SuperTrend, VWAP, Momentum, Breakout
STRATEGY_PARAMS = {                  # Strategy-specific parameters (optional)
    "fast_period": 9,
    "slow_period": 21,
}

# ─────────────────────────────────────────────────────────────────────────────
# DATA LOADER — fetches real OHLCV from Yahoo Finance or generates synthetic
# ─────────────────────────────────────────────────────────────────────────────

def load_candles(symbol: str, period: str = "6mo", interval: str = "1d") -> list[Candle]:
    """
    Fetch historical OHLCV candles.
    Falls back to synthetic data if yfinance is not installed.

    Args:
        symbol   : Yahoo Finance symbol (e.g. "RELIANCE.NS", "TCS.NS")
        period   : "1mo", "3mo", "6mo", "1y", "2y"
        interval : "1d" (daily), "1h" (hourly), "15m" (15-min)
    """
    try:
        import yfinance as yf
        ticker = yf.Ticker(f"{symbol}.NS" if "." not in symbol else symbol)
        df     = ticker.history(period=period, interval=interval)

        if df.empty:
            print(f"[DataLoader] WARNING: No data returned for {symbol}. Using synthetic data.")
            return _synthetic_candles(200)

        candles = [
            Candle(
                timestamp = str(idx),
                open      = float(row["Open"]),
                high      = float(row["High"]),
                low       = float(row["Low"]),
                close     = float(row["Close"]),
                volume    = float(row["Volume"]),
            )
            for idx, row in df.iterrows()
        ]
        print(f"[DataLoader] Loaded {len(candles)} candles for {symbol} ({interval} / {period})")
        return candles

    except ImportError:
        print("[DataLoader] yfinance not installed. Using synthetic candles.")
        print("[DataLoader] Install with:  pip install yfinance")
        return _synthetic_candles(200)

    except Exception as e:
        print(f"[DataLoader] Failed to fetch data: {e}. Using synthetic candles.")
        return _synthetic_candles(200)


def _synthetic_candles(n: int = 200, start_price: float = 2500.0) -> list[Candle]:
    """Generate synthetic random-walk OHLCV candles for testing."""
    random.seed(42)
    candles = []
    price   = start_price
    from datetime import datetime, timedelta
    base_date = datetime(2024, 1, 1, 9, 15, 0)

    for i in range(n):
        open_  = price
        change = random.gauss(0, price * 0.015)   # 1.5% daily vol
        close  = max(open_ + change, 1.0)
        high   = max(open_, close) * (1 + random.uniform(0, 0.005))
        low    = min(open_, close) * (1 - random.uniform(0, 0.005))
        vol    = random.randint(500_000, 5_000_000)
        dt     = (base_date + timedelta(days=i)).isoformat()

        candles.append(Candle(
            timestamp = dt,
            open      = round(open_, 2),
            high      = round(high,  2),
            low       = round(low,   2),
            close     = round(close, 2),
            volume    = float(vol),
        ))
        price = close

    print(f"[DataLoader] Generated {n} synthetic candles (start=Rs.{start_price})")
    return candles


# ─────────────────────────────────────────────────────────────────────────────
# COMMANDS
# ─────────────────────────────────────────────────────────────────────────────

def cmd_list():
    """List all registered strategies."""
    print("\n" + "="*55)
    print("  PaperBull — Available Strategies")
    print("="*55)
    for name in strategy_registry.list_all():
        try:
            cls      = strategy_registry.get(name)
            instance = cls()
            instance.initialize()
            meta = instance.get_metadata()
            print(f"\n  [{name}]")
            print(f"    Description   : {meta.get('description', 'N/A')}")
            print(f"    Best For      : {meta.get('best_for', 'N/A')}")
            print(f"    Risk Level    : {meta.get('risk_level', 'N/A')}")
            print(f"    Indicators    : {', '.join(meta.get('indicators_used', []))}")
        except Exception as e:
            print(f"  [{name}] (error loading metadata: {e})")
    print()


def cmd_backtest(strategy_name: str = None, all_strategies: bool = False):
    """Run backtests on historical data."""
    candles = load_candles(SYMBOL, period="1y", interval="1d")

    if all_strategies:
        strategies_to_test = strategy_registry.list_all()
    else:
        strategies_to_test = [strategy_name or STRATEGY_NAME]

    print(f"\nBacktesting {len(strategies_to_test)} strategy/strategies on {SYMBOL}...")
    print("="*55)

    reports = []
    for name in strategies_to_test:
        try:
            cls      = strategy_registry.get(name)
            instance = cls(params=STRATEGY_PARAMS if name == (strategy_name or STRATEGY_NAME) else {})
            engine   = BacktestEngine(
                initial_capital = INITIAL_CAPITAL,
                warm_up_period  = 50,
            )
            report   = engine.run(instance, candles, symbol=SYMBOL)
            reports.append(report)
        except Exception as e:
            print(f"[Backtest] ERROR for {name}: {e}")

    # Summary table
    if len(reports) > 1:
        print("\n" + "="*70)
        print(f"  {'Strategy':<20} {'Return%':>8} {'Win%':>7} {'PF':>7} {'MaxDD%':>8} {'Sharpe':>8}")
        print("-"*70)
        for r in reports:
            print(
                f"  {r.strategy_name:<20} "
                f"{r.total_return_pct:>+7.2f}% "
                f"{r.win_rate_pct:>6.1f}% "
                f"{r.profit_factor:>7.3f} "
                f"{r.max_drawdown_pct:>7.2f}% "
                f"{r.sharpe_ratio:>8.3f}"
            )
        print("="*70)

    return reports


def cmd_paper(strategy_name: str = None):
    """
    Run paper trading using the latest available candles.
    In a real deployment, this would be called on each new live tick/candle.
    """
    name    = strategy_name or STRATEGY_NAME
    candles = load_candles(SYMBOL, period="6mo", interval="1d")

    print(f"\nPaper Trading — Strategy: {name} | Symbol: {SYMBOL}")
    print("="*55)

    # Configure risk
    risk_cfg = RiskConfig(
        max_daily_loss_pct       = 2.0,
        max_position_exposure_pct= 15.0,
        max_open_positions       = 5,
        max_drawdown_pct         = 10.0,
        min_confidence           = 0.5,
    )

    mgr = StrategyManager(
        capital     = INITIAL_CAPITAL,
        mode        = "paper",
        risk_config = risk_cfg,
    )
    mgr.load(name, params=STRATEGY_PARAMS)

    # Simulate processing candles one at a time (as they would arrive live)
    print(f"\nSimulating candle-by-candle execution ({len(candles)} candles)...")
    warm_up = 50

    for i in range(warm_up, len(candles)):
        slice_  = candles[:i + 1]
        result  = mgr.run(slice_, symbol=SYMBOL, strategy_name=name)

        if result.trade_receipt and result.trade_receipt.success:
            trade = result.trade_receipt.trade
            print(
                f"  Candle {i:3d} | {trade['type']:4s} {trade['qty']}x "
                f"@ Rs.{trade['price']:.2f} | "
                f"PnL: Rs.{trade['pnl']:.2f}" if trade.get("pnl") else
                f"  Candle {i:3d} | {trade['type']:4s} {trade['qty']}x @ Rs.{trade['price']:.2f}"
            )

    # Final portfolio
    portfolio = mgr.get_portfolio()
    trades    = mgr.get_trade_history()
    print(f"\n{'='*55}")
    print(f"  Final Portfolio Summary")
    print(f"{'='*55}")
    print(f"  Cash        : Rs.{portfolio['cash']:,.2f}")
    print(f"  Total Value : Rs.{portfolio['total_value']:,.2f}")
    print(f"  Total Trades: {portfolio['trades_count']}")
    print(f"  Return      : {(portfolio['total_value'] - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100:+.2f}%")

    # Risk state
    risk_state = mgr.get_risk_state()
    print(f"\n  Risk State:")
    print(f"    Open Positions : {risk_state['open_positions']}")
    print(f"    Drawdown       : {risk_state['drawdown_pct']}%")
    print(f"    Daily P&L      : Rs.{risk_state['daily_pnl']:+.2f}")

    return portfolio


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help", "help"):
        print("""
PaperBull Trading Framework — Runner
=====================================
Usage:
  python run_algos.py list                    List all strategies
  python run_algos.py backtest                Backtest default strategy (EMA)
  python run_algos.py backtest RSI            Backtest RSI strategy
  python run_algos.py backtest --all          Backtest all 8 strategies
  python run_algos.py paper                   Paper trade with default strategy
  python run_algos.py paper MACD              Paper trade with MACD strategy

Edit SYMBOL, INITIAL_CAPITAL, STRATEGY_PARAMS at the top of this file.

Install yfinance for real OHLCV data:
  pip install yfinance
        """)

    elif args[0] == "list":
        cmd_list()

    elif args[0] == "backtest":
        all_flag     = "--all" in args
        strategy_arg = next((a for a in args[1:] if not a.startswith("--")), None)
        cmd_backtest(strategy_name=strategy_arg, all_strategies=all_flag)

    elif args[0] == "paper":
        strategy_arg = args[1] if len(args) > 1 else None
        cmd_paper(strategy_name=strategy_arg)

    else:
        print(f"Unknown command: '{args[0]}'. Run with --help for usage.")

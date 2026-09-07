"""
runner.py — PaperBull Backtest Entry Point
==========================================
Single-symbol:
    report = run_backtest(
        strategy = MyStrategy(),
        symbol   = "RELIANCE.NS",
        start    = "2023-01-01",
        end      = "2024-01-01",
        capital  = 1_000_000,
    )

Multi-symbol (universe backtest):
    report = run_backtest(
        strategy = MyStrategy(),
        symbols  = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"],
        start    = "2023-01-01",
        end      = "2024-01-01",
        capital  = 1_000_000,
    )

Internally for multi-symbol:
1. Fetches candles for all symbols in parallel.
2. Builds a shared IndicatorFacade and PortfolioEngine.
3. Calls user's universe() to filter the symbol list.
4. Time-aligns all candle series on a common date index.
5. For each trading date, calls the strategy's on_data() once per symbol.
6. All symbols share the same cash pool and risk engine.
7. Returns a MultiSymbolReport with per-symbol stats + combined equity curve.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# MultiSymbolReport
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class MultiSymbolReport:
    """
    Result of a multi-symbol backtest.

    Attributes
    ----------
    strategy_name    : str
    symbols          : list of symbols traded
    period_from      : str
    period_to        : str
    initial_capital  : float
    final_equity     : float
    total_return_pct : float
    total_trades     : int   (completed round-trips across all symbols)
    wins             : int
    losses           : int
    win_rate_pct     : float
    gross_profit     : float
    gross_loss       : float
    profit_factor    : float
    max_drawdown_pct : float
    sharpe_ratio     : float
    equity_curve     : list[dict]   [{date, equity}, ...]
    trades           : list[dict]   all fills across all symbols
    per_symbol       : dict[str, dict]  per-symbol trade stats
    """
    strategy_name    : str
    symbols          : list[str]
    period_from      : str
    period_to        : str
    initial_capital  : float
    final_equity     : float
    total_return_pct : float
    total_trades     : int
    wins             : int
    losses           : int
    win_rate_pct     : float
    gross_profit     : float
    gross_loss       : float
    profit_factor    : float
    max_drawdown_pct : float
    sharpe_ratio     : float
    equity_curve     : list[dict] = field(default_factory=list)
    trades           : list[dict] = field(default_factory=list)
    per_symbol       : dict       = field(default_factory=dict)
    price_data       : dict       = field(default_factory=dict)

    def print_summary(self) -> None:
        print(f"\n{'='*60}")
        print(f"  [MULTI-SYMBOL BACKTEST] {self.strategy_name}")
        print(f"{'='*60}")
        print(f"  Symbols      : {', '.join(self.symbols)}")
        print(f"  Period       : {self.period_from}  to  {self.period_to}")
        print(f"  Initial      : Rs.{self.initial_capital:,.2f}")
        print(f"  Final Equity : Rs.{self.final_equity:,.2f}")
        print(f"  Total Return : {self.total_return_pct:+.2f}%")
        print(f"  Total Trades : {self.total_trades}")
        print(f"  Win Rate     : {self.win_rate_pct:.1f}%  ({self.wins}W / {self.losses}L)")
        print(f"  Gross Profit : Rs.{self.gross_profit:,.2f}")
        print(f"  Gross Loss   : Rs.{self.gross_loss:,.2f}")
        print(f"  Profit Factor: {self.profit_factor:.3f}")
        print(f"  Max Drawdown : {self.max_drawdown_pct:.2f}%")
        print(f"  Sharpe Ratio : {self.sharpe_ratio:.3f}")
        if self.per_symbol:
            print(f"\n  Per-Symbol Breakdown:")
            print(f"  {'Symbol':<20} {'Trades':>6} {'WinRate':>8} {'PnL':>12}")
            print(f"  {'-'*50}")
            for sym, stats in self.per_symbol.items():
                print(
                    f"  {sym:<20} {stats['trades']:>6} "
                    f"{stats['win_rate']:>7.1f}% "
                    f"Rs.{stats['total_pnl']:>10,.2f}"
                )
        print(f"{'='*60}\n")


# ══════════════════════════════════════════════════════════════════════════════
# Public entry point
# ══════════════════════════════════════════════════════════════════════════════

def run_backtest(
    strategy        : "Strategy",
    start           : str,
    end             : str,
    symbol          : str | None        = None,
    symbols         : list[str] | None  = None,
    market          : str | None        = None,
    capital         : float = 100_000.0,
    warm_up_days    : int   = 60,
    interval        : str   = "1d",
    sizing_pct      : float = 5.0,
):
    """
    Run a full historical backtest of a PaperBull Strategy.

    Universe Selection Modes:
    -------------------------
    1. Manual Single:  symbol="RELIANCE.NS"
    2. Manual Basket:  symbols=["TCS.NS", "INFY.NS", "RELIANCE.NS"]
    3. Market Preset:  market="NIFTY50" (or "NIFTY_BANK", "NIFTY_IT", "US_TECH")
                       The strategy's universe() method dynamically filters/ranks
                       stocks from the market pool before execution.
    """
    from .stock_list import MARKET_PRESETS

    # Resolve symbol list
    if market is not None:
        market_key = market.upper().replace(" ", "_").replace("-", "_")
        if market_key in MARKET_PRESETS:
            sym_list = MARKET_PRESETS[market_key]
        elif market_key in ("NSE", "NIFTY", "NIFTY500"):
            sym_list = MARKET_PRESETS["NIFTY50"]
        else:
            raise ValueError(
                f"[run_backtest] Unknown market '{market}'. Available: {list(MARKET_PRESETS.keys())}"
            )
    elif symbols is not None:
        sym_list = list(dict.fromkeys(symbols))  # preserve order, remove duplicates
    elif symbol is not None:
        sym_list = [symbol]
    else:
        # Default to NIFTY50 market preset if nothing specified
        sym_list = MARKET_PRESETS["NIFTY50"]

    if len(sym_list) == 1:
        return _run_single(sym_list[0], strategy, start, end, capital, warm_up_days, interval, sizing_pct)
    else:
        return _run_multi(sym_list, strategy, start, end, capital, warm_up_days, interval, sizing_pct)


# ══════════════════════════════════════════════════════════════════════════════
# Single-symbol backtest (unchanged from before)
# ══════════════════════════════════════════════════════════════════════════════

def _run_single(symbol, strategy, start, end, capital, warm_up_days, interval, sizing_pct):
    from .strategy          import _PaperBullAdapter
    from .indicator_facade  import IndicatorFacade
    from .portfolio_engine  import PortfolioEngine
    from .stock_list        import build_stock_list_from_candles

    candles, _ = _fetch_candles(symbol, start, end, warm_up_days, interval)
    if not candles:
        raise ValueError(f"[run_backtest] No data for '{symbol}' ({start} -> {end})")

    ind_facade  = IndicatorFacade()
    port_engine = PortfolioEngine()
    ind_facade._set_candles(symbol, candles)

    stock_list    = build_stock_list_from_candles({symbol: candles})
    user_universe = strategy.universe(stock_list)
    universe_syms = user_universe.symbols() if hasattr(user_universe, "symbols") else [symbol]
    if symbol not in universe_syms:
        universe_syms = [symbol] + universe_syms

    strategy._bootstrap(ind_facade, port_engine, universe_syms)
    strategy.initialize()
    if hasattr(strategy, "_capital") and strategy._capital != 100_000.0:
        capital = strategy._capital

    from Algos.execution.execution_engine    import ExecutionEngineClass, ExecutionMode
    from Algos.risk.risk_engine              import RiskConfig
    from Algos.sizing.position_sizing_engine import SizingMode
    from Algos.backtesting.backtest_engine   import BacktestEngine

    exec_engine = ExecutionEngineClass(mode=ExecutionMode.BACKTEST, initial_capital=capital)
    port_engine._bind(
        positions_ref   = exec_engine._positions,
        cash_ref        = [capital],
        candle_registry = ind_facade._candle_registry,
    )

    adapter = _PaperBullAdapter(strategy, initial_capital=capital)
    adapter._current_symbol = symbol
    adapter._bind_exec_engine(exec_engine)

    bt = BacktestEngine(
        initial_capital = capital,
        warm_up_period  = warm_up_days,
        risk_config     = RiskConfig(
            max_daily_loss_pct        = 5.0,
            max_position_exposure_pct = 40.0,
            max_open_positions        = 50,
            max_drawdown_pct          = 30.0,
        ),
        sizing_mode   = SizingMode.PERCENT_EQUITY,
        sizing_kwargs = {"percent_equity": sizing_pct},
    )
    bt._executor = exec_engine
    bt._executor.reset()
    bt._risk.initialize_session(capital=capital)

    return bt.run(
        strategy         = adapter,
        candles          = candles,
        symbol           = symbol,
        target_start_str = start,
        target_end_str   = end,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Multi-symbol backtest
# ══════════════════════════════════════════════════════════════════════════════

def _run_multi(sym_list, strategy, start, end, capital, warm_up_days, interval, sizing_pct):
    """
    Multi-symbol backtest engine.

    All symbols share ONE cash pool. On each trading date, on_data() is
    called once per symbol. Orders from each symbol's on_data() are
    processed immediately at that bar's close price.
    """
    from .strategy          import _PaperBullAdapter, DataBar
    from .indicator_facade  import IndicatorFacade
    from .portfolio_engine  import PortfolioEngine
    from .stock_list        import build_stock_list_from_candles
    from Algos.execution.execution_engine    import ExecutionEngineClass, ExecutionMode
    from Algos.risk.risk_engine              import RiskEngineClass, RiskConfig
    from Algos.sizing.position_sizing_engine import PositionSizingEngineClass, SizingMode
    from Algos.core.signal                   import SignalType
    from Algos.conditions.condition_engine   import ConditionResult
    from Algos.signals.signal_engine         import signal_engine

    print(f"[MultiBacktest] Fetching data for {len(sym_list)} symbols...")

    # ── 1. Fetch all candles ──────────────────────────────────────────────────
    all_candles: dict[str, list] = {}
    failed = []
    for sym in sym_list:
        candles, _ = _fetch_candles(sym, start, end, warm_up_days, interval)
        if candles:
            all_candles[sym] = candles
            print(f"  [OK] {sym}: {len(candles)} candles")
        else:
            failed.append(sym)
            print(f"  [SKIP] {sym}: no data")

    if not all_candles:
        raise ValueError("[run_backtest] No data fetched for any symbol.")
    if failed:
        print(f"[MultiBacktest] Skipped {len(failed)} symbols with no data: {failed}")

    # ── 2. Build engines ──────────────────────────────────────────────────────
    ind_facade  = IndicatorFacade()
    port_engine = PortfolioEngine()

    for sym, candles in all_candles.items():
        ind_facade._set_candles(sym, candles)

    # ── 3. Universe filtering ─────────────────────────────────────────────────
    stock_list    = build_stock_list_from_candles(all_candles)
    user_universe = strategy.universe(stock_list)
    
    if hasattr(user_universe, "preview"):
        user_universe.preview()

    universe_syms = (
        user_universe.symbols()
        if hasattr(user_universe, "symbols") else list(all_candles.keys())
    )
    # Only trade symbols we actually have data for
    universe_syms = [s for s in universe_syms if s in all_candles]
    if not universe_syms:
        universe_syms = list(all_candles.keys())

    print(f"[MultiBacktest] Active trading universe ({len(universe_syms)} stocks): {universe_syms}")

    # ── 4. Bootstrap strategy ─────────────────────────────────────────────────
    strategy._bootstrap(ind_facade, port_engine, universe_syms)
    strategy.initialize()
    if hasattr(strategy, "_capital") and strategy._capital != 100_000.0:
        capital = strategy._capital

    # ── 5. Shared execution & risk engines ───────────────────────────────────
    exec_engine = ExecutionEngineClass(mode=ExecutionMode.BACKTEST, initial_capital=capital)
    exec_engine.reset()

    port_engine._bind(
        positions_ref   = exec_engine._positions,
        cash_ref        = [capital],
        candle_registry = ind_facade._candle_registry,
    )

    risk_engine = RiskEngineClass(RiskConfig(
        max_daily_loss_pct        = 5.0,
        max_position_exposure_pct = 40.0 / max(len(universe_syms), 1),
        max_open_positions        = len(universe_syms) + 10,
        max_drawdown_pct          = 30.0,
    ))
    risk_engine.initialize_session(capital=capital)

    sizing_engine = PositionSizingEngineClass(
        mode           = SizingMode.PERCENT_EQUITY,
        percent_equity = sizing_pct,
    )

    # ── 6. Build time-aligned timestamp index ────────────────────────────────
    # Check if this is an intraday run
    is_intraday = interval in ("1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h")
    
    # Collect all unique bar timestamps across all symbols within [start, end]
    all_timestamps = set()
    for sym in universe_syms:
        for c in all_candles[sym]:
            c_date = c.timestamp[:10]
            if start[:10] <= c_date <= end[:10]:
                all_timestamps.add(c.timestamp)
    sorted_timestamps = sorted(all_timestamps)

    # Build {sym: {timestamp: candle_index}} for fast lookup
    sym_ts_idx: dict[str, dict[str, int]] = {}
    for sym in universe_syms:
        sym_ts_idx[sym] = {}
        for i, c in enumerate(all_candles[sym]):
            sym_ts_idx[sym][c.timestamp] = i

    # ── 7. Main event loop ────────────────────────────────────────────────────
    equity_curve: list[dict] = [{"date": start, "equity": capital}]
    all_fills:    list[dict] = []
    open_positions: dict[str, dict] = {}   # {sym: {qty, entry_price, entry_date}}

    adapter = _PaperBullAdapter(strategy, initial_capital=capital)
    adapter._bind_exec_engine(exec_engine)
    adapter.initialize()

    step_unit = "bars" if is_intraday else "trading days"
    print(f"[MultiBacktest] Running {strategy.__class__.__name__} ({interval}) over {len(sorted_timestamps)} {step_unit}...")

    for bar_time in sorted_timestamps:
        port_engine._update_cash(exec_engine._cash)

        for sym in universe_syms:
            ts_map = sym_ts_idx.get(sym, {})
            idx    = ts_map.get(bar_time)
            if idx is None:
                continue   # this symbol has no bar on this timestamp

            candle_slice  = all_candles[sym][:idx + 1]
            current_price = all_candles[sym][idx].close

            # Update indicator facade for this symbol
            ind_facade._set_candles(sym, candle_slice)

            # Cache ATR
            try:
                from Algos.indicators.indicator_engine import indicator_engine as _ie
                atr_series = _ie.calculate("ATR", candle_slice, symbol=sym, period=14)
                adapter._indicator_cache["ATR"] = atr_series
            except Exception:
                pass

            # Call user's on_data()
            bar = DataBar(all_candles[sym][idx], sym)
            adapter._current_symbol = sym
            port_engine._update_cash(exec_engine._cash)

            try:
                strategy.on_data(bar)
            except Exception as exc:
                logger.error("[MultiBacktest] on_data error for %s: %s", sym, exc)
                continue

            # Process orders placed by on_data()
            orders = strategy._flush_orders()

            for order_sym, order in orders.items():
                order_price_candles = all_candles.get(order_sym, [])
                order_ts_idx        = sym_ts_idx.get(order_sym, {}).get(bar_time)
                order_price         = (
                    order_price_candles[order_ts_idx].close
                    if order_ts_idx is not None and order_price_candles
                    else current_price
                )

                if order.action == "BUY" and order_sym not in open_positions:
                    equity   = exec_engine._cash + sum(
                        p["qty"] * (
                            all_candles[s][sym_ts_idx[s][bar_time]].close
                            if bar_time in sym_ts_idx.get(s, {}) else p["entry_price"]
                        )
                        for s, p in open_positions.items()
                    )
                    alloc  = equity * order.weight
                    qty    = int(alloc / order_price) if order_price > 0 else 0
                    cost   = qty * order_price

                    if qty > 0 and cost <= exec_engine._cash:
                        exec_engine._cash -= cost
                        open_positions[order_sym] = {
                            "qty": qty, "entry_price": order_price, "entry_date": bar_time
                        }
                        exec_engine._positions[order_sym] = {
                            "symbol": order_sym, "qty": qty,
                            "entry_price": order_price, "entry_time": bar_time,
                            "strategy_name": strategy.__class__.__name__,
                            "instrument_key": order_sym,
                        }
                        fill = {
                            "type": "BUY", "symbol": order_sym, "qty": qty,
                            "price": order_price, "value": cost,
                            "pnl": None, "date": bar_time,
                            "reason": f"on_data() BUY {order.weight*100:.1f}%",
                        }
                        all_fills.append(fill)
                        strategy.on_trade_executed(fill)
                        print(f"  [BUY]  {qty}x {order_sym} @ Rs.{order_price:.2f}  (time={bar_time})")

                elif order.action in ("SELL", "LIQUIDATE") and order_sym in open_positions:
                    pos      = open_positions[order_sym]
                    sell_qty = pos["qty"]
                    proceeds = sell_qty * order_price
                    pnl      = (order_price - pos["entry_price"]) * sell_qty
                    exec_engine._cash += proceeds
                    del open_positions[order_sym]
                    if order_sym in exec_engine._positions:
                        del exec_engine._positions[order_sym]

                    fill = {
                        "type": "SELL", "symbol": order_sym, "qty": sell_qty,
                        "price": order_price, "value": proceeds,
                        "pnl": round(pnl, 2), "date": bar_time,
                        "reason": "on_data() SELL",
                    }
                    all_fills.append(fill)
                    strategy.on_trade_executed(fill)
                    risk_engine.on_pnl_recorded(pnl)
                    print(f"  [SELL] {sell_qty}x {order_sym} @ Rs.{order_price:.2f}  PnL=Rs.{pnl:,.0f}  (time={bar_time})")

        # Mark-to-market equity
        pos_value = 0.0
        for sym, pos in open_positions.items():
            sym_idx = sym_ts_idx.get(sym, {}).get(bar_time)
            if sym_idx is not None:
                pos_value += pos["qty"] * all_candles[sym][sym_idx].close
            else:
                pos_value += pos["qty"] * pos["entry_price"]

        equity_curve.append({"date": bar_time, "equity": exec_engine._cash + pos_value})

    # ── 8. Force-close remaining positions ────────────────────────────────────
    last_time = sorted_timestamps[-1] if sorted_timestamps else end
    for sym, pos in list(open_positions.items()):
        last_idx   = sym_ts_idx.get(sym, {}).get(last_time)
        last_price = all_candles[sym][last_idx].close if last_idx is not None else pos["entry_price"]
        pnl        = (last_price - pos["entry_price"]) * pos["qty"]
        exec_engine._cash += pos["qty"] * last_price
        all_fills.append({
            "type": "SELL", "symbol": sym, "qty": pos["qty"],
            "price": last_price, "pnl": round(pnl, 2), "date": last_time,
            "value": pos["qty"] * last_price,
            "reason": "End of backtest square-off",
        })

    # ── 9. Build report ───────────────────────────────────────────────────────
    price_data = {
        sym: [
            {
                "date": c.timestamp,
                "open": round(c.open, 2),
                "high": round(c.high, 2),
                "low": round(c.low, 2),
                "close": round(c.close, 2),
                "volume": c.volume,
            }
            for c in candles
        ]
        for sym, candles in all_candles.items()
    }

    return _build_multi_report(
        strategy.__class__.__name__,
        universe_syms, start, last_time,
        capital, exec_engine._cash,
        all_fills, equity_curve,
        price_data=price_data,
    )


def _build_multi_report(
    name, symbols, start, end,
    initial_capital, final_cash,
    all_fills, equity_curve,
    price_data: dict = None,
) -> MultiSymbolReport:
    sells        = [f for f in all_fills if f["type"] == "SELL" and f.get("pnl") is not None]
    wins         = [f for f in sells if f["pnl"] > 0]
    losses       = [f for f in sells if f["pnl"] <= 0]
    gross_profit = sum(f["pnl"] for f in wins)
    gross_loss   = abs(sum(f["pnl"] for f in losses))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)
    win_rate      = len(wins) / len(sells) * 100 if sells else 0.0

    final_equity = equity_curve[-1]["equity"] if equity_curve else initial_capital
    total_return = (final_equity - initial_capital) / initial_capital * 100

    # Max drawdown
    peak, max_dd = initial_capital, 0.0
    for pt in equity_curve:
        e = pt["equity"]
        if e > peak: peak = e
        dd = (peak - e) / peak * 100 if peak > 0 else 0.0
        if dd > max_dd: max_dd = dd

    # Sharpe
    equities = [pt["equity"] for pt in equity_curve]
    returns  = [
        (equities[i] - equities[i-1]) / equities[i-1]
        for i in range(1, len(equities)) if equities[i-1] > 0
    ]
    avg_r = sum(returns) / len(returns) if returns else 0.0
    std_r = math.sqrt(sum((r - avg_r) ** 2 for r in returns) / len(returns)) if returns else 0.0
    sharpe = (avg_r / std_r) * math.sqrt(252) if std_r > 0 else 0.0

    # Per-symbol stats
    per_symbol = {}
    for sym in symbols:
        sym_sells = [f for f in sells if f["symbol"] == sym]
        sym_wins  = [f for f in sym_sells if f["pnl"] > 0]
        per_symbol[sym] = {
            "trades"    : len(sym_sells),
            "wins"      : len(sym_wins),
            "win_rate"  : len(sym_wins) / len(sym_sells) * 100 if sym_sells else 0.0,
            "total_pnl" : sum(f["pnl"] for f in sym_sells),
        }

    report = MultiSymbolReport(
        strategy_name    = name,
        symbols          = symbols,
        period_from      = start,
        period_to        = end,
        initial_capital  = initial_capital,
        final_equity     = round(final_equity, 2),
        total_return_pct = round(total_return, 2),
        total_trades     = len(sells),
        wins             = len(wins),
        losses           = len(losses),
        win_rate_pct     = round(win_rate, 2),
        gross_profit     = round(gross_profit, 2),
        gross_loss       = round(gross_loss, 2),
        profit_factor    = round(profit_factor, 3),
        max_drawdown_pct = round(max_dd, 2),
        sharpe_ratio     = round(sharpe, 3),
        equity_curve     = equity_curve,
        trades           = all_fills,
        per_symbol       = per_symbol,
        price_data       = price_data or {},
    )
    report.print_summary()
    return report


# ══════════════════════════════════════════════════════════════════════════════
# Data fetching
# ══════════════════════════════════════════════════════════════════════════════

def _fetch_candles(symbol, start, end, warm_up_days, interval):
    try:
        import yfinance as yf
    except ImportError:
        raise ImportError(
            "[run_backtest] yfinance is required. Install: pip install yfinance"
        )

    from Algos.core.base_strategy import Candle

    is_minute = interval in ("1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h")
    start_dt  = datetime.strptime(start[:10], "%Y-%m-%d")
    
    # yfinance limitations for intraday: 1m max 7 days, 5m/15m max 60 days
    if interval == "1m":
        warm_up_days = min(warm_up_days, 5)
    elif is_minute:
        warm_up_days = min(warm_up_days, 30)

    fetch_start = (start_dt - timedelta(days=warm_up_days)).strftime("%Y-%m-%d")

    ticker = yf.Ticker(symbol)
    df = ticker.history(
        start       = fetch_start,
        end         = end,
        interval    = interval,
        auto_adjust = True,
    )

    if df is None or df.empty:
        return [], None

    df      = df.reset_index()
    candles = []

    for _, row in df.iterrows():
        ts = row.get("Date") or row.get("Datetime")
        if ts is None:
            continue
        ts_str = str(ts)[:19] if is_minute else str(ts)[:10]
        candles.append(Candle(
            timestamp = ts_str,
            open      = float(row["Open"]),
            high      = float(row["High"]),
            low       = float(row["Low"]),
            close     = float(row["Close"]),
            volume    = float(row.get("Volume", 0)),
        ))

    return candles, df

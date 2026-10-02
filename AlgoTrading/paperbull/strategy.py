"""
strategy.py — PaperBull-Native Strategy Base Class
====================================================
Users subclass `Strategy` to express their trading algorithms using
PaperBull's clean API. They never touch the internal Algos framework.

Usage
-----
    from paperbull import Strategy

    class MyStrategy(Strategy):

        def initialize(self):
            self.set_capital(1_000_000)
            self.set_resolution("daily")

        def universe(self, stocks):
            return stocks.filter(min_price=50, min_volume=5_000_000).top(20)

        def on_data(self, data):
            for symbol in self.universe_symbols:
                rsi = self.indicator.RSI(symbol, 14)
                if rsi and rsi < 30:
                    self.buy(symbol, 0.05)
                elif rsi and rsi > 70:
                    self.sell(symbol, 1.0)

        def rebalance(self):
            weights = self.portfolio.risk_parity_weights(self.universe_symbols)
            self.rebalance_to(weights)

How it works internally
-----------------------
When `run_backtest()` calls this strategy, it:
1. Builds a `_PaperBullAdapter(BaseStrategy)` wrapping this class.
2. The adapter implements the internal `calculate_indicators()`,
   `generate_entry_signal()`, `generate_exit_signal()`, `get_metadata()`.
3. On each bar, the adapter:
     a. Updates the IndicatorFacade candle registry.
     b. Updates the PortfolioEngine state.
     c. Calls user's `on_data()`.
     d. Reads back any pending orders from `self.buy()` / `self.sell()`.
     e. Returns the appropriate entry/exit Signal to BacktestEngine.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# ── PendingOrder ──────────────────────────────────────────────────────────────

class _PendingOrder:
    """Internal representation of a buy/sell order placed by the user."""
    __slots__ = ("action", "symbol", "weight", "full_exit")

    def __init__(
        self,
        action    : str,   # "BUY" | "SELL" | "LIQUIDATE"
        symbol    : str,
        weight    : float = 0.0,
        full_exit : bool  = False,
    ) -> None:
        self.action    = action
        self.symbol    = symbol
        self.weight    = weight
        self.full_exit = full_exit


# ── Data Bar ─────────────────────────────────────────────────────────────────

class DataBar:
    """
    Snapshot of the current bar passed to on_data().

    Attributes
    ----------
    symbol    : str   — active symbol (single-symbol backtest)
    open      : float
    high      : float
    low       : float
    close     : float
    volume    : float
    timestamp : str
    """
    __slots__ = ("symbol", "open", "high", "low", "close", "volume", "timestamp")

    def __init__(self, candle, symbol: str) -> None:
        self.symbol    = symbol
        self.open      = candle.open
        self.high      = candle.high
        self.low       = candle.low
        self.close     = candle.close
        self.volume    = candle.volume
        self.timestamp = candle.timestamp

    def __repr__(self) -> str:
        return (
            f"<DataBar {self.symbol} @ {self.timestamp} "
            f"O={self.open} H={self.high} L={self.low} C={self.close}>"
        )


# ── Strategy ──────────────────────────────────────────────────────────────────

class Strategy:
    """
    PaperBull-native user strategy base class.

    Subclass this and override any lifecycle hooks you need.

    Lifecycle (per run)
    -------------------
    1. initialize()          — called once; set capital, resolution, params
    2. universe(stocks)      — define which symbols to trade
    3. ─── event loop ───
       on_data(data)         — called on every new bar; place orders here
       rebalance()           — called on your schedule (default: never)
    4. on_trade_executed(trade) — optional callback after fill

    Order methods (inside on_data / rebalance)
    ------------------------------------------
    self.buy(symbol, weight)          — weight = fraction of total equity
    self.sell(symbol, weight)         — sell `weight` fraction of holding
    self.liquidate(symbol=None)       — close all or specific position
    self.set_position_size(sym, size) — absolute ₹ value
    self.rebalance_to(weights)        — rebalance to target weight dict

    Read-only properties
    --------------------
    self.indicator   — IndicatorFacade
    self.portfolio   — PortfolioEngine
    self.universe_symbols — list[str]
    self.cash        — float
    self.equity      — float
    """

    # ── User-overridable lifecycle hooks ──────────────────────────────────────

    def initialize(self) -> None:
        """
        Called once before the first bar.
        Use to set capital, resolution, and strategy parameters.
        """

    def universe(self, stocks) -> Any:
        """
        Define the tradable universe.

        Parameters
        ----------
        stocks : StockList — filterable universe of all available symbols

        Returns
        -------
        StockList — the filtered universe

        Example
        -------
        def universe(self, stocks):
            return stocks.filter(min_price=50, min_volume=5_000_000).top(20)
        """
        return stocks  # default: trade everything passed in

    def on_data(self, data: DataBar) -> None:
        """
        Called on every new bar (candle).

        Place buy/sell orders using self.buy(), self.sell(), self.liquidate().
        Read indicators using self.indicator.RSI(), self.indicator.EMA(), etc.

        Parameters
        ----------
        data : DataBar — current bar (open, high, low, close, volume, timestamp)
        """

    def rebalance(self) -> None:
        """
        Called on your configured rebalance schedule.
        Use self.rebalance_to(weights) here.
        """

    def on_trade_executed(self, trade: dict) -> None:
        """Optional: called after each fill."""

    # ── Configuration helpers (call inside initialize()) ──────────────────────

    def set_capital(self, amount: float) -> None:
        """Set starting capital (₹)."""
        self._capital = float(amount)

    def set_resolution(self, resolution: str) -> None:
        """
        Set data resolution. Accepted: "daily", "minute", "tick".
        Phase 1 supports "daily" only.
        """
        valid = {"daily", "minute", "tick"}
        if resolution not in valid:
            logger.warning(
                "[Strategy] Unknown resolution '%s'. Valid: %s. Defaulting to 'daily'.",
                resolution, valid,
            )
            resolution = "daily"
        self._resolution = resolution

    def set_rebalance_frequency(self, freq: str) -> None:
        """
        Set automatic rebalance frequency.
        Accepted: "daily", "weekly", "monthly", "never" (default).
        Phase 1: rebalance() is called manually or never.
        """
        self._rebalance_freq = freq

    # ── Order methods (call inside on_data() or rebalance()) ──────────────────

    def buy(self, symbol: str, weight: float) -> None:
        """
        Queue a BUY order.

        Parameters
        ----------
        symbol : str   — stock symbol (e.g. "RELIANCE.NS")
        weight : float — fraction of total equity to allocate (0.0 – 1.0)
                         e.g. 0.10 = 10% of portfolio

        Notes
        -----
        Orders are queued and executed by the adapter at end-of-bar.
        Multiple buy() calls for the same symbol are coalesced (last wins).
        """
        self._pending_orders[symbol] = _PendingOrder("BUY", symbol, weight=weight)

    def sell(self, symbol: str, weight: float = 1.0) -> None:
        """
        Queue a SELL order.

        Parameters
        ----------
        symbol : str   — stock symbol
        weight : float — fraction of current holding to sell (1.0 = full exit)
        """
        self._pending_orders[symbol] = _PendingOrder("SELL", symbol, weight=weight)

    def short(self, symbol: str, weight: float) -> None:
        """
        Queue a SHORT order (treated as SELL in Phase 1 paper mode).
        """
        logger.warning("[Strategy] short() → treated as sell() in Phase 1 paper mode.")
        self.sell(symbol, weight)

    def liquidate(self, symbol: str | None = None) -> None:
        """
        Close position(s).

        Parameters
        ----------
        symbol : If given, liquidate only that symbol.
                 If None, liquidate all open positions.
        """
        if symbol is not None:
            self._pending_orders[symbol] = _PendingOrder(
                "SELL", symbol, weight=1.0, full_exit=True
            )
        else:
            for sym in list(self.portfolio.holdings.keys()):
                self._pending_orders[sym] = _PendingOrder(
                    "SELL", sym, weight=1.0, full_exit=True
                )

    def set_position_size(self, symbol: str, size: float) -> None:
        """
        Set position to an absolute ₹ value.

        Converts to weight = size / equity, then queues a BUY or SELL accordingly.
        """
        equity = self.equity
        if equity <= 0:
            return
        weight = size / equity
        self.buy(symbol, weight)

    def rebalance_to(self, weights: dict[str, float]) -> None:
        """
        Rebalance portfolio to target weights.

        For each symbol:
        - If target > current → BUY the difference
        - If target < current → SELL the difference
        - If symbol not in weights → liquidate

        Parameters
        ----------
        weights : dict[str, float] — {symbol: target_weight} summing to ≤ 1.0
        """
        equity   = self.equity
        holdings = self.portfolio.holdings

        # Sell symbols not in new weights
        for sym in list(holdings.keys()):
            if sym not in weights:
                self._pending_orders[sym] = _PendingOrder("SELL", sym, weight=1.0, full_exit=True)

        # Buy/adjust symbols in new weights
        for sym, target_w in weights.items():
            current_value = holdings[sym].value if sym in holdings else 0.0
            target_value  = equity * target_w
            delta         = target_value - current_value

            if delta > equity * 0.005:   # +0.5% threshold to avoid tiny trades
                self._pending_orders[sym] = _PendingOrder("BUY",  sym, weight=target_w)
            elif delta < -equity * 0.005:
                # Partial sell: sell enough to bring down to target
                current_w = current_value / equity if equity > 0 else 0.0
                sell_frac = (current_w - target_w) / current_w if current_w > 0 else 0.0
                self._pending_orders[sym] = _PendingOrder("SELL", sym, weight=min(sell_frac, 1.0))

    # ── Read-only properties ──────────────────────────────────────────────────

    @property
    def indicator(self):
        """IndicatorFacade — access technical indicators."""
        return self._indicator_facade

    @property
    def portfolio(self):
        """PortfolioEngine — access portfolio state and weight methods."""
        return self._portfolio_engine

    @property
    def universe_symbols(self) -> list[str]:
        """List of symbols in the current universe."""
        return list(self._universe_symbols)

    @property
    def cash(self) -> float:
        """Available cash."""
        return self._portfolio_engine.cash

    @property
    def equity(self) -> float:
        """Total portfolio equity (cash + positions mark-to-market)."""
        return self._portfolio_engine.total_value

    # ── Internal bootstrap (called by runner, not by users) ───────────────────

    def _bootstrap(
        self,
        indicator_facade,
        portfolio_engine,
        universe_symbols: list[str],
    ) -> None:
        """Inject engine references. Called by runner before backtesting."""
        from .indicator_facade import IndicatorFacade
        from .portfolio_engine import PortfolioEngine

        self._indicator_facade : IndicatorFacade = indicator_facade
        self._portfolio_engine : PortfolioEngine  = portfolio_engine
        self._universe_symbols : list[str]        = universe_symbols
        self._pending_orders   : dict[str, _PendingOrder] = {}
        self._capital          : float = 100_000.0
        self._resolution       : str   = "daily"
        self._rebalance_freq   : str   = "never"
        self._initialized      : bool  = False

    def _flush_orders(self) -> dict[str, _PendingOrder]:
        """Drain and return all queued orders. Called once per bar by adapter."""
        orders = dict(self._pending_orders)
        self._pending_orders.clear()
        return orders

    def __repr__(self) -> str:
        return f"<Strategy: {self.__class__.__name__}>"


# ── _PaperBullAdapter ─────────────────────────────────────────────────────────

class _PaperBullAdapter:
    """
    Bridges a user's Strategy to the internal BaseStrategy interface.

    This allows BacktestEngine.run() to accept a user Strategy without
    any changes to the existing internal engine.

    The adapter:
    1. Wraps itself as a BaseStrategy-compatible object.
    2. On each bar: updates candle registry → calls user's on_data() →
       reads pending orders → returns a Signal.
    3. Maps buy(weight) → qty via current equity and price.
    """

    def __init__(
        self,
        user_strategy : Strategy,
        initial_capital: float,
    ) -> None:
        self._user    = user_strategy
        self._capital = initial_capital
        self._current_candles : list = []
        self._current_price   : float = 0.0
        self._current_symbol  : str   = ""
        self._open_position   : dict | None = None
        self.name = user_strategy.__class__.__name__
        self.mode = "backtest"
        self._initialized = False
        self._indicator_cache: dict = {}   # required by BacktestEngine ATR lookup
        self._exec_engine_ref = None
        # Staged orders from the current bar's on_data() call
        self._bar_buy_order  : "_PendingOrder | None" = None
        self._bar_sell_order : "_PendingOrder | None" = None

    # ── BacktestEngine interface ──────────────────────────────────────────────

    def initialize(self) -> None:
        if not self._initialized:
            self._user.initialize()
            self._initialized = True

    def calculate_indicators(self, candles: list) -> None:
        """Update the facade registry with latest candles."""
        self._current_candles = candles
        if self._current_symbol:
            self._user._indicator_facade._set_candles(
                self._current_symbol, candles
            )
            # Cache ATR for BacktestEngine's position sizing
            try:
                from Algos.indicators.indicator_engine import indicator_engine
                atr_series = indicator_engine.calculate(
                    "ATR", candles, symbol=self._current_symbol, period=14
                )
                self._indicator_cache["ATR"] = atr_series
            except Exception:
                pass

    def generate_entry_signal(self, candles: list, current_price: float):
        """Return the staged BUY signal (on_data already called in process())."""
        from Algos.signals.signal_engine import signal_engine
        from Algos.conditions.condition_engine import ConditionResult

        symbol = self._current_symbol
        order  = self._bar_buy_order

        if order and order.action == "BUY":
            equity  = self._user.equity
            qty_est = int((equity * order.weight) / current_price) if current_price > 0 else 0
            if qty_est > 0:
                result = ConditionResult(
                    met=True,
                    reason=f"PaperBull BUY {order.weight*100:.1f}% weight"
                )
                return signal_engine.resolve_entry(
                    result=result, symbol=symbol, instrument_key=symbol,
                    price=current_price, strategy_name=self.name,
                )

        return signal_engine.resolve_entry(
            result=ConditionResult(met=False, reason="No entry signal"),
            symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def generate_exit_signal(self, candles: list, current_price: float, position=None):
        """Return the staged SELL signal (on_data already called in process())."""
        from Algos.signals.signal_engine import signal_engine
        from Algos.conditions.condition_engine import ConditionResult

        symbol = self._current_symbol
        order  = self._bar_sell_order

        if order and order.action in ("SELL", "LIQUIDATE"):
            return signal_engine.resolve_exit(
                result=ConditionResult(met=True, reason="PaperBull SELL order"),
                symbol=symbol, instrument_key=symbol,
                price=current_price, strategy_name=self.name,
            )

        return signal_engine.resolve_exit(
            result=ConditionResult(met=False, reason="Holding"),
            symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        doc = self._user.__class__.__doc__ or ""
        return {
            "name"       : self.name,
            "description": doc.strip().splitlines()[0] if doc.strip() else self.name,
            "version"    : "1.0",
            "author"     : "PaperBull User",
        }

    # ── Lifecycle hooks forwarded to user ─────────────────────────────────────

    def on_position_opened(self, trade: dict) -> None:
        self._user.on_trade_executed(trade)

    def on_position_closed(self, trade: dict) -> None:
        self._user.on_trade_executed(trade)

    def on_tick(self, tick: dict) -> None:
        pass

    # ── Exec engine reference (injected by runner) ────────────────────────────

    def _bind_exec_engine(self, exec_engine) -> None:
        self._exec_engine_ref = exec_engine

    # ── BacktestEngine compatibility ──────────────────────────────────────────

    def process(self, candles: list, current_price: float, position=None) -> dict:
        """
        Full per-bar pipeline — overrides BaseStrategy.process().

        Calls on_data() ONCE per bar, then routes pending orders to the
        correct entry/exit signal. This avoids the timing problem where
        BacktestEngine calls exit before entry.
        """
        if not self._initialized:
            self.initialize()

        self.calculate_indicators(candles)

        # Update portfolio cash
        if self._exec_engine_ref:
            self._user._portfolio_engine._update_cash(self._exec_engine_ref._cash)

        # Call user's on_data() once
        bar = DataBar(candles[-1], self._current_symbol)
        try:
            self._user.on_data(bar)
        except Exception as exc:
            logger.error("[PaperBullAdapter] on_data() error: %s", exc, exc_info=True)

        # Stage buy and sell orders from this bar
        orders = self._user._flush_orders()
        sym    = self._current_symbol
        self._bar_buy_order  = None
        self._bar_sell_order = None

        for o in orders.values():
            if o.symbol == sym:
                if o.action == "BUY":
                    self._bar_buy_order = o
                elif o.action in ("SELL", "LIQUIDATE"):
                    self._bar_sell_order = o

        entry = self.generate_entry_signal(candles, current_price)
        exit_ = (
            self.generate_exit_signal(candles, current_price, position)
            if position else None
        )
        return {"entry": entry, "exit": exit_}

    def _ensure_initialized(self) -> None:
        if not self._initialized:
            self.initialize()
            self._initialized = True

    def __repr__(self) -> str:
        return f"<PaperBullAdapter wrapping={self.name}>"

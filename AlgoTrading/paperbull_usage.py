"""
paperbull_usage.py — Complete PaperBull API Usage Reference
============================================================
This file is a living cookbook. Every feature of the PaperBull-native
API is demonstrated here with working examples.

Run from AlgoTrading/ directory:
    python paperbull_usage.py
"""

import sys, os, io

# Windows UTF-8 fix
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from paperbull import Strategy, run_backtest


# ╔══════════════════════════════════════════════════════════════╗
# ║  SECTION 1 — INDICATORS                                      ║
# ╚══════════════════════════════════════════════════════════════╝
#
# All indicators are accessed via:   self.indicator.<NAME>(symbol, ...params)
# They always return a scalar float (or a NamedTuple for multi-output ones).
# They operate on the candle history up to the current bar.
#
# Available indicators:
# ─────────────────────────────────────────────────────────────
#  Momentum:   RSI  MACD  ROC  MOM
#  Trend:      EMA  SMA  VWAP  ADX  SuperTrend
#  Volatility: ATR  BB  STD
#  Volume:     OBV  VolumeSMA
#  Custom:     custom(fn, symbol, window)

class IndicatorUsageStrategy(Strategy):
    """Demonstrates every indicator in the facade."""

    def on_data(self, data):
        sym = data.symbol

        # ── Momentum ──────────────────────────────────────────
        rsi  = self.indicator.RSI(sym, 14)       # float 0–100
        roc  = self.indicator.ROC(sym, 10)       # % change over 10 bars
        mom  = self.indicator.MOM(sym, 10)       # price - price[10 bars ago]

        macd = self.indicator.MACD(sym, 12, 26, 9)
        # macd.macd      → MACD line value
        # macd.signal    → Signal line value
        # macd.histogram → MACD - Signal

        # ── Trend ─────────────────────────────────────────────
        ema9   = self.indicator.EMA(sym, 9)
        ema21  = self.indicator.EMA(sym, 21)
        ema50  = self.indicator.EMA(sym, 50)
        ema200 = self.indicator.EMA(sym, 200)
        sma20  = self.indicator.SMA(sym, 20)
        vwap   = self.indicator.VWAP(sym)
        adx    = self.indicator.ADX(sym, 14)     # trend strength 0–100

        st = self.indicator.SuperTrend(sym, 10, 3.0)
        # st.supertrend  → SuperTrend line value
        # st.direction   → 1 (bullish) or -1 (bearish)
        # st.upper_band  → upper band
        # st.lower_band  → lower band

        # ── Volatility ────────────────────────────────────────
        atr  = self.indicator.ATR(sym, 14)       # average true range (₹)
        std  = self.indicator.STD(sym, 20)       # std dev of closes

        bb = self.indicator.BB(sym, 20, 2.0)
        # bb.upper      → upper band
        # bb.middle     → middle band (SMA)
        # bb.lower      → lower band
        # bb.bandwidth  → (upper-lower)/middle
        # bb.pct_b      → where price is within bands (0=lower, 1=upper)

        # ── Volume ────────────────────────────────────────────
        obv    = self.indicator.OBV(sym)         # on-balance volume
        vol_ma = self.indicator.VolumeSMA(sym, 20)

        # ── Custom indicator ──────────────────────────────────
        # Pass any function that takes a list of candles and returns a float
        hlc3 = self.indicator.custom(
            fn     = lambda candles: sum((c.high + c.low + c.close) / 3 for c in candles) / len(candles),
            symbol = sym,
            window = 14,
        )

        # ── Guard: always check for None before using ─────────
        if rsi is None or ema50 is None:
            return   # not enough history yet

        # ── Example entry logic ───────────────────────────────
        in_position = sym in self.portfolio.holdings

        if rsi < 30 and data.close > ema50 and not in_position:
            self.buy(sym, 0.10)     # buy 10% of equity

        elif rsi > 70 and in_position:
            self.sell(sym)          # sell full position


# ╔══════════════════════════════════════════════════════════════╗
# ║  SECTION 2 — ORDER METHODS                                   ║
# ╚══════════════════════════════════════════════════════════════╝
#
#  self.buy(symbol, weight)
#      weight = fraction of total equity  (0.10 = 10%)
#
#  self.sell(symbol, weight=1.0)
#      weight = fraction of current holding to sell (1.0 = full exit)
#
#  self.liquidate(symbol=None)
#      Close specific position, or ALL positions if symbol=None
#
#  self.set_position_size(symbol, size_in_rupees)
#      Buy enough to reach that absolute ₹ value in the position
#
#  self.rebalance_to(weights_dict)
#      Rebalance entire portfolio to target weights
#      weights_dict = {"RELIANCE.NS": 0.20, "TCS.NS": 0.15, ...}

class OrderMethodsStrategy(Strategy):
    """Demonstrates every order method."""

    def initialize(self):
        self.set_capital(500_000)
        self._day = 0

    def on_data(self, data):
        sym = data.symbol
        self._day += 1

        # Day 1: buy 10% of equity in this stock
        if self._day == 1:
            self.buy(sym, 0.10)

        # Day 5: sell half of the position
        elif self._day == 5 and sym in self.portfolio.holdings:
            self.sell(sym, 0.50)    # sell 50% of holding

        # Day 10: close everything
        elif self._day == 10:
            self.liquidate()        # close all positions

        # Day 15: buy ₹50,000 worth
        elif self._day == 15:
            self.set_position_size(sym, 50_000)


# ╔══════════════════════════════════════════════════════════════╗
# ║  SECTION 3 — PORTFOLIO ENGINE                                ║
# ╚══════════════════════════════════════════════════════════════╝
#
#  self.portfolio.cash              → available cash (float)
#  self.portfolio.equity            → same as self.equity
#  self.portfolio.total_value       → cash + open positions (mark-to-market)
#  self.portfolio.holdings          → {symbol: Holding}
#
#  Holding attributes:
#    .symbol        → str
#    .qty           → int  (shares held)
#    .entry_price   → float
#    .current_price → float (latest close)
#    .value         → qty * current_price
#    .unrealised_pnl      → float (₹)
#    .unrealised_pnl_pct  → float (%)
#
#  self.portfolio.drawdown()        → current unrealised drawdown %
#  self.portfolio.sharpe(window=252)→ approx Sharpe from available candles
#
#  Weight methods (all return {symbol: float} summing to ≤ 1.0):
#  self.portfolio.equal_weights(symbols)
#  self.portfolio.momentum_weights(symbols, lookback=90, max_weight=0.25)
#  self.portfolio.correlation_weights(symbols, window=60, max_weight=0.10)
#  self.portfolio.risk_parity_weights(symbols, window=60, max_weight=0.20)
#  self.portfolio.min_variance_weights(symbols, window=60, max_weight=0.25)

class PortfolioStrategy(Strategy):
    """Demonstrates portfolio engine features."""

    def initialize(self):
        self.set_capital(1_000_000)

    def on_data(self, data):
        sym = data.symbol

        # Read portfolio state
        cash    = self.portfolio.cash          # available ₹
        equity  = self.portfolio.total_value   # total portfolio value
        dd      = self.portfolio.drawdown()    # current drawdown %

        # Inspect each holding
        for symbol, holding in self.portfolio.holdings.items():
            print(f"  {symbol}: {holding.qty} shares @ ₹{holding.current_price:.2f}"
                  f" | P&L: ₹{holding.unrealised_pnl:.0f} ({holding.unrealised_pnl_pct:.1f}%)")

        # Risk check: stop trading if drawdown > 5%
        if dd > 5.0:
            self.liquidate()
            return

        # Simple entry
        rsi = self.indicator.RSI(sym, 14)
        if rsi and rsi < 30 and sym not in self.portfolio.holdings:
            self.buy(sym, 0.15)

    def rebalance(self):
        # Rebalance to risk-parity weights across the universe
        weights = self.portfolio.risk_parity_weights(
            self.universe_symbols,
            window     = 60,
            max_weight = 0.20,     # no single stock > 20%
        )
        print("  Rebalancing to:", weights)
        self.rebalance_to(weights)


# ╔══════════════════════════════════════════════════════════════╗
# ║  SECTION 4 — UNIVERSE / StockList                            ║
# ╚══════════════════════════════════════════════════════════════╝
#
# PaperBull supports 3 distinct Universe Selection Paradigms:
#
# 1. MANUAL UNIVERSE
#    User supplies a fixed list of symbols:
#    run_backtest(strategy=..., symbols=["RELIANCE.NS", "TCS.NS", "INFY.NS"])
#
# 2. RULE-BASED UNIVERSE (Filter + Rank)
#    User filters by price, liquidity, volatility, and ranks by momentum:
#    def universe(self, stocks):
#        return (
#            stocks
#            .filter(min_price=50, max_price=5000, min_volume=2_000_000)
#            .sort_by("momentum_3m")
#            .top(15)
#        )
#
# 3. ALGORITHMIC MULTI-FACTOR UNIVERSE (Scoring)
#    User defines a custom mathematical scoring function across factors
#    (e.g., reward high momentum, penalize high volatility):
#    def universe(self, stocks):
#        def my_alpha_score(stock):
#            mom = stock.momentum_3m or 0.0
#            vol = stock.volatility or 50.0
#            return (mom * 0.7) - (vol * 0.3)
#
#        return stocks.score_by(my_alpha_score).top(10)


class RuleBasedUniverseStrategy(Strategy):
    """
    Paradigm 2: Rule-Based Universe Selection.
    Picks top 5 highest 3-month momentum stocks with volume > 1M, then trades RSI.
    """

    def initialize(self):
        self.set_capital(1_000_000)

    def universe(self, stocks):
        # 1. Filter: Price between ₹100 and ₹5,000, Volume >= 500k
        # 2. Rank by 3-Month Momentum (highest first)
        # 3. Pick top 5 stocks
        return (
            stocks
            .filter(min_price=100, max_price=5_000, min_volume=500_000)
            .sort_by("momentum_3m", ascending=False)
            .top(5)
        )

    def on_data(self, data):
        sym = data.symbol
        rsi = self.indicator.RSI(sym, 14)

        if rsi is None:
            return

        in_pos = sym in self.portfolio.holdings

        # RSI mean reversion on high-momentum market leaders
        if rsi < 35 and not in_pos:
            self.buy(sym, 0.18)  # ~18% per stock (up to 5 stocks)
        elif rsi > 65 and in_pos:
            self.sell(sym)


class AlgorithmicScoringStrategy(Strategy):
    """
    Paradigm 3: Algorithmic Multi-Factor Universe Selection.
    Computes a composite Alpha Score for every stock in the market pool,
    selects top 4 scored stocks, and trades trend-following EMA crossovers.
    """

    def initialize(self):
        self.set_capital(1_000_000)

    def universe(self, stocks):
        # Algorithmic multi-factor scoring function:
        # Score = (3M Momentum * 0.6) + (1M Momentum * 0.4) - (Volatility * 0.2)
        def alpha_score(stock):
            m3 = stock.momentum_3m or 0.0
            m1 = stock.momentum_1m or 0.0
            vol = stock.volatility or 40.0
            return (m3 * 0.6) + (m1 * 0.4) - (vol * 0.2)

        return (
            stocks
            .filter(min_price=100, min_volume=500_000)
            .score_by(alpha_score)
            .top(4)
        )

    def on_data(self, data):
        sym = data.symbol
        ema20 = self.indicator.EMA(sym, 20)
        ema50 = self.indicator.EMA(sym, 50)

        if ema20 is None or ema50 is None:
            return

        in_pos = sym in self.portfolio.holdings

        if ema20 > ema50 and not in_pos:
            self.buy(sym, 0.22)
        elif ema20 < ema50 and in_pos:
            self.sell(sym)


# ╔══════════════════════════════════════════════════════════════╗
# ║  SECTION 5 — LIFECYCLE HOOKS                                 ║
# ╚══════════════════════════════════════════════════════════════╝

class LifecycleStrategy(Strategy):

    def initialize(self):
        self.set_capital(500_000)
        self.set_resolution("daily")
        self.trade_log = []
        self.bars_held = {}

    def universe(self, stocks):
        return stocks.filter(min_price=100).top(5)

    def on_data(self, data):
        sym = data.symbol

        if sym in self.portfolio.holdings:
            self.bars_held[sym] = self.bars_held.get(sym, 0) + 1
            if self.bars_held[sym] >= 30:
                self.sell(sym)
                self.bars_held[sym] = 0
                return

        rsi = self.indicator.RSI(sym, 14)
        if rsi and rsi < 28 and sym not in self.portfolio.holdings:
            self.buy(sym, 0.20)
            self.bars_held[sym] = 0

    def on_trade_executed(self, trade):
        self.trade_log.append(trade)
        pnl = trade.get("pnl")
        pnl_str = f"P&L: Rs.{pnl:,.0f}" if pnl is not None else ""
        print(f"  [Trade] {trade['type']} {trade['symbol']} {pnl_str}")


class BlindBasketDayStrategy(Strategy):
    """
    Blind Basket Strategy:
    1. Pre-Market Screening: Evaluates past historical candles to pick the top 4 strongest stocks.
    2. Market Open (09:15 AM): Immediately buys all 4 stocks (25% each of your 1 Lakh capital).
    3. Market Close (03:15 PM): Automatically closes all positions before market end.
    """

    def initialize(self):
        self.set_capital(100_000)      # ₹1 Lakh total capital
        self.set_resolution("minute")
        self.trade_log = []

    def universe(self, stocks):
        # ── Step 1: Scan historical candles & pick top 4 strongest stocks ──
        return (
            stocks
            .filter(min_price=50, min_volume=10_000)
            .sort_by("momentum_1m", ascending=False)   # Sort by past 1-month momentum
            .top(4)                                    # Top 4 stocks
        )

    def on_data(self, data):
        sym = data.symbol

        # ── Step 2: 09:15 AM Market Open -> Blindly BUY 25% allocation ──
        if "09:15" in data.timestamp or "09:16" in data.timestamp:
            if sym not in self.portfolio.holdings:
                self.buy(sym, 0.25)   # 25% of ₹1 Lakh = ₹25,000 per stock

        # ── Step 3: 03:15 PM (15:15) Market Close -> Liquidate everything ──
        elif "15:15" in data.timestamp or "15:20" in data.timestamp:
            if sym in self.portfolio.holdings:
                self.sell(sym)        # Full exit

    def on_trade_executed(self, trade):
        self.trade_log.append(trade)
        pnl = trade.get("pnl")
        pnl_str = f"P&L: Rs.{pnl:,.0f}" if pnl is not None else ""
        print(f"  [Trade Fill] {trade['type']} {trade['symbol']} @ Rs.{trade['price']:.2f} {pnl_str}")


# ══════════════════════════════════════════════════════════════
#  RUNNING STRATEGIES — Blind Intraday Basket Trading Demo
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":

    # ── Demo 1: Rule-Based Dynamic Universe on Market Pool ───────────────────
    # print("\n" + "="*70)
    # print("  DEMO 1: Rule-Based Universe Selection (Top Momentum from NIFTY pool)")
    # print("="*70)

    # report_rule = run_backtest(
    #     strategy = RuleBasedUniverseStrategy(),
    #     symbols  = [
    #         "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
    #         "SBIN.NS", "ITC.NS", "BHARTIARTL.NS", "KOTAKBANK.NS", "LT.NS",
    #         "TITAN.NS", "TATAMOTORS.NS", "SUNPHARMA.NS", "ADANIENT.NS"
    #     ],
    #     start    = "2025-01-01",
    #     end      = "2026-01-01",
    #     capital  = 1_000_000,
    # )

    # ── Demo 2: 1-Day Intraday Strategy (5-minute / 1-minute bars) ────────────
    print("\n" + "="*70)
    print("  DEMO 2: 1-Day Intraday Multi-Asset Strategy (5m bars)")
    print("="*70)

    report_algo = run_backtest(
        strategy     = RuleBasedUniverseStrategy(),
        market       = "NIFTY50",
        start        = "2026-08-14",
        end          = "2026-08-15",
        interval     = "1m",             # 5m or 1m for intraday
        warm_up_days = 3,
        capital      = 10_00_000,
    )


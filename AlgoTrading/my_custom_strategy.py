"""
my_custom_strategy.py — How to Add Your Own Conditions
=======================================================

There are 3 ways to customize conditions on any strategy:

  WAY 1: Override an existing strategy by subclassing it
          → Fastest. Keep everything, just change entry/exit logic.

  WAY 2: Build a brand new strategy from scratch
          → Full control. Define exactly what you want.

  WAY 3: Inject custom condition functions at runtime
          → No subclassing needed. Pass a function to any strategy.

This file has all 3 fully working examples.
Run: python my_custom_strategy.py
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from Algos import (
    BaseStrategy, Candle, BacktestEngine,
    StrategyManager, RiskConfig,
    CrossAbove, CrossBelow, GreaterThan, LessThan,
    AND, OR, NOT,
)
from Algos.conditions.condition_engine import condition_engine, ConditionResult
from Algos.signals.signal_engine import signal_engine
from Algos.registry.strategy_registry import strategy_registry
from Algos.strategies import *       # registers the 8 built-in strategies


# ═══════════════════════════════════════════════════════════════════════════════
# WAY 1 — Override an existing strategy (quickest)
# ═══════════════════════════════════════════════════════════════════════════════
#
# Inherit EMAStrategy but change:
#   • Entry: EMA crossover + RSI must be > 50 (momentum confirmation)
#   • Exit : EMA crossover below OR price drops > 1.5% from entry
#
# ─────────────────────────────────────────────────────────────────────────────

from Algos.strategies.ema_strategy import EMAStrategy


class MyEMAWithRSI(EMAStrategy):
    """
    EMA Crossover + RSI Momentum Filter
    ------------------------------------
    Entry: Fast EMA crosses ABOVE Slow EMA  AND  RSI > 50
    Exit : Fast EMA crosses BELOW Slow EMA  OR   RSI < 40  OR  price drops 2%
    """

    def initialize(self) -> None:
        super().initialize()                            # keep EMA params from parent
        self.rsi_period     = self.params.get("rsi_period", 14)
        self.rsi_entry_min  = self.params.get("rsi_entry_min", 50)   # your condition
        self.rsi_exit_max   = self.params.get("rsi_exit_max",  40)   # your condition
        self.stop_loss_pct  = self.params.get("stop_loss_pct", 2.0)  # % drop from entry

    def calculate_indicators(self, candles: list[Candle]) -> None:
        super().calculate_indicators(candles)           # still compute EMA fast/slow
        self._indicator_cache["RSI"] = self.indicators.calculate(
            "RSI", candles, period=self.rsi_period
        )

    def generate_entry_signal(self, candles: list[Candle], current_price: float):
        fast   = self._indicator_cache["EMA_fast"]
        slow   = self._indicator_cache["EMA_slow"]
        rsi    = self._indicator_cache["RSI"]
        symbol = "CUSTOM"

        # Your conditions: EMA cross AND RSI above threshold
        combined = condition_engine.evaluate_all([
            {"condition": CrossAbove(), "args": [fast, slow], "label": "EMA Cross Up"},
            {"condition": GreaterThan(), "args": [rsi, [self.rsi_entry_min]], "label": f"RSI > {self.rsi_entry_min}"},
        ])

        return signal_engine.resolve_entry(
            result=combined, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
            meta={"ema_fast": fast[-1] if fast else None, "rsi": rsi[-1] if rsi else None},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None):
        fast   = self._indicator_cache["EMA_fast"]
        slow   = self._indicator_cache["EMA_slow"]
        rsi    = self._indicator_cache["RSI"]
        symbol = "CUSTOM"

        # Stop loss: price fell > stop_loss_pct% from entry
        stop_loss_hit = False
        if position and position.get("entry_price"):
            pct_drop = (position["entry_price"] - current_price) / position["entry_price"] * 100
            stop_loss_hit = pct_drop >= self.stop_loss_pct

        # Exit if: EMA cross down OR RSI < threshold OR stop loss
        if stop_loss_hit:
            result = ConditionResult(met=True, reason=f"Stop loss hit ({self.stop_loss_pct}% drop)")
        else:
            result = condition_engine.evaluate_any([
                {"condition": CrossBelow(),  "args": [fast, slow], "label": "EMA Cross Down"},
                {"condition": LessThan(),    "args": [rsi, [self.rsi_exit_max]], "label": f"RSI < {self.rsi_exit_max}"},
            ])

        return signal_engine.resolve_exit(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : f"EMA Crossover + RSI>{self.rsi_entry_min} entry + {self.stop_loss_pct}% stop loss",
            "version"        : "1.0",
            "author"         : "You",
            "indicators_used": ["EMA", "RSI"],
            "best_for"       : "Trending markets with momentum confirmation",
            "risk_level"     : "LOW",
        }


strategy_registry.register("MyEMAWithRSI", MyEMAWithRSI)


# ═══════════════════════════════════════════════════════════════════════════════
# WAY 2 — Brand new strategy from scratch (full control)
# ═══════════════════════════════════════════════════════════════════════════════
#
# SUPERTREND + VWAP + RSI confluence strategy:
#   Entry: SuperTrend is BULLISH  AND  Price > VWAP  AND  RSI between 40–65
#   Exit : SuperTrend flips BEARISH  OR  Price < VWAP  OR  RSI > 70
#
# ─────────────────────────────────────────────────────────────────────────────

class MySupertrendVWAP(BaseStrategy):
    """
    Triple-Confluence: SuperTrend + VWAP + RSI
    -------------------------------------------
    All 3 must agree for entry. Any 1 failing triggers exit.
    Good for intraday swing trades on liquid large-caps.
    """

    def initialize(self) -> None:
        self.st_period     = self.params.get("st_period",  10)
        self.st_multiplier = self.params.get("st_mult",   3.0)
        self.rsi_period    = self.params.get("rsi_period", 14)
        self.rsi_low       = self.params.get("rsi_low",    40)   # your condition
        self.rsi_high      = self.params.get("rsi_high",   65)   # your condition
        self.rsi_exit      = self.params.get("rsi_exit",   70)   # your condition

    def calculate_indicators(self, candles: list[Candle]) -> None:
        st = self.indicators.calculate(
            "SuperTrend", candles, period=self.st_period, multiplier=self.st_multiplier
        )
        self._indicator_cache["ST_trend"] = st.trend
        self._indicator_cache["ST_line"]  = st.supertrend
        self._indicator_cache["ATR"]      = self.indicators.calculate(
            "ATR", candles, period=self.st_period
        )
        self._indicator_cache["VWAP"] = self.indicators.calculate(
            "VWAP", candles, reset_daily=True
        )
        self._indicator_cache["RSI"] = self.indicators.calculate(
            "RSI", candles, period=self.rsi_period
        )

    def generate_entry_signal(self, candles: list[Candle], current_price: float):
        trend  = self._indicator_cache["ST_trend"]
        vwap   = self._indicator_cache["VWAP"]
        rsi    = self._indicator_cache["RSI"]
        symbol = "CUSTOM"

        # Condition 1: SuperTrend is bullish (trend == 1)
        st_bullish = len(trend) > 0 and trend[-1] == 1

        # Condition 2: Price is above VWAP (bullish bias)
        price_above_vwap = (
            vwap and len(vwap) > 0 and
            vwap[-1] == vwap[-1] and     # not NaN
            current_price > vwap[-1]
        )

        # Condition 3: RSI in "sweet zone" — not oversold, not overbought
        rsi_val = rsi[-1] if rsi else float("nan")
        rsi_in_zone = rsi_val == rsi_val and self.rsi_low <= rsi_val <= self.rsi_high

        met    = st_bullish and price_above_vwap and rsi_in_zone
        reason = (
            f"Triple confluence: ST=bullish, price>VWAP({vwap[-1] if vwap else 'N/A':.2f}), "
            f"RSI={rsi_val:.1f} in [{self.rsi_low},{self.rsi_high}]"
            if met else
            f"No entry: ST={'bullish' if st_bullish else 'bearish'}, "
            f"PriceAboveVWAP={price_above_vwap}, RSI={rsi_val:.1f}"
        )

        result = ConditionResult(met=met, reason=reason)
        return signal_engine.resolve_entry(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name, confidence=0.85,
            meta={"trend": trend[-1] if trend else None,
                  "vwap": vwap[-1] if vwap else None, "rsi": rsi_val},
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None):
        trend  = self._indicator_cache["ST_trend"]
        vwap   = self._indicator_cache["VWAP"]
        rsi    = self._indicator_cache["RSI"]
        symbol = "CUSTOM"

        st_bearish       = len(trend) > 0 and trend[-1] == -1
        price_below_vwap = vwap and len(vwap) > 0 and vwap[-1] == vwap[-1] and current_price < vwap[-1]
        rsi_val          = rsi[-1] if rsi else float("nan")
        rsi_overbought   = rsi_val == rsi_val and rsi_val > self.rsi_exit

        met    = st_bearish or price_below_vwap or rsi_overbought
        reason = []
        if st_bearish      : reason.append("SuperTrend flipped bearish")
        if price_below_vwap: reason.append(f"Price dropped below VWAP")
        if rsi_overbought  : reason.append(f"RSI={rsi_val:.1f} > {self.rsi_exit} (overbought)")

        result = ConditionResult(
            met=met,
            reason=f"Exit: {' | '.join(reason)}" if met else "Holding — all exit conditions clear"
        )
        return signal_engine.resolve_exit(
            result=result, symbol=symbol, instrument_key=symbol,
            price=current_price, strategy_name=self.name,
        )

    def get_metadata(self) -> dict:
        return {
            "name"           : self.name,
            "description"    : "SuperTrend + VWAP + RSI triple confluence entry",
            "version"        : "1.0",
            "author"         : "You",
            "indicators_used": ["SuperTrend", "VWAP", "RSI", "ATR"],
            "best_for"       : "Intraday / swing trades on liquid stocks",
            "risk_level"     : "MEDIUM",
        }


strategy_registry.register("SupertrendVWAP", MySupertrendVWAP)


# ═══════════════════════════════════════════════════════════════════════════════
# WAY 3 — Inject conditions via params at runtime (no subclassing)
# ═══════════════════════════════════════════════════════════════════════════════
#
# Sometimes you just want to tweak thresholds without writing a new class.
# All built-in strategies accept params= when loading. Example:
#
#   mgr.load("RSI", params={
#       "oversold":   25,    # instead of default 30 → stricter entry
#       "overbought": 75,    # instead of default 70 → hold longer
#       "period":     9,     # faster RSI
#   })
#
#   mgr.load("EMA", params={
#       "fast_period": 5,    # very fast EMA
#       "slow_period": 13,
#   })
#
#   mgr.load("BollingerBands", params={
#       "multiplier": 2.5,   # wider bands → fewer but higher-quality signals
#       "rsi_period": 7,
#   })
#
# ─────────────────────────────────────────────────────────────────────────────


# ═══════════════════════════════════════════════════════════════════════════════
# RUN — Backtest all 3 ways and compare
# ═══════════════════════════════════════════════════════════════════════════════

def load_candles(symbol="TCS", period="1y"):
    try:
        import yfinance as yf
        ticker = yf.Ticker(f"{symbol}.NS" if "." not in symbol else symbol)
        df     = ticker.history(period=period, interval="1d")
        if df.empty:
            raise ValueError("Empty data")
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
        print(f"[Data] Loaded {len(candles)} real candles for {symbol}")
        return candles
    except Exception as e:
        print(f"[Data] Using synthetic candles ({e})")
        import random; random.seed(42)
        candles, price = [], 1500.0
        from datetime import datetime, timedelta
        for i in range(250):
            o = price
            c = price + random.gauss(0, price * 0.012)
            h = max(o, c) * (1 + random.uniform(0, 0.004))
            l = min(o, c) * (1 - random.uniform(0, 0.004))
            candles.append(Candle(
                timestamp=str(datetime(2024, 1, 1) + timedelta(days=i)),
                open=round(o,2), high=round(h,2), low=round(l,2), close=round(c,2),
                volume=float(random.randint(1_000_000, 10_000_000))
            ))
            price = c
        return candles


if __name__ == "__main__":
    candles = load_candles("TCS", "1y")
    engine  = BacktestEngine(initial_capital=100_000, warm_up_period=50)

    print("\n" + "="*65)
    print("  Comparing: Base EMA  vs  MyEMAWithRSI  vs  SupertrendVWAP")
    print("="*65)

    strategies_to_test = [
        ("EMA",           strategy_registry.get("EMA")()),
        ("MyEMAWithRSI",  MyEMAWithRSI(params={"fast_period": 9, "slow_period": 21,
                                                "rsi_entry_min": 50, "stop_loss_pct": 2.0})),
        ("SupertrendVWAP", MySupertrendVWAP(params={"st_period": 10, "rsi_low": 40, "rsi_high": 65})),
        # Way 3: built-in RSI but with your stricter thresholds
        ("RSI(strict)",   strategy_registry.get("RSI")(params={"oversold": 25, "overbought": 75, "period": 9})),
    ]

    reports = []
    for label, instance in strategies_to_test:
        instance.name = label
        try:
            report = engine.run(instance, candles, symbol="TCS")
            reports.append(report)
        except Exception as e:
            print(f"[ERROR] {label}: {e}")

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
    print("\nDone! Edit params above and re-run to tune your conditions.")

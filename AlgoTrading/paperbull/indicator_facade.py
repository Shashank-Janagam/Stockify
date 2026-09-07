"""
indicator_facade.py — User-Friendly Indicator API
==================================================
Wraps the internal IndicatorEngine singleton to provide a scalar-returning,
symbol-aware interface.

Internal API (existing):
    indicator_engine.calculate("RSI", candles, period=14)  → list[float]

PaperBull-native API:
    self.indicator.RSI("RELIANCE", 14)   → float (latest value)
    self.indicator.EMA("RELIANCE", 50)   → float
    self.indicator.MACD("RELIANCE")      → MACDResult(macd, signal, histogram)
    self.indicator.BB("RELIANCE")        → BBResult(upper, middle, lower, bandwidth, pct_b)

The facade holds a reference to a candle registry ({symbol: list[Candle]})
that is updated by the Strategy adapter on every bar.

Strategies NEVER import IndicatorEngine directly.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, NamedTuple

if TYPE_CHECKING:
    from Algos.core.base_strategy import Candle

logger = logging.getLogger(__name__)


# ── Result Types ──────────────────────────────────────────────────────────────

class MACDResult(NamedTuple):
    macd      : float | None
    signal    : float | None
    histogram : float | None


class BBResult(NamedTuple):
    upper     : float | None
    middle    : float | None
    lower     : float | None
    bandwidth : float | None
    pct_b     : float | None


class SuperTrendResult(NamedTuple):
    supertrend  : float | None
    direction   : int   | None   # 1 = bullish, -1 = bearish
    upper_band  : float | None
    lower_band  : float | None


# ── IndicatorFacade ───────────────────────────────────────────────────────────

class IndicatorFacade:
    """
    User-facing indicator accessor.

    Usage
    -----
    # Inside Strategy.on_data():
    rsi   = self.indicator.RSI("RELIANCE.NS", 14)     # → float
    ema50 = self.indicator.EMA("RELIANCE.NS", 50)     # → float
    macd  = self.indicator.MACD("RELIANCE.NS")        # → MACDResult
    bb    = self.indicator.BB("RELIANCE.NS", 20, 2.0) # → BBResult
    """

    def __init__(self) -> None:
        # {symbol: list[Candle]} — updated per bar by the adapter
        self._candle_registry: dict[str, list] = {}

    # ── Internal: candle registry management ─────────────────────────────────

    def _set_candles(self, symbol: str, candles: list) -> None:
        """Called by the adapter to register candles before on_data()."""
        self._candle_registry[symbol] = candles

    def _get_candles(self, symbol: str) -> list:
        candles = self._candle_registry.get(symbol)
        if not candles:
            raise ValueError(
                f"[IndicatorFacade] No candle data found for '{symbol}'. "
                f"Make sure '{symbol}' is included in your universe."
            )
        return candles

    def _engine(self):
        """Lazy-import the internal IndicatorEngine singleton."""
        from Algos.indicators.indicator_engine import indicator_engine
        return indicator_engine

    def _last(self, series, fallback=None):
        """Extract the last finite value from a series, or fallback."""
        if not series:
            return fallback
        for v in reversed(series):
            if v is not None and v == v:  # not None, not NaN
                return v
        return fallback

    # ── Momentum ──────────────────────────────────────────────────────────────

    def RSI(self, symbol: str, period: int = 14) -> float | None:
        """
        Relative Strength Index.

        Returns
        -------
        float  Latest RSI value (0–100), or None if insufficient data.
        """
        candles = self._get_candles(symbol)
        series  = self._engine().calculate("RSI", candles, symbol=symbol, period=period)
        return self._last(series)

    def MACD(
        self,
        symbol      : str,
        fast        : int = 12,
        slow        : int = 26,
        signal_period: int = 9,
    ) -> MACDResult:
        """
        MACD — Moving Average Convergence Divergence.

        Returns
        -------
        MACDResult(macd, signal, histogram)
        """
        candles = self._get_candles(symbol)
        result  = self._engine().calculate(
            "MACD", candles, symbol=symbol,
            fast_period=fast, slow_period=slow, signal_period=signal_period,
        )
        if result is None:
            return MACDResult(None, None, None)
        # Internal MACD returns an object with .macd, .signal, .histogram series
        return MACDResult(
            macd      = self._last(getattr(result, "macd",      None)),
            signal    = self._last(getattr(result, "signal",    None)),
            histogram = self._last(getattr(result, "histogram", None)),
        )

    def ROC(self, symbol: str, period: int = 10) -> float | None:
        """Rate of Change (momentum %)."""
        candles = self._get_candles(symbol)
        closes  = [c.close for c in candles]
        if len(closes) < period + 1:
            return None
        past = closes[-(period + 1)]
        return (closes[-1] - past) / past * 100.0 if past else None

    def MOM(self, symbol: str, period: int = 10) -> float | None:
        """Absolute Momentum (close - close[period])."""
        candles = self._get_candles(symbol)
        closes  = [c.close for c in candles]
        if len(closes) < period + 1:
            return None
        return closes[-1] - closes[-(period + 1)]

    # ── Trend ─────────────────────────────────────────────────────────────────

    def EMA(self, symbol: str, period: int = 20) -> float | None:
        """Exponential Moving Average."""
        candles = self._get_candles(symbol)
        series  = self._engine().calculate("EMA", candles, symbol=symbol, period=period)
        return self._last(series)

    def SMA(self, symbol: str, period: int = 20) -> float | None:
        """Simple Moving Average."""
        candles = self._get_candles(symbol)
        series  = self._engine().calculate("SMA", candles, symbol=symbol, period=period)
        return self._last(series)

    def VWAP(self, symbol: str, reset_daily: bool = True) -> float | None:
        """Volume Weighted Average Price."""
        candles = self._get_candles(symbol)
        series  = self._engine().calculate("VWAP", candles, symbol=symbol, reset_daily=reset_daily)
        return self._last(series)

    def ADX(self, symbol: str, period: int = 14) -> float | None:
        """
        Average Directional Index (trend strength 0–100).
        Phase 1: computed from ATR as a proxy; full ADX in Phase 2.
        """
        atr = self.ATR(symbol, period)
        if atr is None:
            return None
        candles = self._get_candles(symbol)
        closes  = [c.close for c in candles]
        if not closes or closes[-1] == 0:
            return None
        # Simplified proxy: normalised ATR as trend-strength signal
        return min(100.0, (atr / closes[-1]) * 100.0 * 14)

    def SuperTrend(
        self,
        symbol     : str,
        period     : int   = 10,
        multiplier : float = 3.0,
    ) -> SuperTrendResult:
        """SuperTrend trend-follower."""
        candles = self._get_candles(symbol)
        result  = self._engine().calculate(
            "SuperTrend", candles, symbol=symbol, period=period, multiplier=multiplier
        )
        if result is None:
            return SuperTrendResult(None, None, None, None)
        return SuperTrendResult(
            supertrend = self._last(getattr(result, "supertrend", None)),
            direction  = self._last(getattr(result, "direction",  None)),
            upper_band = self._last(getattr(result, "upper_band", None)),
            lower_band = self._last(getattr(result, "lower_band", None)),
        )

    # ── Volatility ────────────────────────────────────────────────────────────

    def ATR(self, symbol: str, period: int = 14) -> float | None:
        """Average True Range."""
        candles = self._get_candles(symbol)
        series  = self._engine().calculate("ATR", candles, symbol=symbol, period=period)
        return self._last(series)

    def BB(
        self,
        symbol : str,
        period : int   = 20,
        std    : float = 2.0,
    ) -> BBResult:
        """
        Bollinger Bands.

        Returns
        -------
        BBResult(upper, middle, lower, bandwidth, pct_b)
        """
        candles = self._get_candles(symbol)
        result  = self._engine().calculate(
            "BollingerBands", candles, symbol=symbol, period=period, multiplier=std
        )
        if result is None:
            return BBResult(None, None, None, None, None)
        return BBResult(
            upper     = self._last(getattr(result, "upper",     None)),
            middle    = self._last(getattr(result, "middle",    None)),
            lower     = self._last(getattr(result, "lower",     None)),
            bandwidth = self._last(getattr(result, "bandwidth", None)),
            pct_b     = self._last(getattr(result, "percent_b", None)),
        )

    def STD(self, symbol: str, period: int = 20) -> float | None:
        """Rolling standard deviation of closes."""
        import statistics as _stats
        candles = self._get_candles(symbol)
        closes  = [c.close for c in candles]
        if len(closes) < period:
            return None
        window = closes[-period:]
        return _stats.stdev(window) if len(window) >= 2 else None

    # ── Volume ────────────────────────────────────────────────────────────────

    def OBV(self, symbol: str) -> float | None:
        """On-Balance Volume."""
        candles = self._get_candles(symbol)
        obv = 0.0
        for i in range(1, len(candles)):
            if candles[i].close > candles[i - 1].close:
                obv += candles[i].volume
            elif candles[i].close < candles[i - 1].close:
                obv -= candles[i].volume
        return obv if len(candles) > 1 else None

    def VolumeSMA(self, symbol: str, period: int = 20) -> float | None:
        """Volume Simple Moving Average."""
        candles = self._get_candles(symbol)
        series  = self._engine().calculate("VolumeSMA", candles, symbol=symbol, period=period)
        return self._last(series)

    # ── Custom ────────────────────────────────────────────────────────────────

    def custom(self, fn, symbol: str, window: int) -> float | None:
        """
        Apply a custom function to the trailing `window` candles.

        Parameters
        ----------
        fn     : callable(candles: list[Candle]) -> float
        symbol : stock symbol
        window : number of trailing candles to pass to fn

        Example
        -------
        hlc3 = self.indicator.custom(
            fn=lambda c: sum((x.high + x.low + x.close) / 3 for x in c) / len(c),
            symbol="RELIANCE.NS",
            window=14,
        )
        """
        candles = self._get_candles(symbol)
        if len(candles) < window:
            return None
        try:
            return float(fn(candles[-window:]))
        except Exception as exc:
            logger.error("[IndicatorFacade] custom() error: %s", exc)
            return None

    def __repr__(self) -> str:
        return f"<IndicatorFacade symbols={list(self._candle_registry.keys())}>"

"""
base_strategy.py
================
Abstract Base Class for all PaperBull trading strategies.

Every strategy MUST extend BaseStrategy and implement all abstract methods.
Strategies MUST NOT compute indicator math directly — they use IndicatorEngine.

SOLID Principles Applied
------------------------
S — Each method has exactly one responsibility.
O — Open for extension via subclassing; BaseStrategy itself is never modified.
L — Any BaseStrategy subclass can replace another without breaking the system.
I — Minimal required interface; optional hooks have default no-op implementations.
D — Depends on IndicatorEngine abstraction, never on concrete indicator classes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..indicators.indicator_engine import IndicatorEngine as IndicatorEngineType
    from .signal import Signal


# ── Candle TypedDict-style definition ─────────────────────────────────────────

from dataclasses import dataclass


@dataclass
class Candle:
    """
    OHLCV candle data structure.

    Attributes
    ----------
    timestamp : str   — ISO-8601 timestamp
    open      : float
    high      : float
    low       : float
    close     : float
    volume    : float
    """
    timestamp: str
    open     : float
    high     : float
    low      : float
    close    : float
    volume   : float = 0.0

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "open"     : self.open,
            "high"     : self.high,
            "low"      : self.low,
            "close"    : self.close,
            "volume"   : self.volume,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Candle":
        return cls(
            timestamp=str(d.get("timestamp", "")),
            open     =float(d.get("open",  0)),
            high     =float(d.get("high",  0)),
            low      =float(d.get("low",   0)),
            close    =float(d.get("close", 0)),
            volume   =float(d.get("volume", 0)),
        )


# ── BaseStrategy ──────────────────────────────────────────────────────────────

class BaseStrategy(ABC):
    """
    Abstract base class enforcing the strategy contract.

    Subclasses implement the abstract methods and use self.indicators
    (an IndicatorEngine instance) for all technical computations.

    Usage
    -----
    class MyStrategy(BaseStrategy):
        def initialize(self): ...
        def calculate_indicators(self, candles): ...
        def generate_entry_signal(self, candles, current_price): ...
        def generate_exit_signal(self, candles, current_price, position): ...
        def get_metadata(self): ...
    """

    def __init__(
        self,
        name: str | None = None,
        mode: str = "paper",
        params: dict | None = None,
    ) -> None:
        self.name   : str  = name or self.__class__.__name__
        self.mode   : str  = mode          # "paper" | "backtest" | "live"
        self.params : dict = params or {}

        # Lazy-imported to avoid circular dependencies at module load
        from ..indicators.indicator_engine import indicator_engine
        self.indicators = indicator_engine

        # Cache of computed indicator series: key → list[float]
        self._indicator_cache: dict[str, Any] = {}

        self._initialized: bool = False

    # ── Abstract Methods (MUST be implemented by every strategy) ──────────────

    @abstractmethod
    def initialize(self) -> None:
        """
        Called once before the strategy begins processing candles.

        Responsibility: Validate params, set defaults, pre-warm any state.
        Must NOT compute indicators here — candles are not yet available.
        """

    @abstractmethod
    def calculate_indicators(self, candles: list[Candle]) -> None:
        """
        Compute all indicator series required by this strategy.

        Responsibility: Call self.indicators.calculate(...) for each needed
        indicator and store results in self._indicator_cache. Must be idempotent
        and called before signal generation on every new candle batch.

        Args:
            candles: Full historical candle list up to current bar.
        """

    @abstractmethod
    def generate_entry_signal(
        self,
        candles: list[Candle],
        current_price: float,
    ) -> "Signal":
        """
        Evaluate entry conditions and return BUY or HOLD signal.

        Responsibility: Use self._indicator_cache values (never recompute
        indicators here), evaluate via ConditionEngine, return a Signal.

        Args:
            candles      : Full candle series.
            current_price: Latest traded price.

        Returns:
            Signal with type BUY or HOLD.
        """

    @abstractmethod
    def generate_exit_signal(
        self,
        candles: list[Candle],
        current_price: float,
        position: dict | None = None,
    ) -> "Signal":
        """
        Evaluate exit conditions and return SELL or HOLD signal.

        Responsibility: Only called when a position is open. Must decide
        whether to exit based on indicator state and position metadata.

        Args:
            candles      : Full candle series.
            current_price: Latest traded price.
            position     : Open position metadata (entry_price, qty, etc.).

        Returns:
            Signal with type SELL or HOLD.
        """

    @abstractmethod
    def get_metadata(self) -> dict:
        """
        Return strategy metadata for the registry and UI.

        Returns a dict with keys:
            name, description, version, author,
            indicators_used, best_for, risk_level
        """

    # ── Optional Lifecycle Hooks (may be overridden) ──────────────────────────

    def on_position_opened(self, trade: dict) -> None:
        """Hook: called when this strategy's signal opens a position."""

    def on_position_closed(self, trade: dict) -> None:
        """Hook: called when this strategy's signal closes a position."""

    def on_tick(self, tick: dict) -> None:
        """Hook: called on every live market tick (real-time mode only)."""

    # ── Shared Utility Helpers ────────────────────────────────────────────────

    def _get(self, key: str, n: int = 1) -> Any:
        """
        Safe accessor for cached indicator values.

        Args:
            key: Cache key used in calculate_indicators().
            n  : Number of trailing values to return.
                 n=1 returns a scalar; n>1 returns a list.

        Returns:
            Last n values from the cached series, or None if unavailable.
        """
        series = self._indicator_cache.get(key)
        if not series:
            return None if n == 1 else []
        finite = [v for v in series if v == v]  # filter NaN
        if not finite:
            return None if n == 1 else []
        return finite[-1] if n == 1 else finite[-n:]

    def _ensure_initialized(self) -> None:
        if not self._initialized:
            self.initialize()
            self._initialized = True

    def process(
        self,
        candles: list[Candle],
        current_price: float,
        position: dict | None = None,
    ) -> dict:
        """
        Full per-candle processing pipeline.

        Called by StrategyLifecycle — strategies should NOT override this.

        Returns:
            { "entry": Signal, "exit": Signal | None }
        """
        self._ensure_initialized()
        self.calculate_indicators(candles)

        entry = self.generate_entry_signal(candles, current_price)
        exit_ = (
            self.generate_exit_signal(candles, current_price, position)
            if position else None
        )
        return {"entry": entry, "exit": exit_}

    def __repr__(self) -> str:
        return f"<Strategy: {self.name} | mode={self.mode}>"

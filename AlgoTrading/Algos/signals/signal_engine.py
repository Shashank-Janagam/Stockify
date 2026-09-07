"""
signal_engine.py — Signal Factory / Resolver
=============================================
The SignalEngine is the translation layer between ConditionEngine verdicts
and typed Signal dataclass objects consumed by the RiskEngine.

It ensures every output from a strategy is a proper, validated Signal.
"""

from __future__ import annotations

from ..core.signal import Signal, SignalType, buy_signal, sell_signal, hold_signal
from ..conditions.condition_engine import ConditionResult


class SignalEngineClass:
    """
    Singleton factory for Signal objects.

    Usage
    -----
    from algos.signals.signal_engine import signal_engine

    signal = signal_engine.resolve_entry(
        result=condition_result,
        symbol="RELIANCE",
        instrument_key="NSE_EQ|INE002A01018",
        price=2450.0,
        strategy_name="EMAStrategy",
    )
    """

    # ── Direct Signal Factories ───────────────────────────────────────────────

    def buy(
        self,
        symbol: str,
        instrument_key: str,
        price: float,
        strategy_name: str,
        reason: str,
        confidence: float = 0.75,
        meta: dict | None = None,
    ) -> Signal:
        """Create a BUY signal."""
        return buy_signal(symbol, instrument_key, price, strategy_name, reason, confidence, meta)

    def sell(
        self,
        symbol: str,
        instrument_key: str,
        price: float,
        strategy_name: str,
        reason: str,
        confidence: float = 0.75,
        meta: dict | None = None,
    ) -> Signal:
        """Create a SELL signal."""
        return sell_signal(symbol, instrument_key, price, strategy_name, reason, confidence, meta)

    def hold(
        self,
        symbol: str,
        instrument_key: str,
        price: float,
        strategy_name: str,
        reason: str = "No signal conditions met",
        meta: dict | None = None,
    ) -> Signal:
        """Create a HOLD signal."""
        return hold_signal(symbol, instrument_key, price, strategy_name, reason, meta)

    # ── Condition-Result Resolvers ─────────────────────────────────────────────

    def resolve_entry(
        self,
        result       : ConditionResult,
        symbol       : str,
        instrument_key: str,
        price        : float,
        strategy_name: str,
        confidence   : float = 0.75,
        meta         : dict | None = None,
    ) -> Signal:
        """
        Map an entry ConditionResult → BUY or HOLD Signal.

        Parameters
        ----------
        result        : ConditionResult from ConditionEngine.evaluate()
        symbol        : Stock symbol
        instrument_key: Upstox instrument key
        price         : Current market price
        strategy_name : Strategy identifier
        confidence    : Signal confidence (0–1)
        meta          : Optional indicator snapshot for the signal

        Returns
        -------
        BUY Signal if result.met else HOLD Signal
        """
        if result.met:
            return self.buy(symbol, instrument_key, price, strategy_name,
                            result.reason, confidence, meta)
        return self.hold(symbol, instrument_key, price, strategy_name, result.reason, meta)

    def resolve_exit(
        self,
        result       : ConditionResult,
        symbol       : str,
        instrument_key: str,
        price        : float,
        strategy_name: str,
        confidence   : float = 0.75,
        meta         : dict | None = None,
    ) -> Signal:
        """
        Map an exit ConditionResult → SELL or HOLD Signal.
        """
        if result.met:
            return self.sell(symbol, instrument_key, price, strategy_name,
                             result.reason, confidence, meta)
        return self.hold(symbol, instrument_key, price, strategy_name, result.reason, meta)

    @staticmethod
    def is_actionable(signal: Signal) -> bool:
        """Returns True if the signal requires an order (BUY or SELL)."""
        return signal.type != SignalType.HOLD


# ── Singleton ─────────────────────────────────────────────────────────────────

signal_engine = SignalEngineClass()

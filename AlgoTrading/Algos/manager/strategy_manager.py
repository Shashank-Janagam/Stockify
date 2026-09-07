"""
strategy_manager.py — Strategy Orchestrator
============================================
The StrategyManager is the top-level coordinator for all strategy execution.

Responsibilities
----------------
1. Load strategies from the registry by name
2. Execute a single strategy or all loaded strategies against a candle batch
3. Switch the active strategy at runtime
4. Run multiple strategies simultaneously (parallel signals)
5. Pipe signals through the full lifecycle: Risk → Sizing → Execution

Usage
-----
    from algos.manager.strategy_manager import StrategyManager

    mgr = StrategyManager(capital=100_000)
    mgr.load("EMA", params={"fast_period": 9, "slow_period": 21})
    mgr.load("RSI")

    results = mgr.run_all(candles=candles, symbol="RELIANCE")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal, SignalType
from ..registry.strategy_registry import strategy_registry
from ..risk.risk_engine import RiskEngineClass, RiskConfig
from ..sizing.position_sizing_engine import PositionSizingEngineClass, SizingMode
from ..execution.execution_engine import ExecutionEngineClass, ExecutionMode, TradeReceipt

logger = logging.getLogger(__name__)


@dataclass
class RunResult:
    """Output of a single strategy run against a candle batch."""
    strategy_name  : str
    entry_signal   : Signal | None
    exit_signal    : Signal | None
    risk_approved  : bool
    trade_receipt  : TradeReceipt | None = None
    error          : str                  = ""


class StrategyManager:
    """
    Orchestrates one or more strategies end-to-end.

    Each StrategyManager instance owns its own RiskEngine, SizingEngine,
    and ExecutionEngine — making it safe to create multiple independent
    manager instances (e.g. one per user in paper trading mode).
    """

    def __init__(
        self,
        capital        : float       = 100_000.0,
        mode           : str         = "paper",
        risk_config    : RiskConfig | None = None,
        sizing_mode    : SizingMode  = SizingMode.PERCENT_EQUITY,
        sizing_kwargs  : dict | None = None,
        exec_mode      : ExecutionMode = ExecutionMode.PAPER,
    ) -> None:
        self.capital = capital
        self.mode    = mode

        # Loaded strategies: name → (strategy_instance, open_position | None)
        self._strategies: dict[str, dict] = {}
        self._active_name: str | None = None

        # Per-manager engines (isolated state)
        self._risk    = RiskEngineClass(risk_config or RiskConfig())
        self._sizing  = PositionSizingEngineClass(mode=sizing_mode, **(sizing_kwargs or {}))
        self._executor = ExecutionEngineClass(mode=exec_mode, initial_capital=capital)

        self._risk.initialize_session(capital=capital)

    # ── Load / Unload ─────────────────────────────────────────────────────────

    def load(self, name: str, params: dict | None = None) -> BaseStrategy:
        """
        Load a strategy from the registry by name.

        Parameters
        ----------
        name   : Registered strategy name (e.g. "EMA", "RSI")
        params : Optional strategy-specific parameters

        Returns
        -------
        The instantiated BaseStrategy
        """
        cls      = strategy_registry.get(name)
        instance = cls(params=params or {})
        self._strategies[name] = {"strategy": instance, "position": None}
        if self._active_name is None:
            self._active_name = name
        logger.info("[StrategyManager] Loaded: %s", name)
        print(f"[StrategyManager] [OK] Loaded strategy: {name}")
        return instance

    def unload(self, name: str) -> None:
        """Remove a loaded strategy."""
        if name in self._strategies:
            del self._strategies[name]
            if self._active_name == name:
                self._active_name = next(iter(self._strategies), None)
            logger.info("[StrategyManager] Unloaded: %s", name)

    def switch(self, name: str) -> None:
        """
        Switch the active strategy (for single-strategy mode).

        Parameters
        ----------
        name : Must already be loaded via .load()
        """
        if name not in self._strategies:
            raise KeyError(f"[StrategyManager] Strategy '{name}' is not loaded. Call .load() first.")
        self._active_name = name
        print(f"[StrategyManager] [SWITCH] Switched active strategy to: {name}")

    def loaded_strategies(self) -> list[str]:
        """Return names of all loaded strategies."""
        return list(self._strategies.keys())

    # ── Execution ─────────────────────────────────────────────────────────────

    def run(
        self,
        candles       : list[Candle],
        symbol        : str,
        instrument_key: str = "",
        strategy_name : str | None = None,
    ) -> RunResult:
        """
        Run a single strategy against the candle batch.

        Parameters
        ----------
        candles        : OHLCV candle list (oldest first)
        symbol         : Stock symbol
        instrument_key : Upstox instrument key
        strategy_name  : Name of strategy to run; defaults to active strategy

        Returns
        -------
        RunResult
        """
        name = strategy_name or self._active_name
        if not name or name not in self._strategies:
            raise ValueError(f"[StrategyManager] No strategy loaded or '{name}' not found.")

        state    = self._strategies[name]
        strategy = state["strategy"]
        position = state["position"]
        instr_key = instrument_key or symbol

        try:
            current_price = candles[-1].close
            result        = strategy.process(candles, current_price, position)
        except Exception as exc:
            logger.error("[StrategyManager] Strategy error for %s: %s", name, exc)
            return RunResult(strategy_name=name, entry_signal=None, exit_signal=None,
                             risk_approved=False, error=str(exc))

        entry = result.get("entry")
        exit_ = result.get("exit")

        # Pipe exit signal through risk + execution
        if position and exit_ and exit_.type == SignalType.SELL:
            risk = self._risk.evaluate(exit_)
            if risk.approved:
                receipt = self._executor.execute(exit_, qty=position["qty"])
                if receipt.success:
                    pnl = receipt.trade.get("pnl") or 0.0
                    self._risk.on_pnl_recorded(pnl)
                    self._risk.on_trade_executed(symbol=symbol, side="SELL",
                                                  qty=position["qty"], price=current_price)
                    strategy.on_position_closed(receipt.trade)
                    state["position"] = None
                    return RunResult(strategy_name=name, entry_signal=entry, exit_signal=exit_,
                                     risk_approved=True, trade_receipt=receipt)

        # Pipe entry signal through risk + sizing + execution
        if not position and entry and entry.type == SignalType.BUY:
            risk = self._risk.evaluate(entry)
            if risk.approved:
                max_cap = self._risk.get_position_limit()
                atr_series = strategy._indicator_cache.get("ATR", [])
                atr_val    = next(
                    (v for v in reversed(atr_series) if isinstance(v, float) and v == v), None
                )
                sizing = self._sizing.calculate(
                    capital=self._executor._cash, entry_price=current_price,
                    atr=atr_val, max_capital=max_cap,
                )
                if sizing.qty > 0:
                    receipt = self._executor.execute(entry, qty=sizing.qty)
                    if receipt.success:
                        self._risk.on_trade_executed(symbol=symbol, side="BUY",
                                                      qty=sizing.qty, price=current_price)
                        strategy.on_position_opened(receipt.trade)
                        state["position"] = {"qty": sizing.qty, "entry_price": current_price,
                                              "entry_time": candles[-1].timestamp}
                        return RunResult(strategy_name=name, entry_signal=entry, exit_signal=exit_,
                                         risk_approved=True, trade_receipt=receipt)

        return RunResult(strategy_name=name, entry_signal=entry, exit_signal=exit_,
                         risk_approved=False)

    def run_all(
        self,
        candles       : list[Candle],
        symbol        : str,
        instrument_key: str = "",
    ) -> list[RunResult]:
        """
        Run ALL loaded strategies simultaneously against the same candle batch.

        Returns
        -------
        List of RunResult — one per loaded strategy
        """
        return [
            self.run(candles, symbol, instrument_key, strategy_name=name)
            for name in self._strategies
        ]

    # ── Portfolio / State ─────────────────────────────────────────────────────

    def get_portfolio(self) -> dict:
        """Current portfolio state from the execution engine."""
        return self._executor.get_portfolio()

    def get_risk_state(self) -> dict:
        """Current risk engine state."""
        return self._risk.get_state()

    def get_trade_history(self) -> list[dict]:
        """All trades executed by this manager."""
        return self._executor.get_trade_history()

    def __repr__(self) -> str:
        return (
            f"<StrategyManager strategies={self.loaded_strategies()} "
            f"active={self._active_name} mode={self.mode}>"
        )

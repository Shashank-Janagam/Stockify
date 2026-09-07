"""
execution_engine.py — Paper Trading Execution
==============================================
Receives approved, sized orders and records them.

Design Pattern: Adapter Pattern
  - _execute_paper()  → current implementation (in-memory + optional DB)
  - _execute_live()   → stub for future Upstox Order API adapter
  Swapping live mode requires zero changes to any other framework component.

Maintains a live portfolio: cash balance + open positions + trade history.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from ..core.signal import Signal, SignalType

logger = logging.getLogger(__name__)


# ── Execution Mode ────────────────────────────────────────────────────────────

class ExecutionMode(str, Enum):
    PAPER    = "PAPER"
    BACKTEST = "BACKTEST"
    LIVE     = "LIVE"       # Requires broker adapter — not yet implemented


# ── Trade Receipt ─────────────────────────────────────────────────────────────

@dataclass
class TradeReceipt:
    success : bool
    trade   : dict | None = None
    reason  : str         = ""


# ── ExecutionEngine ───────────────────────────────────────────────────────────

class ExecutionEngineClass:
    """
    Paper/Backtest trade executor.

    Usage
    -----
    from algos.execution.execution_engine import ExecutionEngineClass

    engine = ExecutionEngineClass(mode=ExecutionMode.PAPER, initial_capital=100_000)
    receipt = await engine.execute(signal=signal, qty=10)
    """

    def __init__(
        self,
        mode            : ExecutionMode = ExecutionMode.PAPER,
        initial_capital : float         = 100_000.0,
        db              : Any           = None,  # Optional asyncpg/psycopg2 pool
    ) -> None:
        self.mode            = mode
        self.initial_capital = initial_capital
        self._db             = db

        self._cash       : float                         = initial_capital
        self._positions  : dict[str, dict]               = {}
        self._trades     : list[dict]                    = []
        self._trade_counter: int                         = 1

    # ── Core Execution ────────────────────────────────────────────────────────

    def execute(self, signal: Signal, qty: int, user_id: str = "paper_user") -> TradeReceipt:
        """
        Execute an order synchronously.

        Parameters
        ----------
        signal  : Approved Signal (BUY or SELL)
        qty     : Number of shares to trade
        user_id : User identifier (for trade record)

        Returns
        -------
        TradeReceipt with success flag and trade metadata.
        """
        if signal is None or qty <= 0:
            return TradeReceipt(success=False, reason="Invalid order: no signal or qty <= 0")

        if self.mode in (ExecutionMode.PAPER, ExecutionMode.BACKTEST):
            return self._execute_paper(signal, qty, user_id)

        if self.mode == ExecutionMode.LIVE:
            return self._execute_live(signal, qty, user_id)

        return TradeReceipt(success=False, reason=f"Unknown mode: {self.mode}")

    # ── Paper Execution ───────────────────────────────────────────────────────

    def _execute_paper(self, signal: Signal, qty: int, user_id: str) -> TradeReceipt:
        symbol = signal.symbol
        price  = signal.price

        if signal.type == SignalType.BUY:
            cost = qty * price
            if cost > self._cash:
                return TradeReceipt(
                    success=False,
                    reason=f"Insufficient cash: need ₹{cost:.2f}, have ₹{self._cash:.2f}",
                )
            self._cash -= cost
            self._positions[symbol] = {
                "symbol"        : symbol,
                "instrument_key": signal.instrument_key,
                "qty"           : qty,
                "entry_price"   : price,
                "entry_time"    : signal.timestamp,
                "strategy_name" : signal.strategy_name,
            }
            return self._record_trade(signal, qty, pnl=None, user_id=user_id)

        if signal.type == SignalType.SELL:
            pos = self._positions.get(symbol)
            if not pos:
                return TradeReceipt(
                    success=False,
                    reason=f"No open position to sell for {symbol}",
                )
            sell_qty = min(qty, pos["qty"])
            proceeds = sell_qty * price
            pnl      = (price - pos["entry_price"]) * sell_qty
            self._cash += proceeds

            if sell_qty >= pos["qty"]:
                del self._positions[symbol]
            else:
                pos["qty"] -= sell_qty

            return self._record_trade(signal, sell_qty, pnl=round(pnl, 2), user_id=user_id)

        return TradeReceipt(success=False, reason=f"Cannot execute HOLD signal.")

    # ── Live Execution Stub ───────────────────────────────────────────────────

    def _execute_live(self, signal: Signal, qty: int, user_id: str) -> TradeReceipt:
        """Stub — plug Upstox Order API here when ready for live trading."""
        raise NotImplementedError(
            "[ExecutionEngine] Live execution not implemented. "
            "Plug a broker API adapter into _execute_live()."
        )

    # ── Record Trade ──────────────────────────────────────────────────────────

    def _record_trade(self, signal: Signal, qty: int, pnl: float | None, user_id: str) -> TradeReceipt:
        sig_type_str = signal.type.value if hasattr(signal.type, "value") else str(signal.type)
        mode_str = self.mode.value if hasattr(self.mode, "value") else str(self.mode)
        trade = {
            "id"            : self._trade_counter,
            "type"          : sig_type_str,
            "symbol"        : signal.symbol,
            "instrument_key": signal.instrument_key,
            "qty"           : qty,
            "price"         : signal.price,
            "value"         : round(qty * signal.price, 2),
            "pnl"           : pnl,
            "strategy_name" : signal.strategy_name,
            "reason"        : signal.reason,
            "user_id"       : user_id,
            "executed_at"   : datetime.now(timezone.utc).isoformat(),
            "mode"          : mode_str,
            "status"        : "EXECUTED",
        }
        self._trades.append(trade)
        self._trade_counter += 1

        pnl_str = f" | PnL: Rs.{pnl:.2f}" if pnl is not None else ""
        side_tag = "[BUY] " if sig_type_str == "BUY" else "[SELL]"
        print(f"{side_tag} {sig_type_str} {qty}x {signal.symbol} @ Rs.{signal.price:.2f}{pnl_str}")
        return TradeReceipt(success=True, trade=trade)

    # ── Portfolio Accessors ───────────────────────────────────────────────────

    def get_portfolio(self) -> dict:
        """Returns current portfolio snapshot."""
        positions_value = sum(
            p["qty"] * p["entry_price"] for p in self._positions.values()
        )
        return {
            "cash"           : round(self._cash, 2),
            "positions"      : dict(self._positions),
            "positions_value": round(positions_value, 2),
            "total_value"    : round(self._cash + positions_value, 2),
            "trades_count"   : len(self._trades),
        }

    def get_trade_history(self) -> list[dict]:
        """Returns a copy of the full trade history."""
        return list(self._trades)

    def reset(self) -> None:
        """Reset engine state for a new backtest run."""
        self._cash           = self.initial_capital
        self._positions      = {}
        self._trades         = []
        self._trade_counter  = 1

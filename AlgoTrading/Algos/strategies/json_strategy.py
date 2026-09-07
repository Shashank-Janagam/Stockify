"""
json_strategy.py — Dynamic 9-Stage Institutional Strategy
==========================================================
Allows end-users to build their own strategies using a JSON configuration or UI studio,
without writing any Python code.

Supports all 9 Institutional Stages:
1. Universe (Symbols / Baskets)
2. Timeframe (Interval & Historical Period)
3. Indicators (Built-ins, Formulas & Dynamic Variable Dependency Graph)
4. Trend Filter (Macro Regime filter e.g. Price > EMA200)
5. Entry Rules (Condition trees with AND, OR, NOT, AT_LEAST)
6. Exit Rules (Technical Invalidation & Condition trees)
7. Position Sizing (Fixed Quantity, % Equity, ATR Volatility Risk)
8. Risk Management (Stop Loss, Take Profit, Trailing Stop, Breakeven Stop)
9. Portfolio Guardrails (Max Positions, Re-entry Cooldown, Time Window 09:30-15:00)
"""

from __future__ import annotations
import os
import json
import logging
from typing import Any

from ..core.base_strategy import BaseStrategy, Candle
from ..core.signal import Signal
from ..conditions.comparators import (
    GreaterThan, LessThan, Equal, CrossAbove, CrossBelow, Between, AtOrAbove, AtOrBelow
)
from ..conditions.condition_engine import ConditionResult
from ..signals.signal_engine import signal_engine
from ..registry.strategy_registry import strategy_registry

logger = logging.getLogger(__name__)

COMPARATORS = {
    "GreaterThan": GreaterThan,
    "LessThan": LessThan,
    "Equal": Equal,
    "CrossAbove": CrossAbove,
    "CrossBelow": CrossBelow,
    "Between": Between,
    "AtOrAbove": AtOrAbove,
    "AtOrBelow": AtOrBelow,
}

LOGICAL = ["AND", "OR", "NOT", "AT_LEAST"]


class JsonStrategy(BaseStrategy):
    """
    A strategy that dynamically builds itself from a JSON configuration
    or dictionary passed directly in memory.
    """

    def initialize(self) -> None:
        config_data = self.params.get("strategy_config") or self.params.get("config", {})
        
        # Load from file if string is passed
        if isinstance(config_data, str):
            if config_data.strip().startswith("{"):
                try:
                    self.config = json.loads(config_data)
                except Exception as e:
                    logger.error(f"[JsonStrategy] Failed to parse config JSON string: {e}")
                    self.config = {}
            elif os.path.exists(config_data):
                try:
                    with open(config_data, 'r') as f:
                        self.config = json.load(f)
                except Exception as e:
                    logger.error(f"[JsonStrategy] Failed to load JSON file {config_data}: {e}")
                    self.config = {}
            else:
                try:
                    self.config = json.loads(config_data)
                except Exception:
                    self.config = {}
        elif isinstance(config_data, dict):
            self.config = config_data
        else:
            self.config = {}
            
        self.name = self.config.get("strategy_name") or self.config.get("name", "CustomUserStrategy")
        self._highest_price_in_trade = 0.0
        self._last_exit_candle_index = -999
        self._breakeven_activated = False

    def calculate_indicators(self, candles: list[Candle]) -> None:
        if not hasattr(self, "config"):
            self.initialize()
        # Dynamically compute all indicators requested in the strategy
        for ind in self.config.get("indicators", []):
            name   = ind.get("name", "Formula")
            key    = ind.get("key") or ind.get("name")
            params = ind.get("params", {}).copy()
            
            # If user provided top-level formula
            if "formula" in ind and "formula" not in params:
                name = "Formula"
                params["formula"] = ind["formula"]
            
            # Using IndicatorEngine to calculate and cache
            self._indicator_cache[key] = self.indicators.calculate(name, candles, **params)

    def _resolve_arg(self, arg: Any, candles: list[Candle]) -> Any:
        """Resolve a string argument to its actual series (prices or indicator output)."""
        if isinstance(arg, str):
            lower = arg.lower()
            if lower == "close":
                return [c.close for c in candles]
            elif lower == "open":
                return [c.open for c in candles]
            elif lower == "high":
                return [c.high for c in candles]
            elif lower == "low":
                return [c.low for c in candles]
            elif lower == "volume":
                return [c.volume for c in candles]
            elif lower in ["typical_price", "hlc3"]:
                return [(c.high + c.low + c.close) / 3.0 for c in candles]
            elif lower == "hl2":
                return [(c.high + c.low) / 2.0 for c in candles]
            elif arg in self._indicator_cache:
                return self._indicator_cache[arg]
            elif "." in arg:
                base_key, attr = arg.split(".", 1)
                if base_key in self._indicator_cache:
                    obj = self._indicator_cache[base_key]
                    return getattr(obj, attr) if hasattr(obj, attr) else None
        
        # If it's a number (threshold) or list, return directly
        return arg

    def _evaluate_rule(self, rule: dict | None, candles: list[Candle]) -> bool:
        """Recursively evaluate a condition rule tree."""
        if not rule:
            return False
            
        rtype = rule.get("type")
        
        if rtype in LOGICAL:
            if rtype == "AND":
                return all(self._evaluate_rule(c, candles) for c in rule.get("conditions", []))
            elif rtype == "OR":
                return any(self._evaluate_rule(c, candles) for c in rule.get("conditions", []))
            elif rtype == "NOT":
                cond = rule.get("condition") or (rule.get("conditions", [])[0] if rule.get("conditions") else None)
                return not self._evaluate_rule(cond, candles)
            elif rtype == "AT_LEAST":
                n = rule.get("n", 1)
                count = sum(1 for c in rule.get("conditions", []) if self._evaluate_rule(c, candles))
                return count >= n
                
        elif rtype in COMPARATORS:
            comp = COMPARATORS[rtype]()
            args = [self._resolve_arg(a, candles) for a in rule.get("args", [])]
            return comp.evaluate(*args)
            
        return False

    def generate_entry_signal(self, candles: list[Candle], current_price: float) -> Signal:
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"
        curr_idx = len(candles)

        # 1. Portfolio Guardrails: Re-entry Cooldown Check
        guardrails = self.config.get("portfolio_guardrails", {})
        cooldown = int(guardrails.get("reentry_cooldown_bars", 0))
        if cooldown > 0 and (curr_idx - self._last_exit_candle_index) < cooldown:
            return signal_engine.resolve_entry(
                result=ConditionResult(met=False, reason=f"In cooldown period ({cooldown} bars)"),
                symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
            )

        # 2. Portfolio Guardrails: Trading Time Window Check
        if candles and ("trade_window_start" in guardrails or "trade_window_end" in guardrails):
            ts = getattr(candles[-1], "timestamp", "")
            if " " in ts:
                time_part = ts.split(" ")[1][:5]
                start_w = guardrails.get("trade_window_start", "09:15")
                end_w = guardrails.get("trade_window_end", "15:30")
                if time_part < start_w or time_part > end_w:
                    return signal_engine.resolve_entry(
                        result=ConditionResult(met=False, reason=f"Outside trading window ({start_w}-{end_w})"),
                        symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                    )

        # 3. Macro Trend Filter Check
        trend_filter = self.config.get("trend_filter")
        if trend_filter and isinstance(trend_filter, dict) and trend_filter.get("enabled", True) and trend_filter.get("type"):
            trend_ok = self._evaluate_rule(trend_filter, candles)
            if not trend_ok:
                return signal_engine.resolve_entry(
                    result=ConditionResult(met=False, reason="Trend filter condition not satisfied"),
                    symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                )

        # 4. Entry Trigger Evaluation
        rule = self.config.get("entry_rules") or self.config.get("entry")
        met  = self._evaluate_rule(rule, candles)
        
        if met:
            self._highest_price_in_trade = current_price
            self._breakeven_activated = False

        result = ConditionResult(
            met=met, 
            reason="Custom entry conditions met" if met else "Waiting for entry conditions"
        )
        return signal_engine.resolve_entry(
            result=result, symbol=symbol, instrument_key=symbol, 
            price=current_price, strategy_name=self.name
        )

    def generate_exit_signal(self, candles: list[Candle], current_price: float, position=None) -> Signal:
        symbol = getattr(candles[-1], "symbol", "UNKNOWN") if candles else "UNKNOWN"
        curr_idx = len(candles)
        
        # 1. Intraday Session Square-off Check (Disabled by default unless explicitly set)
        guardrails = self.config.get("portfolio_guardrails", {})
        sq_time = guardrails.get("intraday_square_off")
        if sq_time and str(sq_time).strip().lower() not in ["", "none", "disabled", "off", "false", "null"] and candles:
            ts = getattr(candles[-1], "timestamp", "")
            # Only apply square-off if candle contains a real intraday time component (not daily/weekly date-only or midnight)
            if " " in ts:
                time_part = ts.split(" ")[1][:5]
                # Avoid triggering on 00:00 or daily bar timestamps
                if time_part not in ["00:00", ""] and time_part >= str(sq_time).strip():
                    self._last_exit_candle_index = curr_idx
                    return signal_engine.resolve_exit(
                        result=ConditionResult(met=True, reason=f"Intraday square-off reached ({sq_time})"),
                        symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                    )

        # 2. Risk Management & Protective Stops
        risk_mgmt = self.config.get("risk_management", {})
        sl_config = self.config.get("stop_loss") or risk_mgmt.get("stop_loss") or self.config.get("stop_loss_pct")
        
        if position and position.get("entry_price"):
            entry_price = position["entry_price"]
            self._highest_price_in_trade = max(self._highest_price_in_trade, current_price)
            gain_pct = (current_price - entry_price) / entry_price * 100

            # Breakeven Stop Trigger Check
            be_pct = float(risk_mgmt.get("breakeven_trigger_pct", 0))
            if be_pct > 0 and gain_pct >= be_pct:
                self._breakeven_activated = True

            if self._breakeven_activated and current_price < entry_price:
                self._last_exit_candle_index = curr_idx
                return signal_engine.resolve_exit(
                    result=ConditionResult(met=True, reason="Breakeven stop triggered (Capital Protected)"), 
                    symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                )

            # Trailing Stop Check
            trailing_cfg = risk_mgmt.get("trailing_stop", {})
            trailing_pct = trailing_cfg.get("trail_pct") or self.config.get("trailing_stop_pct")
            if (trailing_cfg.get("enabled") or self.config.get("trailing_stop_pct")) and trailing_pct:
                trail_val = float(trailing_pct)
                if self._highest_price_in_trade > 0:
                    drop_from_peak = (self._highest_price_in_trade - current_price) / self._highest_price_in_trade * 100
                    if drop_from_peak >= trail_val:
                        self._last_exit_candle_index = curr_idx
                        return signal_engine.resolve_exit(
                            result=ConditionResult(met=True, reason=f"Trailing stop triggered (-{trail_val:.1f}% from peak)"), 
                            symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                        )

            # Stop Loss Evaluation
            if sl_config:
                if isinstance(sl_config, dict):
                    sl_type = sl_config.get("type", "FIXED_PCT").upper()
                    if sl_type == "FIXED_PCT" and "value" in sl_config:
                        pct = float(sl_config["value"])
                        pct_drop = (entry_price - current_price) / entry_price * 100
                        if pct_drop >= pct:
                            self._last_exit_candle_index = curr_idx
                            return signal_engine.resolve_exit(
                                result=ConditionResult(met=True, reason=f"Stop loss triggered (-{pct:.1f}%)"), 
                                symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                            )
                    elif sl_type == "TRAILING_PCT":
                        trail_pct = float(sl_config.get("trail_step_pct") or sl_config.get("value") or 1.5)
                        if self._highest_price_in_trade > 0:
                            drop_from_peak = (self._highest_price_in_trade - current_price) / self._highest_price_in_trade * 100
                            if drop_from_peak >= trail_pct:
                                self._last_exit_candle_index = curr_idx
                                return signal_engine.resolve_exit(
                                    result=ConditionResult(met=True, reason=f"Trailing stop triggered (-{trail_pct:.1f}% from peak)"), 
                                    symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                                )
                    elif sl_type == "ATR_MULTIPLIER":
                        multiplier = float(sl_config.get("multiplier", 1.5))
                        atr_series = self._indicator_cache.get("atr_14") or self._indicator_cache.get("ATR")
                        atr_val = atr_series[-1] if atr_series else (entry_price * 0.015)
                        sl_dist = atr_val * multiplier
                        if (entry_price - current_price) >= sl_dist:
                            self._last_exit_candle_index = curr_idx
                            return signal_engine.resolve_exit(
                                result=ConditionResult(met=True, reason=f"ATR Stop loss triggered ({multiplier}x ATR: -Rs.{sl_dist:.2f})"), 
                                symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                            )
                elif isinstance(sl_config, (int, float)):
                    pct_drop = (entry_price - current_price) / entry_price * 100
                    if pct_drop >= float(sl_config):
                        self._last_exit_candle_index = curr_idx
                        return signal_engine.resolve_exit(
                            result=ConditionResult(met=True, reason=f"Stop loss triggered (-{sl_config}%)"), 
                            symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                        )

            # Take Profit Evaluation
            tp_config = self.config.get("take_profit") or risk_mgmt.get("take_profit") or self.config.get("take_profit_pct")
            if tp_config:
                if isinstance(tp_config, dict):
                    tp_type = tp_config.get("type", "FIXED_PCT").upper()
                    if tp_type == "FIXED_PCT" and "value" in tp_config:
                        pct = float(tp_config["value"])
                        if gain_pct >= pct:
                            self._last_exit_candle_index = curr_idx
                            return signal_engine.resolve_exit(
                                result=ConditionResult(met=True, reason=f"Take profit triggered (+{pct:.1f}%)"), 
                                symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                            )
                    elif tp_type in ["RISK_REWARD", "RISK_REWARD_RATIO"]:
                        ratio = float(tp_config.get("ratio", 2.0))
                        sl_val = 1.5
                        if isinstance(sl_config, dict):
                            sl_val = float(sl_config.get("value", 1.5))
                        elif isinstance(sl_config, (int, float)):
                            sl_val = float(sl_config)
                        target_pct = sl_val * ratio
                        if gain_pct >= target_pct:
                            self._last_exit_candle_index = curr_idx
                            return signal_engine.resolve_exit(
                                result=ConditionResult(met=True, reason=f"Take profit (R:R 1:{ratio} -> +{target_pct:.1f}%) triggered"), 
                                symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                            )
                elif isinstance(tp_config, (int, float)):
                    if gain_pct >= float(tp_config):
                        self._last_exit_candle_index = curr_idx
                        return signal_engine.resolve_exit(
                            result=ConditionResult(met=True, reason=f"Take profit triggered (+{tp_config}%)"), 
                            symbol=symbol, instrument_key=symbol, price=current_price, strategy_name=self.name
                        )

        # 3. Technical Indicator-based Exit Condition Tree
        rule = self.config.get("exit_rules") or self.config.get("exit")
        met  = self._evaluate_rule(rule, candles)
        if met:
            self._last_exit_candle_index = curr_idx

        result = ConditionResult(
            met=met, 
            reason="Technical exit condition triggered" if met else "Holding position"
        )
        return signal_engine.resolve_exit(
            result=result, symbol=symbol, instrument_key=symbol, 
            price=current_price, strategy_name=self.name
        )
        
    def get_metadata(self) -> dict:
        return {
            "name"                : self.name,
            "description"         : self.config.get("description", "User-defined custom strategy"),
            "version"             : "2.5",
            "author"              : "User",
            "universe"            : self.config.get("universe", {}),
            "timeframe"           : self.config.get("timeframe", {}),
            "trend_filter"        : self.config.get("trend_filter", {}),
            "indicators_used"     : [ind.get("name", "Formula") for ind in self.config.get("indicators", [])],
            "position_sizing"     : self.config.get("position_sizing", {}),
            "risk_management"     : self.config.get("risk_management", {}),
            "portfolio_guardrails": self.config.get("portfolio_guardrails", {}),
        }


# ── Self-Registration ─────────────────────────────────────────────────────────
strategy_registry.register("JsonStrategy", JsonStrategy)
strategy_registry.register("CustomStrategy", JsonStrategy)

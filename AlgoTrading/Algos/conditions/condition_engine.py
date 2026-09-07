"""
condition_engine.py — Condition Tree Evaluator
================================================
The ConditionEngine bridges raw indicator data and the SignalEngine.

It accepts any Condition (atomic or composite rule tree) and evaluates it,
returning a structured ConditionResult with a boolean verdict and a
human-readable explanation for logging and UI display.

Usage
-----
    result = condition_engine.evaluate(my_rule, *args, label="EMA Cross")
    if result.met:
        signal = signal_engine.buy(...)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from .comparators import Condition

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ConditionResult:
    """Result of a condition evaluation."""
    met   : bool
    reason: str
    label : str = ""


class ConditionEngineClass:
    """
    Singleton evaluator for Condition objects.

    Methods
    -------
    evaluate(condition, *args, label)  → ConditionResult
    evaluate_all(rules)                → ConditionResult  (AND semantics)
    evaluate_any(rules)                → ConditionResult  (OR semantics)
    check(condition, *args)            → bool             (inline shorthand)
    """

    def evaluate(
        self,
        condition: Condition,
        *args   : Any,
        label   : str = "condition",
    ) -> ConditionResult:
        """
        Evaluate a single condition (atomic or composite).

        Parameters
        ----------
        condition : Any Condition instance (GreaterThan, AND, OR, etc.)
        *args     : Arguments forwarded to condition.evaluate()
        label     : Human-readable name for logging

        Returns
        -------
        ConditionResult
        """
        if not isinstance(condition, Condition):
            raise TypeError(
                f"[ConditionEngine] Expected a Condition instance, got {type(condition).__name__}"
            )
        try:
            met    = bool(condition.evaluate(*args))
            reason = f"✅ {label} met" if met else f"❌ {label} not met"
            return ConditionResult(met=met, reason=reason, label=label)
        except Exception as exc:
            logger.error("[ConditionEngine] Error evaluating '%s': %s", label, exc)
            return ConditionResult(
                met=False,
                reason=f"⚠️ {label} errored: {exc}",
                label=label,
            )

    def evaluate_all(
        self,
        rules: list[dict],
    ) -> ConditionResult:
        """
        Evaluate multiple named rules with AND semantics.
        ALL rules must pass for the combined result to be met=True.

        Parameters
        ----------
        rules : list of dicts, each with keys:
                  "condition": Condition instance
                  "args"     : list of arguments for condition.evaluate()
                  "label"    : (optional) human-readable name

        Returns
        -------
        ConditionResult with combined met, reason
        """
        results = [
            self.evaluate(r["condition"], *r.get("args", []), label=r.get("label", "rule"))
            for r in rules
        ]
        all_met = all(r.met for r in results)
        reason  = " AND ".join(r.reason for r in results)
        return ConditionResult(met=all_met, reason=reason)

    def evaluate_any(
        self,
        rules: list[dict],
    ) -> ConditionResult:
        """
        Evaluate multiple named rules with OR semantics.
        ANY rule passing makes the combined result met=True.
        """
        results = [
            self.evaluate(r["condition"], *r.get("args", []), label=r.get("label", "rule"))
            for r in rules
        ]
        any_met = any(r.met for r in results)
        reason  = " OR ".join(r.reason for r in results)
        return ConditionResult(met=any_met, reason=reason)

    def check(self, condition: Condition, *args: Any) -> bool:
        """
        Inline boolean check — a shorthand for one-liners inside strategy methods.

        Parameters
        ----------
        condition : Condition instance
        *args     : Arguments for condition.evaluate()

        Returns
        -------
        bool
        """
        return bool(condition.evaluate(*args))


# ── Singleton ─────────────────────────────────────────────────────────────────

condition_engine = ConditionEngineClass()

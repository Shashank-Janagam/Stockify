"""
logical_operators.py — Composable Logical Operators
====================================================
Design Pattern: Composite Pattern

Logical operators accept other Condition objects (atomic or composite)
enabling arbitrarily deep rule trees:

    entry_rule = AND([
        OR([CrossAbove(), strong_rsi]),
        NOT(overbought),
    ])
    entry_rule.evaluate(*args)  →  bool

All operators implement the same Condition interface as atomic comparators,
making them fully interchangeable and composable.
"""

from __future__ import annotations
from .comparators import Condition


# ── AND ───────────────────────────────────────────────────────────────────────

class AND(Condition):
    """
    Returns True only if ALL child conditions return True.

    Parameters
    ----------
    conditions : list of Condition — must be non-empty
    """
    def __init__(self, conditions: list[Condition]) -> None:
        if not conditions:
            raise ValueError("[AND] Must receive a non-empty list of conditions.")
        self.conditions = conditions

    def evaluate(self, *args) -> bool:
        return all(cond.evaluate(*args) for cond in self.conditions)


# ── OR ────────────────────────────────────────────────────────────────────────

class OR(Condition):
    """
    Returns True if ANY child condition returns True.

    Parameters
    ----------
    conditions : list of Condition — must be non-empty
    """
    def __init__(self, conditions: list[Condition]) -> None:
        if not conditions:
            raise ValueError("[OR] Must receive a non-empty list of conditions.")
        self.conditions = conditions

    def evaluate(self, *args) -> bool:
        return any(cond.evaluate(*args) for cond in self.conditions)


# ── NOT ───────────────────────────────────────────────────────────────────────

class NOT(Condition):
    """
    Negates a single condition.

    Parameters
    ----------
    condition : Condition — a single condition to negate
    """
    def __init__(self, condition: Condition) -> None:
        if not isinstance(condition, Condition):
            raise TypeError("[NOT] Must receive a Condition instance.")
        self.condition = condition

    def evaluate(self, *args) -> bool:
        return not self.condition.evaluate(*args)


# ── AT_LEAST ──────────────────────────────────────────────────────────────────

class AT_LEAST(Condition):
    """
    Returns True if at least N child conditions return True.

    Useful for confluence / scoring-style rules:
    e.g. "3 out of 5 technical signals must align".

    Parameters
    ----------
    n          : Minimum number of conditions that must pass
    conditions : list of Condition
    """
    def __init__(self, n: int, conditions: list[Condition]) -> None:
        if not (1 <= n <= len(conditions)):
            raise ValueError(
                f"[AT_LEAST] n ({n}) must be between 1 and "
                f"len(conditions) ({len(conditions)})."
            )
        self.n          = n
        self.conditions = conditions

    def evaluate(self, *args) -> bool:
        count = 0
        for cond in self.conditions:
            if cond.evaluate(*args):
                count += 1
                if count >= self.n:
                    return True
        return False

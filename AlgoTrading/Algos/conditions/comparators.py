"""
comparators.py — Atomic Condition Classes
==========================================
Design Pattern: Strategy Pattern — each class is an interchangeable condition.

All comparators implement the Condition interface:
    evaluate(*series) → bool

series values are lists of floats from IndicatorEngine.
Helper methods extract the last/previous valid (non-NaN) values.
"""

from __future__ import annotations
import math
from abc import ABC, abstractmethod
from typing import Union

Number = Union[int, float, list]


# ── Base Condition Interface ──────────────────────────────────────────────────

class Condition(ABC):
    """Abstract base for all atomic and composite conditions."""

    @abstractmethod
    def evaluate(self, *args) -> bool:
        """Evaluate the condition and return True/False."""

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def last(v: Number) -> float:
        """Return the last finite (non-NaN) value from a series or scalar."""
        if isinstance(v, list):
            for x in reversed(v):
                if isinstance(x, (int, float)) and math.isfinite(x):
                    return float(x)
            return float("nan")
        return float(v) if isinstance(v, (int, float)) else float("nan")

    @staticmethod
    def prev(v: Number) -> float:
        """Return the second-to-last finite value (used for crossover detection)."""
        if isinstance(v, list):
            count = 0
            for x in reversed(v):
                if isinstance(x, (int, float)) and math.isfinite(x):
                    count += 1
                    if count == 2:
                        return float(x)
            return float("nan")
        return float("nan")


# ── Atomic Comparators ────────────────────────────────────────────────────────

class GreaterThan(Condition):
    """Evaluates: last(a) > last(b)."""
    def evaluate(self, a: Number, b: Number) -> bool:
        return self.last(a) > self.last(b)


class LessThan(Condition):
    """Evaluates: last(a) < last(b)."""
    def evaluate(self, a: Number, b: Number) -> bool:
        return self.last(a) < self.last(b)


class Equal(Condition):
    """Evaluates: |last(a) - last(b)| <= tolerance."""
    def __init__(self, tolerance: float = 0.0001) -> None:
        self.tolerance = tolerance

    def evaluate(self, a: Number, b: Number) -> bool:
        la, lb = self.last(a), self.last(b)
        if not (math.isfinite(la) and math.isfinite(lb)):
            return False
        return abs(la - lb) <= self.tolerance


class CrossAbove(Condition):
    """
    Evaluates golden-cross: series a crossed above series b on the last bar.
    Condition: prev(a) <= prev(b) AND last(a) > last(b)
    """
    def evaluate(self, a: Number, b: Number) -> bool:
        curr_a, prev_a = self.last(a), self.prev(a)
        curr_b, prev_b = self.last(b), self.prev(b)
        if not all(math.isfinite(x) for x in [curr_a, prev_a, curr_b, prev_b]):
            return False
        return prev_a <= prev_b and curr_a > curr_b


class CrossBelow(Condition):
    """
    Evaluates death-cross: series a crossed below series b on the last bar.
    Condition: prev(a) >= prev(b) AND last(a) < last(b)
    """
    def evaluate(self, a: Number, b: Number) -> bool:
        curr_a, prev_a = self.last(a), self.prev(a)
        curr_b, prev_b = self.last(b), self.prev(b)
        if not all(math.isfinite(x) for x in [curr_a, prev_a, curr_b, prev_b]):
            return False
        return prev_a >= prev_b and curr_a < curr_b


class Between(Condition):
    """Evaluates: last(lower) <= last(a) <= last(upper)."""
    def evaluate(self, a: Number, lower: Number, upper: Number) -> bool:
        val = self.last(a)
        return self.last(lower) <= val <= self.last(upper)


class AtOrAbove(Condition):
    """Evaluates: last(a) >= last(threshold)."""
    def evaluate(self, a: Number, threshold: Number) -> bool:
        return self.last(a) >= self.last(threshold)


class AtOrBelow(Condition):
    """Evaluates: last(a) <= last(threshold)."""
    def evaluate(self, a: Number, threshold: Number) -> bool:
        return self.last(a) <= self.last(threshold)


# ── Convenience Singletons ────────────────────────────────────────────────────
# Import these directly for one-liner use without `new`

greater_than = GreaterThan()
less_than    = LessThan()
equal        = Equal()
cross_above  = CrossAbove()
cross_below  = CrossBelow()
between      = Between()
at_or_above  = AtOrAbove()
at_or_below  = AtOrBelow()

"""
strategy_registry.py — Auto-Discovery Strategy Registry
========================================================
Design Pattern: Registry Pattern

Strategies self-register by calling StrategyRegistry.register() at the bottom
of their module. The registry holds name → class mappings and can instantiate
strategies on demand.

No central list needs to be maintained — adding a new strategy file is all
that's required to make it available via StrategyRegistry.get("MyStrategy").
"""

from __future__ import annotations

import importlib
import logging
import pkgutil
from pathlib import Path
from typing import Type

from ..core.base_strategy import BaseStrategy

logger = logging.getLogger(__name__)


class StrategyRegistryClass:
    """
    Singleton registry for all strategy classes.

    Usage
    -----
    from algos.registry.strategy_registry import strategy_registry

    strategy_registry.register("EMA", EMAStrategy)
    cls   = strategy_registry.get("EMA")
    names = strategy_registry.list_all()
    """

    def __init__(self) -> None:
        # name → strategy class
        self._registry: dict[str, Type[BaseStrategy]] = {}

    # ── Registration ──────────────────────────────────────────────────────────

    def register(self, name: str, strategy_class: Type[BaseStrategy]) -> None:
        """
        Register a strategy class under a given name.

        Parameters
        ----------
        name           : Unique strategy identifier (e.g. "EMA", "RSI")
        strategy_class : Class that extends BaseStrategy
        """
        if not (isinstance(strategy_class, type) and issubclass(strategy_class, BaseStrategy)):
            raise TypeError(
                f"[StrategyRegistry] '{name}' must be a class extending BaseStrategy."
            )
        if name in self._registry:
            logger.warning("[StrategyRegistry] Overwriting strategy: '%s'", name)
        self._registry[name] = strategy_class
        logger.debug("[StrategyRegistry] Registered: %s → %s", name, strategy_class.__name__)

    # ── Retrieval ─────────────────────────────────────────────────────────────

    def get(self, name: str) -> Type[BaseStrategy]:
        """
        Retrieve a strategy class by name.

        Parameters
        ----------
        name : Registered strategy name (case-sensitive)

        Raises
        ------
        KeyError if strategy is not registered.
        """
        if name not in self._registry:
            available = ", ".join(self.list_all())
            raise KeyError(
                f"[StrategyRegistry] Unknown strategy: '{name}'. "
                f"Available: {available}"
            )
        return self._registry[name]

    def instantiate(self, name: str, **kwargs) -> BaseStrategy:
        """
        Instantiate a strategy by name with optional config kwargs.

        Parameters
        ----------
        name     : Registered strategy name
        **kwargs : Passed to the strategy's __init__()

        Returns
        -------
        BaseStrategy instance
        """
        cls = self.get(name)
        return cls(**kwargs)

    def list_all(self) -> list[str]:
        """Return sorted list of all registered strategy names."""
        return sorted(self._registry.keys())

    def has(self, name: str) -> bool:
        """Check if a strategy is registered."""
        return name in self._registry

    # ── Auto-Discovery ────────────────────────────────────────────────────────

    def discover(self, strategies_package_path: str = None) -> None:
        """
        Auto-discovers and imports all modules in the strategies package.
        Importing a strategy module causes it to self-register via its
        `strategy_registry.register(...)` call at the bottom of the file.

        Parameters
        ----------
        strategies_package_path : Dotted import path (e.g. "algos.strategies").
                                  Defaults to the sibling strategies package.
        """
        pkg_path = strategies_package_path or "algos.strategies"
        try:
            pkg = importlib.import_module(pkg_path)
            pkg_dir = Path(pkg.__file__).parent
            for _, module_name, _ in pkgutil.iter_modules([str(pkg_dir)]):
                full_name = f"{pkg_path}.{module_name}"
                try:
                    importlib.import_module(full_name)
                    logger.debug("[StrategyRegistry] Auto-discovered: %s", full_name)
                except Exception as exc:
                    logger.error("[StrategyRegistry] Failed to import %s: %s", full_name, exc)
            print(f"[StrategyRegistry] [OK] Discovered {len(self._registry)} strategies: {self.list_all()}")
        except ModuleNotFoundError as exc:
            logger.error("[StrategyRegistry] Discovery failed: %s", exc)

    def __repr__(self) -> str:
        return f"<StrategyRegistry strategies={self.list_all()}>"


# ── Singleton ─────────────────────────────────────────────────────────────────

strategy_registry = StrategyRegistryClass()

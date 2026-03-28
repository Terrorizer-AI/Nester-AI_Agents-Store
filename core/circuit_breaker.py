"""
Circuit breakers — prevent cascading failures on external dependencies.

Three-state pattern:
  CLOSED  → calls pass through, failures tracked in 60s rolling window
  OPEN    → calls immediately rejected for 30s cooldown (no wasted retries)
  HALF_OPEN → one trial request allowed; success → CLOSED, failure → OPEN

One breaker per external dependency (LLM providers, MCP servers).
Integrates with MCP health monitoring.
"""

import logging
from typing import Any

from pybreaker import CircuitBreaker, CircuitBreakerError

logger = logging.getLogger(__name__)

# ── Breaker registry ──────────────────────────────────────────────────────────
_BREAKERS: dict[str, CircuitBreaker] = {}

# Default thresholds (per the improvements doc)
DEFAULT_FAIL_MAX = 5
DEFAULT_RESET_TIMEOUT = 30  # seconds


def get_breaker(
    name: str,
    fail_max: int = DEFAULT_FAIL_MAX,
    reset_timeout: int = DEFAULT_RESET_TIMEOUT,
) -> CircuitBreaker:
    """Get or create a circuit breaker for a named dependency."""
    if name not in _BREAKERS:
        _BREAKERS[name] = CircuitBreaker(
            fail_max=fail_max,
            reset_timeout=reset_timeout,
            name=name,
            listeners=[_LoggingListener()],
        )
        logger.info("[CircuitBreaker] Created breaker: %s (fail_max=%d, reset=%ds)",
                     name, fail_max, reset_timeout)
    return _BREAKERS[name]


def get_breaker_status(name: str) -> dict[str, Any]:
    """Return current state and stats for a named breaker."""
    if name not in _BREAKERS:
        return {"name": name, "state": "unknown", "registered": False}
    breaker = _BREAKERS[name]
    return {
        "name": name,
        "state": breaker.current_state,
        "fail_counter": breaker.fail_counter,
        "registered": True,
    }


def get_all_breaker_statuses() -> list[dict[str, Any]]:
    """Return status of all registered breakers."""
    return [get_breaker_status(name) for name in sorted(_BREAKERS)]


def is_available(name: str) -> bool:
    """Check if a dependency's breaker is in a callable state (not OPEN)."""
    if name not in _BREAKERS:
        return True  # No breaker = assume available
    return _BREAKERS[name].current_state != "open"


class _LoggingListener:
    """Logs circuit breaker state transitions."""

    def state_change(self, cb: CircuitBreaker, old_state: Any, new_state: Any) -> None:
        if str(new_state) == "open":
            logger.warning(
                "[CircuitBreaker] %s TRIPPED → OPEN (failures: %d)",
                cb.name, cb.fail_counter,
            )
        elif str(new_state) == "closed":
            logger.info("[CircuitBreaker] %s recovered → CLOSED", cb.name)
        elif str(new_state) == "half-open":
            logger.info("[CircuitBreaker] %s testing → HALF-OPEN", cb.name)

    def before_call(self, cb: CircuitBreaker, func: Any, *args: Any, **kwargs: Any) -> None:
        pass

    def after_call(self, cb: CircuitBreaker, func: Any, *args: Any, **kwargs: Any) -> None:
        pass

    def failure(self, cb: CircuitBreaker, exc: Exception) -> None:
        logger.debug("[CircuitBreaker] %s failure: %s", cb.name, exc)

    def success(self, cb: CircuitBreaker) -> None:
        pass

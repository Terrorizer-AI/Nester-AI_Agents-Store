"""
Error handling primitives for the Nester Agent Platform.

Provides retry with exponential backoff, graceful degradation strategies,
and structured error types used by the engine and agent nodes.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class ErrorStrategy(str, Enum):
    """How a node should handle failures."""
    RETRY_THEN_SKIP = "retry_then_skip"
    RETRY_THEN_ABORT = "retry_then_abort"
    SKIP_IMMEDIATELY = "skip_immediately"
    ABORT_IMMEDIATELY = "abort_immediately"


@dataclass(frozen=True)
class NodeError:
    """Structured error from a failed node execution."""
    node_name: str
    error_type: str
    message: str
    strategy: ErrorStrategy
    retries_attempted: int = 0
    original_exception: Exception | None = field(default=None, repr=False)


class FlowAbortError(Exception):
    """Raised when a flow must abort due to unrecoverable error."""

    def __init__(self, node_error: NodeError):
        self.node_error = node_error
        super().__init__(f"Flow aborted at {node_error.node_name}: {node_error.message}")


class CostBudgetExceededError(Exception):
    """Raised when a flow or user exceeds their cost budget."""

    def __init__(self, entity: str, budget: float, spent: float):
        self.entity = entity
        self.budget = budget
        self.spent = spent
        super().__init__(f"Cost budget exceeded for {entity}: ${spent:.2f} / ${budget:.2f}")


async def retry_with_backoff(
    func: Callable[..., Any],
    *args: Any,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    node_name: str = "unknown",
    **kwargs: Any,
) -> Any:
    """
    Execute an async function with exponential backoff.

    Returns the result on success. Raises the last exception after
    all retries are exhausted.
    """
    last_exception: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except Exception as exc:
            last_exception = exc
            if attempt == max_retries:
                break
            delay = min(base_delay * (2 ** attempt), max_delay)
            logger.warning(
                "[%s] Attempt %d/%d failed: %s — retrying in %.1fs",
                node_name, attempt + 1, max_retries, exc, delay,
            )
            await asyncio.sleep(delay)

    raise last_exception  # type: ignore[misc]


def build_skip_output(node_name: str, error: str) -> dict[str, Any]:
    """Return a degraded output dict when a node is skipped after failure."""
    return {
        "error": error,
        "skipped": True,
        "node": node_name,
    }

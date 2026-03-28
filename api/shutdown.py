"""
Graceful shutdown handler.

When SIGTERM arrives:
  1. Fail the readiness check (stop new traffic)
  2. Wait for active flows to complete (up to grace period)
  3. Flush Langfuse traces
  4. Close LangGraph checkpointer
  5. Stop scheduler
  6. Shutdown browser pool
"""

import asyncio
import logging
import signal

logger = logging.getLogger(__name__)

_shutting_down = False
_active_flows: set[str] = set()
GRACE_PERIOD_SECONDS = 115  # Kubernetes default is 120s, buffer 5s


def is_shutting_down() -> bool:
    return _shutting_down


def register_active_flow(run_id: str) -> None:
    _active_flows.add(run_id)


def deregister_active_flow(run_id: str) -> None:
    _active_flows.discard(run_id)


async def graceful_shutdown() -> None:
    """Execute graceful shutdown sequence."""
    global _shutting_down
    _shutting_down = True
    logger.info("[Shutdown] Starting graceful shutdown (%d active flows)", len(_active_flows))

    # Wait for active flows to drain
    elapsed = 0
    while _active_flows and elapsed < GRACE_PERIOD_SECONDS:
        logger.info("[Shutdown] Waiting for %d flows to complete...", len(_active_flows))
        await asyncio.sleep(2)
        elapsed += 2

    if _active_flows:
        logger.warning(
            "[Shutdown] %d flows still active after %ds grace period — forcing exit",
            len(_active_flows), GRACE_PERIOD_SECONDS,
        )

    # Flush and close
    try:
        from observability.tracing import shutdown_tracing
        shutdown_tracing()
    except Exception as e:
        logger.debug("[Shutdown] Tracing shutdown: %s", e)

    try:
        from memory.checkpointer import close_checkpointer
        await close_checkpointer()
    except Exception as e:
        logger.debug("[Shutdown] Checkpointer close: %s", e)

    try:
        from api.routes.scheduler import stop_scheduler
        stop_scheduler()
    except Exception as e:
        logger.debug("[Shutdown] Scheduler stop: %s", e)

    try:
        from tools.health import stop_health_monitor
        stop_health_monitor()
    except Exception as e:
        logger.debug("[Shutdown] Health monitor stop: %s", e)

    try:
        from tools.browser import shutdown_browser_pool
        await shutdown_browser_pool()
    except Exception as e:
        logger.debug("[Shutdown] Browser pool close: %s", e)

    logger.info("[Shutdown] Complete")

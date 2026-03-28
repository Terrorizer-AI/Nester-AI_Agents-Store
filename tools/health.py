"""
MCP server health monitor — pings every server every 30 seconds.

Maintains a health status map that integrates with circuit breakers.
Three consecutive health check failures trip the circuit breaker
before any flow attempts to use the server.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

from tools.registry import MCPServerConfig, TransportType, list_servers

logger = logging.getLogger(__name__)

HEALTH_CHECK_INTERVAL = 30  # seconds
CONSECUTIVE_FAILURES_TO_TRIP = 3


@dataclass
class ServerHealth:
    """Mutable health status for a single MCP server."""
    name: str
    is_healthy: bool = True
    last_check: str = ""
    last_latency_ms: float = 0
    consecutive_failures: int = 0
    total_checks: int = 0
    total_failures: int = 0


_health_status: dict[str, ServerHealth] = {}
_monitor_task: asyncio.Task | None = None


def get_health(name: str) -> ServerHealth:
    """Get current health status for a server."""
    if name not in _health_status:
        _health_status[name] = ServerHealth(name=name)
    return _health_status[name]


def get_all_health() -> list[dict[str, Any]]:
    """Return health status for all monitored servers."""
    return [
        {
            "name": h.name,
            "healthy": h.is_healthy,
            "last_check": h.last_check,
            "latency_ms": h.last_latency_ms,
            "consecutive_failures": h.consecutive_failures,
        }
        for h in _health_status.values()
    ]


async def check_server_health(config: MCPServerConfig) -> bool:
    """Ping a single MCP server's health endpoint."""
    health = get_health(config.name)
    health.total_checks += 1

    if config.transport == TransportType.HTTP and config.url:
        try:
            start = time.monotonic()
            async with httpx.AsyncClient(timeout=5) as client:
                url = f"{config.url.rstrip('/')}/health"
                resp = await client.get(url)
                elapsed = (time.monotonic() - start) * 1000

                health.last_latency_ms = elapsed
                health.last_check = datetime.now(timezone.utc).isoformat()

                if resp.status_code == 200:
                    health.is_healthy = True
                    health.consecutive_failures = 0
                    return True
                else:
                    raise Exception(f"HTTP {resp.status_code}")

        except Exception as exc:
            health.is_healthy = False
            health.consecutive_failures += 1
            health.total_failures += 1
            health.last_check = datetime.now(timezone.utc).isoformat()

            cf = health.consecutive_failures
            # Log at ERROR only on first trip (==3) and then every 20 failures.
            # After that downgrade to DEBUG to avoid log spam for servers that
            # are intentionally not running (direct-fallback mode).
            if cf == CONSECUTIVE_FAILURES_TO_TRIP:
                logger.error(
                    "[Health] %s DOWN (%d consecutive failures): %s — "
                    "using direct fallback (further failures logged at DEBUG)",
                    config.name, cf, exc,
                )
            elif cf % 20 == 0:
                logger.debug(
                    "[Health] %s still DOWN (%d consecutive failures)",
                    config.name, cf,
                )
            else:
                logger.debug(
                    "[Health] %s DOWN (%d): %s", config.name, cf, exc,
                )
            return False

    # stdio servers: check if command exists (basic check)
    if config.transport == TransportType.STDIO and config.command:
        import shutil
        exists = shutil.which(config.command) is not None
        health.is_healthy = exists
        health.last_check = datetime.now(timezone.utc).isoformat()
        if not exists:
            health.consecutive_failures += 1
        else:
            health.consecutive_failures = 0
        return exists

    return True  # Unknown transport — assume healthy


async def _monitor_loop() -> None:
    """Background loop that checks all servers every HEALTH_CHECK_INTERVAL seconds."""
    while True:
        servers = list_servers()
        for config in servers:
            if config.enabled:
                await check_server_health(config)
        await asyncio.sleep(HEALTH_CHECK_INTERVAL)


def start_health_monitor() -> None:
    """Start the background health monitoring task."""
    global _monitor_task
    if _monitor_task is None or _monitor_task.done():
        _monitor_task = asyncio.create_task(_monitor_loop())
        logger.info("[Health] Started monitoring %d servers every %ds",
                     len(list_servers()), HEALTH_CHECK_INTERVAL)


def stop_health_monitor() -> None:
    """Stop the background health monitoring task."""
    global _monitor_task
    if _monitor_task and not _monitor_task.done():
        _monitor_task.cancel()
        _monitor_task = None
        logger.info("[Health] Stopped monitoring")

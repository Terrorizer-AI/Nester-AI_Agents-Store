"""
Browser infrastructure — Playwright-based web scraping for the Nester platform.

Public API:
  - startup_browser_pool()   — call from app lifespan
  - shutdown_browser_pool()  — call from graceful shutdown
  - get_browser_pool()       — returns the pool (raises if not started)
  - get_pool_if_ready()      — returns the pool or None (no exception)
  - is_browser_healthy()     — health check for monitoring

The pool is a module-level singleton, managed by the application lifecycle.
"""

import asyncio
import logging

from tools.browser.config import BrowserConfig
from tools.browser.pool import BrowserPool

logger = logging.getLogger(__name__)

# Module-level singleton — created by startup_browser_pool(), used everywhere
_browser_pool: BrowserPool | None = None
_init_lock = asyncio.Lock()


async def startup_browser_pool(
    headless: bool = True,
    pool_size: int = 2,
    page_timeout_ms: int = 30_000,
) -> BrowserPool:
    """
    Create and start the global browser pool.

    Called once from api/main.py lifespan. Safe to call multiple times —
    serialized by module-level lock to prevent duplicate browser launches.
    """
    global _browser_pool

    async with _init_lock:
        if _browser_pool is not None and _browser_pool.is_healthy():
            return _browser_pool

        config = BrowserConfig(
            headless=headless,
            pool_size=pool_size,
            page_timeout_ms=page_timeout_ms,
        )
        pool = BrowserPool(config)
        await pool.startup()
        _browser_pool = pool
        return pool


async def shutdown_browser_pool() -> None:
    """Shut down the global browser pool. Safe to call if not started."""
    global _browser_pool

    async with _init_lock:
        if _browser_pool is not None:
            await _browser_pool.shutdown()
            _browser_pool = None
            logger.info("[Browser] Pool shut down")


def get_browser_pool() -> BrowserPool:
    """Get the running browser pool. Raises RuntimeError if not started."""
    if _browser_pool is None or not _browser_pool.is_healthy():
        raise RuntimeError("Browser pool is not available")
    return _browser_pool


def get_pool_if_ready() -> BrowserPool | None:
    """Get the browser pool if running, or None. Never raises."""
    if _browser_pool is not None and _browser_pool.is_healthy():
        return _browser_pool
    return None


def is_browser_healthy() -> bool:
    """Check if the browser pool is running and healthy."""
    return _browser_pool is not None and _browser_pool.is_healthy()

"""
Browser pool — manages persistent Playwright browser contexts.

Lifecycle: startup() → acquire_page() / release → shutdown()

Design:
  - One Chromium browser instance (expensive to launch — done once)
  - N persistent BrowserContexts (cheap, isolate cookies/state)
  - Pages are checked out via async context manager, closed on release
  - Contexts are rotated after max_pages_per_context to prevent memory leaks
  - Concurrency controlled by asyncio.Semaphore(pool_size)
  - All shared state mutations protected by asyncio.Lock
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)

from tools.browser.config import BrowserConfig
from tools.browser.stealth import create_stealth_context

logger = logging.getLogger(__name__)


class BrowserPool:
    """Persistent Playwright browser pool with context rotation."""

    def __init__(self, config: BrowserConfig) -> None:
        self._config = config
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._contexts: list[BrowserContext] = []
        self._context_page_counts: list[int] = []
        self._context_inflight: list[int] = []  # In-flight pages per context
        self._semaphore = asyncio.Semaphore(config.pool_size)
        self._context_index: int = 0
        self._started: bool = False
        self._lock = asyncio.Lock()

    @property
    def config(self) -> BrowserConfig:
        return self._config

    # ── Lifecycle ─────────────────────────────────────────────────────────

    async def startup(self) -> None:
        """Launch Playwright and Chromium browser, create initial contexts."""
        if self._started:
            return

        async with self._lock:
            if self._started:
                return

            logger.info("[BrowserPool] Starting Playwright + Chromium...")
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                headless=self._config.headless,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                ],
            )

            # Create initial stealth contexts
            for _ in range(self._config.pool_size):
                ctx = await create_stealth_context(self._browser, self._config)
                self._contexts.append(ctx)
                self._context_page_counts.append(0)
                self._context_inflight.append(0)

            self._started = True
            logger.info(
                "[BrowserPool] Ready — %d contexts, pool_size=%d",
                len(self._contexts),
                self._config.pool_size,
            )

    async def shutdown(self) -> None:
        """Close all contexts, browser, and Playwright — safe to call multiple times."""
        if not self._started:
            return

        async with self._lock:
            if not self._started:
                return

            logger.info("[BrowserPool] Shutting down...")

            # Close all contexts
            for ctx in self._contexts:
                try:
                    await ctx.close()
                except Exception as exc:
                    logger.debug("[BrowserPool] Context close error: %s", exc)
            self._contexts.clear()
            self._context_page_counts.clear()
            self._context_inflight.clear()

            # Close browser
            if self._browser:
                try:
                    await self._browser.close()
                except Exception as exc:
                    logger.debug("[BrowserPool] Browser close error: %s", exc)
                self._browser = None

            # Stop Playwright
            if self._playwright:
                try:
                    await self._playwright.stop()
                except Exception as exc:
                    logger.debug("[BrowserPool] Playwright stop error: %s", exc)
                self._playwright = None

            self._started = False
            logger.info("[BrowserPool] Shutdown complete")

    # ── Page Checkout ─────────────────────────────────────────────────────

    @asynccontextmanager
    async def acquire_page(self) -> AsyncGenerator[Page, None]:
        """
        Check out a page from the pool.

        Usage:
            async with pool.acquire_page() as page:
                await page.goto("https://example.com")
                content = await page.content()

        The page is always closed when the context manager exits.
        Concurrency is bounded by pool_size via semaphore.
        """
        if not self._started:
            raise RuntimeError("BrowserPool not started — call startup() first")

        async with self._semaphore:
            context, ctx_idx = await self._pick_context()
            page = await context.new_page()
            try:
                yield page
            finally:
                try:
                    await page.close()
                except Exception as exc:
                    logger.debug("[BrowserPool] Page close error (browser may have crashed): %s", exc)

                # Decrement in-flight count and maybe rotate
                await self._release_context(ctx_idx)

    # ── Context Rotation ──────────────────────────────────────────────────

    async def _pick_context(self) -> tuple[BrowserContext, int]:
        """
        Round-robin context selection — protected by lock.

        Returns the context and its index so the caller can release it later.
        Rotation is deferred until all in-flight pages on the context are done.
        """
        async with self._lock:
            idx = self._context_index % len(self._contexts)
            self._context_page_counts[idx] += 1
            self._context_inflight[idx] += 1
            self._context_index += 1
            return self._contexts[idx], idx

    async def _release_context(self, idx: int) -> None:
        """
        Decrement in-flight count for a context.

        If the context has exceeded max_pages_per_context AND no pages are in-flight,
        rotate it now. This prevents closing a context while pages are still using it.
        """
        async with self._lock:
            if idx >= len(self._context_inflight):
                return  # Pool was shut down while page was in use

            self._context_inflight[idx] -= 1

            needs_rotation = (
                self._context_page_counts[idx] >= self._config.max_pages_per_context
                and self._context_inflight[idx] == 0
            )

            if needs_rotation:
                logger.info(
                    "[BrowserPool] Rotating context %d after %d pages",
                    idx,
                    self._context_page_counts[idx],
                )
                old_ctx = self._contexts[idx]
                try:
                    await old_ctx.close()
                except Exception as exc:
                    logger.debug("[BrowserPool] Old context close error: %s", exc)

                new_ctx = await create_stealth_context(self._browser, self._config)
                self._contexts[idx] = new_ctx
                self._context_page_counts[idx] = 0
                self._context_inflight[idx] = 0

    # ── Health ────────────────────────────────────────────────────────────

    def is_healthy(self) -> bool:
        """Check if the pool is running and browser is connected."""
        return (
            self._started
            and self._browser is not None
            and self._browser.is_connected()
        )

"""
Browser pool configuration — immutable settings for Playwright infrastructure.

All values can be overridden via environment variables through Settings.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class BrowserConfig:
    """Immutable configuration for the Playwright browser pool."""

    headless: bool = True
    pool_size: int = 2  # Max concurrent pages
    page_timeout_ms: int = 30_000  # 30s per navigation
    idle_timeout_ms: int = 10_000  # 10s wait for network idle
    max_pages_per_context: int = 50  # Rotate context after N pages (prevent memory leaks)
    viewport: dict[str, int] = field(
        default_factory=lambda: {"width": 1920, "height": 1080},
    )
    block_resources: tuple[str, ...] = ("image", "media", "font")
    body_text_limit: int = 6000  # Max chars of body text to return
    search_max_results: int = 8

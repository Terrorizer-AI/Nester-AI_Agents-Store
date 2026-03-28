"""
Browser stealth — anti-detection patches for Playwright contexts.

Injects JS to hide automation signals (navigator.webdriver, chrome.runtime, etc.)
and rotates user agents to look like a real desktop browser.
"""

import random

from playwright.async_api import Browser, BrowserContext

from tools.browser.config import BrowserConfig

# Realistic desktop user agents (Chrome on macOS, rotated per context)
_USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]

# JS injected before any page script runs — hides Playwright fingerprints
_STEALTH_SCRIPT = """
// Hide navigator.webdriver
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// Chrome runtime stub
window.chrome = { runtime: {} };

// Realistic plugins array
Object.defineProperty(navigator, 'plugins', {
    get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
    ],
});

// Realistic languages
Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
});

// Fix broken Permission API
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
"""


async def create_stealth_context(
    browser: Browser,
    config: BrowserConfig,
) -> BrowserContext:
    """Create a BrowserContext with anti-detection measures applied."""
    context = await browser.new_context(
        viewport=config.viewport,
        user_agent=random.choice(_USER_AGENTS),
        locale="en-US",
        timezone_id="America/New_York",
        java_script_enabled=True,
    )

    # Inject stealth patches before any page loads
    await context.add_init_script(_STEALTH_SCRIPT)

    # Block heavy resources for speed (images, fonts, media)
    if config.block_resources:
        await context.route(
            "**/*",
            _make_resource_blocker(config.block_resources),
        )

    return context


def _make_resource_blocker(blocked_types: tuple[str, ...]):
    """Return a Playwright route handler that aborts blocked resource types."""

    async def _handler(route):
        if route.request.resource_type in blocked_types:
            await route.abort()
        else:
            await route.continue_()

    return _handler

"""
Playwright-based website extraction — renders JS, handles SPAs, bypasses Cloudflare.

Drop-in replacement for httpx+BeautifulSoup with the same return signature.
"""

import ipaddress
import logging
import socket
from typing import Any
from urllib.parse import urlparse

from tools.browser.pool import BrowserPool

logger = logging.getLogger(__name__)

# ── Private IP ranges blocked for SSRF prevention ────────────────────────────
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # AWS metadata
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def validate_url(url: str) -> None:
    """
    Validate a URL for safe fetching — blocks non-HTTP schemes and private IPs.

    Raises ValueError if the URL is disallowed.
    """
    parsed = urlparse(url)

    # Only allow http/https
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Disallowed URL scheme: {parsed.scheme!r}")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL has no hostname")

    # Resolve hostname and check against blocked networks
    try:
        resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for _family, _type, _proto, _canonname, sockaddr in resolved:
            ip = ipaddress.ip_address(sockaddr[0])
            for network in _BLOCKED_NETWORKS:
                if ip in network:
                    raise ValueError(
                        f"URL resolves to blocked private address: {hostname} -> {ip}"
                    )
    except socket.gaierror:
        pass  # DNS resolution failed — let the browser handle the error


# JS executed inside the browser to extract structured page content.
# Runs in the page's DOM context — has access to document, window, etc.
_EXTRACTION_JS = """
() => {
    // Remove noise elements
    const removeSelectors = [
        'script', 'style', 'nav', 'footer', 'iframe', 'noscript',
        '[role="navigation"]', '[role="banner"]', '.cookie-banner',
        '.popup', '.modal', '#cookie-consent', '.ads', '.advertisement',
    ];
    removeSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Title
    const title = document.title || '';

    // Meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    const metaDescription = metaDesc ? metaDesc.getAttribute('content') || '' : '';

    // OG tags for richer context
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const ogType = document.querySelector('meta[property="og:type"]');

    // Headings (h1-h3)
    const headings = [];
    document.querySelectorAll('h1, h2, h3').forEach((h, i) => {
        if (i < 20 && h.textContent.trim()) {
            headings.push({ level: h.tagName.toLowerCase(), text: h.textContent.trim() });
        }
    });

    // Main content — prefer semantic elements, fall back to body
    const mainEl = document.querySelector('main') || document.querySelector('article')
        || document.querySelector('[role="main"]') || document.body;
    const bodyText = mainEl ? mainEl.innerText : '';

    // Links with text (useful for navigation/structure understanding)
    const links = [];
    document.querySelectorAll('a[href]').forEach((a, i) => {
        if (i < 30 && a.textContent.trim() && a.href.startsWith('http')) {
            links.push({ text: a.textContent.trim().slice(0, 100), href: a.href });
        }
    });

    return {
        title,
        meta_description: metaDescription,
        og_title: ogTitle ? ogTitle.getAttribute('content') : null,
        og_description: ogDesc ? ogDesc.getAttribute('content') : null,
        og_type: ogType ? ogType.getAttribute('content') : null,
        headings,
        body_text: bodyText,
        links,
        url: window.location.href,
    };
}
"""


async def browser_extract_website(
    url: str,
    pool: BrowserPool,
    **_kwargs: Any,
) -> dict[str, Any]:
    """
    Fetch a URL with Playwright, render JS, extract structured content.

    Returns the same dict shape as direct_extract_website for compatibility.
    """
    try:
        validate_url(url)
    except ValueError as exc:
        return {"error": str(exc), "url": url, "source": "playwright_browser"}

    try:
        async with pool.acquire_page() as page:
            response = await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=pool.config.page_timeout_ms,
            )

            # Wait for dynamic content to settle
            try:
                await page.wait_for_load_state(
                    "networkidle",
                    timeout=pool.config.idle_timeout_ms,
                )
            except Exception:
                pass  # networkidle timeout is non-fatal — page may still be usable

            # Check HTTP status
            status = response.status if response else 0
            if status >= 400:
                return {
                    "error": f"HTTP {status} fetching {url}",
                    "url": url,
                    "source": "playwright_browser",
                }

            # Extract content via in-browser JS
            raw = await page.evaluate(_EXTRACTION_JS)

            # Trim body text to configured limit
            body_text = raw.get("body_text", "")
            body_text = "\n".join(
                line for line in body_text.splitlines() if line.strip()
            )[:pool.config.body_text_limit]

            return {
                "url": raw.get("url", url),
                "title": raw.get("title", ""),
                "meta_description": raw.get("meta_description", ""),
                "og_title": raw.get("og_title"),
                "og_description": raw.get("og_description"),
                "headings": raw.get("headings", []),
                "body_text": body_text,
                "links": raw.get("links", [])[:20],
                "source": "playwright_browser",
            }

    except Exception as exc:
        logger.warning("[BrowserScraper] Failed for %s: %s", url, exc)
        return {
            "error": f"Browser scraping failed: {exc}",
            "url": url,
            "source": "playwright_browser",
        }


async def browser_extract_multiple(
    urls: list[str],
    pool: BrowserPool,
) -> list[dict[str, Any]]:
    """Extract content from multiple URLs concurrently (bounded by pool size)."""
    import asyncio

    tasks = [browser_extract_website(url, pool) for url in urls]
    return await asyncio.gather(*tasks)

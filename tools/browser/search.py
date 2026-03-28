"""
Google search via Playwright browser — avoids captchas better than raw HTTP.

Falls back gracefully if Google blocks the request (captcha detected).
"""

import logging
from typing import Any
from urllib.parse import quote_plus

from tools.browser.pool import BrowserPool

logger = logging.getLogger(__name__)

# JS executed in the browser to extract Google search results.
# Accepts maxResults as a structured argument — never string-formatted.
_GOOGLE_RESULTS_JS = """
(maxResults) => {
    const results = [];
    const items = document.querySelectorAll('#search .g, #rso .g');

    items.forEach((item, i) => {
        if (i >= maxResults) return;

        const linkEl = item.querySelector('a[href]');
        const titleEl = item.querySelector('h3');
        const snippetEl = item.querySelector('[data-sncf], .VwiC3b, [data-content-feature="1"]');

        if (linkEl && titleEl) {
            const href = linkEl.getAttribute('href') || '';
            if (href.startsWith('http') && !href.includes('google.com/search')) {
                results.push({
                    title: titleEl.textContent.trim(),
                    url: href,
                    snippet: snippetEl ? snippetEl.textContent.trim() : '',
                });
            }
        }
    });

    const paaItems = document.querySelectorAll('[data-sgrd] [data-q]');
    const related_questions = [];
    paaItems.forEach((item, i) => {
        if (i < 4) {
            related_questions.push(item.getAttribute('data-q') || item.textContent.trim());
        }
    });

    return { results, related_questions };
}
"""

# JS to extract Google News results — accepts maxResults as argument.
_GOOGLE_NEWS_JS = """
(maxResults) => {
    const results = [];
    document.querySelectorAll('#search .SoaBEf, #rso .SoaBEf, #search .g').forEach((item, i) => {
        if (i >= maxResults) return;
        const linkEl = item.querySelector('a[href]');
        const titleEl = item.querySelector('[role="heading"], h3, .n0jPhd');
        const snippetEl = item.querySelector('.GI74Re, .Y3v8qd, .st');
        const sourceEl = item.querySelector('.NUnG9d .CEMjEf, .UPmit');
        const dateEl = item.querySelector('.OSrXXb, .LfVVr');

        if (linkEl && titleEl) {
            const href = linkEl.getAttribute('href') || '';
            if (href.startsWith('http')) {
                results.push({
                    title: titleEl.textContent.trim(),
                    url: href,
                    snippet: snippetEl ? snippetEl.textContent.trim() : '',
                    source: sourceEl ? sourceEl.textContent.trim() : '',
                    date: dateEl ? dateEl.textContent.trim() : '',
                });
            }
        }
    });
    return results;
}
"""

# Check if Google served a captcha instead of results
_CAPTCHA_CHECK_JS = """
() => {
    const body = document.body ? document.body.innerText : '';
    return body.includes('unusual traffic') || body.includes('captcha')
        || body.includes('automated queries') || !!document.querySelector('#captcha-form');
}
"""


async def browser_google_search(
    query: str,
    pool: BrowserPool,
    max_results: int = 8,
    **_kwargs: Any,
) -> dict[str, Any]:
    """
    Search Google via a real Chromium browser.

    Returns structured results with title, url, snippet, and related questions.
    """
    # Clamp max_results to a safe range
    max_results = max(1, min(int(max_results), 20))

    encoded_query = quote_plus(query)
    search_url = f"https://www.google.com/search?q={encoded_query}&num={max_results}&hl=en"

    try:
        async with pool.acquire_page() as page:
            await page.goto(
                search_url,
                wait_until="domcontentloaded",
                timeout=pool.config.page_timeout_ms,
            )

            try:
                await page.wait_for_selector("#search", timeout=10_000)
            except Exception:
                pass

            is_captcha = await page.evaluate(_CAPTCHA_CHECK_JS)
            if is_captcha:
                logger.warning("[BrowserSearch] Google captcha detected for query: %s", query)
                return {
                    "error": "Google captcha detected — falling back to DuckDuckGo",
                    "query": query,
                    "captcha": True,
                    "source": "google_browser",
                }

            # Pass max_results as a structured argument — never string-formatted
            raw = await page.evaluate(_GOOGLE_RESULTS_JS, max_results)

            results = raw.get("results", [])
            related = raw.get("related_questions", [])

            logger.info(
                "[BrowserSearch] Google returned %d results for: %s",
                len(results),
                query[:60],
            )

            return {
                "query": query,
                "results": results,
                "related_questions": related,
                "source": "google_browser",
                "result_count": len(results),
            }

    except Exception as exc:
        logger.warning("[BrowserSearch] Google search failed for '%s': %s", query, exc)
        return {
            "error": f"Browser search failed: {exc}",
            "query": query,
            "source": "google_browser",
        }


async def browser_news_search(
    query: str,
    pool: BrowserPool,
    max_results: int = 5,
    **_kwargs: Any,
) -> dict[str, Any]:
    """Search Google News via browser for recent articles."""
    max_results = max(1, min(int(max_results), 20))

    encoded_query = quote_plus(query)
    search_url = f"https://www.google.com/search?q={encoded_query}&num={max_results}&tbm=nws&hl=en"

    try:
        async with pool.acquire_page() as page:
            await page.goto(
                search_url,
                wait_until="domcontentloaded",
                timeout=pool.config.page_timeout_ms,
            )

            try:
                await page.wait_for_selector("#search", timeout=10_000)
            except Exception:
                pass

            is_captcha = await page.evaluate(_CAPTCHA_CHECK_JS)
            if is_captcha:
                return {
                    "error": "Google captcha on news search",
                    "query": query,
                    "captcha": True,
                    "source": "google_news_browser",
                }

            # Pass max_results as a structured argument
            results = await page.evaluate(_GOOGLE_NEWS_JS, max_results)

            return {
                "query": query,
                "results": results,
                "source": "google_news_browser",
                "result_count": len(results),
            }

    except Exception as exc:
        logger.warning("[BrowserSearch] News search failed for '%s': %s", query, exc)
        return {
            "error": f"Browser news search failed: {exc}",
            "query": query,
            "source": "google_news_browser",
        }

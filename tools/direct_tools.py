"""
Direct tool implementations — primary + fallback scraping and search.

Three-tier strategy:
  1. Playwright browser (JS rendering, Cloudflare bypass, Google search)
  2. httpx + BeautifulSoup (fast, no JS — fallback when browser is unavailable)
  3. DuckDuckGo API (free search — fallback when Google captchas appear)

Used by the LangChain bridge when MCP servers return connection errors.
Also used as the primary scraping backend when web_scraper/search MCP servers
have no API keys configured.
"""

import logging
from typing import Any

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


# ── Web Scraping (Browser → httpx fallback) ─────────────────────────────────


async def direct_extract_website(url: str, **_kwargs: Any) -> dict[str, Any]:
    """
    Fetch a URL and extract structured text content.

    Tier 1: Firecrawl API (if FIRECRAWL_API_KEY set) — best quality, JS rendering
    Tier 2: Playwright browser (if pool ready) — JS rendering, no API key needed
    Tier 3: httpx + BeautifulSoup — fast plain-HTTP fallback
    """
    # Validate URL to prevent SSRF
    try:
        from tools.browser.scraper import validate_url
        validate_url(url)
    except ValueError as exc:
        return {"error": str(exc), "url": url}

    # Tier 1: Firecrawl
    import os
    firecrawl_key = os.environ.get("FIRECRAWL_API_KEY", "")
    if firecrawl_key:
        try:
            payload = {"url": url, "formats": ["markdown"]}
            headers = {
                "Authorization": f"Bearer {firecrawl_key}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.firecrawl.dev/v1/scrape",
                    headers=headers,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
            result = data.get("data", {})
            meta = result.get("metadata", {})
            content = result.get("markdown", "")
            if content:
                logger.info("[DirectTools] Firecrawl succeeded for %s (%d chars)", url, len(content))
                return {
                    "url": url,
                    "title": meta.get("title", ""),
                    "description": meta.get("description", ""),
                    "body_text": content,
                    "source": "firecrawl",
                }
        except Exception as exc:
            logger.warning("[DirectTools] Firecrawl failed for %s: %s — trying browser", url, exc)

    # Tier 2: Playwright browser
    try:
        from tools.browser import get_pool_if_ready
        pool = get_pool_if_ready()
        if pool is not None:
            from tools.browser.scraper import browser_extract_website
            result = await browser_extract_website(url, pool)
            if not result.get("error"):
                return result
            logger.debug("[DirectTools] Browser scrape got error for %s, trying httpx", url)
    except Exception as exc:
        logger.debug("[DirectTools] Browser unavailable for %s: %s — trying httpx", url, exc)

    # Tier 3: httpx + BeautifulSoup
    return await _httpx_extract_website(url)


async def _httpx_extract_website(url: str) -> dict[str, Any]:
    """Fetch a URL with plain HTTP — no JS rendering, fast fallback."""
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        }
        async with httpx.AsyncClient(
            timeout=15.0, follow_redirects=True, headers=headers,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text

        soup = BeautifulSoup(html, "html.parser")

        # Remove noise
        for tag in soup(["script", "style", "nav", "footer", "iframe", "noscript"]):
            tag.decompose()

        title = soup.title.string.strip() if soup.title and soup.title.string else ""

        # Meta description
        meta_desc = ""
        meta_tag = soup.find("meta", attrs={"name": "description"})
        if meta_tag and meta_tag.get("content"):
            meta_desc = meta_tag["content"].strip()

        # Body text (limit for LLM context)
        body_text = soup.get_text(separator="\n", strip=True)
        body_text = "\n".join(
            line for line in body_text.splitlines() if line.strip()
        )[:6000]

        # Headings for structure
        headings = []
        for h in soup.find_all(["h1", "h2", "h3"], limit=15):
            text = h.get_text(strip=True)
            if text:
                headings.append({"level": h.name, "text": text})

        return {
            "url": url,
            "title": title,
            "meta_description": meta_desc,
            "headings": headings,
            "body_text": body_text,
            "source": "httpx_scrape",
        }

    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code} fetching {url}", "url": url}
    except httpx.ConnectError:
        return {"error": f"Cannot connect to {url}", "url": url}
    except Exception as exc:
        logger.warning("[DirectTools] httpx extract failed for %s: %s", url, exc)
        return {"error": str(exc), "url": url}


# ── Web Search (Browser Google → DuckDuckGo fallback) ───────────────────────


async def direct_web_search(query: str, **_kwargs: Any) -> dict[str, Any]:
    """
    Search the web — Google via browser, DuckDuckGo as fallback.
    """
    # Try Google via browser
    try:
        from tools.browser import get_pool_if_ready
        pool = get_pool_if_ready()
        if pool is not None:
            from tools.browser.search import browser_google_search
            result = await browser_google_search(query, pool)
            # If captcha or error, fall through to DuckDuckGo
            if not result.get("error"):
                return result
            logger.info("[DirectTools] Google blocked, falling back to DuckDuckGo for: %s", query)
    except Exception as exc:
        logger.info("[DirectTools] Browser search unavailable: %s — trying DuckDuckGo", exc)

    # Fallback: DuckDuckGo
    import asyncio
    results = await asyncio.to_thread(_ddg_search, query, 8)
    return {"query": query, "results": results, "source": "duckduckgo"}


async def direct_company_search(company_name: str, **_kwargs: Any) -> dict[str, Any]:
    """Search for company information — browser Google, then DuckDuckGo."""
    query = f"{company_name} company about products services funding"

    # Try Google via browser
    try:
        from tools.browser import get_pool_if_ready
        pool = get_pool_if_ready()
        if pool is not None:
            from tools.browser.search import browser_google_search
            result = await browser_google_search(query, pool)
            if not result.get("error"):
                result["company_name"] = company_name
                return result
    except Exception:
        pass

    # Fallback: DuckDuckGo
    import asyncio
    results = await asyncio.to_thread(_ddg_search, query, 8)
    return {
        "company_name": company_name,
        "results": results,
        "source": "duckduckgo",
    }


async def direct_news_search(query: str, **_kwargs: Any) -> dict[str, Any]:
    """Search for recent news — Google News via browser, then DuckDuckGo."""
    # Try Google News via browser
    try:
        from tools.browser import get_pool_if_ready
        pool = get_pool_if_ready()
        if pool is not None:
            from tools.browser.search import browser_news_search
            result = await browser_news_search(query, pool)
            if not result.get("error"):
                return result
    except Exception:
        pass

    # Fallback: DuckDuckGo news
    try:
        from ddgs import DDGS
        import asyncio

        def _search() -> list[dict]:
            with DDGS() as ddgs:
                return list(ddgs.news(query, max_results=5))

        results = await asyncio.to_thread(_search)
        return {
            "query": query,
            "results": [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("body", ""),
                    "date": r.get("date", ""),
                    "source": r.get("source", ""),
                }
                for r in results
            ],
            "source": "duckduckgo_news",
        }
    except Exception as exc:
        logger.warning("[DirectTools] news search failed: %s", exc)
        return {"error": str(exc), "query": query}


# ── DuckDuckGo (search fallback) ────────────────────────────────────────────


def _ddg_search(query: str, max_results: int = 5) -> list[dict[str, str]]:
    """Run a DuckDuckGo search synchronously (called from async via thread)."""
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
            }
            for r in results
        ]
    except Exception as exc:
        logger.warning("[DirectTools] DuckDuckGo search failed: %s", exc)
        return [{"error": str(exc)}]


# ── Fallback registry ────────────────────────────────────────────────────────

DIRECT_FALLBACKS: dict[str, Any] = {
    "extract_website": direct_extract_website,
    "crawl_domain": direct_extract_website,
    "extract_structured": direct_extract_website,
    "web_search": direct_web_search,
    "company_search": direct_company_search,
    "news_search": direct_news_search,
}

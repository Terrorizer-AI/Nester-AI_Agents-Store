"""
Web scraper MCP server — website extraction via Firecrawl.

Runs as a FastMCP HTTP server on port 8102.

Tools:
  - extract_website: Extract structured data from a single URL
  - crawl_domain: Crawl a domain and extract from multiple pages
  - extract_structured: Extract data matching a specific schema
"""

import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastmcp import FastMCP

mcp = FastMCP("web_scraper", description="Website extraction via Firecrawl")

FIRECRAWL_BASE = "https://api.firecrawl.dev/v1"


def _api_key() -> str:
    key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not key:
        raise RuntimeError("FIRECRAWL_API_KEY not set")
    return key


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }


@mcp.tool()
async def extract_website(
    url: str,
    include_links: bool = False,
) -> dict[str, Any]:
    """
    Extract content and metadata from a single URL using Firecrawl.

    Returns: title, description, markdown content, tech stack indicators,
    meta tags, and optionally outbound links.
    """
    try:
        payload: dict[str, Any] = {
            "url": url,
            "formats": ["markdown", "links"] if include_links else ["markdown"],
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{FIRECRAWL_BASE}/scrape",
                headers=_headers(),
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        result = data.get("data", {})
        meta = result.get("metadata", {})

        return {
            "url": url,
            "title": meta.get("title", ""),
            "description": meta.get("description", ""),
            "content": result.get("markdown", ""),
            "tech_stack": meta.get("techStack", []),
            "meta_tags": {k: v for k, v in meta.items() if k not in ("title", "description")},
            "links": result.get("links", []) if include_links else None,
            "extracted_at": datetime.now(timezone.utc).isoformat(),
            "source": "firecrawl",
        }

    except httpx.HTTPStatusError as exc:
        return {"error": f"Firecrawl HTTP {exc.response.status_code}: {exc.response.text[:200]}", "url": url}
    except Exception as exc:
        return {"error": str(exc), "url": url}


@mcp.tool()
async def crawl_domain(
    domain: str,
    max_pages: int = 10,
) -> dict[str, Any]:
    """
    Crawl a domain and extract content from multiple pages via Firecrawl.

    Returns: list of page extractions, site structure, key pages found.
    """
    try:
        payload = {
            "url": domain,
            "limit": max_pages,
            "scrapeOptions": {"formats": ["markdown"]},
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{FIRECRAWL_BASE}/crawl",
                headers=_headers(),
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        pages = [
            {
                "url": p.get("metadata", {}).get("url", ""),
                "title": p.get("metadata", {}).get("title", ""),
                "content": p.get("markdown", "")[:3000],
            }
            for p in data.get("data", [])
        ]

        return {
            "domain": domain,
            "pages_crawled": len(pages),
            "max_pages": max_pages,
            "pages": pages,
            "crawled_at": datetime.now(timezone.utc).isoformat(),
            "source": "firecrawl",
        }

    except httpx.HTTPStatusError as exc:
        return {"error": f"Firecrawl HTTP {exc.response.status_code}", "domain": domain}
    except Exception as exc:
        return {"error": str(exc), "domain": domain}


@mcp.tool()
async def extract_structured(
    url: str,
    schema: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Extract structured data from a URL using Firecrawl's LLM extraction.

    Useful for extracting company info: mission, products, team, pricing, etc.
    """
    default_schema = schema or {
        "company_name": "string",
        "mission": "string",
        "products_services": "array of strings",
        "target_market": "string",
        "founded_year": "string",
        "team_size": "string",
        "pricing": "string",
        "key_differentiators": "array of strings",
    }

    try:
        payload = {
            "url": url,
            "formats": ["extract"],
            "extract": {
                "schema": default_schema,
                "prompt": "Extract company information from this page.",
            },
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{FIRECRAWL_BASE}/scrape",
                headers=_headers(),
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        extracted = data.get("data", {}).get("extract", {})

        return {
            "url": url,
            "schema_requested": default_schema,
            "data": extracted,
            "confidence": 1.0 if extracted else 0.0,
            "extracted_at": datetime.now(timezone.utc).isoformat(),
            "source": "firecrawl",
        }

    except httpx.HTTPStatusError as exc:
        return {"error": f"Firecrawl HTTP {exc.response.status_code}", "url": url}
    except Exception as exc:
        return {"error": str(exc), "url": url}


if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=8102)

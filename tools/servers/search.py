"""
Search MCP server — web search via Tavily API.

Runs as a FastMCP HTTP server on port 8105.

Tools:
  - web_search: General web search
  - news_search: News-specific search
  - company_search: Company information search
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastmcp import FastMCP
from tavily import TavilyClient

logger = logging.getLogger(__name__)

mcp = FastMCP("search", description="Web search via Tavily")


def _get_client() -> TavilyClient:
    """Get a Tavily client using the API key from environment."""
    api_key = os.environ.get("TAVILY_API_KEY", "")
    if not api_key or api_key == "your_tavily_key":
        raise ValueError("TAVILY_API_KEY not configured — set it in .env")
    return TavilyClient(api_key=api_key)


@mcp.tool()
async def web_search(
    query: str,
    max_results: int = 5,
) -> dict[str, Any]:
    """
    Perform a web search and return structured results.

    Returns: list of results with title, url, snippet, and relevance score.
    """
    try:
        client = _get_client()
        response = client.search(
            query=query,
            max_results=max_results,
            search_depth="advanced",
            include_answer=True,
        )

        results = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", ""),
                "score": r.get("score", 0),
            }
            for r in response.get("results", [])
        ]

        return {
            "query": query,
            "answer": response.get("answer", ""),
            "results": results,
            "total_results": len(results),
            "searched_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.error("web_search failed: %s", exc)
        return {
            "query": query,
            "results": [],
            "total_results": 0,
            "error": str(exc),
            "searched_at": datetime.now(timezone.utc).isoformat(),
        }


@mcp.tool()
async def news_search(
    query: str,
    days: int = 7,
    max_results: int = 5,
) -> dict[str, Any]:
    """
    Search for recent news articles matching a query.

    Returns: list of articles with title, source, date, snippet.
    """
    try:
        client = _get_client()
        response = client.search(
            query=query,
            max_results=max_results,
            search_depth="advanced",
            topic="news",
            days=days,
            include_answer=True,
        )

        articles = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", ""),
                "published_date": r.get("published_date", ""),
                "score": r.get("score", 0),
            }
            for r in response.get("results", [])
        ]

        return {
            "query": query,
            "period_days": days,
            "answer": response.get("answer", ""),
            "articles": articles,
            "total_found": len(articles),
            "searched_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.error("news_search failed: %s", exc)
        return {
            "query": query,
            "period_days": days,
            "articles": [],
            "total_found": 0,
            "error": str(exc),
            "searched_at": datetime.now(timezone.utc).isoformat(),
        }


@mcp.tool()
async def company_search(
    company_name: str,
    include_funding: bool = True,
    include_news: bool = True,
) -> dict[str, Any]:
    """
    Search for company information — overview, funding, recent news.

    Returns: company profile, funding rounds, recent news, key people.
    """
    try:
        client = _get_client()

        # General company info
        overview_resp = client.search(
            query=f"{company_name} company overview about",
            max_results=3,
            search_depth="advanced",
            include_answer=True,
        )

        overview = {
            "summary": overview_resp.get("answer", ""),
            "sources": [
                {"title": r.get("title", ""), "url": r.get("url", "")}
                for r in overview_resp.get("results", [])
            ],
        }

        # Funding info
        funding: list[dict[str, Any]] = []
        if include_funding:
            funding_resp = client.search(
                query=f"{company_name} funding round investment valuation",
                max_results=3,
                search_depth="advanced",
                include_answer=True,
            )
            funding = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("content", ""),
                }
                for r in funding_resp.get("results", [])
            ]

        # Recent news
        news: list[dict[str, Any]] = []
        if include_news:
            news_resp = client.search(
                query=f"{company_name} news latest",
                max_results=3,
                search_depth="advanced",
                topic="news",
                days=30,
            )
            news = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("content", ""),
                    "published_date": r.get("published_date", ""),
                }
                for r in news_resp.get("results", [])
            ]

        return {
            "company_name": company_name,
            "overview": overview,
            "funding": funding if include_funding else None,
            "recent_news": news if include_news else None,
            "searched_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.error("company_search failed: %s", exc)
        return {
            "company_name": company_name,
            "overview": {},
            "funding": [],
            "recent_news": [],
            "error": str(exc),
            "searched_at": datetime.now(timezone.utc).isoformat(),
        }


if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=8105)

"""
Tool result cache — SQLite-backed caching for read-only MCP tool results.

Caches expensive tool calls (LinkedIn profiles, web scraping, search results)
with configurable TTL per tool type. Never caches side-effectful calls
(email sending, issue creation, Slack messages).

Storage: ~/.nester/ops.db via memory.sqlite_ops
"""

import hashlib
import json
import logging
from typing import Any

from memory.sqlite_ops import cache_get, cache_set, cache_invalidate

logger = logging.getLogger(__name__)

# TTL per tool type (seconds)
CACHE_TTL: dict[str, int] = {
    "linkedin": 86400,    # 24 hours — profiles rarely change, protects rate limit
    "web_scraper": 300,   # 5 min — website content
    "search": 120,        # 2 min — search results fresher
    "github": 60,         # 1 min — repo data changes frequently
}

# Tools that must NEVER be cached (side effects)
NO_CACHE_TOOLS = {
    "send_email", "send_message", "create_issue", "assign_reviewer",
    "send_alert", "create_channel_message",
}


def _cache_key(server_name: str, tool_name: str, tool_input: dict) -> str:
    """Generate a deterministic cache key from tool call parameters."""
    input_hash = hashlib.sha256(
        json.dumps(tool_input, sort_keys=True, default=str).encode()
    ).hexdigest()[:12]
    return f"tool_cache:{server_name}:{tool_name}:{input_hash}"


async def get_cached_result(
    server_name: str, tool_name: str, tool_input: dict,
) -> Any | None:
    """Return cached result if available, None otherwise."""
    if tool_name in NO_CACHE_TOOLS:
        return None

    key = _cache_key(server_name, tool_name, tool_input)
    result = cache_get(key)

    if result is not None:
        logger.debug("[Cache] HIT %s.%s", server_name, tool_name)
    return result


async def set_cached_result(
    server_name: str, tool_name: str, tool_input: dict, result: Any,
) -> None:
    """Cache a tool result with appropriate TTL."""
    if tool_name in NO_CACHE_TOOLS:
        return

    key = _cache_key(server_name, tool_name, tool_input)
    ttl = CACHE_TTL.get(server_name, 300)

    cache_set(key, result, ttl)
    logger.debug("[Cache] SET %s.%s (TTL=%ds)", server_name, tool_name, ttl)


async def invalidate_cache(server_name: str | None = None) -> int:
    """Invalidate cached results. Returns count of deleted keys."""
    pattern = f"tool_cache:{server_name}:%" if server_name else "tool_cache:%"
    count = cache_invalidate(pattern)
    if count:
        logger.info("[Cache] Invalidated %d keys (pattern=%s)", count, pattern)
    return count

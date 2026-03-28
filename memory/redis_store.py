"""
Redis memory layer — session state, checkpoints, and event queues.

Responsibilities:
  - LangGraph checkpointing via RedisSaver (resume-on-failure)
  - Session state for in-progress flows (<1ms reads)
  - Webhook event queue (Redis Streams) for GitHub Monitor
  - Pub/Sub channels for SSE streaming relay
  - Cost tracking atomic counters

All keys are namespaced: {org_id}:{flow_id}:{session_id}:*
"""

import json
import logging
from datetime import timedelta
from typing import Any

import redis.asyncio as aioredis

from config.settings import get_settings
from memory.namespace import Namespace

logger = logging.getLogger(__name__)

_redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Get or create the async Redis client singleton."""
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
        await _redis_client.ping()
        logger.info("[Redis] Connected to %s", settings.redis_url)
    return _redis_client


async def close_redis() -> None:
    """Close the Redis connection."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
        logger.info("[Redis] Connection closed")


# ── Session state ─────────────────────────────────────────────────────────────

async def set_session_state(
    ns: Namespace, key: str, value: Any, ttl_seconds: int = 3600,
) -> None:
    """Store a session state value with TTL."""
    redis = await get_redis()
    full_key = f"{ns.redis_prefix}:state:{key}"
    await redis.set(full_key, json.dumps(value, default=str), ex=ttl_seconds)


async def get_session_state(ns: Namespace, key: str) -> Any | None:
    """Retrieve a session state value."""
    redis = await get_redis()
    full_key = f"{ns.redis_prefix}:state:{key}"
    raw = await redis.get(full_key)
    if raw is None:
        return None
    return json.loads(raw)


async def delete_session_state(ns: Namespace, key: str) -> None:
    """Delete a session state value."""
    redis = await get_redis()
    full_key = f"{ns.redis_prefix}:state:{key}"
    await redis.delete(full_key)


# ── Webhook event queue (Redis Streams) ───────────────────────────────────────

async def push_webhook_event(
    source: str, repo: str, event_type: str, payload: dict[str, Any],
) -> str:
    """Push a webhook event to a Redis Stream. Returns the stream entry ID."""
    redis = await get_redis()
    stream_key = f"webhook:{source}:{repo}"
    entry = {
        "type": event_type,
        "payload": json.dumps(payload, default=str),
    }
    entry_id = await redis.xadd(stream_key, entry, maxlen=10000)
    return entry_id


async def read_webhook_events(
    source: str, repo: str, count: int = 100, last_id: str = "0",
) -> list[dict[str, Any]]:
    """Read events from a webhook stream."""
    redis = await get_redis()
    stream_key = f"webhook:{source}:{repo}"
    entries = await redis.xrange(stream_key, min=last_id, count=count)
    events = []
    for entry_id, data in entries:
        event = {
            "id": entry_id,
            "type": data.get("type", ""),
            "payload": json.loads(data.get("payload", "{}")),
        }
        events.append(event)
    return events


# ── Pub/Sub for SSE relay ─────────────────────────────────────────────────────

async def subscribe_to_run(run_id: str):
    """Subscribe to a flow run's event channel. Returns an async iterator."""
    redis = await get_redis()
    pubsub = redis.pubsub()
    channel = f"flow:{run_id}:events"
    await pubsub.subscribe(channel)
    return pubsub


# ── Health check ──────────────────────────────────────────────────────────────

async def redis_health() -> bool:
    """Return True if Redis is reachable."""
    try:
        redis = await get_redis()
        return await redis.ping()
    except Exception:
        return False

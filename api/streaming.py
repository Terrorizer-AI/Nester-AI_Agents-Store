"""
SSE streaming relay — in-memory pub/sub for real-time flow events.

Workers publish events via publish_event(), and SSE clients receive
them through asyncio.Queue-based subscriptions. No external services needed.

If the API process restarts, clients reconnect automatically (SSE built-in).
"""

import asyncio
import json
import logging
from collections import defaultdict
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["streaming"])

# In-memory pub/sub: run_id -> set of subscriber queues
_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
_lock = asyncio.Lock()


async def publish_event(run_id: str, event: dict) -> None:
    """Publish an event to all subscribers of a run."""
    async with _lock:
        queues = _subscribers.get(run_id, set())
    for q in queues:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            logger.debug("[SSE] Queue full for run %s, dropping event", run_id)


async def _subscribe(run_id: str) -> asyncio.Queue:
    """Create a new subscriber queue for a run."""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    async with _lock:
        _subscribers[run_id].add(q)
    return q


async def _unsubscribe(run_id: str, q: asyncio.Queue) -> None:
    """Remove a subscriber queue."""
    async with _lock:
        _subscribers[run_id].discard(q)
        if not _subscribers[run_id]:
            del _subscribers[run_id]


@router.get("/stream/{run_id}")
async def stream_run_events(run_id: str):
    """
    Subscribe to a flow run's SSE event stream.

    Clients connect here after receiving a run_id from /flow/{name}/stream
    or /flow/{name}/invoke.
    """
    return StreamingResponse(
        _relay_events(run_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Run-Id": run_id,
        },
    )


async def _relay_events(run_id: str) -> AsyncGenerator[str, None]:
    """Subscribe to in-memory pub/sub and yield SSE-formatted events."""
    queue = await _subscribe(run_id)
    logger.info("[SSE] Client subscribed to run %s", run_id)

    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send keepalive comment to prevent connection timeout
                yield ": keepalive\n\n"
                continue

            data = json.dumps(event, default=str)
            yield f"data: {data}\n\n"

            # Check if flow is complete
            event_type = event.get("type", "")
            if event_type in ("flow_complete", "flow_error"):
                break
    finally:
        await _unsubscribe(run_id, queue)
        logger.info("[SSE] Client disconnected from run %s", run_id)

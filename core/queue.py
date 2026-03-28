"""
Job queue — decouples flow execution from the API request cycle.

Pattern: submit -> background task -> stream
  1. API returns HTTP 202 with run_id immediately
  2. Background asyncio task executes the LangGraph flow
  3. Task publishes events to in-memory pub/sub
  4. SSE endpoint subscribes and relays to frontend

Uses asyncio tasks for in-process execution — no external broker needed.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from config.settings import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


async def run_flow_task(
    flow_name: str,
    input_data: dict[str, Any],
    run_id: str,
    org_id: str = "",
    user_id: str = "",
    flow_version: str = "",
) -> dict[str, Any]:
    """
    Execute a flow as a background task.
    Publishes intermediate events to in-memory pub/sub.
    """
    from core.engine import compile_flow
    from core.runner import RunConfig, stream_flow
    from api.streaming import publish_event

    run_config = RunConfig(
        run_id=run_id,
        flow_name=flow_name,
        flow_version=flow_version,
        org_id=org_id,
        user_id=user_id,
    )

    try:
        compiled, config = compile_flow(flow_name)

        async for event in stream_flow(compiled, input_data, run_config):
            await publish_event(run_id, event)

        return {"status": "completed", "run_id": run_id}

    except Exception as exc:
        error_event = {
            "type": "flow_error",
            "run_id": run_id,
            "error": str(exc),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await publish_event(run_id, error_event)
        logger.error("[Queue] Flow %s/%s failed: %s", flow_name, run_id, exc)
        return {"status": "failed", "run_id": run_id, "error": str(exc)}


async def submit_flow(
    flow_name: str,
    input_data: dict[str, Any],
    run_id: str,
    org_id: str = "",
    user_id: str = "",
    flow_version: str = "",
) -> str:
    """
    Submit a flow for async execution. Returns immediately with the run_id.
    The caller can subscribe to /stream/{run_id} for SSE updates.
    """
    asyncio.create_task(
        run_flow_task(
            flow_name=flow_name,
            input_data=input_data,
            run_id=run_id,
            org_id=org_id,
            user_id=user_id,
            flow_version=flow_version,
        )
    )
    logger.info("[Queue] Submitted flow %s run_id=%s", flow_name, run_id)
    return run_id

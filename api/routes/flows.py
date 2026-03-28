"""
Flow endpoints — run, stream, and manage agent flows.

GET  /flows                  → List all registered flows
POST /flow/{name}/invoke     → Run synchronously, return final state
POST /flow/{name}/stream     → Run with SSE streaming
POST /flow/{name}/resume     → Resume paused flow after human review
GET  /flow/{name}/dashboard  → Retrieve dashboard metrics
"""

import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse

from config.settings import get_settings
from memory.cost_tracker import check_budget
from core.engine import discover_flows
from core.hot_reload import get_or_build_graph
from core.runner import RunConfig, invoke_flow, stream_flow
from core.versioning import get_version_metadata

router = APIRouter(tags=["flows"])
settings = get_settings()


@router.get("/flows")
async def list_flows():
    """Return all registered flows with metadata."""
    flow_names = discover_flows()
    flows = []
    for name in flow_names:
        version_info = get_version_metadata(name)
        flows.append({
            "name": name,
            "version": version_info.get("flow_version", "unknown"),
        })
    return {"flows": flows}


@router.post("/flow/{name}/invoke")
async def invoke(name: str, request: Request):
    """Run a flow synchronously. Returns final state."""
    body = await request.json()
    user_id = body.pop("user_id", "anonymous")
    run_id = str(uuid.uuid4())

    # The body itself is the flow input state
    input_data = body
    logger.info("[Invoke] flow=%s linkedin_url=%r company_website=%r keys=%s",
                name,
                input_data.get("linkedin_url", "MISSING"),
                input_data.get("company_website", "MISSING"),
                list(input_data.keys()))

    # Cost budget check
    budget = await check_budget(settings.platform_org_id, name, user_id)
    if not budget["allowed"]:
        return {"error": "Cost budget exceeded", "budget": budget}

    compiled, config = get_or_build_graph(name)

    run_config = RunConfig(
        run_id=run_id,
        flow_name=name,
        flow_version=config.get("_hash", ""),
        org_id=settings.platform_org_id,
        user_id=user_id,
    )

    result = await invoke_flow(compiled, input_data, run_config)
    return {
        "run_id": result.run_id,
        "status": result.status,
        "output": result.output,
        "duration_ms": result.duration_ms,
        "error": result.error,
    }


@router.post("/flow/{name}/stream")
async def stream(name: str, request: Request):
    """Run a flow with SSE streaming of intermediate agent steps."""
    body = await request.json()
    user_id = body.pop("user_id", "anonymous")
    run_id = str(uuid.uuid4())

    input_data = body

    # Cost budget check
    budget = await check_budget(settings.platform_org_id, name, user_id)
    if not budget["allowed"]:
        return {"error": "Cost budget exceeded", "budget": budget}

    compiled, config = get_or_build_graph(name)

    run_config = RunConfig(
        run_id=run_id,
        flow_name=name,
        flow_version=config.get("_hash", ""),
        org_id=settings.platform_org_id,
        user_id=user_id,
    )

    async def _event_generator():
        async for event in stream_flow(compiled, input_data, run_config):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Run-Id": run_id,
        },
    )


@router.post("/flow/{name}/resume")
async def resume(name: str, request: Request):
    """Resume a paused flow after human-in-the-loop review."""
    body = await request.json()
    run_id = body.get("run_id", "")
    action = body.get("action", "approve")  # approve | reject | regenerate
    feedback = body.get("feedback", "")

    # TODO: Implement resume via LangGraph's interrupt/resume mechanism
    return {
        "run_id": run_id,
        "action": action,
        "status": "resumed",
        "_note": "Connect LangGraph interrupt/resume mechanism",
    }


@router.get("/flow/{name}/dashboard")
async def dashboard(name: str):
    """Retrieve dashboard metrics for a flow."""
    # TODO: Query Supabase time-series metrics + Langfuse stats
    return {
        "flow_name": name,
        "metrics": {},
        "_note": "Connect Supabase metrics and Langfuse stats",
    }

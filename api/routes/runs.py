"""
Run history endpoints — list and inspect past pipeline executions.

GET  /runs              → List recent runs (with optional filters)
GET  /runs/{run_id}     → Full details for a single run
"""

import logging
from typing import Optional

from fastapi import APIRouter, Query

from memory.sqlite_ops import count_runs, get_run, list_runs

logger = logging.getLogger(__name__)

router = APIRouter(tags=["runs"])


@router.get("/runs")
async def list_run_history(
    flow_name: Optional[str] = Query(None, description="Filter by flow name"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List recent pipeline runs, newest first."""
    runs = list_runs(flow_name=flow_name, limit=limit, offset=offset)
    total = count_runs(flow_name=flow_name)
    return {"runs": runs, "total": total, "limit": limit, "offset": offset}


@router.get("/runs/{run_id}")
async def get_run_detail(run_id: str):
    """Get full details for a single run including input/output data."""
    run = get_run(run_id)
    if run is None:
        return {"error": "Run not found", "run_id": run_id}
    return {"run": run}

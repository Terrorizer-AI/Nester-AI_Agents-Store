"""
Cron scheduler — manages scheduled flow executions via APScheduler.

POST /flow/{name}/schedule — Register or update a cron schedule
GET  /schedules              — List all active schedules
DELETE /flow/{name}/schedule — Remove a schedule
"""

import logging
import uuid
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import APIRouter, Request

from config.settings import get_settings
from core.queue import submit_flow

logger = logging.getLogger(__name__)
router = APIRouter(tags=["scheduler"])
settings = get_settings()

_scheduler: AsyncIOScheduler | None = None
_schedules: dict[str, dict[str, Any]] = {}


def get_scheduler() -> AsyncIOScheduler:
    """Get or create the APScheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler()
    return _scheduler


def start_scheduler() -> None:
    """Start the APScheduler."""
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        logger.info("[Scheduler] Started")


def stop_scheduler() -> None:
    """Stop the APScheduler gracefully."""
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=True)
        logger.info("[Scheduler] Stopped")


async def _scheduled_flow_run(flow_name: str, input_data: dict[str, Any]) -> None:
    """Callback executed by APScheduler — submits a flow to the job queue."""
    run_id = str(uuid.uuid4())
    logger.info("[Scheduler] Triggering %s (run_id=%s)", flow_name, run_id[:8])
    await submit_flow(
        flow_name=flow_name,
        input_data=input_data,
        run_id=run_id,
        org_id=settings.platform_org_id,
    )


@router.post("/flow/{name}/schedule")
async def create_schedule(name: str, request: Request):
    """
    Register or update a cron schedule for a flow.

    Body:
      cron: "0 */6 * * *"  (every 6 hours)
      input: {...}          (default input for scheduled runs)
    """
    body = await request.json()
    cron_expr = body.get("cron", "0 */6 * * *")
    input_data = body.get("input", {"trigger": "cron"})

    scheduler = get_scheduler()
    job_id = f"schedule:{name}"

    # Remove existing job if any
    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)

    # Parse cron expression
    parts = cron_expr.split()
    if len(parts) != 5:
        return {"error": f"Invalid cron expression: {cron_expr}"}, 400

    trigger = CronTrigger(
        minute=parts[0],
        hour=parts[1],
        day=parts[2],
        month=parts[3],
        day_of_week=parts[4],
    )

    scheduler.add_job(
        _scheduled_flow_run,
        trigger=trigger,
        id=job_id,
        args=[name, input_data],
        replace_existing=True,
    )

    _schedules[name] = {
        "flow_name": name,
        "cron": cron_expr,
        "input": input_data,
        "job_id": job_id,
    }

    logger.info("[Scheduler] Registered %s with cron: %s", name, cron_expr)
    return {"status": "scheduled", "flow_name": name, "cron": cron_expr}


@router.get("/schedules")
async def list_schedules():
    """List all active schedules."""
    return {"schedules": list(_schedules.values())}


@router.delete("/flow/{name}/schedule")
async def delete_schedule(name: str):
    """Remove a flow's schedule."""
    scheduler = get_scheduler()
    job_id = f"schedule:{name}"

    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)
        _schedules.pop(name, None)
        return {"status": "removed", "flow_name": name}

    return {"status": "not_found", "flow_name": name}

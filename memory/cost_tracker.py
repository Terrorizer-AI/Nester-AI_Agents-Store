"""
Cost tracker — SQLite-backed cost tracking for LLM spend.

Tracks cumulative cost per user, per flow, and per run.
Enforces soft budgets (80% -> alert) and hard budgets (100% -> block).

Storage: ~/.nester/ops.db via memory.sqlite_ops
"""

import logging
from datetime import datetime, timezone
from typing import Any

from config.settings import get_settings
from memory.sqlite_ops import record_cost as _sqlite_record, get_cost_total

logger = logging.getLogger(__name__)


def _month_start() -> str:
    """Return the first day of the current month as ISO string."""
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


async def record_cost(
    org_id: str,
    flow_name: str,
    run_id: str,
    user_id: str,
    cost_usd: float,
    model: str = "",
    tokens_in: int = 0,
    tokens_out: int = 0,
) -> dict[str, float]:
    """
    Record an LLM call cost. Writes to SQLite with scoped keys.

    Returns current totals for budget checking.
    """
    # Record per-run cost
    _sqlite_record(
        scope="run", scope_key=run_id,
        amount=cost_usd, model=model,
        tokens_in=tokens_in, tokens_out=tokens_out,
    )
    # Record per-flow monthly cost
    _sqlite_record(
        scope="flow_monthly", scope_key=f"{org_id}:{flow_name}",
        amount=cost_usd, model=model,
        tokens_in=tokens_in, tokens_out=tokens_out,
    )
    # Record per-user monthly cost
    _sqlite_record(
        scope="user_monthly", scope_key=f"{org_id}:{user_id}",
        amount=cost_usd, model=model,
        tokens_in=tokens_in, tokens_out=tokens_out,
    )

    since = _month_start()
    run_total = get_cost_total("run", run_id)
    flow_total = get_cost_total("flow_monthly", f"{org_id}:{flow_name}", since=since)
    user_total = get_cost_total("user_monthly", f"{org_id}:{user_id}", since=since)

    return {
        "run_total": run_total,
        "flow_monthly": flow_total,
        "user_monthly": user_total,
    }


async def check_budget(
    org_id: str,
    flow_name: str,
    user_id: str,
) -> dict[str, Any]:
    """
    Check if cost budgets are exceeded.

    Returns:
        {
            "allowed": True/False,
            "flow_spent": float,
            "flow_budget": float,
            "user_spent": float,
            "user_budget": float,
            "alert": True if soft threshold hit,
        }
    """
    settings = get_settings()
    since = _month_start()

    flow_spent = get_cost_total("flow_monthly", f"{org_id}:{flow_name}", since=since)
    user_spent = get_cost_total("user_monthly", f"{org_id}:{user_id}", since=since)

    flow_budget = settings.default_cost_budget_per_flow
    user_budget = settings.default_cost_budget_per_user
    alert_threshold = settings.cost_alert_threshold

    flow_exceeded = flow_spent >= flow_budget
    user_exceeded = user_spent >= user_budget
    flow_alert = flow_spent >= (flow_budget * alert_threshold)
    user_alert = user_spent >= (user_budget * alert_threshold)

    if flow_exceeded:
        logger.warning(
            "[Cost] HARD LIMIT: flow %s/%s spent $%.2f / $%.2f",
            org_id, flow_name, flow_spent, flow_budget,
        )
    elif flow_alert:
        logger.warning(
            "[Cost] SOFT ALERT: flow %s/%s at $%.2f / $%.2f (%.0f%%)",
            org_id, flow_name, flow_spent, flow_budget,
            (flow_spent / flow_budget) * 100,
        )

    return {
        "allowed": not (flow_exceeded or user_exceeded),
        "flow_spent": flow_spent,
        "flow_budget": flow_budget,
        "user_spent": user_spent,
        "user_budget": user_budget,
        "alert": flow_alert or user_alert,
    }


async def get_run_cost(run_id: str) -> float:
    """Get total cost for a specific run."""
    return get_cost_total("run", run_id)

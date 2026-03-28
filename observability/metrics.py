"""
Per-flow metrics — cost tracking, latency targets, error rate thresholds.

Reads from Langfuse Metrics API and Redis cost counters.
Used by the /flow/{name}/dashboard endpoint and alerting system.
"""

import logging
from dataclasses import dataclass
from typing import Any

from memory.cost_tracker import check_budget, get_run_cost

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FlowMetricTargets:
    """Per-flow metric thresholds from the architecture doc."""
    flow_name: str
    cost_per_run_max: float
    latency_p95_seconds: float
    error_rate_max: float
    quality_metric: str
    volume_metric: str


# Targets from the architecture doc (Section 8.2)
METRIC_TARGETS: dict[str, FlowMetricTargets] = {
    "sales_outreach": FlowMetricTargets(
        flow_name="sales_outreach",
        cost_per_run_max=0.18,
        latency_p95_seconds=30.0,
        error_rate_max=0.05,
        quality_metric="human_email_approval_rate",
        volume_metric="prospects_per_day",
    ),
    "github_monitor": FlowMetricTargets(
        flow_name="github_monitor",
        cost_per_run_max=0.05,
        latency_p95_seconds=45.0,
        error_rate_max=0.02,
        quality_metric="false_positive_rate",
        volume_metric="events_per_hour",
    ),
}


def get_targets(flow_name: str) -> FlowMetricTargets | None:
    """Get metric targets for a flow."""
    return METRIC_TARGETS.get(flow_name)


async def get_flow_metrics(
    flow_name: str,
    org_id: str,
    user_id: str = "",
) -> dict[str, Any]:
    """
    Aggregate metrics for a flow — cost, budget status, targets.
    """
    targets = get_targets(flow_name)
    budget = await check_budget(org_id, flow_name, user_id or "system")

    return {
        "flow_name": flow_name,
        "cost": {
            "flow_monthly_spent": budget["flow_spent"],
            "flow_budget": budget["flow_budget"],
            "user_monthly_spent": budget["user_spent"],
            "user_budget": budget["user_budget"],
            "budget_alert": budget["alert"],
        },
        "targets": {
            "cost_per_run_max": targets.cost_per_run_max if targets else None,
            "latency_p95_seconds": targets.latency_p95_seconds if targets else None,
            "error_rate_max": targets.error_rate_max if targets else None,
        },
    }

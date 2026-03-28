"""
GitHub Monitor state schema — TypedDict flowing through the 5-agent pipeline.

Supports dual triggers: webhook (real-time) and cron (scheduled).
Critical events use a fast-path that skips the Productivity Analyzer.
"""

import operator
from typing import Annotated, Any, TypedDict


class GitHubMonitorState(TypedDict, total=False):
    """Shared state for the GitHub Monitor flow."""

    # ── Input / Trigger ───────────────────────────────────────────────────
    trigger: str  # "webhook" | "cron"
    event_type: str  # "pull_request", "dependabot_alert", etc.
    repo: str  # "org/repo-name"
    fast_path: bool  # True for critical events (skip Productivity Analyzer)
    normalized_event: dict[str, Any]

    # ── Agent 1: Event Collector ──────────────────────────────────────────
    normalized_events: list[dict[str, Any]]
    event_summary: dict[str, Any]

    # ── Agent 2: Security Analyzer ────────────────────────────────────────
    security_alerts: list[dict[str, Any]]
    severity_counts: dict[str, int]
    unresolved_critical: int

    # ── Agent 3: Productivity Analyzer ────────────────────────────────────
    productivity_metrics: dict[str, Any]
    bottleneck_report: dict[str, Any]
    trends: dict[str, Any]

    # ── Agent 4: Intelligence Synthesizer ─────────────────────────────────
    weekly_report: str
    anomalies: list[dict[str, Any]]
    recommendations: list[str]

    # ── Agent 5: Action Dispatcher ────────────────────────────────────────
    actions_taken: list[dict[str, Any]]
    metrics_stored: bool
    alerts_sent: list[dict[str, Any]]

    # ── Pipeline metadata ─────────────────────────────────────────────────
    errors: Annotated[list[dict[str, Any]], operator.add]
    run_id: str
    flow_version: str

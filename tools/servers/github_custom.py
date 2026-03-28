"""
Custom GitHub MCP server — webhook queue metrics, PR cycle time, commit velocity.

Supplements the official GitHub MCP server with computed metrics and
webhook event queue access. Runs as a FastMCP HTTP server on port 8100.

Tools:
  - get_webhook_events: Read events from SQLite webhook queue
  - compute_pr_metrics: PR cycle time, review turnaround, merge rate
  - compute_commit_velocity: Commits per day/week, contributor activity
  - get_review_bottlenecks: Identify slow reviewers and stale PRs
"""

from datetime import datetime, timezone
from typing import Any

from fastmcp import FastMCP

mcp = FastMCP("github_custom", description="Custom GitHub metrics and webhook queue")


@mcp.tool()
async def get_webhook_events(
    repo: str,
    event_type: str = "",
    count: int = 50,
) -> list[dict[str, Any]]:
    """Read recent webhook events from the SQLite queue for a repository."""
    from memory.sqlite_ops import pop_webhooks

    # Pop pending webhooks (marks them as processing)
    events = pop_webhooks(limit=count)

    # Filter by source (github:{repo}) and optionally by event_type
    filtered = [
        e for e in events
        if e.get("source", "").endswith(repo)
        and (not event_type or e.get("event_type") == event_type)
    ]

    return filtered


@mcp.tool()
async def compute_pr_metrics(
    repo: str,
    days: int = 30,
) -> dict[str, Any]:
    """
    Compute PR metrics for a repository over the given time window.

    Returns: cycle_time_hours, review_turnaround_hours, merge_rate,
    open_prs, merged_prs, avg_comments_per_pr.
    """
    # In production, this queries GitHub API + cached data from Supabase
    return {
        "repo": repo,
        "period_days": days,
        "cycle_time_hours": 0,
        "review_turnaround_hours": 0,
        "merge_rate": 0,
        "open_prs": 0,
        "merged_prs": 0,
        "avg_comments_per_pr": 0,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "_note": "Connect GitHub API to populate real data",
    }


@mcp.tool()
async def compute_commit_velocity(
    repo: str,
    days: int = 30,
) -> dict[str, Any]:
    """
    Compute commit velocity metrics for a repository.

    Returns: commits_per_day, unique_contributors, most_active_contributor,
    busiest_day, commit_trend.
    """
    return {
        "repo": repo,
        "period_days": days,
        "commits_per_day": 0,
        "unique_contributors": 0,
        "most_active_contributor": "",
        "busiest_day": "",
        "commit_trend": "stable",
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "_note": "Connect GitHub API to populate real data",
    }


@mcp.tool()
async def get_review_bottlenecks(
    repo: str,
    threshold_hours: int = 48,
) -> dict[str, Any]:
    """
    Identify review bottlenecks — slow reviewers and stale PRs.

    Returns: stale_prs (not reviewed in >threshold_hours),
    slow_reviewers (avg review time above threshold).
    """
    return {
        "repo": repo,
        "threshold_hours": threshold_hours,
        "stale_prs": [],
        "slow_reviewers": [],
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "_note": "Connect GitHub API to populate real data",
    }


if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=8100)

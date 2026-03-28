"""
Structured audit logging — separate from Langfuse traces.

Captures the 5W for every significant action:
  Who:   actor ID + type (user, agent, system, webhook)
  What:  action + resource
  When:  UTC millisecond timestamp
  Where: IP + session + flow context
  Why:   outcome (success/failure + error)

Additional agent-specific fields:
  flow_version, tools_called[], llm_model, token_usage, delegation_chain

Stored in SQLite append-only audit_log table.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# In-memory buffer for batch writes (flushed periodically)
_audit_buffer: list[dict[str, Any]] = []
BUFFER_FLUSH_SIZE = 50


async def log_audit(
    actor_id: str,
    actor_type: str,
    action: str,
    resource: str,
    outcome: str,
    flow_name: str = "",
    flow_version: str = "",
    run_id: str = "",
    org_id: str = "",
    ip_address: str = "",
    error: str = "",
    tools_called: list[str] | None = None,
    llm_model: str = "",
    token_usage: dict[str, int] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """
    Record an audit log entry.

    Args:
        actor_id: Who performed the action (user ID, agent name, "system")
        actor_type: "user" | "agent" | "system" | "webhook" | "scheduler"
        action: What happened ("flow_started", "tool_called", "email_sent", etc.)
        resource: What was acted on ("flow:sales_outreach", "tool:linkedin", etc.)
        outcome: "success" | "failure" | "skipped" | "rejected"
    """
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actor_id": actor_id,
        "actor_type": actor_type,
        "action": action,
        "resource": resource,
        "outcome": outcome,
        "flow_name": flow_name,
        "flow_version": flow_version,
        "run_id": run_id,
        "org_id": org_id,
        "ip_address": ip_address,
        "error": error,
        "tools_called": tools_called or [],
        "llm_model": llm_model,
        "token_usage": token_usage or {},
        "metadata": metadata or {},
    }

    _audit_buffer.append(entry)
    logger.debug("[Audit] %s %s %s -> %s", actor_type, action, resource, outcome)

    # Flush when buffer is full
    if len(_audit_buffer) >= BUFFER_FLUSH_SIZE:
        await flush_audit_buffer()


async def flush_audit_buffer() -> int:
    """Flush buffered audit entries to SQLite. Returns count flushed."""
    global _audit_buffer

    if not _audit_buffer:
        return 0

    entries = _audit_buffer.copy()
    _audit_buffer = []

    try:
        from memory.sqlite_ops import audit_log

        for entry in entries:
            audit_log(
                action=entry["action"],
                resource=entry.get("resource", ""),
                actor=entry.get("actor_id", ""),
                outcome=entry.get("outcome", "success"),
                metadata={
                    k: v for k, v in entry.items()
                    if k not in ("action", "resource", "actor_id", "outcome")
                },
            )
        logger.info("[Audit] Flushed %d entries to SQLite", len(entries))
        return len(entries)
    except Exception as e:
        logger.warning("[Audit] Flush failed: %s — entries lost", e)
        return 0


async def query_audit_logs(
    org_id: str,
    flow_name: str = "",
    actor_id: str = "",
    action: str = "",
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Query audit logs from SQLite."""
    try:
        from memory.sqlite_ops import _get_conn

        conn = _get_conn()
        query = "SELECT * FROM audit_log WHERE 1=1"
        params: list[Any] = []

        if org_id:
            query += " AND metadata LIKE ?"
            params.append(f'%"org_id": "{org_id}"%')
        if action:
            query += " AND action = ?"
            params.append(action)

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []

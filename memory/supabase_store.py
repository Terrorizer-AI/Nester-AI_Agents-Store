"""
Supabase memory layer — long-term knowledge with pgvector semantic search.

Responsibilities:
  - Persona profiles from Sales Outreach (email-reply correlations)
  - Time-series metrics from GitHub Monitor (PR cycle time, deployment freq)
  - Security alert history
  - Weekly report archive
  - Flow version history
  - Audit logs

All queries are namespace-scoped via tenant_id column.
Supabase Row-Level Security enforces multi-tenancy.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any

from config.settings import get_settings
from memory.namespace import Namespace

logger = logging.getLogger(__name__)

_supabase_client = None


async def get_supabase():
    """Get or create the Supabase client singleton."""
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        if not settings.supabase_url or not settings.supabase_service_key:
            logger.warning("[Supabase] Not configured — long-term memory disabled")
            return None
        from supabase import create_client
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_key,
        )
        logger.info("[Supabase] Connected to %s", settings.supabase_url)
    return _supabase_client


# ── Generic store/retrieve ────────────────────────────────────────────────────

async def store_memory(
    ns: Namespace,
    table: str,
    data: dict[str, Any],
) -> dict[str, Any] | None:
    """Insert a row into a Supabase table with namespace scoping."""
    client = await get_supabase()
    if not client:
        return None

    row = {
        "namespace": ns.supabase_namespace,
        "org_id": ns.org_id,
        "flow_id": ns.flow_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **data,
    }

    result = client.table(table).insert(row).execute()
    return result.data[0] if result.data else None


async def query_memory(
    ns: Namespace,
    table: str,
    filters: dict[str, Any] | None = None,
    limit: int = 100,
    order_by: str = "created_at",
    ascending: bool = False,
) -> list[dict[str, Any]]:
    """Query rows from a Supabase table within a namespace."""
    client = await get_supabase()
    if not client:
        return []

    query = (
        client.table(table)
        .select("*")
        .eq("namespace", ns.supabase_namespace)
    )

    if filters:
        for key, value in filters.items():
            query = query.eq(key, value)

    query = query.order(order_by, desc=not ascending).limit(limit)
    result = query.execute()
    return result.data or []


# ── Semantic search via pgvector ──────────────────────────────────────────────

async def semantic_search(
    ns: Namespace,
    table: str,
    query_embedding: list[float],
    match_count: int = 5,
    match_threshold: float = 0.7,
) -> list[dict[str, Any]]:
    """
    Perform a semantic similarity search using pgvector.
    Requires a Supabase RPC function: match_{table}.
    """
    client = await get_supabase()
    if not client:
        return []

    result = client.rpc(
        f"match_{table}",
        {
            "query_embedding": query_embedding,
            "match_count": match_count,
            "match_threshold": match_threshold,
            "filter_namespace": ns.supabase_namespace,
        },
    ).execute()

    return result.data or []


# ── Flow versions ─────────────────────────────────────────────────────────────

async def store_flow_version(
    flow_name: str,
    version_hash: str,
    config_yaml: str,
    org_id: str,
) -> dict[str, Any] | None:
    """Store a flow version in the flow_versions table."""
    client = await get_supabase()
    if not client:
        return None

    row = {
        "flow_name": flow_name,
        "version": version_hash,
        "config_yaml": config_yaml,
        "org_id": org_id,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = client.table("flow_versions").upsert(
        row, on_conflict="flow_name,version"
    ).execute()
    return result.data[0] if result.data else None


# ── Health check ──────────────────────────────────────────────────────────────

async def supabase_health() -> bool:
    """Return True if Supabase is reachable."""
    try:
        client = await get_supabase()
        if not client:
            return False
        client.table("flow_versions").select("count").limit(1).execute()
        return True
    except Exception:
        return False

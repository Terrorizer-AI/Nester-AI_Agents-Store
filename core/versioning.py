"""
Flow versioning — tracks config versions for debugging, A/B testing,
and canary deployments.

Each flow YAML change produces a new version entry in Supabase's
flow_versions table. The config hash is stored in checkpoint metadata
so any trace can be linked back to the exact config that produced it.

For A/B testing: route traffic by user segment to different versions.
For canary: route 5% to new version, monitor errors, auto-revert.
"""

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FlowVersion:
    """Immutable snapshot of a flow configuration."""
    flow_name: str
    version: str  # SHA-256 hash prefix
    config_yaml: str
    created_at: str
    is_active: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


# In-memory version store (backed by Supabase in production)
_versions: dict[str, list[FlowVersion]] = {}


def register_version(flow_name: str, config_yaml: str) -> FlowVersion:
    """
    Register a new flow version. Returns the FlowVersion.
    Idempotent — same YAML content produces the same version hash.
    """
    version_hash = hashlib.sha256(config_yaml.encode()).hexdigest()[:16]

    # Check if this exact version already exists
    existing = _versions.get(flow_name, [])
    for v in existing:
        if v.version == version_hash:
            return v

    version = FlowVersion(
        flow_name=flow_name,
        version=version_hash,
        config_yaml=config_yaml,
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    if flow_name not in _versions:
        _versions[flow_name] = []
    _versions[flow_name].append(version)

    logger.info(
        "[Versioning] Registered %s v%s (%d total versions)",
        flow_name, version_hash, len(_versions[flow_name]),
    )
    return version


def get_active_version(flow_name: str) -> FlowVersion | None:
    """Return the currently active version for a flow."""
    versions = _versions.get(flow_name, [])
    for v in reversed(versions):
        if v.is_active:
            return v
    return None


def list_versions(flow_name: str) -> list[FlowVersion]:
    """Return all versions for a flow, newest first."""
    return list(reversed(_versions.get(flow_name, [])))


def get_version_metadata(flow_name: str) -> dict[str, Any]:
    """Return version info suitable for trace/checkpoint metadata."""
    active = get_active_version(flow_name)
    if not active:
        return {"flow_name": flow_name, "flow_version": "unknown"}
    return {
        "flow_name": flow_name,
        "flow_version": active.version,
        "version_created_at": active.created_at,
    }

"""
Integrations endpoint — list, inspect, and manage MCP tool servers.

GET  /integrations          -> List all servers with health + OAuth connection status
GET  /integrations/{name}   -> Server detail with full tool schemas
"""

import logging
from typing import Any

from fastapi import APIRouter

from tools.registry import list_servers, get_server_config, MCPServerConfig
from tools.health import get_health
from auth.providers import PROVIDERS
from memory.sqlite_ops import list_oauth_connections, get_oauth_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["integrations"])


# ── Map integration names to their OAuth provider ────────────────────────────

_INTEGRATION_TO_PROVIDER: dict[str, str] = {
    integ: prov_name
    for prov_name, prov in PROVIDERS.items()
    for integ in prov.powers_integrations
}


def _oauth_status_for_integration(integration_name: str) -> dict[str, Any]:
    """Get OAuth connection status for an integration."""
    provider_name = _INTEGRATION_TO_PROVIDER.get(integration_name)

    if provider_name is None:
        # Not an OAuth integration (e.g. web_scraper, search — auto-connected)
        return {
            "auth_type": "none",
            "connected": True,
            "provider": None,
            "user_name": None,
        }

    token = get_oauth_token(provider_name)
    if token is None:
        return {
            "auth_type": "oauth",
            "connected": False,
            "provider": provider_name,
            "user_name": None,
        }

    return {
        "auth_type": "oauth",
        "connected": True,
        "provider": provider_name,
        "user_name": token["provider_user_name"],
        "connected_at": token["connected_at"],
    }


def _serialize_server(config: MCPServerConfig) -> dict[str, Any]:
    """Convert a server config + health + OAuth into a JSON-serializable dict."""
    health = get_health(config.name)
    return {
        "name": config.name,
        "description": config.description,
        "transport": config.transport.value,
        "url": config.url,
        "enabled": config.enabled,
        "tools_count": len(config.tools_provided),
        "tools": config.tools_provided,
        "used_by": config.used_by,
        "health": {
            "healthy": health.is_healthy,
            "last_check": health.last_check,
            "latency_ms": round(health.last_latency_ms, 1),
            "consecutive_failures": health.consecutive_failures,
        },
        "connection": _oauth_status_for_integration(config.name),
    }


@router.get("/integrations")
async def list_integrations():
    """Return all registered MCP servers with health status and OAuth connection."""
    servers = list_servers()
    serialized = [_serialize_server(s) for s in servers]
    connected_count = sum(1 for s in serialized if s["connection"]["connected"])

    return {
        "integrations": serialized,
        "total_servers": len(servers),
        "total_tools": sum(len(s.tools_provided) for s in servers),
        "connected_count": connected_count,
    }


@router.get("/integrations/{name}")
async def get_integration(name: str):
    """Return full detail for a single integration including tool schemas."""
    try:
        config = get_server_config(name)
    except KeyError:
        return {"error": f"Integration not found: {name}"}

    health = get_health(config.name)

    tools_detail = [
        {
            "name": schema.name,
            "description": schema.description,
            "parameters": schema.parameters,
        }
        for schema in config.tool_schemas
    ]

    return {
        "name": config.name,
        "description": config.description,
        "transport": config.transport.value,
        "url": config.url,
        "enabled": config.enabled,
        "used_by": config.used_by,
        "tools": tools_detail,
        "health": {
            "healthy": health.is_healthy,
            "last_check": health.last_check,
            "latency_ms": round(health.last_latency_ms, 1),
            "consecutive_failures": health.consecutive_failures,
            "total_checks": health.total_checks,
            "total_failures": health.total_failures,
        },
        "connection": _oauth_status_for_integration(config.name),
    }

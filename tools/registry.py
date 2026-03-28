"""
MCP tool registry — central mapping of server names to connection configs.

When the graph builder creates an agent node, it reads the mcp_tools list
from the YAML config and constructs a client with only the servers that
agent needs. Agents declare tool dependencies and never manage connections.
"""

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import yaml
from pathlib import Path

logger = logging.getLogger(__name__)


class TransportType(str, Enum):
    STDIO = "stdio"
    HTTP = "http"
    STREAMABLE_HTTP = "streamable-http"


@dataclass(frozen=True)
class MCPToolSchema:
    """Schema for a single MCP tool (used to create LangChain tools)."""
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema
    server_name: str


@dataclass(frozen=True)
class MCPServerConfig:
    """Configuration for a single MCP tool server."""
    name: str
    transport: TransportType
    url: str = ""
    command: str = ""
    args: list[str] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)
    description: str = ""
    tools_provided: list[str] = field(default_factory=list)
    tool_schemas: list[MCPToolSchema] = field(default_factory=list)
    used_by: list[str] = field(default_factory=list)
    enabled: bool = True


# ── Registry ──────────────────────────────────────────────────────────────────
_TOOL_REGISTRY: dict[str, MCPServerConfig] = {}


def _parse_tools(server_name: str, raw_tools: list) -> tuple[list[str], list[MCPToolSchema]]:
    """Parse tools_provided — supports both plain strings and rich dicts."""
    names: list[str] = []
    schemas: list[MCPToolSchema] = []

    for entry in raw_tools:
        if isinstance(entry, str):
            names.append(entry)
        elif isinstance(entry, dict):
            name = entry["name"]
            names.append(name)
            schemas.append(MCPToolSchema(
                name=name,
                description=entry.get("description", ""),
                parameters=entry.get("parameters", {"type": "object", "properties": {}}),
                server_name=server_name,
            ))
    return names, schemas


def load_registry(config_path: str | None = None) -> None:
    """Load MCP server configs from YAML file."""
    global _TOOL_REGISTRY

    if config_path is None:
        config_path = str(Path(__file__).parent / "mcp_config.yaml")

    path = Path(config_path)
    if not path.exists():
        logger.warning("[ToolRegistry] Config not found: %s", config_path)
        return

    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    servers = raw.get("servers", [])

    for srv in servers:
        tool_names, tool_schemas = _parse_tools(srv["name"], srv.get("tools_provided", []))
        config = MCPServerConfig(
            name=srv["name"],
            transport=TransportType(srv.get("transport", "http")),
            url=srv.get("url", ""),
            command=srv.get("command", ""),
            args=srv.get("args", []),
            env=srv.get("env", {}),
            description=srv.get("description", ""),
            tools_provided=tool_names,
            tool_schemas=tool_schemas,
            used_by=srv.get("used_by", []),
            enabled=srv.get("enabled", True),
        )
        _TOOL_REGISTRY[config.name] = config

    total_tools = sum(len(c.tool_schemas) for c in _TOOL_REGISTRY.values())
    logger.info(
        "[ToolRegistry] Loaded %d MCP servers (%d tools) from %s",
        len(_TOOL_REGISTRY), total_tools, config_path,
    )


def get_server_config(name: str) -> MCPServerConfig:
    """Get a registered MCP server config by name."""
    if name not in _TOOL_REGISTRY:
        available = ", ".join(sorted(_TOOL_REGISTRY)) or "(none)"
        raise KeyError(f"Unknown MCP server: {name!r}. Registered: {available}")
    return _TOOL_REGISTRY[name]


def get_tool_schemas(server_name: str) -> list[MCPToolSchema]:
    """Return tool schemas for a registered MCP server."""
    config = get_server_config(server_name)
    return list(config.tool_schemas)


def get_servers_for_agent(tool_names: list[str]) -> list[MCPServerConfig]:
    """Return configs for the MCP servers an agent needs."""
    configs = []
    for name in tool_names:
        if name in _TOOL_REGISTRY:
            config = _TOOL_REGISTRY[name]
            if config.enabled:
                configs.append(config)
            else:
                logger.warning("[ToolRegistry] Server %s is disabled", name)
        else:
            logger.warning("[ToolRegistry] Unknown server: %s", name)
    return configs


def list_servers() -> list[MCPServerConfig]:
    """Return all registered MCP server configs."""
    return list(_TOOL_REGISTRY.values())


def is_server_enabled(name: str) -> bool:
    """Check if a server is registered and enabled."""
    config = _TOOL_REGISTRY.get(name)
    return config.enabled if config else False

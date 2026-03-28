"""
LangChain bridge — converts MCP tool schemas into LangChain StructuredTool instances.

Each tool's async callable routes through the interceptor chain
(rate limit → circuit breaker → timeout → logging) and the Redis cache layer.

Supports two MCP transports:
  - HTTP: plain JSON-RPC POST (FastMCP custom servers)
  - Streamable HTTP: SSE-based MCP protocol (stickerdaniel/linkedin-mcp-server)

This is the single bridge between the MCP registry and LangChain's tool-calling protocol.
"""

import json
import logging
from typing import Any

import aiohttp
import httpx
from langchain_core.tools import StructuredTool

from tools.cache import get_cached_result, set_cached_result
from tools.interceptors import intercepted_tool_call
from tools.registry import (
    MCPServerConfig,
    MCPToolSchema,
    TransportType,
    get_server_config,
    get_tool_schemas,
)

logger = logging.getLogger(__name__)

# ── Session cache for Streamable HTTP servers ────────────────────────────────
_MCP_SESSIONS: dict[str, str] = {}  # server_name → session_id


def build_langchain_tools(server_names: list[str]) -> list[StructuredTool]:
    """
    Convert MCP server tool definitions into LangChain StructuredTool instances.

    Each tool is wired through the interceptor chain and cache layer.
    Servers that are unreachable will produce tools that return graceful error dicts.
    """
    tools: list[StructuredTool] = []

    for server_name in server_names:
        try:
            schemas = get_tool_schemas(server_name)
            server_config = get_server_config(server_name)
        except KeyError:
            logger.warning("[Bridge] Unknown server %s — skipping tools", server_name)
            continue

        for schema in schemas:
            tool = _create_tool(schema, server_config)
            tools.append(tool)
            logger.debug("[Bridge] Created tool: %s.%s", server_name, schema.name)

    logger.info(
        "[Bridge] Built %d LangChain tools from servers: %s",
        len(tools), server_names,
    )
    return tools


def _json_schema_to_pydantic(tool_name: str, schema: dict[str, Any]) -> type:
    """Convert a JSON Schema object to a Pydantic model for LangChain args_schema."""
    from pydantic import BaseModel, Field

    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    field_definitions: dict[str, Any] = {}

    type_map = {"string": str, "integer": int, "number": float, "boolean": bool}

    for prop_name, prop_schema in properties.items():
        prop_type = type_map.get(prop_schema.get("type", "string"), str)
        description = prop_schema.get("description", "")
        default = prop_schema.get("default")

        if prop_name in required:
            field_definitions[prop_name] = (prop_type, Field(description=description))
        else:
            field_definitions[prop_name] = (
                prop_type | None,
                Field(default=default, description=description),
            )

    model = type(
        f"{tool_name}_args",
        (BaseModel,),
        {"__annotations__": {k: v[0] for k, v in field_definitions.items()},
         **{k: v[1] for k, v in field_definitions.items()}},
    )
    return model


def _create_tool(schema: MCPToolSchema, server_config: MCPServerConfig) -> StructuredTool:
    """Create a single LangChain StructuredTool from an MCP tool schema."""

    async def _execute(**kwargs: Any) -> str:
        """Execute MCP tool call through interceptor chain with caching."""
        from tools.direct_tools import DIRECT_FALLBACKS

        server_name = schema.server_name
        tool_name = schema.name

        # 1. Check cache (skip cached errors)
        cached = await get_cached_result(server_name, tool_name, kwargs)
        if cached is not None:
            is_cached_error = isinstance(cached, dict) and (
                cached.get("error") or cached.get("unavailable")
            )
            if not is_cached_error:
                return json.dumps(cached, default=str)

        # 2. Build the actual MCP call function
        async def _mcp_call(tool_input: dict[str, Any]) -> Any:
            return await _call_mcp_server(server_config, tool_name, tool_input)

        # 3. Execute through interceptor chain (rate limit, circuit breaker, timeout)
        result = await intercepted_tool_call(
            tool_fn=_mcp_call,
            tool_input=kwargs,
            server_name=server_name,
            tool_name=tool_name,
        )

        # 4. If MCP server is unavailable, try direct fallback
        if isinstance(result, dict) and result.get("unavailable"):
            fallback_fn = DIRECT_FALLBACKS.get(tool_name)
            if fallback_fn:
                logger.debug("[Bridge] MCP unavailable, using direct fallback for %s", tool_name)
                result = await fallback_fn(**kwargs)

        # 5. Cache the result (never cache errors)
        is_error = isinstance(result, dict) and (
            result.get("skipped") or result.get("error") or result.get("unavailable")
        )
        if not is_error:
            await set_cached_result(server_name, tool_name, kwargs, result)

        return json.dumps(result, default=str) if not isinstance(result, str) else result

    # Build a Pydantic model from the JSON Schema so LangChain passes correct args
    args_schema = _json_schema_to_pydantic(schema.name, schema.parameters)

    return StructuredTool.from_function(
        func=None,  # sync version not needed
        coroutine=_execute,
        name=schema.name,
        description=schema.description,
        args_schema=args_schema,
    )


async def _call_mcp_server(
    config: MCPServerConfig,
    tool_name: str,
    arguments: dict[str, Any],
) -> Any:
    """
    Call an MCP server tool.

    Routes to the appropriate transport handler:
    - HTTP: plain JSON-RPC POST (FastMCP custom servers)
    - Streamable HTTP: SSE-based MCP protocol with session management
    - stdio: placeholder (requires subprocess management)
    """
    if config.transport == TransportType.HTTP:
        return await _call_http_server(config, tool_name, arguments)
    elif config.transport == TransportType.STREAMABLE_HTTP:
        return await _call_streamable_http_server(config, tool_name, arguments)
    elif config.transport == TransportType.STDIO:
        return {
            "error": f"stdio transport not yet implemented for {config.name}",
            "tool": tool_name,
            "server": config.name,
        }
    else:
        return {"error": f"Unknown transport: {config.transport}"}


async def _call_http_server(
    config: MCPServerConfig,
    tool_name: str,
    arguments: dict[str, Any],
) -> Any:
    """
    Call an HTTP-transport MCP server.

    FastMCP servers expose tools at POST /tools/call with JSON-RPC format.
    Third-party MCP servers (like linkedin-mcp) use streamable-http at their URL.
    """
    url = config.url.rstrip("/")

    # MCP JSON-RPC 2.0 request
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
        "id": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

            # Handle JSON-RPC response
            if "result" in data:
                return data["result"]
            elif "error" in data:
                return {"error": data["error"].get("message", str(data["error"]))}
            else:
                return data

    except httpx.ConnectError:
        logger.debug("[Bridge] Cannot connect to %s at %s", config.name, url)
        return {
            "error": f"MCP server {config.name} is not reachable at {url}",
            "unavailable": True,
        }
    except httpx.HTTPStatusError as exc:
        logger.error("[Bridge] HTTP error from %s: %s", config.name, exc)
        return {"error": f"HTTP {exc.response.status_code} from {config.name}", "unavailable": True}
    except Exception as exc:
        logger.error("[Bridge] Unexpected error calling %s: %s", config.name, exc)
        return {"error": str(exc), "unavailable": True}


# ── Streamable HTTP (SSE) Transport ──────────────────────────────────────────
# Uses aiohttp instead of httpx because httpx sends absolute-form URIs that
# Docker port-forwarded uvicorn servers reject as 404.


def _parse_sse_data(text: str) -> dict[str, Any] | None:
    """Extract the JSON data from an SSE event stream response."""
    for line in text.splitlines():
        if line.startswith("data: "):
            try:
                return json.loads(line[6:])
            except json.JSONDecodeError:
                continue
    return None


_SSE_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}


async def _ensure_mcp_session(
    session: aiohttp.ClientSession,
    url: str,
    server_name: str,
) -> str:
    """Initialize an MCP session if we don't have one, return session ID."""
    if server_name in _MCP_SESSIONS:
        return _MCP_SESSIONS[server_name]

    # Step 1: Initialize
    init_payload = {
        "jsonrpc": "2.0",
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "nester-platform", "version": "1.0.0"},
        },
        "id": 1,
    }

    async with session.post(url, json=init_payload, headers=_SSE_HEADERS) as resp:
        resp.raise_for_status()
        session_id = resp.headers.get("mcp-session-id", "")
        if not session_id:
            logger.warning("[Bridge] No session ID from %s", server_name)

    # Step 2: Send initialized notification
    notify_headers = {**_SSE_HEADERS}
    if session_id:
        notify_headers["Mcp-Session-Id"] = session_id

    async with session.post(
        url,
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        headers=notify_headers,
    ) as resp:
        pass  # 202 Accepted or 200 OK — both fine

    if session_id:
        _MCP_SESSIONS[server_name] = session_id
        logger.info("[Bridge] MCP session for %s: %s", server_name, session_id[:12])

    return session_id


async def _call_streamable_http_server(
    config: MCPServerConfig,
    tool_name: str,
    arguments: dict[str, Any],
) -> Any:
    """
    Call a Streamable HTTP MCP server (SSE-based protocol).

    Manages session lifecycle: initialize → tools/call → parse SSE response.
    Uses aiohttp for correct HTTP/1.1 relative-path requests.
    """
    url = config.url.rstrip("/")
    timeout = aiohttp.ClientTimeout(total=60)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            session_id = await _ensure_mcp_session(session, url, config.name)

            payload = {
                "jsonrpc": "2.0",
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": arguments,
                },
                "id": 2,
            }

            headers = {**_SSE_HEADERS}
            if session_id:
                headers["Mcp-Session-Id"] = session_id

            async with session.post(url, json=payload, headers=headers) as resp:
                resp.raise_for_status()
                text = await resp.text()

                content_type = resp.headers.get("content-type", "")
                if "text/event-stream" in content_type:
                    data = _parse_sse_data(text)
                else:
                    data = json.loads(text)

            if data is None:
                return {"error": f"Empty response from {config.name} for {tool_name}"}

            if "result" in data:
                return data["result"]
            elif "error" in data:
                return {"error": data["error"].get("message", str(data["error"]))}
            else:
                return data

    except aiohttp.ClientConnectorError:
        logger.debug("[Bridge] Cannot connect to %s at %s", config.name, url)
        return {
            "error": f"MCP server {config.name} is not reachable at {url}",
            "unavailable": True,
        }
    except aiohttp.ClientResponseError as exc:
        logger.error("[Bridge] HTTP %d from %s", exc.status, config.name)
        _MCP_SESSIONS.pop(config.name, None)
        return {"error": f"HTTP {exc.status} from {config.name}"}
    except Exception as exc:
        logger.error("[Bridge] Streamable HTTP error calling %s: %s", config.name, exc)
        _MCP_SESSIONS.pop(config.name, None)
        return {"error": str(exc)}

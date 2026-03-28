"""
YAML hot-reload — detects flow config changes without server restarts.

Uses hash-based cache invalidation:
  - Each compiled graph is cached with its config's SHA-256 hash
  - On every new run, the hash is rechecked
  - If changed, the graph is rebuilt and cached
  - In-progress runs continue with the original graph

Critical rule from LangGraph docs: changing topology mid-thread corrupts
state. New runs get the latest graph; running flows keep the original.
"""

import hashlib
import logging
from pathlib import Path
from typing import Any

from core.engine import FLOWS_DIR, build_graph, load_flow_config

logger = logging.getLogger(__name__)

# flow_name → {"hash": str, "graph": CompiledGraph, "config": dict}
_graph_cache: dict[str, dict[str, Any]] = {}


def get_or_build_graph(
    flow_name: str,
    checkpointer: Any = None,
) -> tuple[Any, dict[str, Any]]:
    """
    Return a compiled graph for a flow, rebuilding only if the YAML changed.

    Returns (compiled_graph, flow_config).
    """
    yaml_path = FLOWS_DIR / f"{flow_name}.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(f"Flow config not found: {yaml_path}")

    content = yaml_path.read_text(encoding="utf-8")
    config_hash = hashlib.sha256(content.encode()).hexdigest()[:16]

    cached = _graph_cache.get(flow_name)
    if cached and cached["hash"] == config_hash:
        logger.debug("[HotReload] Cache hit for %s (hash=%s)", flow_name, config_hash)
        return cached["graph"], cached["config"]

    # Cache miss — rebuild
    logger.info(
        "[HotReload] Rebuilding graph for %s (hash=%s → %s)",
        flow_name,
        cached["hash"] if cached else "none",
        config_hash,
    )

    config = load_flow_config(flow_name)
    graph = build_graph(config)
    compiled = graph.compile(checkpointer=checkpointer)

    _graph_cache[flow_name] = {
        "hash": config_hash,
        "graph": compiled,
        "config": config,
    }

    return compiled, config


def invalidate_cache(flow_name: str | None = None) -> None:
    """Force cache invalidation. If flow_name is None, clears all."""
    if flow_name:
        _graph_cache.pop(flow_name, None)
        logger.info("[HotReload] Invalidated cache for %s", flow_name)
    else:
        _graph_cache.clear()
        logger.info("[HotReload] Invalidated all cached graphs")


def get_cached_flows() -> dict[str, str]:
    """Return {flow_name: config_hash} for all cached graphs."""
    return {name: info["hash"] for name, info in _graph_cache.items()}

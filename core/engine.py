"""
LangGraph engine — YAML-driven graph builder.

Reads flow definitions from flows/*.yaml, resolves node types from the
registry, constructs StateGraphs with sequential + conditional edges,
and compiles them. New flows require zero infrastructure changes.

Key design decisions:
  - Sequential pattern (not ReAct) per the architecture doc
  - Conditional error edges: retry → skip → abort
  - Parallel branches: YAML edges with type: parallel fan-out from one node
    to many, then a no-op join node merges state before continuing
  - Config hash stored in metadata for versioning

Parallel edge YAML syntax:
  edges:
    - from: linkedin_researcher
      to: [company_researcher, company_linkedin_researcher]   # fan-out
      type: parallel
    - from: [company_researcher, company_linkedin_researcher]  # fan-in
      to: activity_analyzer
      type: join
"""

import hashlib
import logging
from pathlib import Path
from typing import Any

import yaml
from langgraph.graph import END, StateGraph

from core.registry import get_node_factory

logger = logging.getLogger(__name__)

FLOWS_DIR = Path(__file__).parent.parent / "flows"


def load_flow_config(flow_name: str) -> dict[str, Any]:
    """Load and parse a YAML flow definition."""
    yaml_path = FLOWS_DIR / f"{flow_name}.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(f"Flow config not found: {yaml_path}")
    content = yaml_path.read_text(encoding="utf-8")
    config = yaml.safe_load(content)
    config["_raw"] = content
    config["_hash"] = hashlib.sha256(content.encode()).hexdigest()[:16]
    return config


def _resolve_state_schema(schema_ref: str) -> type:
    """
    Dynamically import a TypedDict state schema from schemas/ module.

    schema_ref format: "schemas.sales_outreach.SalesOutreachState"
    """
    parts = schema_ref.rsplit(".", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid schema ref: {schema_ref!r}. Expected 'module.ClassName'")
    module_path, class_name = parts
    import importlib
    mod = importlib.import_module(module_path)
    schema_cls = getattr(mod, class_name)
    return schema_cls


def build_graph(config: dict[str, Any]) -> StateGraph:
    """
    Build a LangGraph StateGraph from a parsed YAML config.

    Config structure:
        name: sales_outreach
        schema: schemas.sales_outreach.SalesOutreachState
        trigger: user | webhook | cron
        memory_namespace: "{org_id}/sales_outreach/{session_id}"
        nodes:
          - id: linkedin_researcher
            type: linkedin_researcher
            model_role: research
            mcp_tools: [linkedin]
            retry: 3
            on_error: retry_then_skip
          ...
        edges:
          - from: linkedin_researcher
            to: company_researcher
          ...
    """
    flow_name = config["name"]
    schema_cls = _resolve_state_schema(config["schema"])

    graph = StateGraph(schema_cls)

    # ── Register nodes ────────────────────────────────────────────────────
    node_configs = {n["id"]: n for n in config["nodes"]}

    for node_def in config["nodes"]:
        node_id = node_def["id"]
        node_type = node_def.get("type", node_id)
        mcp_tool_names = node_def.get("mcp_tools", [])
        params = {
            "model_role": node_def.get("model_role", "research"),
            "mcp_tools": mcp_tool_names,
            "retry": node_def.get("retry", 3),
            "on_error": node_def.get("on_error", "retry_then_skip"),
            "config": node_def.get("config", {}),
            "tools": [],
        }

        # Pre-build LangChain tools from MCP server definitions
        if mcp_tool_names:
            try:
                from tools.langchain_bridge import build_langchain_tools
                tools = build_langchain_tools(mcp_tool_names)
                params["tools"] = tools
                logger.info(
                    "[Engine] Node %s: bound %d tools from %s",
                    node_id, len(tools), mcp_tool_names,
                )
            except Exception as exc:
                logger.warning(
                    "[Engine] Failed to build tools for %s: %s — node will run without tools",
                    node_id, exc,
                )

        factory = get_node_factory(node_type)
        node_fn = factory(params)
        graph.add_node(node_id, node_fn)

    # ── Wire edges ────────────────────────────────────────────────────────
    edges = config.get("edges", [])
    node_ids = [n["id"] for n in config["nodes"]]
    # Track which node IDs were auto-generated as join helpers
    _join_nodes: set[str] = set()

    if not edges and len(node_ids) > 1:
        # Default: sequential chain in order defined
        for i in range(len(node_ids) - 1):
            graph.add_edge(node_ids[i], node_ids[i + 1])
    else:
        for edge in edges:
            src = edge["from"]
            dst = edge["to"]
            edge_type = edge.get("type", "sequential")

            if edge_type == "parallel":
                # fan-out: one node → multiple nodes in parallel
                # src must be a single string; dst is a list
                if isinstance(dst, str):
                    dst = [dst]
                for target in dst:
                    graph.add_edge(src, target)
                logger.info(
                    "[Engine] Parallel fan-out: %s → %s", src, dst
                )

            elif edge_type == "join":
                # fan-in: multiple nodes → one node
                # src is a list of parallel branches; dst is the merge target
                if isinstance(src, str):
                    src = [src]
                # LangGraph merges state automatically when multiple branches
                # converge on the same downstream node. We just need to add
                # an edge from each branch to the destination.
                for source in src:
                    graph.add_edge(source, dst)
                logger.info(
                    "[Engine] Parallel join: %s → %s", src, dst
                )

            else:
                # Standard sequential edge (src and dst are strings)
                graph.add_edge(src, dst)

    # ── Entry and finish ──────────────────────────────────────────────────
    if node_ids:
        graph.set_entry_point(node_ids[0])
        # Last node in the declared list that isn't a join helper
        last_node = node_ids[-1]
        graph.add_edge(last_node, END)

    logger.info(
        "[Engine] Built graph: %s (%d nodes, hash=%s)",
        flow_name, len(node_ids), config.get("_hash", "?"),
    )
    return graph


def compile_flow(flow_name: str, checkpointer: Any = None) -> Any:
    """Load, build, and compile a flow by name. Returns compiled graph."""
    config = load_flow_config(flow_name)
    graph = build_graph(config)
    compiled = graph.compile(checkpointer=checkpointer)
    return compiled, config


def discover_flows() -> list[str]:
    """Scan flows/ directory and return all available flow names."""
    if not FLOWS_DIR.exists():
        return []
    return [p.stem for p in FLOWS_DIR.glob("*.yaml")]

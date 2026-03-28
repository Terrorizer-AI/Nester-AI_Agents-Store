"""
Node registry — maps string identifiers from YAML configs to agent node
factory functions.

When a new agent node is created (e.g., nodes/sales/linkedin_researcher.py),
it registers itself here. The engine resolves node types from this registry
when building graphs from YAML.

Usage:
    from core.registry import register_node, get_node_factory

    @register_node("linkedin_researcher")
    def create_linkedin_researcher(params: dict) -> Callable:
        ...

    # Engine calls:
    factory = get_node_factory("linkedin_researcher")
    node_fn = factory(params_from_yaml)
"""

import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)

# node_type_id → factory function
_NODE_REGISTRY: dict[str, Callable[..., Any]] = {}


def register_node(node_type: str) -> Callable:
    """Decorator to register an agent node factory function."""

    def decorator(factory_fn: Callable) -> Callable:
        if node_type in _NODE_REGISTRY:
            logger.warning(
                "[Registry] Overwriting existing node type: %s", node_type
            )
        _NODE_REGISTRY[node_type] = factory_fn
        logger.debug("[Registry] Registered node type: %s", node_type)
        return factory_fn

    return decorator


def get_node_factory(node_type: str) -> Callable:
    """Retrieve a registered node factory by its type identifier."""
    if node_type not in _NODE_REGISTRY:
        available = ", ".join(sorted(_NODE_REGISTRY)) or "(none)"
        raise KeyError(
            f"Unknown node type: {node_type!r}. Registered: {available}"
        )
    return _NODE_REGISTRY[node_type]


def list_registered_nodes() -> list[str]:
    """Return all registered node type identifiers."""
    return sorted(_NODE_REGISTRY)


def is_registered(node_type: str) -> bool:
    """Check if a node type is registered."""
    return node_type in _NODE_REGISTRY

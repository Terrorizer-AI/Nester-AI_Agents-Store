"""
Namespace manager — enforces memory isolation between flows.

Every piece of memory is scoped by a namespace tuple:
  (org_id)                           → org-level settings
  (org_id, user_id)                  → user preferences across flows
  (org_id, flow_id)                  → flow-specific learned knowledge
  (org_id, flow_id, session_id)      → session-specific working state

Two concurrent flows get completely isolated memory. A Sales Outreach
run and a GitHub Monitor run coexist without data leakage.

Storage backends:
  - SQLite (ops.db) — session state, cache, cost, webhooks, metrics, audit
  - Mem0 (Qdrant + SQLite) — long-term agent knowledge (prospects, companies)
  - LangGraph Checkpointer (ops.db) — flow state for resume/human-in-the-loop
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Namespace:
    """Immutable namespace tuple for memory scoping."""
    org_id: str
    flow_id: str = ""
    session_id: str = ""
    user_id: str = ""

    @property
    def sqlite_prefix(self) -> str:
        """SQLite key prefix for session state and cache keys."""
        parts = [self.org_id]
        if self.flow_id:
            parts.append(self.flow_id)
        if self.session_id:
            parts.append(self.session_id)
        return ":".join(parts)

    @property
    def mem0_user_id(self) -> str:
        """Mem0 user_id for long-term knowledge scoping."""
        parts = [self.org_id]
        if self.flow_id:
            parts.append(self.flow_id)
        if self.user_id:
            parts.append(self.user_id)
        return "_".join(parts)

    @property
    def langfuse_tags(self) -> dict[str, str]:
        """Metadata tags for Langfuse traces."""
        tags = {"org_id": self.org_id}
        if self.flow_id:
            tags["flow_id"] = self.flow_id
        if self.session_id:
            tags["session_id"] = self.session_id
        if self.user_id:
            tags["user_id"] = self.user_id
        return tags

    @property
    def thread_id(self) -> str:
        """LangGraph thread_id for checkpointing."""
        parts = [self.org_id]
        if self.flow_id:
            parts.append(self.flow_id)
        if self.session_id:
            parts.append(self.session_id)
        return "_".join(parts)


def build_namespace(
    org_id: str,
    flow_id: str = "",
    session_id: str = "",
    user_id: str = "",
) -> Namespace:
    """Factory for creating namespace tuples."""
    if not org_id:
        raise ValueError("org_id is required for namespace")
    return Namespace(
        org_id=org_id,
        flow_id=flow_id,
        session_id=session_id,
        user_id=user_id,
    )

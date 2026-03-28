"""
Langfuse observability — unified tracing across all flows.

Every flow execution → trace, every node → span, every LLM call → generation.
Connects to LangGraph via LangChain callbacks mechanism.

Trace metadata includes: flow_name, org_id, session_id, flow_version.
Langfuse Agent Graph View auto-visualizes the node-to-node execution path.
"""

import http.client
import logging
import os
from typing import Any
from urllib.parse import urlparse

from config.settings import get_settings

logger = logging.getLogger(__name__)

_langfuse_client = None
_tracing_enabled = False


def init_tracing() -> bool:
    """
    Initialize Langfuse client. Called once at app startup.
    Returns True if tracing is active.
    """
    global _langfuse_client, _tracing_enabled

    settings = get_settings()
    public_key = settings.langfuse_public_key
    secret_key = settings.langfuse_secret_key
    host = settings.langfuse_host

    if not public_key:
        logger.info("[Tracing] LANGFUSE_PUBLIC_KEY not set — tracing disabled")
        return False

    try:
        # Verify server is reachable via stdlib (avoids httpx proxy issues)
        parsed = urlparse(host)
        conn = http.client.HTTPConnection(
            parsed.hostname, parsed.port or 3000, timeout=5,
        )
        conn.request("GET", "/api/public/health")
        resp = conn.getresponse()
        conn.close()
        if resp.status != 200:
            raise RuntimeError(f"Langfuse health check failed: HTTP {resp.status}")

        # Set env vars for SDK
        os.environ["LANGFUSE_PUBLIC_KEY"] = public_key
        os.environ["LANGFUSE_SECRET_KEY"] = secret_key
        os.environ["LANGFUSE_HOST"] = host

        # Bypass macOS system proxy for localhost
        existing = os.environ.get("NO_PROXY", "")
        entries = {e.strip() for e in existing.split(",") if e.strip()}
        entries.update({"localhost", "127.0.0.1"})
        os.environ["NO_PROXY"] = ",".join(entries)
        os.environ["no_proxy"] = os.environ["NO_PROXY"]

        from langfuse import Langfuse
        _langfuse_client = Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            host=host,
        )

        _tracing_enabled = True
        logger.info("[Tracing] Langfuse connected — %s", host)
        return True

    except ImportError:
        logger.warning("[Tracing] langfuse not installed — pip install langfuse")
        return False
    except Exception as e:
        logger.warning("[Tracing] Langfuse init failed: %s — tracing disabled", e)
        return False


def is_tracing_active() -> bool:
    return _tracing_enabled and _langfuse_client is not None


def get_langfuse_callback(
    run_id: str,
    flow_name: str,
    flow_version: str = "",
    org_id: str = "",
    user_id: str = "",
) -> Any | None:
    """
    Return a Langfuse callback handler for LangGraph/LangChain integration.

    Pass into LangGraph config:
        config = {"callbacks": [get_langfuse_callback(...)]}
    """
    if not is_tracing_active():
        return None

    try:
        from langfuse.callback import CallbackHandler

        handler = CallbackHandler(
            public_key=os.environ.get("LANGFUSE_PUBLIC_KEY", ""),
            secret_key=os.environ.get("LANGFUSE_SECRET_KEY", ""),
            host=os.environ.get("LANGFUSE_HOST", ""),
            session_id=run_id,
            user_id=user_id or "system",
            trace_name=f"Flow: {flow_name}",
            tags=[flow_name, org_id] if org_id else [flow_name],
            metadata={
                "flow_name": flow_name,
                "flow_version": flow_version,
                "org_id": org_id,
                "run_id": run_id,
            },
        )
        return handler
    except Exception as e:
        logger.debug("[Tracing] Callback handler failed: %s", e)
        return None


def create_trace(
    name: str,
    run_id: str,
    flow_name: str = "",
    metadata: dict[str, Any] | None = None,
) -> Any | None:
    """Create a manual Langfuse trace for custom instrumentation."""
    if not is_tracing_active():
        return None

    return _langfuse_client.trace(
        name=name,
        session_id=run_id,
        metadata={"flow_name": flow_name, **(metadata or {})},
        tags=[flow_name] if flow_name else [],
    )


def flush_tracing() -> None:
    """Flush pending events to Langfuse."""
    if _langfuse_client:
        try:
            _langfuse_client.flush()
        except Exception:
            pass


def shutdown_tracing() -> None:
    """Flush and shutdown Langfuse client."""
    global _langfuse_client, _tracing_enabled
    if _langfuse_client:
        try:
            _langfuse_client.flush()
            _langfuse_client.shutdown()
            logger.info("[Tracing] Langfuse shutdown complete")
        except Exception as e:
            logger.debug("[Tracing] shutdown failed: %s", e)
    _tracing_enabled = False
    _langfuse_client = None

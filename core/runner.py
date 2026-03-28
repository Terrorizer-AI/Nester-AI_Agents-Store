"""
Flow runner — executes compiled LangGraph graphs with streaming,
checkpointing, and observability integration.

The runner is the bridge between the API layer and the LangGraph engine.
It handles:
  - Invoking flows synchronously or with streaming
  - Injecting run metadata (run_id, flow_version, org_id)
  - Yielding SSE events for the streaming endpoint
  - Resuming paused flows after human-in-the-loop review
"""

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from config.settings import get_settings
from memory.sqlite_ops import is_sqlite_ready, save_run

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RunConfig:
    """Configuration for a single flow execution."""
    run_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    flow_name: str = ""
    flow_version: str = ""
    org_id: str = ""
    user_id: str = ""
    session_id: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RunResult:
    """Result of a completed flow execution."""
    run_id: str
    flow_name: str
    status: str  # "completed" | "failed" | "paused"
    output: dict[str, Any]
    duration_ms: int
    error: str | None = None


def _persist_run(
    run_config: RunConfig,
    input_data: dict[str, Any],
    result: "RunResult",
    node_timings: dict[str, Any],
    started_at: str,
) -> None:
    """Save run to SQLite history (best-effort, never raises)."""
    try:
        if not is_sqlite_ready():
            return
        # Extract prospect/company from output for quick display
        output = result.output or {}
        li_parsed = output.get("linkedin_parsed", {})
        co_parsed = output.get("company_parsed", {})
        prospect = li_parsed.get("name", "") if isinstance(li_parsed, dict) else ""
        company = co_parsed.get("name", "") if isinstance(co_parsed, dict) else ""
        # Fallback to input
        if not prospect:
            prospect = input_data.get("linkedin_url", "")
        if not company:
            company = input_data.get("company_website", "")

        save_run(
            run_id=result.run_id,
            flow_name=result.flow_name,
            status=result.status,
            input_data=input_data,
            output_data=output,
            node_timings=node_timings,
            duration_ms=result.duration_ms,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc).isoformat(),
            flow_version=run_config.flow_version,
            user_id=run_config.user_id,
            error=result.error,
            prospect_name=prospect,
            company_name=company,
        )
    except Exception as exc:
        logger.warning("[Runner] Failed to persist run: %s", exc)


async def invoke_flow(
    compiled_graph: Any,
    input_data: dict[str, Any],
    run_config: RunConfig,
) -> RunResult:
    """
    Execute a flow synchronously. Returns final state.
    Uses astream internally so we can log per-node completion.
    Used by POST /flow/{name}/invoke.
    """
    start = datetime.now(timezone.utc)
    run_id_short = run_config.run_id[:8]

    config = {
        "configurable": {
            "thread_id": run_config.run_id,
            "flow_name": run_config.flow_name,
            "flow_version": run_config.flow_version,
        },
        "metadata": {
            "org_id": run_config.org_id,
            "user_id": run_config.user_id,
            **run_config.metadata,
        },
    }

    logger.info(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    logger.info(
        "[PIPELINE] ▶ %s triggered | run_id=%s",
        run_config.flow_name,
        run_id_short,
    )

    # Track per-node start times and results
    node_starts: dict[str, datetime] = {}
    node_results: dict[str, str] = {}  # node_id → "ok" | "skipped" | "error"
    final_state: dict[str, Any] = {}

    try:
        async for update in compiled_graph.astream(
            input_data,
            config=config,
            stream_mode="updates",
        ):
            # update is a dict: {node_id: node_output_dict}
            if not isinstance(update, dict):
                continue

            for node_id, node_output in update.items():
                now = datetime.now(timezone.utc)

                # Calculate duration since we first saw this node
                # (LangGraph emits the update AFTER completion, so we mark
                #  start as the pipeline start if we haven't seen it yet)
                node_start = node_starts.get(node_id, start)
                elapsed_node = (now - node_start).total_seconds()

                # Detect skip/error from output dict
                skipped = isinstance(node_output, dict) and node_output.get("skipped")
                errors = isinstance(node_output, dict) and node_output.get("errors")

                if skipped:
                    status_icon = "⚠"
                    node_results[node_id] = "skipped"
                    logger.warning(
                        "[PIPELINE] %s %s — skipped (%.1fs)",
                        status_icon, node_id, elapsed_node,
                    )
                elif errors:
                    status_icon = "✗"
                    node_results[node_id] = "error"
                    logger.error(
                        "[PIPELINE] %s %s — failed (%.1fs)",
                        status_icon, node_id, elapsed_node,
                    )
                else:
                    status_icon = "✓"
                    node_results[node_id] = "ok"
                    logger.info(
                        "[PIPELINE] %s %s — done (%.1fs)",
                        status_icon, node_id, elapsed_node,
                    )

                # Merge into final state
                if isinstance(node_output, dict):
                    final_state.update(node_output)

        total_elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        ok_count = sum(1 for v in node_results.values() if v == "ok")
        total_count = len(node_results)

        logger.info(
            "[PIPELINE] ■ %s COMPLETE — %.1fs | %d/%d agents ok",
            run_config.flow_name,
            total_elapsed,
            ok_count,
            total_count,
        )
        logger.info(
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )

        elapsed_ms = int(total_elapsed * 1000)
        # Build node timing map for history
        node_timing_map = {
            nid: {"status": node_results.get(nid, "ok")}
            for nid in node_results
        }
        result = RunResult(
            run_id=run_config.run_id,
            flow_name=run_config.flow_name,
            status="completed",
            output=final_state,
            duration_ms=elapsed_ms,
        )
        _persist_run(run_config, input_data, result, node_timing_map, start.isoformat())
        return result

    except Exception as exc:
        elapsed_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        logger.error(
            "[PIPELINE] ✗ %s FAILED after %.1fs — %s",
            run_config.flow_name,
            elapsed_ms / 1000,
            exc,
        )
        logger.info(
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        node_timing_map = {
            nid: {"status": node_results.get(nid, "ok")}
            for nid in node_results
        }
        result = RunResult(
            run_id=run_config.run_id,
            flow_name=run_config.flow_name,
            status="failed",
            output={},
            duration_ms=elapsed_ms,
            error=str(exc),
        )
        _persist_run(run_config, input_data, result, node_timing_map, start.isoformat())
        return result


async def stream_flow(
    compiled_graph: Any,
    input_data: dict[str, Any],
    run_config: RunConfig,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Execute a flow with streaming. Yields SSE-compatible event dicts.
    """
    config = {
        "configurable": {
            "thread_id": run_config.run_id,
            "flow_name": run_config.flow_name,
            "flow_version": run_config.flow_version,
        },
        "metadata": {
            "org_id": run_config.org_id,
            "user_id": run_config.user_id,
            **run_config.metadata,
        },
    }

    # Emit flow start
    start_event = {
        "type": "flow_start",
        "run_id": run_config.run_id,
        "flow_name": run_config.flow_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    yield start_event

    try:
        async for event in compiled_graph.astream(
            input_data,
            config=config,
            stream_mode=["updates", "custom"],
        ):
            sse_event = {
                "type": "stream_event",
                "run_id": run_config.run_id,
                "data": event if isinstance(event, dict) else str(event),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            yield sse_event

    except Exception as exc:
        error_event = {
            "type": "flow_error",
            "run_id": run_config.run_id,
            "error": str(exc),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        yield error_event
        return

    # Emit flow complete
    done_event = {
        "type": "flow_complete",
        "run_id": run_config.run_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    yield done_event

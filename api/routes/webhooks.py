"""
Webhook receiver — ingests external events and triggers continuous flows.

POST /webhook/{source} — validate signature, normalize payload, queue in SQLite,
trigger the appropriate flow if event matches a subscribed type.

Currently supports:
  - GitHub: HMAC-SHA256 signature validation, event normalization
  - Extensible to: Stripe, Jira, PagerDuty, etc.
"""

import hashlib
import hmac
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Header, Request

from config.settings import get_settings
from memory.sqlite_ops import push_webhook
from core.queue import submit_flow

logger = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])
settings = get_settings()


def _verify_github_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify GitHub HMAC-SHA256 webhook signature."""
    if not signature.startswith("sha256="):
        return False
    expected = hmac.new(
        secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


# GitHub event types that trigger the monitoring flow
GITHUB_SUBSCRIBED_EVENTS = {
    "pull_request", "push", "check_suite", "check_run",
    "dependabot_alert", "secret_scanning_alert",
    "code_scanning_alert", "deployment_status",
}

# Critical events that use the fast-path (skip Productivity Analyzer)
GITHUB_CRITICAL_EVENTS = {
    "secret_scanning_alert", "dependabot_alert",
}


@router.post("/webhook/{source}")
async def receive_webhook(
    source: str,
    request: Request,
    x_hub_signature_256: str = Header(None, alias="X-Hub-Signature-256"),
    x_github_event: str = Header(None, alias="X-GitHub-Event"),
):
    """
    Receive and process external webhooks.

    For GitHub:
      1. Validate HMAC-SHA256 signature
      2. Normalize payload into standard event schema
      3. Push to Redis Stream keyed by source + repository
      4. Trigger GitHub Monitor flow if event type is subscribed
    """
    payload_bytes = await request.body()

    if source == "github":
        return await _handle_github_webhook(
            payload_bytes, x_hub_signature_256, x_github_event,
        )

    # Generic handler for unknown sources
    logger.warning("[Webhook] Unknown source: %s", source)
    return {"status": "ignored", "reason": f"Unknown source: {source}"}


async def _handle_github_webhook(
    payload_bytes: bytes,
    signature: str | None,
    event_type: str | None,
) -> dict[str, Any]:
    """Process a GitHub webhook event."""

    # 1. Validate signature
    if settings.github_webhook_secret:
        if not signature:
            return {"status": "rejected", "reason": "Missing signature"}
        if not _verify_github_signature(
            payload_bytes, signature, settings.github_webhook_secret,
        ):
            return {"status": "rejected", "reason": "Invalid signature"}

    # 2. Parse payload
    try:
        payload = json.loads(payload_bytes)
    except json.JSONDecodeError:
        return {"status": "rejected", "reason": "Invalid JSON"}

    # 3. Extract repo info
    repo_name = ""
    if "repository" in payload:
        repo_name = payload["repository"].get("full_name", "")

    event_type = event_type or "unknown"

    # 4. Normalize into standard event schema
    normalized = {
        "source": "github",
        "event_type": event_type,
        "repo": repo_name,
        "action": payload.get("action", ""),
        "sender": payload.get("sender", {}).get("login", ""),
        "raw_payload": payload,
    }

    # 5. Push to SQLite webhook queue
    entry_id = push_webhook(
        source=f"github:{repo_name}",
        event_type=event_type,
        payload=normalized,
    )

    # 6. Trigger flow if subscribed event type
    triggered = False
    if event_type in GITHUB_SUBSCRIBED_EVENTS:
        is_critical = event_type in GITHUB_CRITICAL_EVENTS
        run_id = str(uuid.uuid4())

        await submit_flow(
            flow_name="github_monitor",
            input_data={
                "trigger": "webhook",
                "event_type": event_type,
                "repo": repo_name,
                "fast_path": is_critical,
                "normalized_event": normalized,
            },
            run_id=run_id,
            org_id=settings.platform_org_id,
        )
        triggered = True

        logger.info(
            "[Webhook] GitHub %s on %s → triggered flow (run=%s, critical=%s)",
            event_type, repo_name, run_id[:8], is_critical,
        )

    return {
        "status": "accepted",
        "source": "github",
        "event_type": event_type,
        "repo": repo_name,
        "stream_entry": entry_id,
        "flow_triggered": triggered,
    }

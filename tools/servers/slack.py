"""
Slack MCP server — send alerts and messages via Slack Bot API.

Runs as a FastMCP HTTP server on port 8103.

Tools:
  - send_message: Send a message to a Slack channel
  - send_alert: Send a formatted alert (security, performance, etc.)
  - create_channel_message: Post a rich message with blocks
"""

from datetime import datetime, timezone
from typing import Any

from fastmcp import FastMCP

mcp = FastMCP("slack", description="Slack Bot API for alerts and messaging")


@mcp.tool()
async def send_message(
    channel: str,
    text: str,
) -> dict[str, Any]:
    """Send a plain text message to a Slack channel."""
    # In production, uses slack_sdk.WebClient
    return {
        "channel": channel,
        "text": text,
        "sent": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "_note": "Connect Slack Bot API to send real messages",
    }


@mcp.tool()
async def send_alert(
    channel: str,
    severity: str,
    title: str,
    description: str,
    source: str = "",
    action_url: str = "",
) -> dict[str, Any]:
    """
    Send a formatted alert to a Slack channel.

    Severity levels: critical, high, medium, low, info.
    """
    emoji_map = {
        "critical": "🔴",
        "high": "🟠",
        "medium": "🟡",
        "low": "🔵",
        "info": "ℹ️",
    }
    emoji = emoji_map.get(severity, "⚪")

    return {
        "channel": channel,
        "severity": severity,
        "title": f"{emoji} [{severity.upper()}] {title}",
        "description": description,
        "source": source,
        "action_url": action_url,
        "sent": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "_note": "Connect Slack Bot API to send real alerts",
    }


@mcp.tool()
async def create_channel_message(
    channel: str,
    blocks: list[dict[str, Any]] | None = None,
    text: str = "",
) -> dict[str, Any]:
    """Post a rich message with Slack Block Kit blocks."""
    return {
        "channel": channel,
        "text": text,
        "blocks": blocks or [],
        "sent": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "_note": "Connect Slack Bot API to send real block messages",
    }


if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=8103)

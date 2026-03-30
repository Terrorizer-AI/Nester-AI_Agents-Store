"""
Email MCP server — send and validate emails via SMTP.

Runs as a FastMCP HTTP server on port 8104.

Tools:
  - send_email: Send an email via SMTP (Gmail/custom)
  - validate_address: Check if an email address is valid and deliverable
  - check_deliverability: Domain-level deliverability check
"""

from datetime import datetime, timezone
from typing import Any

from fastmcp import FastMCP

mcp = FastMCP("email")


@mcp.tool()
async def send_email(
    to: str,
    subject: str,
    body: str,
    from_email: str = "",
    reply_to: str = "",
    html: bool = False,
) -> dict[str, Any]:
    """
    Send an email via SMTP.

    Uses configured SMTP credentials from environment.
    Returns delivery status.
    """
    # In production, uses aiosmtplib with settings from config
    return {
        "to": to,
        "subject": subject,
        "body_preview": body[:100] + "..." if len(body) > 100 else body,
        "from": from_email,
        "html": html,
        "sent": False,
        "message_id": "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "_note": "Connect SMTP server to send real emails",
    }


@mcp.tool()
async def validate_address(
    email: str,
) -> dict[str, Any]:
    """
    Validate an email address — syntax, MX records, and deliverability.

    Returns: is_valid, is_deliverable, risk_score.
    """
    import re
    syntax_valid = bool(re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email))

    return {
        "email": email,
        "syntax_valid": syntax_valid,
        "mx_found": False,
        "is_deliverable": False,
        "risk_score": 0,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "_note": "Connect email validation API for full checks",
    }


@mcp.tool()
async def check_deliverability(
    domain: str,
) -> dict[str, Any]:
    """
    Check domain-level email deliverability.

    Checks SPF, DKIM, DMARC records and domain reputation.
    """
    return {
        "domain": domain,
        "spf_valid": False,
        "dkim_valid": False,
        "dmarc_valid": False,
        "domain_reputation": "unknown",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "_note": "Connect DNS/email reputation API for real checks",
    }


if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=8104)

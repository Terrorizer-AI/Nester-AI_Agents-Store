"""
Credential testers — validate integration credentials before saving.

Each tester returns a (success: bool, message: str) tuple.
Tests are lightweight and non-destructive (e.g. SMTP EHLO, GitHub /user).
"""

import asyncio
import logging
import smtplib
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# ── Per-integration credential field definitions ─────────────────────────────

CREDENTIAL_FIELDS: dict[str, list[dict[str, Any]]] = {
    "email": [
        {"key": "smtp_host", "label": "SMTP Host", "type": "text", "default": "smtp.gmail.com"},
        {"key": "smtp_port", "label": "SMTP Port", "type": "number", "default": 587},
        {"key": "smtp_user", "label": "Email Address", "type": "text", "placeholder": "you@gmail.com"},
        {"key": "smtp_password", "label": "App Password", "type": "password", "placeholder": "xxxx xxxx xxxx xxxx"},
    ],
    "github_official": [
        {"key": "github_token", "label": "Personal Access Token", "type": "password", "placeholder": "ghp_..."},
    ],
    "slack": [
        {"key": "slack_bot_token", "label": "Bot Token", "type": "password", "placeholder": "xoxb-..."},
    ],
    "search": [
        {"key": "tavily_api_key", "label": "Tavily API Key", "type": "password", "placeholder": "tvly-..."},
    ],
    "web_scraper": [
        {"key": "firecrawl_api_key", "label": "Firecrawl API Key (optional)", "type": "password", "placeholder": "fc-..."},
    ],
    # These require no credentials
    "linkedin": [],
    "github_custom": [],
}


# ── Testers ──────────────────────────────────────────────────────────────────


async def test_email(credentials: dict[str, Any]) -> tuple[bool, str]:
    """Test SMTP connection with EHLO (does not send mail)."""
    host = credentials.get("smtp_host", "smtp.gmail.com")
    port = int(credentials.get("smtp_port", 587))
    user = credentials.get("smtp_user", "")
    password = credentials.get("smtp_password", "")

    if not user or not password:
        return False, "Email address and app password are required"

    def _test_smtp() -> tuple[bool, str]:
        try:
            server = smtplib.SMTP(host, port, timeout=10)
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(user, password)
            server.quit()
            return True, f"Connected to {host}:{port} as {user}"
        except smtplib.SMTPAuthenticationError:
            return False, "Authentication failed — check email and app password"
        except smtplib.SMTPConnectError:
            return False, f"Cannot reach {host}:{port}"
        except (smtplib.SMTPException, OSError) as e:
            return False, f"SMTP error: {e}"

    return await asyncio.to_thread(_test_smtp)


async def test_github(credentials: dict[str, Any]) -> tuple[bool, str]:
    """Test GitHub token by hitting /user endpoint."""
    token = credentials.get("github_token", "")
    if not token:
        return False, "GitHub personal access token is required"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.github.com/user",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                return True, f"Authenticated as {data.get('login', 'unknown')}"
            elif resp.status_code == 401:
                return False, "Invalid token — check scopes (need repo + read:org)"
            else:
                return False, f"GitHub API returned {resp.status_code}"
    except Exception as e:
        return False, f"Connection error: {e}"


async def test_slack(credentials: dict[str, Any]) -> tuple[bool, str]:
    """Test Slack bot token by calling auth.test."""
    token = credentials.get("slack_bot_token", "")
    if not token:
        return False, "Slack bot token is required"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://slack.com/api/auth.test",
                headers={"Authorization": f"Bearer {token}"},
            )
            data = resp.json()
            if data.get("ok"):
                return True, f"Connected as {data.get('bot_id', 'bot')} in {data.get('team', 'workspace')}"
            else:
                return False, f"Slack error: {data.get('error', 'unknown')}"
    except Exception as e:
        return False, f"Connection error: {e}"


async def test_tavily(credentials: dict[str, Any]) -> tuple[bool, str]:
    """Test Tavily API key with a minimal search."""
    api_key = credentials.get("tavily_api_key", "")
    if not api_key:
        return False, "Tavily API key is required"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": api_key, "query": "test", "max_results": 1},
            )
            if resp.status_code == 200:
                return True, "Tavily API key is valid"
            elif resp.status_code in (401, 403):
                return False, "Invalid API key"
            else:
                return False, f"Tavily returned {resp.status_code}"
    except Exception as e:
        return False, f"Connection error: {e}"


async def test_no_credentials(_credentials: dict[str, Any]) -> tuple[bool, str]:
    """Integrations that need no credentials — always succeed."""
    return True, "No credentials needed — auto-connected"


# ── Dispatcher ───────────────────────────────────────────────────────────────

Tester = Callable[[dict[str, Any]], Awaitable[tuple[bool, str]]]

_TESTERS: dict[str, Tester] = {
    "email": test_email,
    "github_official": test_github,
    "slack": test_slack,
    "search": test_tavily,
    "web_scraper": test_no_credentials,
    "linkedin": test_no_credentials,
    "github_custom": test_no_credentials,
}


async def test_credentials(
    integration_name: str, credentials: dict[str, Any]
) -> tuple[bool, str]:
    """Test credentials for a named integration. Returns (success, message)."""
    tester = _TESTERS.get(integration_name)
    if tester is None:
        return False, f"No credential tester for '{integration_name}'"

    try:
        return await tester(credentials)
    except Exception as e:
        logger.exception("[CredentialTest] %s failed", integration_name)
        return False, f"Test failed: {e}"


def get_credential_fields(integration_name: str) -> list[dict[str, Any]]:
    """Return the credential field definitions for an integration (returns a copy)."""
    return list(CREDENTIAL_FIELDS.get(integration_name, []))


def needs_credentials(integration_name: str) -> bool:
    """Return True if this integration requires user-provided credentials."""
    fields = CREDENTIAL_FIELDS.get(integration_name)
    if fields is None:
        return True  # Unknown integration — assume it needs credentials
    return len(fields) > 0

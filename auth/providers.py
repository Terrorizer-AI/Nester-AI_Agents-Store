"""
OAuth2 provider definitions — endpoints, scopes, and token exchange logic.

Each provider is a frozen dataclass with everything needed for the OAuth2 flow:
  - Authorization URL (where the browser popup goes)
  - Token URL (where we exchange the auth code)
  - Scopes (what permissions we request)
  - User-info fetcher (to display "Connected as ...")

Providers: Google (Gmail + Calendar), GitHub, Slack
"""

import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from config.settings import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OAuthProvider:
    """Configuration for a single OAuth2 provider."""
    name: str
    display_name: str
    authorize_url: str
    token_url: str
    revoke_url: str
    scopes: list[str] = field(default_factory=list)
    # Extra params to send with the authorization request
    authorize_params: dict[str, str] = field(default_factory=dict)
    # Which integration names in mcp_config.yaml this provider powers
    powers_integrations: list[str] = field(default_factory=list)
    icon: str = ""
    color: str = ""
    # Settings attribute names for client_id and client_secret (DRY dispatch)
    client_id_setting: str = ""
    client_secret_setting: str = ""


# ── Provider Registry ────────────────────────────────────────────────────────

PROVIDERS: dict[str, OAuthProvider] = {
    "google": OAuthProvider(
        name="google",
        display_name="Google",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        revoke_url="https://oauth2.googleapis.com/revoke",
        scopes=[
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
        ],
        authorize_params={
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
        },
        powers_integrations=["gmail", "google_calendar", "email"],
        icon="G",
        color="#4285f4",
        client_id_setting="google_client_id",
        client_secret_setting="google_client_secret",
    ),
    "github": OAuthProvider(
        name="github",
        display_name="GitHub",
        authorize_url="https://github.com/login/oauth/authorize",
        token_url="https://github.com/login/oauth/access_token",
        revoke_url="",  # GitHub tokens are revoked via settings UI
        scopes=["repo", "read:org", "read:user"],
        powers_integrations=["github_official"],
        icon="GH",
        color="#333333",
        client_id_setting="github_client_id",
        client_secret_setting="github_client_secret",
    ),
    "slack": OAuthProvider(
        name="slack",
        display_name="Slack",
        authorize_url="https://slack.com/oauth/v2/authorize",
        token_url="https://slack.com/api/oauth.v2.access",
        revoke_url="https://slack.com/api/auth.revoke",
        scopes=["chat:write", "channels:read", "channels:history", "users:read"],
        powers_integrations=["slack"],
        icon="SL",
        color="#e11d48",
        client_id_setting="slack_client_id",
        client_secret_setting="slack_client_secret",
    ),
}


def get_provider(name: str) -> OAuthProvider:
    """Get a provider by name. Raises KeyError if not found."""
    if name not in PROVIDERS:
        available = ", ".join(sorted(PROVIDERS))
        raise KeyError(f"Unknown OAuth provider: {name!r}. Available: {available}")
    return PROVIDERS[name]


def list_providers() -> list[dict[str, Any]]:
    """Return all providers with their public info (no secrets)."""
    return [
        {
            "name": p.name,
            "display_name": p.display_name,
            "icon": p.icon,
            "color": p.color,
            "scopes": list(p.scopes),
            "powers_integrations": list(p.powers_integrations),
            "configured": _is_configured(p),
        }
        for p in PROVIDERS.values()
    ]


def _is_configured(provider: OAuthProvider) -> bool:
    """Check if client_id and client_secret are set for this provider."""
    if not provider.client_id_setting or not provider.client_secret_setting:
        return False
    settings = get_settings()
    cid = getattr(settings, provider.client_id_setting, "")
    secret = getattr(settings, provider.client_secret_setting, "")
    return bool(cid and secret)


def get_client_credentials(provider_name: str) -> tuple[str, str]:
    """Return (client_id, client_secret) for a provider. Raises if not configured."""
    provider = get_provider(provider_name)
    if not provider.client_id_setting or not provider.client_secret_setting:
        raise KeyError(f"No credential settings defined for provider: {provider_name}")

    settings = get_settings()
    cid = getattr(settings, provider.client_id_setting, "")
    secret = getattr(settings, provider.client_secret_setting, "")

    if not cid or not secret:
        raise ValueError(
            f"OAuth not configured for {provider_name}. "
            f"Set {provider_name.upper()}_CLIENT_ID and {provider_name.upper()}_CLIENT_SECRET in .env"
        )
    return cid, secret


# ── Token Exchange ───────────────────────────────────────────────────────────


async def exchange_code_for_tokens(
    provider: OAuthProvider,
    code: str,
    redirect_uri: str,
) -> dict[str, Any]:
    """Exchange an authorization code for access + refresh tokens."""
    client_id, client_secret = get_client_credentials(provider.name)

    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }

    headers = {"Accept": "application/json"}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(provider.token_url, data=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


async def refresh_access_token(
    provider: OAuthProvider,
    refresh_token: str,
) -> dict[str, Any]:
    """Use a refresh token to get a new access token."""
    client_id, client_secret = get_client_credentials(provider.name)

    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    }

    headers = {"Accept": "application/json"}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(provider.token_url, data=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


async def revoke_token(provider: OAuthProvider, token: str) -> bool:
    """Revoke an OAuth token at the provider. Returns True on success."""
    if not provider.revoke_url:
        return True  # Provider doesn't support revocation (e.g. GitHub)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if provider.name == "google":
                resp = await client.post(
                    provider.revoke_url,
                    params={"token": token},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            elif provider.name == "slack":
                resp = await client.post(
                    provider.revoke_url,
                    headers={"Authorization": f"Bearer {token}"},
                )
            else:
                resp = await client.post(
                    provider.revoke_url,
                    data={"token": token},
                )
            return resp.status_code in (200, 204)
    except (httpx.HTTPError, OSError) as e:
        logger.warning("[OAuth] Revocation failed for %s: %s", provider.name, e)
        return False


# ── User Info Fetchers ───────────────────────────────────────────────────────


async def fetch_user_info(
    provider_name: str, access_token: str
) -> dict[str, str]:
    """Fetch the authenticated user's ID and display name from the provider."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if provider_name == "google":
                resp = await client.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                resp.raise_for_status()
                data = resp.json()
                return {
                    "user_id": data.get("id", ""),
                    "user_name": data.get("email", data.get("name", "")),
                }

            elif provider_name == "github":
                resp = await client.get(
                    "https://api.github.com/user",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/vnd.github+json",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return {
                    "user_id": str(data.get("id", "")),
                    "user_name": data.get("login", ""),
                }

            elif provider_name == "slack":
                resp = await client.post(
                    "https://slack.com/api/auth.test",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                resp.raise_for_status()
                data = resp.json()
                return {
                    "user_id": data.get("bot_id", data.get("user_id", "")),
                    "user_name": data.get("team", ""),
                }

            else:
                logger.warning("[OAuth] No user info fetcher for provider: %s", provider_name)

    except (httpx.HTTPError, OSError) as e:
        logger.warning("[OAuth] Failed to fetch user info for %s: %s", provider_name, e)

    return {"user_id": "", "user_name": ""}

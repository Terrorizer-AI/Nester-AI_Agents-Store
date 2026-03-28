"""
OAuth2 routes — browser popup flow for connecting integrations.

Flow:
  1. Frontend opens popup to GET /auth/{provider}/start
  2. Backend redirects popup to provider's OAuth consent screen
  3. Provider redirects back to GET /auth/{provider}/callback
  4. Backend exchanges code for tokens, stores them, renders HTML that
     calls window.opener.postMessage() and closes the popup
  5. Frontend receives the message and updates the UI

Additional endpoints:
  GET  /auth/providers            -> List all OAuth providers + connection status
  GET  /auth/{provider}/status    -> Check if connected + who as
  POST /auth/{provider}/disconnect -> Revoke token + delete from DB
  POST /auth/{provider}/refresh   -> Force-refresh the access token
"""

import html
import json as _json
import logging
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from auth.providers import (
    PROVIDERS,
    get_provider,
    get_client_credentials,
    exchange_code_for_tokens,
    refresh_access_token,
    revoke_token,
    fetch_user_info,
    list_providers,
)
from config.settings import get_settings
from memory.sqlite_ops import (
    save_oauth_token,
    get_oauth_token,
    delete_oauth_token,
    list_oauth_connections,
    update_oauth_access_token,
    session_set,
    session_get,
    session_delete,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["oauth"])


# ── Provider listing ─────────────────────────────────────────────────────────


@router.get("/providers")
async def get_providers():
    """List all OAuth providers with connection status."""
    providers = list_providers()
    connections = {c["provider"]: c for c in list_oauth_connections()}

    results = []
    for p in providers:
        conn = connections.get(p["name"])
        results.append({
            **p,
            "connected": conn is not None,
            "connected_as": conn["provider_user_name"] if conn else None,
            "connected_at": conn["connected_at"] if conn else None,
        })

    return {"providers": results}


# ── OAuth Start (popup opens this) ───────────────────────────────────────────


@router.get("/{provider}/start")
async def oauth_start(provider: str):
    """Redirect the popup to the provider's OAuth consent screen."""
    try:
        prov = get_provider(provider)
        client_id, _secret = get_client_credentials(provider)
    except (KeyError, ValueError) as e:
        return HTMLResponse(_error_page(str(e)), status_code=400)

    settings = get_settings()
    redirect_uri = f"{settings.oauth_redirect_base}/auth/{provider}/callback"

    # Generate CSRF state token
    state = secrets.token_urlsafe(32)
    session_set(f"oauth_state:{state}", {"provider": provider}, ttl_seconds=600)

    # Build authorization URL
    params: dict[str, str] = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
    }

    # Provider-specific scope format
    if provider == "slack":
        params["scope"] = ",".join(prov.scopes)
    else:
        params["scope"] = " ".join(prov.scopes)

    # Extra params (e.g. access_type=offline for Google)
    params.update(prov.authorize_params)

    auth_url = f"{prov.authorize_url}?{urlencode(params)}"
    return RedirectResponse(auth_url)


# ── OAuth Callback (provider redirects here) ─────────────────────────────────


@router.get("/{provider}/callback")
async def oauth_callback(provider: str, code: str = "", state: str = "", error: str = ""):
    """Handle the OAuth callback — exchange code, store tokens, close popup."""

    # Handle provider errors (user denied, etc.)
    # Only allow known OAuth error codes — don't reflect arbitrary input
    _KNOWN_ERRORS = {"access_denied", "server_error", "temporarily_unavailable", "invalid_scope"}
    if error:
        safe_error = error if error in _KNOWN_ERRORS else "authorization_denied"
        return HTMLResponse(_result_page(
            success=False,
            provider=provider,
            message=f"Authorization denied ({safe_error})",
        ))

    if not code or not state:
        return HTMLResponse(_result_page(
            success=False,
            provider=provider,
            message="Missing authorization code or state parameter",
        ))

    # Validate CSRF state
    state_data = session_get(f"oauth_state:{state}")
    if state_data is None or state_data.get("provider") != provider:
        return HTMLResponse(_result_page(
            success=False,
            provider=provider,
            message="Invalid state parameter — possible CSRF attack",
        ))
    session_delete(f"oauth_state:{state}")

    # Exchange code for tokens
    try:
        prov = get_provider(provider)
        settings = get_settings()
        redirect_uri = f"{settings.oauth_redirect_base}/auth/{provider}/callback"

        token_data = await exchange_code_for_tokens(prov, code, redirect_uri)
    except Exception as e:
        logger.exception("[OAuth] Token exchange failed for %s", provider)
        return HTMLResponse(_result_page(
            success=False,
            provider=provider,
            message="Could not complete authorization — please try again",
        ))

    # Extract tokens — different providers use different field names
    access_token = token_data.get("access_token", "")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in")
    scopes = token_data.get("scope", "")

    # Slack's top-level access_token is the bot token (xoxb-)
    if provider == "slack" and access_token and not access_token.startswith("xoxb-"):
        logger.warning("[OAuth] Slack token does not look like a bot token: %s...", access_token[:10])

    if not access_token:
        return HTMLResponse(_result_page(
            success=False,
            provider=provider,
            message="No access token in provider response",
        ))

    # Calculate expiry
    expires_at = None
    if expires_in:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        ).isoformat()

    # Fetch user info for display
    user_info = await fetch_user_info(provider, access_token)

    # Store tokens
    save_oauth_token(
        provider=provider,
        access_token=access_token,
        refresh_token=refresh_token,
        scopes=scopes,
        expires_at=expires_at,
        provider_user_id=user_info["user_id"],
        provider_user_name=user_info["user_name"],
    )

    logger.info(
        "[OAuth] %s connected as %s",
        provider, user_info["user_name"] or "unknown",
    )

    return HTMLResponse(_result_page(
        success=True,
        provider=provider,
        message=f"Connected as {user_info['user_name']}" if user_info["user_name"] else "Connected",
        user_name=user_info["user_name"],
    ))


# ── Status ───────────────────────────────────────────────────────────────────


@router.get("/{provider}/status")
async def oauth_status(provider: str):
    """Check connection status for a provider."""
    try:
        get_provider(provider)
    except KeyError:
        return {"error": f"Unknown provider: {provider}"}

    token_record = get_oauth_token(provider)
    if token_record is None:
        return {
            "connected": False,
            "provider": provider,
        }

    # Check if token is expired (handle both tz-aware and naive ISO strings)
    is_expired = False
    if token_record["expires_at"]:
        try:
            exp = datetime.fromisoformat(token_record["expires_at"])
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            is_expired = datetime.now(timezone.utc) > exp
        except (ValueError, TypeError):
            pass

    return {
        "connected": True,
        "provider": provider,
        "user_name": token_record["provider_user_name"],
        "user_id": token_record["provider_user_id"],
        "scopes": token_record["scopes"],
        "connected_at": token_record["connected_at"],
        "token_expired": is_expired,
        "has_refresh_token": bool(token_record["refresh_token"]),
    }


# ── Disconnect ───────────────────────────────────────────────────────────────


@router.post("/{provider}/disconnect")
async def oauth_disconnect(provider: str):
    """Revoke the OAuth token and remove it from the database."""
    try:
        prov = get_provider(provider)
    except KeyError:
        return {"error": f"Unknown provider: {provider}"}

    token_record = get_oauth_token(provider)
    if token_record is None:
        return {"success": True, "message": "Already disconnected"}

    # Revoke at provider (both access and refresh tokens)
    await revoke_token(prov, token_record["access_token"])
    if token_record.get("refresh_token"):
        await revoke_token(prov, token_record["refresh_token"])

    # Delete locally
    delete_oauth_token(provider)

    logger.info("[OAuth] %s disconnected", provider)
    return {"success": True, "message": f"Disconnected from {prov.display_name}"}


# ── Refresh ──────────────────────────────────────────────────────────────────


@router.post("/{provider}/refresh")
async def oauth_refresh(provider: str):
    """Force-refresh the access token using the stored refresh token."""
    try:
        prov = get_provider(provider)
    except KeyError:
        return {"error": f"Unknown provider: {provider}"}

    token_record = get_oauth_token(provider)
    if token_record is None:
        return {"success": False, "message": "Not connected"}

    if not token_record["refresh_token"]:
        return {"success": False, "message": "No refresh token — reconnect to fix"}

    try:
        new_data = await refresh_access_token(prov, token_record["refresh_token"])

        new_access = new_data.get("access_token", "")
        if not new_access:
            return {"success": False, "message": "Refresh returned no access token"}

        expires_in = new_data.get("expires_in")
        expires_at = None
        if expires_in:
            expires_at = (
                datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
            ).isoformat()

        update_oauth_access_token(provider, new_access, expires_at)

        return {"success": True, "message": "Token refreshed"}
    except Exception as e:
        logger.exception("[OAuth] Refresh failed for %s", provider)
        return {"success": False, "message": "Token refresh failed — try reconnecting"}


# ── HTML Templates (for popup) ───────────────────────────────────────────────


def _result_page(
    success: bool,
    provider: str,
    message: str,
    user_name: str = "",
) -> str:
    """HTML page rendered in the OAuth popup — posts result to opener and closes."""
    settings = get_settings()
    # Target origin for postMessage — NEVER use '*'
    target_origin = settings.oauth_redirect_base.replace("/auth", "").rstrip("/")
    # Derive frontend origin (default: same host, port 3000)
    frontend_origin = (
        os.environ.get("NEXT_PUBLIC_FRONTEND_URL")
        or target_origin.replace(":8000", ":3000")
    )

    status = "success" if success else "error"
    color = "#10b981" if success else "#ef4444"
    icon = "&#10003;" if success else "&#10007;"

    # Escape all values for safe HTML embedding
    safe_message = html.escape(message)
    safe_provider = html.escape(provider)

    # Build JS payload with json.dumps — no f-string interpolation into JS
    js_payload = _json.dumps({
        "type": "nester_oauth",
        "status": status,
        "provider": provider,
        "message": message,
        "userName": user_name,
    })
    safe_origin = _json.dumps(frontend_origin)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Nester — {safe_provider}</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }}
    .card {{
      text-align: center;
      padding: 48px;
      border-radius: 16px;
      border: 1px solid #1e1e2e;
      background: #12121a;
    }}
    .icon {{
      font-size: 48px;
      color: {color};
      margin-bottom: 16px;
    }}
    .message {{
      font-size: 16px;
      margin-bottom: 8px;
    }}
    .sub {{
      font-size: 13px;
      color: #888;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">{icon}</div>
    <div class="message">{safe_message}</div>
    <div class="sub">This window will close automatically...</div>
  </div>
  <script>
    if (window.opener) {{
      window.opener.postMessage({js_payload}, {safe_origin});
    }}
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>"""


def _error_page(message: str) -> str:
    """Simple error HTML page for the popup."""
    return _result_page(success=False, provider="unknown", message=message)

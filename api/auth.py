"""
Authentication — API key and JWT validation.

Simple API key auth for v1. Extensible to JWT with Supabase Auth later.
"""

import logging
from typing import Any

from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader

from config.settings import get_settings

logger = logging.getLogger(__name__)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> dict[str, Any]:
    """
    Validate the API key from X-API-Key header.

    Returns a dict with user context (user_id, org_id, role).
    """
    settings = get_settings()

    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")

    if api_key != settings.api_secret_key:
        raise HTTPException(status_code=403, detail="Invalid API key")

    return {
        "user_id": "admin",
        "org_id": settings.platform_org_id,
        "role": "admin",
    }

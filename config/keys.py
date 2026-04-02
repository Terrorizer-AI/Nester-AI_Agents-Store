"""
Runtime API key resolver.

Priority order:
  1. SQLite (user-set via Settings UI)
  2. os.environ / .env

This allows users to update API keys via the Settings page without
restarting the server or editing .env files.

Works across all processes (main backend + MCP servers) since SQLite
is a shared file at ~/.nester/ops.db.
"""

from __future__ import annotations

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Default DB path — same as used by the main backend
_DEFAULT_DB = str(Path("~/.nester/ops.db").expanduser())


def get_api_key(name: str, db_path: str = _DEFAULT_DB) -> str:
    """
    Resolve an API key by name.

    Checks SQLite first (user-set via UI), then falls back to os.environ.
    Returns empty string if neither is set.
    """
    # 1. Try SQLite (user-set via Settings UI)
    try:
        import sqlite3
        path = Path(db_path).expanduser()
        if path.exists():
            conn = sqlite3.connect(str(path))
            row = conn.execute(
                "SELECT value FROM api_keys WHERE key = ?", (name,)
            ).fetchone()
            conn.close()
            if row and row[0]:
                return row[0]
    except Exception as e:
        logger.debug("[Keys] SQLite lookup failed for %s: %s", name, e)

    # 2. Fall back to environment variable
    return os.environ.get(name, "")

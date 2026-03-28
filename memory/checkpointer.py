"""
LangGraph checkpointer — SQLite-backed state persistence.

Replaces Redis-based RedisSaver with local SQLite.
Enables human-in-the-loop (resume after email review) and
crash recovery (resume from last checkpoint on restart).

Database file: ~/.nester/ops.db (shared with sqlite_ops).
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_checkpointer = None


async def get_checkpointer(db_path: str = "~/.nester/ops.db"):
    """
    Get or create the async SQLite checkpointer singleton.

    Uses LangGraph's built-in AsyncSqliteSaver for full compatibility
    with human-in-the-loop, branching, and time-travel debugging.
    """
    global _checkpointer

    if _checkpointer is not None:
        return _checkpointer

    path = Path(db_path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)

    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    _checkpointer = AsyncSqliteSaver.from_conn_string(str(path))
    # Initialize the checkpoint tables
    await _checkpointer.setup()

    logger.info("[Checkpointer] SQLite checkpointer ready at %s", path)
    return _checkpointer


async def close_checkpointer() -> None:
    """Close the checkpointer connection."""
    global _checkpointer
    if _checkpointer is not None:
        try:
            await _checkpointer.conn.close()
        except Exception as exc:
            logger.debug("[Checkpointer] Close error: %s", exc)
        _checkpointer = None
        logger.info("[Checkpointer] Closed")

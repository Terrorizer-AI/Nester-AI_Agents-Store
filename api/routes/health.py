"""
Health check endpoints — three-probe Kubernetes pattern.

/healthcheck  -> Liveness: process is running (200 always)
/ready        -> Readiness: all dependencies reachable
/startup      -> Startup: initialization complete
"""

from fastapi import APIRouter

from memory.mem0_store import is_mem0_ready
from memory.sqlite_ops import is_sqlite_ready
from tools.health import get_all_health

router = APIRouter(tags=["health"])

_startup_complete = False


def mark_startup_complete() -> None:
    global _startup_complete
    _startup_complete = True


@router.get("/healthcheck")
async def liveness():
    """Liveness probe — confirms the process is running. Never add dependency checks here."""
    return {"status": "alive"}


@router.get("/ready")
async def readiness():
    """
    Readiness probe — checks all dependencies.
    Returns 503 if critical dependency (SQLite) is down.
    """
    sqlite_ok = is_sqlite_ready()
    mem0_ok = is_mem0_ready()
    mcp_health = get_all_health()

    all_ok = sqlite_ok  # SQLite is critical; Mem0 can degrade

    return {
        "status": "ready" if all_ok else "not_ready",
        "dependencies": {
            "sqlite_ops": sqlite_ok,
            "mem0": mem0_ok,
            "mcp_servers": mcp_health,
        },
    }


@router.get("/startup")
async def startup():
    """Startup probe — prevents traffic routing before initialization completes."""
    if _startup_complete:
        return {"status": "started"}
    return {"status": "starting"}, 503

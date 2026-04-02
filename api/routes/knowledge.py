"""
Knowledge API routes — Google Drive file picker + sync + company profile.

GET  /knowledge/status          → connection status, doc count, last sync time
GET  /knowledge/picker-config   → returns client_id + access_token for Google Picker
POST /knowledge/files           → save selected file IDs from picker, trigger sync
POST /knowledge/upload          → upload local files directly (PDF, DOCX, PPTX, TXT, MD, CSV)
POST /knowledge/sync            → trigger manual re-sync of saved files
GET  /knowledge/docs            → list synced docs
GET  /knowledge/profile         → company master profile text
DELETE /knowledge/reset         → wipe all knowledge and re-sync from scratch
"""

from __future__ import annotations

import io
import logging
import mimetypes
import os
import uuid

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi import Form
from pydantic import BaseModel
from config.keys import get_api_key

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/knowledge", tags=["knowledge"])


def _get_drive_access_token() -> str | None:
    """Get the stored Google Drive OAuth access token."""
    from memory.sqlite_ops import get_oauth_token, is_sqlite_ready
    if not is_sqlite_ready():
        return None
    token = get_oauth_token("google_drive")
    if token:
        return token.get("access_token")
    # Fall back to general google token if it has drive scope
    token = get_oauth_token("google")
    if token and "drive" in (token.get("scopes") or ""):
        return token.get("access_token")
    return None


def _get_openai_key() -> str:
    return os.environ.get("OPENAI_API_KEY", "")


def _get_selected_file_ids() -> list[str]:
    """Get list of file IDs the user selected via the picker."""
    from memory.sqlite_ops import session_get, is_sqlite_ready
    if not is_sqlite_ready():
        return []
    return session_get("gdrive_selected_files") or []


@router.get("/status")
async def get_knowledge_status():
    """Return Drive connection status, doc count, and last sync info."""
    from memory.sqlite_ops import list_knowledge_files, get_company_profile, is_sqlite_ready

    access_token = _get_drive_access_token()
    selected_files = _get_selected_file_ids()
    docs = list_knowledge_files() if is_sqlite_ready() else []
    profile = get_company_profile() if is_sqlite_ready() else None

    return {
        "connected": bool(access_token),
        "has_access_token": bool(access_token),
        "selected_file_count": len(selected_files),
        "doc_count": len(docs),
        "chunk_count": sum(d.get("chunk_count", 0) for d in docs),
        "last_sync": docs[0]["indexed_at"] if docs else None,
        "profile_generated": profile is not None,
        "profile_generated_at": profile.get("generated_at") if profile else None,
        "google_client_id": get_api_key("GOOGLE_CLIENT_ID"),
    }


@router.get("/docs")
async def list_docs():
    """List all synced Drive documents."""
    from memory.sqlite_ops import list_knowledge_files, is_sqlite_ready

    if not is_sqlite_ready():
        return {"docs": []}

    docs = list_knowledge_files()
    return {"docs": docs, "total": len(docs)}


@router.get("/profile")
async def get_profile():
    """Return the company master profile."""
    from memory.sqlite_ops import get_company_profile, is_sqlite_ready

    if not is_sqlite_ready():
        raise HTTPException(status_code=503, detail="Knowledge store not ready")

    profile = get_company_profile()
    if not profile:
        return {"profile": None, "message": "No profile generated yet. Sync your Drive docs first."}

    return {
        "profile": profile["profile_text"],
        "doc_count": profile["doc_count"],
        "generated_at": profile["generated_at"],
    }


class DriveTokenRequest(BaseModel):
    access_token: str
    scope: str = ""


class PickerFilesRequest(BaseModel):
    files: list[dict]  # [{id, name, mimeType}] from Google Picker
    access_token: str  # fresh token from picker (may have drive scope)


class SyncRequest(BaseModel):
    force_resync: bool = False
    regenerate_profile: bool = False


@router.post("/drive-token")
async def save_drive_token(body: DriveTokenRequest):
    """Save a Google Drive OAuth access token obtained from the frontend picker flow."""
    from memory.sqlite_ops import save_oauth_token, is_sqlite_ready, init_sqlite_ops

    if not is_sqlite_ready():
        init_sqlite_ops()

    if not body.access_token:
        raise HTTPException(status_code=400, detail="access_token is required")

    save_oauth_token(
        provider="google_drive",
        access_token=body.access_token,
        scopes=body.scope or "https://www.googleapis.com/auth/drive.readonly",
    )
    logger.info("[Knowledge] Google Drive token saved")
    return {"saved": True}


@router.post("/files")
async def save_selected_files(body: PickerFilesRequest, background_tasks: BackgroundTasks):
    """
    Receive file selections from the Google Picker and trigger sync.
    Called by the frontend after the user picks files.
    """
    from memory.sqlite_ops import session_set, save_oauth_token, is_sqlite_ready, init_sqlite_ops

    if not is_sqlite_ready():
        init_sqlite_ops()

    if not body.files:
        raise HTTPException(status_code=400, detail="No files selected")

    # Save access token
    save_oauth_token(
        provider="google_drive",
        access_token=body.access_token,
        scopes="https://www.googleapis.com/auth/drive.readonly",
    )

    # Save selected file IDs + names permanently
    file_ids = [f["id"] for f in body.files]
    session_set("gdrive_selected_files", file_ids, ttl_seconds=365 * 10 * 24 * 3600)
    session_set("gdrive_selected_files_meta", body.files, ttl_seconds=365 * 10 * 24 * 3600)

    logger.info("[Knowledge] %d files selected via picker", len(body.files))

    # Trigger sync in background
    openai_key = _get_openai_key()
    if not openai_key:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY not set")

    def _run_sync():
        from knowledge.drive_sync import sync_drive_files
        sync_drive_files(
            file_ids=file_ids,
            access_token=body.access_token,
            openai_api_key=openai_key,
            force_resync=True,
        )

    background_tasks.add_task(_run_sync)
    return {"message": f"Syncing {len(body.files)} files in background", "files": body.files}


@router.post("/sync")
async def sync_knowledge(body: SyncRequest, background_tasks: BackgroundTasks):
    """Re-sync previously selected Drive files."""
    access_token = _get_drive_access_token()
    file_ids = _get_selected_file_ids()
    openai_key = _get_openai_key()

    if not access_token:
        raise HTTPException(status_code=400, detail="Not connected to Google Drive. Use the file picker first.")
    if not file_ids:
        raise HTTPException(status_code=400, detail="No files selected. Use the file picker to select files.")
    if not openai_key:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY not set.")

    def _run_sync():
        from memory.sqlite_ops import init_sqlite_ops, is_sqlite_ready
        from knowledge.drive_sync import sync_drive_files
        from knowledge.profile_builder import build_company_profile

        if not is_sqlite_ready():
            init_sqlite_ops()

        result = sync_drive_files(
            file_ids=file_ids,
            access_token=access_token,
            openai_api_key=openai_key,
            force_resync=body.force_resync,
        )

        if body.regenerate_profile and not result.get("profile_updated"):
            build_company_profile(openai_key)

        logger.info("[Knowledge] Sync complete: %s", result)

    background_tasks.add_task(_run_sync)
    return {"message": f"Syncing {len(file_ids)} files in background"}


UPLOAD_MIME_MAP = {
    ".pdf":  "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt":  "text/plain",
    ".md":   "text/markdown",
    ".csv":  "text/csv",
}


@router.post("/upload")
async def upload_files(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
):
    """Upload local files directly — chunks, embeds, and indexes them."""
    from memory.sqlite_ops import is_sqlite_ready, init_sqlite_ops

    if not is_sqlite_ready():
        init_sqlite_ops()

    openai_key = _get_openai_key()
    if not openai_key:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY not set")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    accepted = []
    for f in files:
        ext = os.path.splitext(f.filename or "")[1].lower()
        if ext not in UPLOAD_MIME_MAP:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {ext}. Allowed: {', '.join(UPLOAD_MIME_MAP)}",
            )
        raw = await f.read()
        accepted.append({"filename": f.filename, "ext": ext, "raw": raw})

    def _run_index():
        from knowledge.drive_sync import (
            _chunk_text, _embed_chunks,
            _extract_pdf_text, _extract_docx_text, _extract_pptx_text,
        )
        from memory.sqlite_ops import (
            delete_knowledge_file, upsert_knowledge_chunk, upsert_knowledge_file,
        )
        from knowledge.profile_builder import build_company_profile
        import datetime

        any_indexed = False
        for item in accepted:
            ext = item["ext"]
            raw: bytes = item["raw"]
            filename: str = item["filename"] or "upload"
            mime = UPLOAD_MIME_MAP[ext]

            # Stable file_id based on filename so re-uploads replace old version
            file_id = f"local_{uuid.uuid5(uuid.NAMESPACE_URL, filename)}"

            try:
                if ext == ".pdf":
                    text = _extract_pdf_text(raw)
                elif ext == ".docx":
                    text = _extract_docx_text(raw)
                elif ext == ".pptx":
                    text = _extract_pptx_text(raw)
                else:
                    text = raw.decode("utf-8", errors="replace")

                if not text.strip():
                    logger.warning("[Upload] Empty content: %s", filename)
                    continue

                chunks = _chunk_text(text)
                if not chunks:
                    continue

                embeddings = _embed_chunks(chunks, openai_key)
                delete_knowledge_file(file_id)

                for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                    upsert_knowledge_chunk(file_id, filename, idx, chunk, emb)

                modified_time = datetime.datetime.utcnow().isoformat() + "Z"
                upsert_knowledge_file(file_id, filename, mime, modified_time, len(chunks))
                any_indexed = True
                logger.info("[Upload] Indexed %s → %d chunks", filename, len(chunks))

            except Exception as exc:
                logger.error("[Upload] Failed %s: %s", filename, exc)

        if any_indexed:
            try:
                build_company_profile(openai_key)
            except Exception as exc:
                logger.error("[Upload] Profile build failed: %s", exc)

    background_tasks.add_task(_run_index)
    return {"message": f"Indexing {len(accepted)} file(s) in background", "files": [a["filename"] for a in accepted]}


@router.delete("/files/{file_id}")
async def delete_file(file_id: str):
    """Remove a single file from the knowledge base and from the saved selection list."""
    from memory.sqlite_ops import (
        delete_knowledge_file, session_get, session_set, is_sqlite_ready, init_sqlite_ops,
    )

    if not is_sqlite_ready():
        init_sqlite_ops()

    deleted_chunks = delete_knowledge_file(file_id)

    # Remove from saved selection list so it won't re-sync on next start
    file_ids: list[str] = session_get("gdrive_selected_files") or []
    file_meta: list[dict] = session_get("gdrive_selected_files_meta") or []
    if file_id in file_ids:
        new_ids = [fid for fid in file_ids if fid != file_id]
        new_meta = [f for f in file_meta if f.get("id") != file_id]
        ttl = 365 * 10 * 24 * 3600
        session_set("gdrive_selected_files", new_ids, ttl_seconds=ttl)
        session_set("gdrive_selected_files_meta", new_meta, ttl_seconds=ttl)

    logger.info("[Knowledge] Deleted file %s (%d chunks removed)", file_id, deleted_chunks)
    return {"deleted": True, "file_id": file_id, "chunks_removed": deleted_chunks}


@router.delete("/reset")
async def reset_knowledge(background_tasks: BackgroundTasks):
    """Wipe all knowledge and re-sync from scratch."""
    access_token = _get_drive_access_token()
    file_ids = _get_selected_file_ids()
    openai_key = _get_openai_key()

    def _run_reset():
        from memory.sqlite_ops import clear_knowledge, init_sqlite_ops, is_sqlite_ready
        from knowledge.drive_sync import sync_drive_files

        if not is_sqlite_ready():
            init_sqlite_ops()

        clear_knowledge()
        logger.info("[Knowledge] Knowledge wiped — starting full re-sync")

        if file_ids and access_token and openai_key:
            sync_drive_files(
                file_ids=file_ids,
                access_token=access_token,
                openai_api_key=openai_key,
                force_resync=True,
            )

    background_tasks.add_task(_run_reset)
    return {"message": "Knowledge reset started. Full re-sync in progress."}

"""CSV / Excel import endpoints."""
from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from ..deps import DbSession, PaginationDep, UserDep
from ..models import DataSource, ImportBatch, ImportRowError
from ..security import require_permission, write_audit
from ..services import import_export

router = APIRouter(prefix="/api/imports", tags=["imports"])


async def _read_upload(file: UploadFile) -> bytes:
    content = await file.read()
    if len(content) > import_export.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than the 12 MB limit.")
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    return content


@router.get("")
def list_batches(db: DbSession, pagination: PaginationDep, _user: UserDep):
    rows = db.scalars(
        select(ImportBatch).order_by(ImportBatch.id.desc())
        .offset(pagination.offset).limit(pagination.page_size)
    ).all()
    total = len(db.scalars(select(ImportBatch.id)).all())
    return {
        "items": [batch.to_dict() for batch in rows],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "stats": import_export.import_stats(db),
    }


@router.post("/preview")
async def preview(file: UploadFile = File(...), user: UserDep = None):
    require_permission(user, "imports:manage")
    content = await _read_upload(file)
    try:
        return import_export.preview_import(content, file.filename or "upload.csv")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("")
async def run_import(
    request: Request,
    db: DbSession,
    user: UserDep,
    file: UploadFile = File(...),
    source_id: int | None = Form(default=None),
    attestation: str = Form(...),
    consent_override: str | None = Form(default=None),
    dry_run: bool = Form(default=False),
):
    require_permission(user, "imports:manage")
    if len(attestation.strip()) < 15:
        raise HTTPException(
            status_code=400,
            detail="Please describe your legal basis for contacting these businesses (at least 15 characters).",
        )
    content = await _read_upload(file)
    source = db.get(DataSource, source_id) if source_id else None
    if source_id and not source:
        raise HTTPException(status_code=404, detail="Source not found")
    try:
        result = import_export.run_import(
            db, content=content, filename=file.filename or "upload.csv", user=user,
            source=source, attestation=attestation, consent_override=consent_override,
            dry_run=dry_run,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    write_audit(db, action="import.completed", user=user, request=request, entity_type="import",
                entity_id=result.get("batch_id"), detail={
                    "filename": result["filename"], "rows": result["rows_total"],
                    "imported": result["imported"], "duplicates": result["duplicates"],
                    "invalid": result["invalid"], "dry_run": dry_run,
                })
    return result


@router.get("/template")
def template(format: str = "csv", user: UserDep = None):
    require_permission(user, "imports:manage")
    content, filename, media_type = import_export.build_import_template(format)
    return Response(content=content, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/{batch_id}")
def get_batch(batch_id: int, db: DbSession, user: UserDep):
    require_permission(user, "imports:manage")
    batch = db.get(ImportBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")
    errors = db.scalars(
        select(ImportRowError).where(ImportRowError.batch_id == batch_id).limit(200)
    ).all()
    payload = batch.to_dict()
    payload["errors"] = [error.to_dict() for error in errors]
    return payload

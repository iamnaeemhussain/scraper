"""Compliance-gated exports of calling lists."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select

from ..deps import DbSession, PaginationDep, UserDep
from ..models import ExportJob
from ..schemas import ExportRequest
from ..security import has_permission, write_audit
from ..services import import_export, org_settings

router = APIRouter(prefix="/api/exports", tags=["exports"])


def _policy(db, payload: ExportRequest, user) -> tuple[bool, bool]:
    require_consent = payload.require_consent
    if require_consent is None:
        require_consent = bool(org_settings.get(db, "export_require_consent", False))
    exclude_invalid = payload.exclude_invalid
    if exclude_invalid is None:
        exclude_invalid = bool(org_settings.get(db, "export_exclude_invalid", True))
    if not has_permission(user, "exports:manage") and not org_settings.get(db, "allow_agent_export", True):
        raise HTTPException(status_code=403, detail="Exports are restricted to managers by organisation policy.")
    return require_consent, exclude_invalid


@router.post("/preview")
def preview(payload: ExportRequest, db: DbSession, user: UserDep):
    filters = payload.filters.as_dict()
    if not has_permission(user, "leads:read_all"):
        filters["assigned_agent_id"] = user.id
    require_consent, exclude_invalid = _policy(db, payload, user)
    result = import_export.export_preview(db, filters, require_consent=require_consent,
                                          exclude_invalid=exclude_invalid)
    result["applied_filters"] = filters
    result["policy"] = {
        "require_consent": require_consent,
        "exclude_invalid": exclude_invalid,
        "agent_scoped": not has_permission(user, "leads:read_all"),
    }
    return result


@router.post("")
def create_export(payload: ExportRequest, request: Request, db: DbSession, user: UserDep):
    filters = payload.filters.as_dict()
    if not has_permission(user, "leads:read_all"):
        filters["assigned_agent_id"] = user.id
    require_consent, exclude_invalid = _policy(db, payload, user)
    leads, blocked = import_export.select_export_leads(
        db, filters, require_consent=require_consent, exclude_invalid=exclude_invalid
    )
    if not leads:
        raise HTTPException(
            status_code=409,
            detail=(
                "No leads passed the compliance checks. "
                f"{len(blocked)} record(s) were blocked (suppression list, Do Not Contact or missing consent)."
            ),
        )
    content, filename, media_type = import_export.build_export_file(
        leads, payload.format, include_notes=payload.include_notes
    )
    job = ExportJob(
        format=payload.format,
        filters={**filters, "purpose": payload.purpose, "require_consent": require_consent,
                 "exclude_invalid": exclude_invalid},
        rows=len(leads),
        blocked=len(blocked),
        file_name=filename,
        created_by=user.id,
        created_by_name=user.full_name,
    )
    db.add(job)
    db.commit()
    write_audit(db, action="export.created", user=user, request=request, entity_type="export",
                entity_id=job.id, detail={
                    "rows": len(leads), "blocked": len(blocked), "format": payload.format,
                    "purpose": payload.purpose, "filters": filters,
                    "require_consent": require_consent,
                })
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Export-Rows": str(len(leads)),
            "X-Export-Blocked": str(len(blocked)),
            "Access-Control-Expose-Headers": "X-Export-Rows, X-Export-Blocked, Content-Disposition",
        },
    )


@router.get("/history")
def history(db: DbSession, pagination: PaginationDep, _user: UserDep):
    rows = db.scalars(
        select(ExportJob).order_by(ExportJob.id.desc())
        .offset(pagination.offset).limit(pagination.page_size)
    ).all()
    total = len(db.scalars(select(ExportJob.id)).all())
    return {"items": [job.to_dict() for job in rows], "total": total,
            "page": pagination.page, "page_size": pagination.page_size}

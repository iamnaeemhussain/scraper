"""Settings, roles, API keys, suppression list, audit log, retention and backups."""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from ..config import settings as app_settings
from ..database import SessionLocal
from ..deps import DbSession, PaginationDep, UserDep
from ..models import ApiKey, AuditLog, ExportJob, Lead, LeadAudit, SuppressionEntry, User
from ..schemas import ApiKeyCreate, SettingsUpdate, SuppressionCreate
from ..security import (
    generate_api_key,
    has_permission,
    require_permission,
    write_audit,
)
from ..services import org_settings
from ..services.suppression import add_entry, stats as suppression_stats

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings(db: DbSession, user: UserDep):
    data = org_settings.get_all(db)
    data["retention"] = {
        "data_retention_days": data.get("data_retention_days"),
        "audit_retention_days": data.get("audit_retention_days"),
    }
    data["environment"] = {
        "environment": app_settings.environment,
        "database": "PostgreSQL" if "postgres" in app_settings.database_url else "SQLite",
        "demo_mode": app_settings.demo_mode_enabled,
        "cookie_secure": app_settings.cookie_secure,
        "fetch_engine": app_settings.fetch_engine,
        "robots_enforced": app_settings.respect_robots_txt,
        "live_allowlist": app_settings.allowed_domain_list,
        "user_agent": app_settings.user_agent,
    }
    data["suppression"] = suppression_stats(db)
    data["can_manage"] = has_permission(user, "settings:manage")
    if has_permission(user, "apikeys:manage"):
        data["api_keys"] = [key.to_dict() for key in db.scalars(select(ApiKey).order_by(ApiKey.id)).all()]
    return data


@router.put("")
def update_settings(payload: SettingsUpdate, request: Request, db: DbSession, user: UserDep):
    require_permission(user, "settings:manage")
    values = payload.model_dump(exclude_unset=True)
    updated = org_settings.update(db, values, user=user, request=request)
    return {"ok": True, "settings": updated}


# --------------------------------------------------------------------------- #
# Suppression list
# --------------------------------------------------------------------------- #
@router.get("/suppression")
def list_suppression(db: DbSession, pagination: PaginationDep, user: UserDep, q: str | None = None):
    stmt = select(SuppressionEntry)
    count_stmt = select(func.count(SuppressionEntry.id))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(SuppressionEntry.value).like(like))
        count_stmt = count_stmt.where(func.lower(SuppressionEntry.value).like(like))
    total = int(db.scalar(count_stmt) or 0)
    rows = db.scalars(stmt.order_by(SuppressionEntry.id.desc())
                      .offset(pagination.offset).limit(pagination.page_size)).all()
    return {"items": [row.to_dict() for row in rows], "total": total,
            "page": pagination.page, "page_size": pagination.page_size,
            "stats": suppression_stats(db),
            "can_manage": has_permission(user, "suppression:manage")}


@router.post("/suppression", status_code=201)
def create_suppression(payload: SuppressionCreate, request: Request, db: DbSession, user: UserDep):
    require_permission(user, "suppression:manage")
    entry = add_entry(db, kind=payload.kind, value=payload.value, reason=payload.reason, user_id=user.id)
    db.commit()
    db.refresh(entry)
    write_audit(db, action="suppression.added", user=user, request=request,
                entity_type="suppression", entity_id=entry.id,
                detail={"kind": entry.kind, "value": entry.value})
    return entry.to_dict()


@router.delete("/suppression/{entry_id}")
def delete_suppression(entry_id: int, request: Request, db: DbSession, user: UserDep):
    require_permission(user, "suppression:manage")
    entry = db.get(SuppressionEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Suppression entry not found")
    write_audit(db, action="suppression.removed", user=user, request=request,
                entity_type="suppression", entity_id=entry.id,
                detail={"kind": entry.kind, "value": entry.value})
    db.delete(entry)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# API keys
# --------------------------------------------------------------------------- #
@router.get("/api-keys")
def list_api_keys(db: DbSession, user: UserDep):
    require_permission(user, "apikeys:manage")
    return {"items": [key.to_dict() for key in db.scalars(select(ApiKey).order_by(ApiKey.id)).all()]}


@router.post("/api-keys", status_code=201)
def create_api_key(payload: ApiKeyCreate, request: Request, db: DbSession, user: UserDep):
    require_permission(user, "apikeys:manage")
    plaintext, prefix, hashed = generate_api_key()
    key = ApiKey(name=payload.name, prefix=prefix, hashed_key=hashed, scopes=payload.scopes,
                 created_by=user.id)
    db.add(key)
    db.commit()
    db.refresh(key)
    write_audit(db, action="api_key.created", user=user, request=request, entity_type="api_key",
                entity_id=key.id, detail={"name": key.name, "scopes": key.scopes})
    return {**key.to_dict(), "key": plaintext,
            "notice": "Copy this key now — it is stored hashed and cannot be shown again."}


@router.delete("/api-keys/{key_id}")
def revoke_api_key(key_id: int, request: Request, db: DbSession, user: UserDep):
    require_permission(user, "apikeys:manage")
    key = db.get(ApiKey, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    key.is_active = False
    db.commit()
    write_audit(db, action="api_key.revoked", user=user, request=request, entity_type="api_key",
                entity_id=key.id)
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Audit log
# --------------------------------------------------------------------------- #
@router.get("/audit")
def audit_log(db: DbSession, pagination: PaginationDep, user: UserDep,
              action: str | None = None, q: str | None = None):
    require_permission(user, "audit:read")
    stmt = select(AuditLog)
    count_stmt = select(func.count(AuditLog.id))
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
        count_stmt = count_stmt.where(AuditLog.action.like(f"{action}%"))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(AuditLog.actor_email).like(like))
        count_stmt = count_stmt.where(func.lower(AuditLog.actor_email).like(like))
    total = int(db.scalar(count_stmt) or 0)
    rows = db.scalars(stmt.order_by(AuditLog.id.desc())
                      .offset(pagination.offset).limit(pagination.page_size)).all()
    return {"items": [row.to_dict() for row in rows], "total": total,
            "page": pagination.page, "page_size": pagination.page_size}


# --------------------------------------------------------------------------- #
# Retention & backups
# --------------------------------------------------------------------------- #
@router.get("/retention/preview")
def retention_preview(db: DbSession, user: UserDep):
    require_permission(user, "retention:manage")
    data_days = int(org_settings.get(db, "data_retention_days", app_settings.data_retention_days))
    audit_days = int(org_settings.get(db, "audit_retention_days", app_settings.audit_retention_days))
    now = datetime.now(timezone.utc)
    leads = db.scalar(select(func.count(Lead.id)).where(
        Lead.collected_at < now - timedelta(days=data_days),
        Lead.lead_status.not_in(["converted", "interested"]),
    )) or 0
    audit = db.scalar(select(func.count(AuditLog.id)).where(
        AuditLog.created_at < now - timedelta(days=audit_days))) or 0
    return {
        "data_retention_days": data_days,
        "audit_retention_days": audit_days,
        "leads_to_purge": int(leads),
        "audit_entries_to_purge": int(audit),
        "note": "Converted and interested leads are always retained; delete them explicitly if required.",
    }


@router.post("/retention/purge")
def retention_purge(request: Request, db: DbSession, user: UserDep, dry_run: bool = False):
    require_permission(user, "retention:manage")
    data_days = int(org_settings.get(db, "data_retention_days", app_settings.data_retention_days))
    audit_days = int(org_settings.get(db, "audit_retention_days", app_settings.audit_retention_days))
    cutoff = datetime.now(timezone.utc) - timedelta(days=data_days)
    stale = db.scalars(select(Lead).where(
        Lead.collected_at < cutoff,
        Lead.lead_status.not_in(["converted", "interested"]),
    )).all()
    audit_cutoff = datetime.now(timezone.utc) - timedelta(days=audit_days)
    audit_count = db.scalar(select(func.count(AuditLog.id)).where(AuditLog.created_at < audit_cutoff)) or 0
    if dry_run:
        return {"dry_run": True, "leads": len(stale), "audit_entries": int(audit_count)}
    for lead in stale:
        db.delete(lead)
    db.query(AuditLog).filter(AuditLog.created_at < audit_cutoff).delete()
    db.commit()
    write_audit(db, action="retention.purged", user=user, request=request, entity_type="retention",
                detail={"leads": len(stale), "audit_entries": int(audit_count),
                        "data_days": data_days, "audit_days": audit_days})
    return {"ok": True, "leads_purged": len(stale), "audit_entries_purged": int(audit_count)}


@router.post("/backup")
def create_backup(request: Request, db: DbSession, user: UserDep):
    """Download a consistent snapshot of the SQLite database."""
    require_permission(user, "backup:run")
    if "postgres" in app_settings.database_url:
        write_audit(db, action="backup.requested", user=user, request=request)
        raise HTTPException(
            status_code=400,
            detail=(
                "PostgreSQL backups are managed by your provider. Run: "
                "pg_dump $DATABASE_URL | gzip > leadbridge-$(date +%F).sql.gz "
                "and store the archive outside the app server (see docs/DEPLOYMENT.md)."
            ),
        )
    from ..database import engine

    target = Path(tempfile.gettempdir()) / f"leadbridge-backup-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.db"
    if target.exists():
        target.unlink()
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql(f"VACUUM INTO '{target}'")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}") from exc
    size = target.stat().st_size if target.exists() else 0
    write_audit(db, action="backup.created", user=user, request=request, entity_type="backup",
                detail={"file": target.name, "size": size})
    return FileResponse(target, filename=target.name, media_type="application/x-sqlite3")


@router.get("/data-inventory")
def data_inventory(db: DbSession, user: UserDep):
    require_permission(user, "settings:manage")
    counts = {
        "leads": int(db.scalar(select(func.count(Lead.id))) or 0),
        "lead_audit": int(db.scalar(select(func.count(LeadAudit.id))) or 0),
        "audit_logs": int(db.scalar(select(func.count(AuditLog.id))) or 0),
        "exports": int(db.scalar(select(func.count(ExportJob.id))) or 0),
        "suppression": int(db.scalar(select(func.count(SuppressionEntry.id))) or 0),
        "users": int(db.scalar(select(func.count(User.id))) or 0),
    }
    database_path = app_settings.database_url
    size = None
    if database_path.startswith("sqlite"):
        path = Path(database_path.replace("sqlite:///", ""))
        if path.exists():
            size = path.stat().st_size
    return {"counts": counts, "database": database_path.split("://")[0], "database_size_bytes": size,
            "environment_variables_set": {
        "SECRET_KEY": bool(os.environ.get("SECRET_KEY")),
        "DATABASE_URL": bool(os.environ.get("DATABASE_URL")),
        "ALLOWED_LIVE_DOMAINS": bool(os.environ.get("ALLOWED_LIVE_DOMAINS")),
    }}

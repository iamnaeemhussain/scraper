"""Data source management."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select

from ..adapters.base import ALL_LEAD_FIELDS, PROHIBITED_FIELDS
from ..adapters.net import ComplianceError, assert_live_allowed, domain_of, engine_info, robots_cache
from ..adapters.registry import get_meta
from ..config import settings
from ..deps import DbSession, PrincipalDep, require_service_or
from ..models import CollectionJob, DataSource, FailedRequest, Lead, User
from ..schemas import SourceCreate, SourceUpdate
from ..security import write_audit

router = APIRouter(prefix="/api/sources", tags=["sources"])


def _validate_fields(fields: list[str], meta_default: list[str]) -> list[str]:
    if not fields:
        return list(meta_default)
    # Prohibited fields are checked first so the error explains the policy rather
    # than just "unknown field".
    prohibited = [f for f in fields if f in PROHIBITED_FIELDS]
    if prohibited:
        raise HTTPException(
            status_code=400,
            detail=f"Prohibited fields cannot be collected: {', '.join(prohibited)}",
        )
    invalid = [f for f in fields if f not in ALL_LEAD_FIELDS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown lead fields: {', '.join(invalid)}")
    return fields


def _source_with_stats(db: DbSession, source: DataSource) -> dict[str, Any]:
    leads = db.scalar(select(func.count(Lead.id)).where(Lead.source_id == source.id)) or 0
    duplicates = db.scalar(
        select(func.count(Lead.id)).where(Lead.source_id == source.id, Lead.is_duplicate.is_(True))
    ) or 0
    jobs = db.scalar(select(func.count(CollectionJob.id)).where(CollectionJob.source_id == source.id)) or 0
    failures = db.scalar(
        select(func.count(FailedRequest.id)).where(FailedRequest.source_id == source.id)
    ) or 0
    last_job = db.scalar(
        select(CollectionJob).where(CollectionJob.source_id == source.id).order_by(CollectionJob.id.desc())
    )
    payload = source.to_dict()
    payload["meta"] = get_meta(source.adapter).to_dict() if get_meta(source.adapter) else None
    payload["stats"] = {
        "leads": int(leads),
        "duplicates": int(duplicates),
        "jobs": int(jobs),
        "failed_requests": int(failures),
        "last_job": last_job.to_dict(source.name) if last_job else None,
    }
    payload["live_ready"] = _live_readiness(source)
    return payload


def _live_readiness(source: DataSource) -> dict[str, Any]:
    meta = get_meta(source.adapter)
    if not meta:
        return {"ready": False, "reason": "Unknown adapter"}
    if not meta.supports_live:
        return {"ready": False, "reason": "Adapter does not support live collection"}
    if meta.requires_credentials:
        import os

        if not source.credential_env:
            return {"ready": False, "reason": "No credential environment variable configured"}
        if not os.environ.get(source.credential_env):
            return {"ready": False, "reason": f"Environment variable {source.credential_env} is not set"}
    if meta.key in {"business_directory", "company_website"}:
        domain = domain_of(source.url or "")
        config = source.config or {}
        extra = config.get("allowed_domains") or []
        allowed = set(settings.allowed_domain_list) | {d.lower() for d in extra}
        if not domain:
            return {"ready": False, "reason": "Source URL is required for live collection"}
        if not any(domain == entry or domain.endswith("." + entry) for entry in allowed):
            return {
                "ready": False,
                "reason": f"Domain '{domain}' is not on the approved live domain allowlist",
            }
    return {"ready": True, "reason": "Live collection is configured"}


@router.get("")
def list_sources(db: DbSession, _principal: PrincipalDep):
    sources = db.scalars(select(DataSource).order_by(DataSource.created_at.desc())).all()
    return {"items": [_source_with_stats(db, source) for source in sources], "total": len(sources)}


@router.post("", status_code=201)
def create_source(payload: SourceCreate, request: Request, db: DbSession,
                  principal=Depends(require_service_or("sources:manage"))):
    meta = get_meta(payload.adapter)
    if not meta:
        raise HTTPException(status_code=400, detail=f"Unknown adapter '{payload.adapter}'")
    allowed_fields = _validate_fields(payload.allowed_fields, meta.default_allowed_fields)
    if meta.requires_credentials and not (payload.credential_env or "").strip():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Adapter '{meta.key}' is licensed. Store the credential in the API server "
                "environment and set credential_env to that variable name — never paste the "
                "key into the browser."
            ),
        )
    config = dict(payload.config or {})
    if meta.key == "lead_form" and not config.get("form_token"):
        import secrets

        config["form_token"] = secrets.token_urlsafe(24)

    source = DataSource(
        name=payload.name.strip(),
        adapter=payload.adapter,
        url=payload.url.strip(),
        description=payload.description,
        mode=payload.mode,
        is_enabled=payload.is_enabled,
        config=config,
        allowed_fields=allowed_fields,
        rate_limit_per_minute=payload.rate_limit_per_minute,
        min_delay_seconds=payload.min_delay_seconds,
        max_records_per_run=payload.max_records_per_run,
        max_requests_per_run=payload.max_requests_per_run,
        attribution=payload.attribution or meta.default_attribution,
        licensing_status=payload.licensing_status,
        consent_default=payload.consent_default,
        credential_env=payload.credential_env,
        compliance_notes=payload.compliance_notes or meta.compliance_notes,
        created_by=principal.user.id if principal.user else None,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    write_audit(db, action="source.created", user=principal.user, request=request,
                entity_type="source", entity_id=source.id,
                detail={"name": source.name, "adapter": source.adapter, "mode": source.mode})
    return _source_with_stats(db, source)


@router.get("/{source_id}")
def get_source(source_id: int, db: DbSession, _principal: PrincipalDep):
    source = db.get(DataSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return _source_with_stats(db, source)


@router.put("/{source_id}")
def update_source(source_id: int, payload: SourceUpdate, request: Request, db: DbSession,
                  principal=Depends(require_service_or("sources:manage"))):
    source = db.get(DataSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    meta = get_meta(source.adapter)
    data = payload.model_dump(exclude_unset=True)
    if (
        meta and meta.requires_credentials
        and "credential_env" in data
        and not (data["credential_env"] or "").strip()
        and not (source.credential_env or "").strip()
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Adapter '{meta.key}' requires credential_env to reference a server-side secret.",
        )
    if "allowed_fields" in data and data["allowed_fields"] is not None:
        data["allowed_fields"] = _validate_fields(data["allowed_fields"],
                                                 meta.default_allowed_fields if meta else [])
    for key, value in data.items():
        if value is not None:
            setattr(source, key, value)
    db.commit()
    write_audit(db, action="source.updated", user=principal.user, request=request,
                entity_type="source", entity_id=source.id, detail={"fields": list(data.keys())})
    return _source_with_stats(db, source)


@router.patch("/{source_id}/enabled")
def toggle_source(source_id: int, enabled: bool, request: Request, db: DbSession,
                  principal=Depends(require_service_or("sources:manage"))):
    source = db.get(DataSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    source.is_enabled = enabled
    db.commit()
    write_audit(db, action="source.enabled" if enabled else "source.disabled", user=principal.user,
                request=request, entity_type="source", entity_id=source.id)
    return _source_with_stats(db, source)


@router.delete("/{source_id}")
def delete_source(source_id: int, request: Request, db: DbSession,
                  principal=Depends(require_service_or("sources:manage"))):
    source = db.get(DataSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    lead_count = db.scalar(select(func.count(Lead.id)).where(Lead.source_id == source.id)) or 0
    if lead_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This source still has {lead_count} collected records and cannot be deleted. "
                "Disable it instead to preserve source attribution and audit history."
            ),
        )
    db.query(CollectionJob).filter(CollectionJob.source_id == source.id).delete()
    db.delete(source)
    db.commit()
    write_audit(db, action="source.deleted", user=principal.user, request=request,
                entity_type="source", entity_id=source_id, detail={"name": source.name})
    return {"ok": True}


@router.post("/{source_id}/test")
def test_source(source_id: int, db: DbSession, _=Depends(require_service_or("sources:manage"))):
    """Pre-flight check: configuration, credentials, allowlist and robots policy."""
    source = db.get(DataSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    meta = get_meta(source.adapter)
    checks: list[dict[str, Any]] = []
    ok = True

    checks.append({
        "check": "Adapter",
        "status": "pass" if meta else "fail",
        "detail": meta.label if meta else "Unknown adapter",
    })
    ok = ok and bool(meta)

    if source.mode == "demo":
        checks.append({"check": "Mode", "status": "pass",
                       "detail": "Demo dataset — no external requests are made."})
        return {"ok": True, "checks": checks, "engine": engine_info()}

    readiness = _live_readiness(source)
    checks.append({
        "check": "Live readiness",
        "status": "pass" if readiness["ready"] else "fail",
        "detail": readiness["reason"],
    })
    ok = ok and readiness["ready"]

    if meta and meta.key in {"business_directory", "company_website"} and source.url:
        try:
            assert_live_allowed(source.url, (source.config or {}).get("allowed_domains") or [])
            checks.append({"check": "robots.txt", "status": "pass",
                           "detail": f"Allowed for {settings.user_agent}"})
        except ComplianceError as exc:
            checks.append({"check": "robots.txt", "status": "fail", "detail": str(exc)})
            ok = False

    checks.append({
        "check": "Request limits",
        "status": "pass",
        "detail": (f"≤ {source.rate_limit_per_minute} requests/min, {source.min_delay_seconds}s minimum delay, "
                   f"{source.max_records_per_run} records per run"),
    })
    checks.append({
        "check": "Permitted fields",
        "status": "pass" if source.allowed_fields else "warn",
        "detail": ", ".join(source.allowed_fields or []) or "No fields permitted",
    })
    return {"ok": ok, "checks": checks, "engine": engine_info()}


@router.post("/{source_id}/robots-check")
def robots_check(source_id: int, db: DbSession, _=Depends(require_service_or("sources:manage"))):
    source = db.get(DataSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if not source.url:
        raise HTTPException(status_code=400, detail="This source has no URL to check")
    robots_cache.clear()
    allowed, reason = robots_cache.allowed(source.url)
    return {"url": source.url, "allowed": allowed, "reason": reason,
            "robots_url": source.url.rstrip("/") + "/robots.txt"}


@router.get("/{source_id}/fields")
def source_fields(source_id: int, db: DbSession, _=Depends(require_service_or("jobs:manage"))):
    source = db.get(DataSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"allowed_fields": source.allowed_fields or [], "all_fields": ALL_LEAD_FIELDS,
            "prohibited": PROHIBITED_FIELDS}

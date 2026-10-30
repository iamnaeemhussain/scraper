"""Collection job management: start, pause, resume, stop, history, failures."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select

from ..config import settings
from ..deps import DbSession, PaginationDep, require_service_or
from ..models import CollectionJob, DataSource, FailedRequest, JobEvent, Lead
from ..schemas import StartJobRequest
from ..security import write_audit
from ..services import org_settings
from ..services.jobs import job_manager

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _job_payload(db, job: CollectionJob, source: DataSource | None = None) -> dict:
    source = source or db.get(DataSource, job.source_id)
    payload = job.to_dict(source.name if source else None)
    payload["source_adapter"] = source.adapter if source else None
    payload["can_pause"] = job.status == "running"
    payload["can_resume"] = job.status == "paused"
    payload["can_stop"] = job.status in {"running", "paused", "queued"}
    return payload


@router.get("")
def list_jobs(db: DbSession, pagination: PaginationDep, _=Depends(require_service_or("jobs:manage")),
              source_id: int | None = None, status: str | None = None, q: str | None = None):
    stmt = select(CollectionJob).join(DataSource, DataSource.id == CollectionJob.source_id)
    count_stmt = select(func.count(CollectionJob.id)).join(DataSource, DataSource.id == CollectionJob.source_id)
    conditions = []
    if source_id:
        conditions.append(CollectionJob.source_id == source_id)
    if status:
        statuses = [s for s in status.split(",") if s]
        conditions.append(CollectionJob.status.in_(statuses))
    if q:
        conditions.append(func.lower(DataSource.name).like(f"%{q.lower()}%"))
    for condition in conditions:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        stmt.order_by(CollectionJob.id.desc()).offset(pagination.offset).limit(pagination.page_size)
    ).scalars().all()
    return {
        "items": [_job_payload(db, job) for job in rows],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
    }


@router.get("/summary")
def job_summary(db: DbSession, _=Depends(require_service_or("jobs:manage")), days: int = 30):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(
        select(CollectionJob.status, func.count(CollectionJob.id)).where(CollectionJob.created_at >= since)
        .group_by(CollectionJob.status)
    ).all()
    totals = db.execute(
        select(
            func.coalesce(func.sum(CollectionJob.records_collected), 0),
            func.coalesce(func.sum(CollectionJob.records_processed), 0),
            func.coalesce(func.sum(CollectionJob.records_failed), 0),
            func.coalesce(func.sum(CollectionJob.duplicates_found), 0),
            func.coalesce(func.sum(CollectionJob.invalid_found), 0),
            func.coalesce(func.avg(CollectionJob.duration_ms), 0),
        ).where(CollectionJob.created_at >= since)
    ).one()
    durations = db.scalar(
        select(func.coalesce(func.sum(CollectionJob.duration_ms), 0)).where(CollectionJob.created_at >= since)
    )
    return {
        "period_days": days,
        "by_status": {status: int(count) for status, count in rows},
        "total_records": int(totals[0] or 0),
        "processed": int(totals[1] or 0),
        "failed": int(totals[2] or 0),
        "duplicates": int(totals[3] or 0),
        "invalid": int(totals[4] or 0),
        "avg_duration_ms": int(totals[5] or 0),
        "total_duration_ms": int(durations or 0),
        "running": [job_manager.is_running(job.id) for job in db.scalars(
            select(CollectionJob).where(CollectionJob.status == "running")).all()].count(True),
    }


@router.post("", status_code=201)
def start_job(payload: StartJobRequest, request: Request, db: DbSession,
              principal=Depends(require_service_or("jobs:manage")), source_id: int | None = None):
    if source_id is None:
        raise HTTPException(status_code=422, detail="source_id is required")
    source = db.get(DataSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if not source.is_enabled:
        raise HTTPException(status_code=409, detail="This source is disabled. Enable it before collecting.")
    if principal.user and not org_settings.get(db, "collection_enabled", True):
        raise HTTPException(status_code=409, detail="Collection is paused globally in Settings.")

    tomorrow = datetime.now(timezone.utc) - timedelta(days=1)
    recent_total = db.scalar(
        select(func.coalesce(func.sum(CollectionJob.records_collected), 0))
        .where(CollectionJob.created_at >= tomorrow)
    ) or 0
    daily_limit = int(org_settings.get(db, "daily_collection_limit", 5000) or 5000)
    if recent_total >= daily_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily collection limit of {daily_limit} records reached. Adjust it in Settings.",
        )

    active = db.scalar(
        select(CollectionJob).where(
            CollectionJob.source_id == source.id,
            CollectionJob.status.in_(["queued", "running", "paused"]),
        )
    )
    if active:
        raise HTTPException(status_code=409,
                            detail=f"A collection for this source is already {active.status} (job #{active.id}).")

    mode = payload.mode_override or source.mode
    max_records = payload.max_records or source.max_records_per_run
    options = {"max_records": max_records, "max_requests": payload.max_requests or source.max_requests_per_run}
    previous_runs = db.scalar(
        select(func.count(CollectionJob.id)).where(CollectionJob.source_id == source.id)
    ) or 0
    options["run_index"] = int(previous_runs) + 1

    job = CollectionJob(
        source_id=source.id,
        status="queued",
        mode=mode,
        triggered_by=principal.user.id if principal.user else None,
        triggered_by_name=principal.label,
        options=options,
        message=f"Queued ({mode} mode, max {max_records} records).",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    write_audit(db, action="job.started", user=principal.user, request=request,
                entity_type="job", entity_id=job.id,
                detail={"source": source.name, "mode": mode, "max_records": max_records})
    job_manager.submit(job.id)
    return _job_payload(db, job, source)


@router.get("/failures/all")
def all_failures(db: DbSession, pagination: PaginationDep,
                 _=Depends(require_service_or("jobs:manage")), source_id: int | None = None):
    stmt = select(FailedRequest)
    count_stmt = select(func.count(FailedRequest.id))
    if source_id:
        stmt = stmt.where(FailedRequest.source_id == source_id)
        count_stmt = count_stmt.where(FailedRequest.source_id == source_id)
    total = int(db.scalar(count_stmt) or 0)
    rows = db.scalars(
        stmt.order_by(FailedRequest.id.desc()).offset(pagination.offset).limit(pagination.page_size)
    ).all()
    names = {source.id: source.name for source in db.scalars(select(DataSource)).all()}
    return {
        "items": [
            {"id": r.id, "job_id": r.job_id, "source_id": r.source_id,
             "source_name": names.get(r.source_id), "url": r.url, "error_type": r.error_type,
             "status_code": r.status_code, "message": r.message,
             "created_at": r.created_at.isoformat() if r.created_at else None}
            for r in rows
        ],
        "total": total, "page": pagination.page, "page_size": pagination.page_size,
    }


@router.get("/{job_id}")
def get_job(job_id: int, db: DbSession, _=Depends(require_service_or("jobs:manage"))):
    job = db.get(CollectionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    payload = _job_payload(db, job)
    events = db.scalars(
        select(JobEvent).where(JobEvent.job_id == job_id).order_by(JobEvent.id.desc()).limit(60)
    ).all()
    payload["events"] = [
        {"id": e.id, "level": e.level, "message": e.message,
         "created_at": e.created_at.isoformat() if e.created_at else None}
        for e in events
    ]
    payload["failures"] = [
        {
            "id": f.id,
            "url": f.url,
            "error_type": f.error_type,
            "status_code": f.status_code,
            "message": f.message,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in db.scalars(
            select(FailedRequest).where(FailedRequest.job_id == job_id).order_by(FailedRequest.id.desc())
        ).all()
    ]
    payload["records"] = [
        lead.to_dict()
        for lead in db.scalars(
            select(Lead).where(Lead.source_id == job.source_id, Lead.is_duplicate.is_(False))
            .order_by(Lead.id.desc()).limit(20)
        ).all()
    ]
    return payload


@router.post("/{job_id}/pause")
def pause_job(job_id: int, request: Request, db: DbSession,
              principal=Depends(require_service_or("jobs:manage"))):
    job = db.get(CollectionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in {"running", "queued"}:
        raise HTTPException(status_code=409, detail=f"Cannot pause a job that is {job.status}.")
    if not job_manager.pause(job_id):
        raise HTTPException(status_code=409, detail="This job is not running in the current process.")
    job.status = "paused"
    job.message = "Paused by operator."
    db.commit()
    db.add(JobEvent(job_id=job_id, level="warn", message="Collection paused by operator."))
    db.commit()
    write_audit(db, action="job.paused", user=principal.user, request=request,
                entity_type="job", entity_id=job_id)
    return _job_payload(db, job)


@router.post("/{job_id}/resume")
def resume_job(job_id: int, request: Request, db: DbSession,
              principal=Depends(require_service_or("jobs:manage"))):
    job = db.get(CollectionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "paused":
        raise HTTPException(status_code=409, detail="Only paused jobs can be resumed.")
    if not job_manager.resume(job_id):
        raise HTTPException(status_code=409, detail="This job is not running in the current process.")
    job.status = "running"
    job.message = "Resumed."
    db.commit()
    db.add(JobEvent(job_id=job_id, level="info", message="Collection resumed by operator."))
    db.commit()
    write_audit(db, action="job.resumed", user=principal.user, request=request,
                entity_type="job", entity_id=job_id)
    return _job_payload(db, job)


@router.post("/{job_id}/stop")
def stop_job(job_id: int, request: Request, db: DbSession,
              principal=Depends(require_service_or("jobs:manage"))):
    job = db.get(CollectionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in {"running", "paused", "queued"}:
        raise HTTPException(status_code=409, detail=f"Job is already {job.status}.")
    job_manager.stop(job_id)
    if job.status == "queued":
        job.status = "stopped"
        job.message = "Stopped before starting."
        job.finished_at = datetime.now(timezone.utc)
    else:
        job.status = "stopping"
        job.message = "Stopping after the current record…"
    db.commit()
    db.add(JobEvent(job_id=job_id, level="warn", message="Stop requested by operator."))
    db.commit()
    write_audit(db, action="job.stop.requested", user=principal.user, request=request,
                entity_type="job", entity_id=job_id)
    return _job_payload(db, job)


@router.get("/{job_id}/failures")
def job_failures(job_id: int, db: DbSession, _=Depends(require_service_or("jobs:manage"))):
    rows = db.scalars(
        select(FailedRequest).where(FailedRequest.job_id == job_id).order_by(FailedRequest.id.desc())
    ).all()
    return {"items": [
        {"id": r.id, "url": r.url, "error_type": r.error_type, "status_code": r.status_code,
         "message": r.message, "created_at": r.created_at.isoformat() if r.created_at else None}
        for r in rows
    ], "total": len(rows)}


@router.get("/{job_id}/records")
def job_records(job_id: int, db: DbSession, pagination: PaginationDep,
                _=Depends(require_service_or("jobs:manage"))):
    job = db.get(CollectionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    stmt = (select(Lead).where(Lead.source_id == job.source_id)
            .order_by(Lead.id.desc()).offset(pagination.offset).limit(pagination.page_size))
    total = db.scalar(select(func.count(Lead.id)).where(Lead.source_id == job.source_id)) or 0
    rows = db.scalars(stmt).all()
    return {"items": [lead.to_dict() for lead in rows], "total": int(total),
            "page": pagination.page, "page_size": pagination.page_size}

"""Reporting: collection, quality, compliance and source attribution."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import Response
from sqlalchemy import func, select

from ..deps import DbSession, UserDep
from ..models import CollectionJob, DataSource, Lead, LeadAudit
from ..security import require_permission
from ..services.analytics import dashboard, quality_report
from ..services.jobs import job_manager
from ..services.normalization import freshness_label
from ..services.suppression import stats as suppression_stats

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _csv_response(rows: list[list[str]], headers: list[str], filename: str) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return Response(
        content=buffer.getvalue().encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/summary")
def summary(db: DbSession, user: UserDep, days: int = 30):
    require_permission(user, "reports:read")
    dash = dashboard(db, days=days)
    quality = quality_report(db)
    job_rows = db.execute(
        select(CollectionJob.status, func.count(CollectionJob.id),
               func.coalesce(func.sum(CollectionJob.records_processed), 0),
               func.coalesce(func.sum(CollectionJob.duplicates_found), 0),
               func.coalesce(func.sum(CollectionJob.records_failed), 0),
               func.coalesce(func.sum(CollectionJob.duration_ms), 0))
        .group_by(CollectionJob.status)
    ).all()
    verification_rows = db.execute(
        select(Lead.phone_verification_status, Lead.email_verification_status, func.count(Lead.id))
        .where(Lead.is_duplicate.is_(False))
        .group_by(Lead.phone_verification_status, Lead.email_verification_status)
    ).all()
    freshness = {"fresh": 0, "aging": 0, "stale": 0, "expired": 0, "unknown": 0}
    for lead in db.scalars(select(Lead).where(Lead.is_duplicate.is_(False))).all():
        freshness[freshness_label(lead.collected_at)] = freshness.get(freshness_label(lead.collected_at), 0) + 1
    licensing_rows = db.execute(
        select(Lead.licensing_status, func.count(Lead.id)).where(Lead.is_duplicate.is_(False))
        .group_by(Lead.licensing_status)
    ).all()
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period_days": days,
        "quality": quality,
        "cards": dash["cards"],
        "daily_collection": dash["daily_collection"],
        "by_industry": dash["leads_by_industry"],
        "by_state": dash["leads_by_state"],
        "source_performance": dash["source_performance"],
        "agent_performance": dash["agent_performance"],
        "jobs": [
            {"status": row[0], "count": int(row[1]), "processed": int(row[2]),
             "duplicates": int(row[3]), "failed": int(row[4]), "duration_ms": int(row[5])}
            for row in job_rows
        ],
        "verification_matrix": [
            {"phone": row[0], "email": row[1], "count": int(row[2])} for row in verification_rows
        ],
        "freshness": freshness,
        "licensing": [{"status": row[0], "count": int(row[1])} for row in licensing_rows],
        "suppression": suppression_stats(db),
    }


@router.get("/collection.csv")
def collection_csv(db: DbSession, user: UserDep, days: int = 30):
    require_permission(user, "reports:read")
    payload = dashboard(db, days=days)
    rows = [[entry["date"], str(entry["collected"]), str(entry["duplicates"])]
            for entry in payload["daily_collection"]]
    return _csv_response(rows, ["date", "collected", "duplicates"],
                         f"collection-{datetime.now(timezone.utc):%Y%m%d}.csv")


@router.get("/sources.csv")
def sources_csv(db: DbSession, user: UserDep):
    require_permission(user, "reports:read")
    rows = []
    for source in db.scalars(select(DataSource).order_by(DataSource.name)).all():
        leads = db.scalar(select(func.count(Lead.id)).where(Lead.source_id == source.id)) or 0
        duplicates = db.scalar(select(func.count(Lead.id)).where(
            Lead.source_id == source.id, Lead.is_duplicate.is_(True))) or 0
        jobs = db.scalar(select(func.count(CollectionJob.id)).where(
            CollectionJob.source_id == source.id)) or 0
        rows.append([source.name, source.adapter, source.mode, "enabled" if source.is_enabled else "disabled",
                     source.url or "", str(leads), str(duplicates), str(jobs),
                     (source.last_run_at.isoformat() if source.last_run_at else ""),
                     source.attribution or "", source.licensing_status])
    return _csv_response(
        rows,
        ["source", "adapter", "mode", "status", "url", "leads", "duplicates", "jobs",
         "last_run_at", "attribution", "licensing_status"],
        f"source-performance-{datetime.now(timezone.utc):%Y%m%d}.csv",
    )


@router.get("/compliance.csv")
def compliance_csv(db: DbSession, user: UserDep):
    require_permission(user, "reports:read")
    rows = []
    for lead in db.scalars(select(Lead).where(Lead.is_duplicate.is_(False)).limit(20000)).all():
        rows.append([
            lead.lead_ref, lead.business_name, lead.city or "", lead.state or "",
            lead.consent_status, lead.phone_verification_status, lead.email_verification_status,
            lead.licensing_status, lead.lead_status, lead.source_name or "",
            lead.collected_at.strftime("%Y-%m-%d") if lead.collected_at else "",
            lead.last_verified_at.strftime("%Y-%m-%d") if lead.last_verified_at else "",
            freshness_label(lead.collected_at),
        ])
    return _csv_response(
        rows,
        ["record_id", "business_name", "city", "state", "consent_status", "phone_status",
         "email_status", "licensing_status", "lead_status", "source", "collected_at",
         "last_verified_at", "freshness"],
        f"compliance-{datetime.now(timezone.utc):%Y%m%d}.csv",
    )


@router.get("/audit.csv")
def audit_csv(db: DbSession, user: UserDep, limit: int = 5000):
    require_permission(user, "reports:read")
    rows = []
    for entry in db.scalars(
        select(LeadAudit).order_by(LeadAudit.id.desc()).limit(min(limit, 20000))
    ).all():
        rows.append([
            str(entry.id), str(entry.lead_id), entry.action, entry.field or "",
            (entry.old_value or "")[:120], (entry.new_value or "")[:120],
            (entry.note or "")[:240], entry.actor_name or "",
            entry.created_at.isoformat() if entry.created_at else "",
        ])
    return _csv_response(
        rows,
        ["id", "lead_id", "action", "field", "old_value", "new_value", "note", "actor", "created_at"],
        f"lead-audit-{datetime.now(timezone.utc):%Y%m%d}.csv",
    )


@router.get("/jobs.csv")
def jobs_csv(db: DbSession, user: UserDep):
    require_permission(user, "reports:read")
    rows = []
    for job, name in db.execute(
        select(CollectionJob, DataSource.name).join(DataSource, DataSource.id == CollectionJob.source_id)
        .order_by(CollectionJob.id.desc()).limit(5000)
    ).all():
        rows.append([
            str(job.id), name, job.status, job.mode, job.triggered_by_name or "",
            job.started_at.isoformat() if job.started_at else "",
            job.finished_at.isoformat() if job.finished_at else "",
            str(job.duration_ms), str(job.records_collected), str(job.records_processed),
            str(job.duplicates_found), str(job.records_failed), str(job.requests_made),
            (job.message or "")[:240],
        ])
    return _csv_response(
        rows,
        ["job_id", "source", "status", "mode", "triggered_by", "started_at", "finished_at",
         "duration_ms", "records_collected", "records_processed", "duplicates", "failed",
         "requests", "message"],
        f"collection-jobs-{datetime.now(timezone.utc):%Y%m%d}.csv",
    )

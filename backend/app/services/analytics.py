"""Dashboard & report aggregations."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from ..models import CollectionJob, DataSource, FailedRequest, Lead, SuppressionEntry, User

VERIFIED_PHONE = ("verified_owner",)
VERIFIED_EMAIL = ("verified_owner", "mx_valid")
INVALID_PHONE = ("invalid", "disconnected")
INVALID_EMAIL = ("invalid", "bounced")


def _base():
    """Lead scope: real leads only (duplicates are tracked separately)."""
    return Lead.is_duplicate.is_(False)


def dashboard(db: Session, days: int = 30) -> dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=days)

    def count(*conditions) -> int:
        stmt = select(func.count(Lead.id)).where(_base())
        for condition in conditions:
            stmt = stmt.where(condition)
        return int(db.scalar(stmt) or 0)

    verified = count(or_(Lead.phone_verification_status.in_(VERIFIED_PHONE),
                         Lead.email_verification_status.in_(VERIFIED_EMAIL)))
    invalid = count(or_(Lead.phone_verification_status.in_(INVALID_PHONE),
                        Lead.email_verification_status.in_(INVALID_EMAIL),
                        and_(Lead.phone_e164.is_(None), Lead.email.is_(None))))

    cards = {
        "total_leads": count(),
        "new_leads": count(Lead.lead_status == "new"),
        "verified_contacts": verified,
        "duplicates": int(db.scalar(select(func.count(Lead.id)).where(Lead.is_duplicate.is_(True))) or 0),
        "invalid_contacts": invalid,
        "assigned_leads": count(Lead.assigned_agent_id.is_not(None)),
        "do_not_contact": count(Lead.lead_status == "do_not_contact"),
        "in_progress": count(Lead.lead_status.in_(["assigned", "contacted", "interested", "follow_up"])),
        "sources_active": int(db.scalar(select(func.count(DataSource.id)).where(DataSource.is_enabled.is_(True))) or 0),
        "running_jobs": int(db.scalar(select(func.count(CollectionJob.id)).where(
            CollectionJob.status.in_(["queued", "running", "paused"]))) or 0),
        "collected_period": int(db.scalar(
            select(func.count(Lead.id)).where(_base(), Lead.collected_at >= since)) or 0),
        "suppressed": int(db.scalar(select(func.count(SuppressionEntry.id))) or 0),
    }

    # ---------------------------------------------------------- daily series
    rows = db.execute(
        select(Lead.collected_date, func.count(Lead.id),
               func.sum(case((Lead.is_duplicate.is_(True), 1), else_=0)))
        .where(Lead.collected_date >= (date.today() - timedelta(days=days)))
        .group_by(Lead.collected_date)
        .order_by(Lead.collected_date)
    ).all()
    by_day = {str(row[0]): {"collected": int(row[1] or 0), "duplicates": int(row[2] or 0)} for row in rows}
    daily = []
    for offset in range(days, -1, -1):
        day = (date.today() - timedelta(days=offset)).isoformat()
        entry = by_day.get(day, {"collected": 0, "duplicates": 0})
        daily.append({
            "date": day,
            "collected": max(0, entry["collected"] - entry["duplicates"]),
            "duplicates": entry["duplicates"],
        })

    # ------------------------------------------------------------- location
    location_rows = db.execute(
        select(Lead.state, Lead.city, func.count(Lead.id))
        .where(_base(), Lead.state.is_not(None))
        .group_by(Lead.state, Lead.city)
        .order_by(func.count(Lead.id).desc())
        .limit(8)
    ).all()
    by_location = [
        {"label": f"{city}, {state}" if city else state, "state": state, "city": city, "value": int(value)}
        for state, city, value in location_rows
    ]
    state_rows = db.execute(
        select(Lead.state, func.count(Lead.id)).where(_base(), Lead.state.is_not(None))
        .group_by(Lead.state).order_by(func.count(Lead.id).desc()).limit(10)
    ).all()
    by_state = [{"label": state, "value": int(value)} for state, value in state_rows]

    # ------------------------------------------------------------- industry
    industry_rows = db.execute(
        select(Lead.industry, func.count(Lead.id)).where(_base(), Lead.industry.is_not(None))
        .group_by(Lead.industry).order_by(func.count(Lead.id).desc()).limit(7)
    ).all()
    by_industry = [{"label": industry, "value": int(value)} for industry, value in industry_rows]
    other = db.scalar(
        select(func.count(Lead.id)).where(_base(), Lead.industry.is_not(None),
                                          ~Lead.industry.in_([r[0] for r in industry_rows]))
    ) or 0
    if other:
        by_industry.append({"label": "Other", "value": int(other)})

    # --------------------------------------------------- source performance
    source_rows = db.execute(
        select(
            DataSource.id, DataSource.name, DataSource.adapter, DataSource.is_enabled,
            func.count(Lead.id),
            func.sum(case((Lead.is_duplicate.is_(True), 1), else_=0)),
            func.sum(case((or_(Lead.phone_verification_status.in_(INVALID_PHONE),
                               Lead.email_verification_status.in_(INVALID_EMAIL)), 1), else_=0)),
        )
        .join(Lead, Lead.source_id == DataSource.id, isouter=True)
        .group_by(DataSource.id)
        .order_by(func.count(Lead.id).desc())
        .limit(10)
    ).all()
    source_performance = [
        {
            "source_id": row[0],
            "label": row[1],
            "adapter": row[2],
            "is_enabled": bool(row[3]),
            "value": int(row[4] or 0),
            "duplicates": int(row[5] or 0),
            "invalid": int(row[6] or 0),
        }
        for row in source_rows
    ]

    # ------------------------------------------------------ agent performance
    agent_rows = db.execute(
        select(
            User.id, User.full_name,
            func.count(Lead.id),
            func.sum(case((Lead.lead_status.in_(["contacted", "follow_up", "interested", "converted"]), 1), else_=0)),
            func.sum(case((Lead.lead_status == "interested", 1), else_=0)),
            func.sum(case((Lead.lead_status == "converted", 1), else_=0)),
        )
        .join(Lead, Lead.assigned_agent_id == User.id, isouter=True)
        .where(User.role.in_(["agent", "manager", "admin"]), User.is_active.is_(True))
        .group_by(User.id)
        .order_by(func.count(Lead.id).desc())
        .limit(10)
    ).all()
    agent_performance = [
        {
            "agent_id": row[0],
            "label": row[1],
            "assigned": int(row[2] or 0),
            "contacted": int(row[3] or 0),
            "interested": int(row[4] or 0),
            "converted": int(row[5] or 0),
        }
        for row in agent_rows
    ]

    # ---------------------------------------------------------- distributions
    status_rows = db.execute(
        select(Lead.lead_status, func.count(Lead.id)).where(_base()).group_by(Lead.lead_status)
    ).all()
    by_status = {status: int(count_) for status, count_ in status_rows}

    consent_rows = db.execute(
        select(Lead.consent_status, func.count(Lead.id)).where(_base()).group_by(Lead.consent_status)
    ).all()
    by_consent = {consent: int(count_) for consent, count_ in consent_rows}

    phone_rows = db.execute(
        select(Lead.phone_verification_status, func.count(Lead.id)).where(_base())
        .group_by(Lead.phone_verification_status)
    ).all()
    by_phone_status = {status: int(count_) for status, count_ in phone_rows}

    # ----------------------------------------------------------- recent feed
    recent_jobs_rows = db.execute(
        select(CollectionJob, DataSource.name)
        .join(DataSource, DataSource.id == CollectionJob.source_id)
        .order_by(CollectionJob.id.desc()).limit(6)
    ).all()
    recent_jobs = [job.to_dict(source_name=name) for job, name in recent_jobs_rows]

    recent_leads = db.scalars(
        select(Lead).where(_base()).order_by(Lead.id.desc()).limit(6)
    ).all()

    failed_recent = int(db.scalar(
        select(func.count(FailedRequest.id)).where(
            FailedRequest.created_at >= datetime.now(timezone.utc) - timedelta(days=7)
        )) or 0)

    return {
        "period_days": days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cards": cards,
        "daily_collection": daily,
        "leads_by_location": by_location,
        "leads_by_state": by_state,
        "leads_by_industry": by_industry,
        "source_performance": source_performance,
        "agent_performance": agent_performance,
        "by_status": by_status,
        "by_consent": by_consent,
        "by_phone_status": by_phone_status,
        "recent_jobs": recent_jobs,
        "recent_leads": [lead.to_dict() for lead in recent_leads],
        "failed_requests_7d": failed_recent,
    }


def quality_report(db: Session) -> dict[str, Any]:
    total = int(db.scalar(select(func.count(Lead.id)).where(_base())) or 0)
    duplicates = int(db.scalar(select(func.count(Lead.id)).where(Lead.is_duplicate.is_(True))) or 0)
    missing_phone = int(db.scalar(select(func.count(Lead.id)).where(_base(), Lead.phone_e164.is_(None))) or 0)
    missing_email = int(db.scalar(select(func.count(Lead.id)).where(_base(), Lead.email.is_(None))) or 0)
    missing_address = int(db.scalar(select(func.count(Lead.id)).where(_base(), Lead.address_line1.is_(None))) or 0)
    verified_phone = int(db.scalar(select(func.count(Lead.id)).where(_base(), Lead.phone_verification_status == "verified_owner")) or 0)
    verified_email = int(db.scalar(select(func.count(Lead.id)).where(_base(), Lead.email_verification_status.in_(VERIFIED_EMAIL))) or 0)
    suppressed = int(db.scalar(select(func.count(SuppressionEntry.id))) or 0)
    dnc = int(db.scalar(select(func.count(Lead.id)).where(_base(), Lead.lead_status == "do_not_contact")) or 0)

    source_rows = db.execute(
        select(DataSource.name, func.count(Lead.id),
               func.min(Lead.collected_at), func.max(Lead.collected_at))
        .join(Lead, Lead.source_id == DataSource.id, isouter=True)
        .group_by(DataSource.id).order_by(func.count(Lead.id).desc())
    ).all()
    attribution = [
        {
            "source": row[0],
            "records": int(row[1] or 0),
            "first_seen": row[2].isoformat() if row[2] else None,
            "last_seen": row[3].isoformat() if row[3] else None,
        }
        for row in source_rows
    ]

    return {
        "total_leads": total,
        "duplicates": duplicates,
        "duplicate_rate": round(duplicates / (total + duplicates) * 100, 1) if total + duplicates else 0,
        "missing_phone": missing_phone,
        "missing_email": missing_email,
        "missing_address": missing_address,
        "verified_phone": verified_phone,
        "verified_email": verified_email,
        "dnc": dnc,
        "suppressed": suppressed,
        "attribution": attribution,
    }

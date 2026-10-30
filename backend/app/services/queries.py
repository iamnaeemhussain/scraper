"""Lead query building shared by the API, exports and reports."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import Select, and_, func, or_, select

from ..models import Lead

SORTABLE = {
    "created_at": Lead.created_at,
    "collected_at": Lead.collected_at,
    "business_name": Lead.business_name,
    "city": Lead.city,
    "state": Lead.state,
    "quality_score": Lead.quality_score,
    "lead_status": Lead.lead_status,
    "last_verified_at": Lead.last_verified_at,
}

FRESHNESS_WINDOWS = {"fresh": 30, "aging": 90, "stale": 180, "expired": 100000}


def apply_filters(stmt: Select, filters: dict[str, Any]) -> Select:
    if not filters.get("include_duplicates"):
        stmt = stmt.where(Lead.is_duplicate.is_(False))
    if filters.get("only_duplicates"):
        stmt = stmt.where(Lead.is_duplicate.is_(True))

    q = (filters.get("q") or "").strip()
    if q:
        like = f"%{q.lower()}%"
        digits = "".join(ch for ch in q if ch.isdigit())
        conditions = [
            func.lower(Lead.business_name).like(like),
            func.lower(Lead.email).like(like),
            func.lower(Lead.city).like(like),
            func.lower(Lead.industry).like(like),
            Lead.zip_code.like(f"%{q}%"),
            Lead.lead_ref.like(f"%{q.upper()}%"),
        ]
        if digits:
            conditions.append(Lead.phone_e164.like(f"%{digits}%"))
        stmt = stmt.where(or_(*conditions))

    if filters.get("business_name"):
        stmt = stmt.where(func.lower(Lead.business_name).like(f"%{filters['business_name'].lower()}%"))
    if filters.get("phone"):
        digits = "".join(ch for ch in str(filters["phone"]) if ch.isdigit())
        if digits:
            stmt = stmt.where(Lead.phone_e164.like(f"%{digits}%"))
    if filters.get("city"):
        stmt = stmt.where(func.lower(Lead.city) == str(filters["city"]).lower())
    if filters.get("state"):
        stmt = stmt.where(Lead.state == str(filters["state"]).upper())
    if filters.get("zip"):
        stmt = stmt.where(Lead.zip_code.like(f"{str(filters['zip'])[:5]}%"))
    if filters.get("industry"):
        stmt = stmt.where(Lead.industry == filters["industry"])
    if filters.get("source_id"):
        stmt = stmt.where(Lead.source_id == int(filters["source_id"]))
    if filters.get("assigned_agent_id") == "unassigned":
        stmt = stmt.where(Lead.assigned_agent_id.is_(None))
    elif filters.get("assigned_agent_id"):
        stmt = stmt.where(Lead.assigned_agent_id == int(filters["assigned_agent_id"]))

    statuses = filters.get("lead_status")
    if isinstance(statuses, str):
        statuses = [s for s in statuses.split(",") if s]
    if statuses:
        stmt = stmt.where(Lead.lead_status.in_(statuses))

    consents = filters.get("consent_status")
    if isinstance(consents, str):
        consents = [c for c in consents.split(",") if c]
    if consents:
        stmt = stmt.where(Lead.consent_status.in_(consents))

    phone_status = filters.get("phone_status")
    if isinstance(phone_status, str):
        phone_status = [s for s in phone_status.split(",") if s]
    if phone_status:
        stmt = stmt.where(Lead.phone_verification_status.in_(phone_status))

    email_status = filters.get("email_status")
    if isinstance(email_status, str):
        email_status = [s for s in email_status.split(",") if s]
    if email_status:
        stmt = stmt.where(Lead.email_verification_status.in_(email_status))

    verification = filters.get("verification")
    if verification == "verified":
        stmt = stmt.where(or_(Lead.phone_verification_status == "verified_owner",
                              Lead.email_verification_status.in_(["verified_owner", "mx_valid"])))
    elif verification == "invalid":
        stmt = stmt.where(or_(Lead.phone_verification_status.in_(["invalid", "disconnected"]),
                              Lead.email_verification_status.in_(["invalid", "bounced"]),
                              and_(Lead.phone_e164.is_(None), Lead.email.is_(None))))

    freshness = filters.get("freshness")
    if freshness in FRESHNESS_WINDOWS:
        cutoff = datetime.now(timezone.utc) - timedelta(days=FRESHNESS_WINDOWS[freshness])
        if freshness == "expired":
            stmt = stmt.where(Lead.collected_at < datetime.now(timezone.utc) - timedelta(days=180))
        else:
            stmt = stmt.where(Lead.collected_at >= cutoff)

    if filters.get("min_quality"):
        stmt = stmt.where(Lead.quality_score >= int(filters["min_quality"]))

    if filters.get("created_after"):
        stmt = stmt.where(Lead.collected_at >= filters["created_after"])

    return stmt


def sorted_leads(stmt: Select, sort: str | None, direction: str | None = "desc") -> Select:
    column = SORTABLE.get(sort or "created_at", Lead.created_at)
    return stmt.order_by(column.desc() if (direction or "desc").lower() != "asc" else column.asc())

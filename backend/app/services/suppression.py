"""Suppression list handling — checked on ingest, on assignment and before any export."""
from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import SuppressionEntry
from .normalization import name_key, normalize_email, normalize_phone


def normalize_suppression_value(kind: str, value: str) -> str:
    if kind == "email":
        parsed = normalize_email(value)
        return parsed["email"] or value.strip().lower()
    if kind == "phone":
        parsed = normalize_phone(value)
        return parsed["e164"] or "".join(ch for ch in value if ch.isdigit())
    if kind == "domain":
        return value.strip().lower().removeprefix("https://").removeprefix("http://").split("/")[0]
    return name_key(value)


def suppression_reason(
    db: Session,
    *,
    email: str | None = None,
    phone: str | None = None,
    business_name: str | None = None,
    website: str | None = None,
) -> str | None:
    """Return a human readable reason when the contact is suppressed."""
    checks: list[tuple[str, str | None]] = [
        ("email", normalize_suppression_value("email", email) if email else None),
        ("phone", normalize_suppression_value("phone", phone) if phone else None),
        ("business_name", normalize_suppression_value("business_name", business_name) if business_name else None),
        ("domain", normalize_suppression_value("domain", website) if website else None),
    ]
    for kind, value in checks:
        if not value:
            continue
        entry = db.scalar(
            select(SuppressionEntry).where(
                SuppressionEntry.kind == kind,
                func.lower(SuppressionEntry.value) == value.lower(),
            )
        )
        if entry:
            return f"Suppressed {kind}: {entry.reason or 'on the do-not-contact list'}"
    return None


def add_entry(db: Session, *, kind: str, value: str, reason: str | None, user_id: int | None) -> SuppressionEntry:
    normalized = normalize_suppression_value(kind, value)
    existing = db.scalar(select(SuppressionEntry).where(SuppressionEntry.kind == kind,
                                                        SuppressionEntry.value == normalized))
    if existing:
        existing.reason = reason or existing.reason
        return existing
    entry = SuppressionEntry(kind=kind, value=normalized, reason=reason, created_by=user_id)
    db.add(entry)
    return entry


def stats(db: Session) -> dict[str, Any]:
    rows = db.execute(
        select(SuppressionEntry.kind, func.count(SuppressionEntry.id)).group_by(SuppressionEntry.kind)
    ).all()
    counts = {kind: int(count) for kind, count in rows}
    return {"total": sum(counts.values()), "by_kind": counts}

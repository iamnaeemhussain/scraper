"""Ingest pipeline: validate → normalise → de-duplicate → persist → audit.

This is the only path that writes leads, whether the record came from an adapter,
an upload or the public form webhook. That guarantees consistent validation,
attribution and audit history.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import DataSource, Lead, LeadAudit, User
from .normalization import (
    dedupe_key,
    derive_email_status,
    derive_phone_status,
    missing_fields,
    normalize_address_line,
    normalize_business_name,
    normalize_city,
    normalize_country,
    normalize_email,
    normalize_person_name,
    normalize_phone,
    normalize_state,
    normalize_website,
    normalize_zip,
    quality_score,
)
from .suppression import suppression_reason

PROVIDER_VERIFIED_STATUSES = {"verified", "verified_owner", "owner_verified", "confirmed"}
PROVIDER_INVALID_STATUSES = {"invalid", "disconnected", "not_in_service", "rejected", "bounced"}
ALLOWED_CONSENT = {"granted", "pending", "unknown", "denied", "withdrawn"}


@dataclass
class IngestResult:
    status: str  # created | duplicate | invalid
    lead: Lead | None = None
    errors: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)


def _clean(value: object) -> str:
    return str(value).strip() if value is not None else ""


def build_lead_fields(
    raw: dict,
    *,
    source: DataSource | None,
    consent_override: str | None = None,
    provider_phone_status: str | None = None,
    provider_email_status: str | None = None,
) -> tuple[dict, list[str]]:
    """Validate + normalise a raw record. Returns (fields, errors)."""
    errors: list[str] = []

    business_name = normalize_business_name(raw.get("business_name"))
    if not business_name:
        errors.append("Missing business name")

    phone_info = normalize_phone(raw.get("phone"))
    email_info = normalize_email(raw.get("email"))

    if not phone_info["e164"] and not email_info["valid"]:
        errors.append("No usable business phone or e-mail")

    state = normalize_state(raw.get("state"))
    zip_code = normalize_zip(raw.get("zip_code"))
    city = normalize_city(raw.get("city"))
    country = normalize_country(raw.get("country")) or "US"

    if _clean(raw.get("state")) and not state:
        errors.append("Unrecognised state/region")
    if _clean(raw.get("zip_code")) and not zip_code:
        errors.append("Unrecognised ZIP/postal code")

    consent = (consent_override or _clean(raw.get("consent_status")) or
               (source.consent_default if source else "unknown")).lower()
    if consent not in ALLOWED_CONSENT:
        consent = "unknown"

    evidence_phone = None
    if provider_phone_status:
        lowered = provider_phone_status.lower()
        if lowered in PROVIDER_VERIFIED_STATUSES:
            evidence_phone = "owner_confirmed"
        elif lowered in PROVIDER_INVALID_STATUSES:
            evidence_phone = "provider_invalid"
    evidence_email = None
    if provider_email_status:
        lowered = provider_email_status.lower()
        if lowered in PROVIDER_VERIFIED_STATUSES:
            evidence_email = "owner_confirmed"
        elif lowered in PROVIDER_INVALID_STATUSES:
            evidence_email = "bounced"

    fields = {
        "business_name": business_name,
        "contact_name": normalize_person_name(raw.get("contact_name")),
        "contact_title": _clean(raw.get("contact_title")) or None,
        "phone": phone_info["display"] or _clean(raw.get("phone")) or None,
        "phone_e164": phone_info["e164"],
        "phone_extension": phone_info["extension"],
        "email": email_info["email"],
        "address_line1": normalize_address_line(raw.get("address_line1")),
        "address_line2": _clean(raw.get("address_line2")) or None,
        "city": city,
        "state": state,
        "zip_code": zip_code,
        "country": country,
        "industry": _clean(raw.get("industry")) or None,
        "website": normalize_website(raw.get("website")),
        "source_url": _clean(raw.get("source_url")) or None,
        "consent_status": consent,
        # A phone number seen on a website is NEVER "verified": at most format-checked.
        "phone_verification_status": derive_phone_status(
            phone_info["e164"], phone_info["valid"], evidence_phone,
            provided=bool(_clean(raw.get("phone"))),
        ),
        "email_verification_status": derive_email_status(
            email_info["email"], email_info["valid"], evidence_email,
            provided=bool(_clean(raw.get("email"))),
        ),
        "licensing_status": source.licensing_status if source else "unconfirmed",
        "source_id": source.id if source else None,
        "source_name": source.name if source else None,
        "source_attribution": (source.attribution or source.name) if source else "Unknown source",
        "last_verified_at": datetime.now(timezone.utc) if evidence_phone or evidence_email else None,
        "consent_source": (
            _clean(raw.get("consent_source")) or (source.attribution if source else None)
            if consent != "unknown"
            else None
        ),
        # Only imports supply notes; scraped records start with none.
        "notes": _clean(raw.get("notes")) or None,
    }
    return fields, errors


def find_existing_lead(db: Session, key: str, phone_e164: str | None, email: str | None,
                       business_name: str | None, zip_code: str | None) -> Lead | None:
    conditions = [Lead.dedupe_key == key]
    if phone_e164:
        conditions.append(Lead.phone_e164 == phone_e164)
    if email:
        conditions.append(Lead.email == email)
    stmt = select(Lead).where(Lead.is_duplicate.is_(False), or_(*conditions)).limit(1)
    existing = db.scalar(stmt)
    if existing:
        return existing
    if business_name and zip_code:
        # Fuzzy safety net: same name key in the same ZIP.
        candidates = db.scalars(
            select(Lead).where(
                Lead.is_duplicate.is_(False),
                Lead.zip_code == zip_code,
                Lead.business_name.ilike(f"{business_name.split()[0]}%"),
            ).limit(10)
        ).all()
        from .normalization import name_key

        for candidate in candidates:
            if name_key(candidate.business_name) == name_key(business_name):
                return candidate
    return None


MERGEABLE_FIELDS = (
    "contact_name", "contact_title", "email", "phone", "phone_e164", "address_line1",
    "city", "state", "zip_code", "industry", "website", "source_url",
)


def ingest_record(
    db: Session,
    raw: dict,
    *,
    source: DataSource | None = None,
    user: User | None = None,
    actor_label: str | None = None,
    import_batch_id: int | None = None,
    collected_at: datetime | None = None,
    consent_override: str | None = None,
    merge_missing: bool = True,
    commit: bool = True,
) -> IngestResult:
    provider_phone_status = raw.pop("_provider_phone_status", None)
    provider_email_status = raw.pop("_provider_email_status", None)

    fields, errors = build_lead_fields(
        raw,
        source=source,
        consent_override=consent_override,
        provider_phone_status=provider_phone_status,
        provider_email_status=provider_email_status,
    )
    if errors:
        return IngestResult(status="invalid", errors=errors)

    key = dedupe_key(fields["business_name"], fields["phone_e164"], fields["email"], fields["zip_code"])
    fields["dedupe_key"] = key
    collected_at = collected_at or datetime.now(timezone.utc)
    fields["collected_at"] = collected_at
    fields["collected_date"] = collected_at.date() if isinstance(collected_at, datetime) else date.today()

    suppressed = suppression_reason(
        db,
        email=fields.get("email"),
        phone=fields.get("phone_e164") or fields.get("phone"),
        business_name=fields.get("business_name"),
        website=fields.get("website"),
    )
    if suppressed:
        fields["lead_status"] = "do_not_contact"
        fields["consent_status"] = "denied"
        fields["notes"] = f"Auto-flagged at ingest: {suppressed}"

    existing = find_existing_lead(db, key, fields["phone_e164"], fields["email"],
                                  fields["business_name"], fields["zip_code"])
    actor = actor_label or (user.full_name if user else (source.name if source else "system"))

    if existing:
        duplicate = Lead(
            business_name=fields["business_name"],
            lead_ref="PENDING",
            is_duplicate=True,
            duplicate_of_id=existing.id,
            assigned_agent_id=None,
            lead_status="new",
            quality_score=quality_score(fields),
            collected_at=collected_at,
            collected_date=fields["collected_date"],
            source_id=fields["source_id"],
            source_name=fields["source_name"],
            source_url=fields["source_url"],
            source_attribution=fields["source_attribution"],
            import_batch_id=import_batch_id,
            **{k: fields.get(k) for k in (
                "contact_name", "contact_title", "phone", "phone_e164", "phone_extension", "email",
                "address_line1", "address_line2", "city", "state", "zip_code", "country", "industry",
                "website", "phone_verification_status", "email_verification_status", "licensing_status",
                "consent_status", "dedupe_key",
            )},
        )
        db.add(duplicate)
        db.flush()
        duplicate.lead_ref = f"LD-{duplicate.id:06d}"

        merged: list[str] = []
        if merge_missing:
            for name in MERGEABLE_FIELDS:
                if not getattr(existing, name) and fields.get(name):
                    setattr(existing, name, fields[name])
                    merged.append(name)
        if merged:
            existing.updated_at = datetime.now(timezone.utc)
            existing.quality_score = quality_score(existing.to_dict())
        db.add(
            LeadAudit(
                lead_id=existing.id,
                user_id=user.id if user else None,
                actor_name=actor,
                action="duplicate_seen" if not merged else "duplicate_merged",
                note=(
                    f"Duplicate record {duplicate.lead_ref} seen from {fields['source_attribution']}. "
                    + (f"Filled missing fields: {', '.join(merged)}." if merged else "No new information.")
                ),
            )
        )
        if commit:
            db.commit()
        return IngestResult(status="duplicate", lead=duplicate, reasons=["Duplicate of existing lead"])

    lead = Lead(
        lead_ref="PENDING",
        lead_status=fields.pop("lead_status", "new"),
        quality_score=quality_score(fields),
        import_batch_id=import_batch_id,
        **fields,
    )
    db.add(lead)
    db.flush()
    lead.lead_ref = f"LD-{lead.id:06d}"

    missing = missing_fields(fields)
    db.add(
        LeadAudit(
            lead_id=lead.id,
            user_id=user.id if user else None,
            actor_name=actor,
            action="collected",
            note=(
                f"Collected from {fields['source_attribution']}."
                + (f" Missing fields: {', '.join(missing)}." if missing else "")
                + (" Auto-suppressed at ingest." if suppressed else "")
            ),
        )
    )
    if commit:
        db.commit()
    return IngestResult(status="created", lead=lead)


def delete_lead(db: Session, lead: Lead, *, user: User, reason: str | None = None) -> None:
    db.add(
        LeadAudit(
            lead_id=lead.id,
            user_id=user.id,
            actor_name=user.full_name,
            action="deleted",
            note=reason or "Record deleted and contact suppressed.",
        )
    )
    db.delete(lead)
    db.commit()

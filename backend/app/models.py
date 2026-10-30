"""SQLAlchemy models for the LeadBridge lead collection platform."""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(value: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; normalise them to UTC-aware for comparisons."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class JSONDict(TypeDecorator):
    """Portable JSON column (TEXT on SQLite, JSON/JSONB on PostgreSQL)."""

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):  # pragma: no cover - dialect hook
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import JSONB

            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return None


# --------------------------------------------------------------------------- #
# Enumerations (kept as plain strings for portability & easy migration)
# --------------------------------------------------------------------------- #
ROLES = ("admin", "manager", "agent")
LEAD_STATUSES = (
    "new",
    "assigned",
    "contacted",
    "interested",
    "not_interested",
    "follow_up",
    "converted",
    "do_not_contact",
)
CONSENT_STATUSES = ("granted", "pending", "unknown", "denied", "withdrawn")
PHONE_STATUSES = ("unverified", "format_valid", "verified_owner", "invalid", "disconnected")
EMAIL_STATUSES = ("unverified", "syntax_valid", "mx_valid", "verified_owner", "invalid", "bounced")
LICENSING_STATUSES = ("licensed", "public_website", "user_provided", "unconfirmed")
JOB_STATUSES = ("queued", "running", "paused", "stopping", "stopped", "completed", "failed")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(20), default="agent", index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    team: Mapped[str | None] = mapped_column(String(80), nullable=True)
    daily_quota: Mapped[int] = mapped_column(Integer, default=60)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "is_active": self.is_active,
            "phone": self.phone,
            "team": self.team,
            "daily_quota": self.daily_quota,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class DataSource(Base):
    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    adapter: Mapped[str] = mapped_column(String(60), index=True)
    url: Mapped[str] = mapped_column(String(500), default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mode: Mapped[str] = mapped_column(String(20), default="demo")  # demo | live
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    config: Mapped[dict | None] = mapped_column(JSONDict, default=dict)
    allowed_fields: Mapped[list | None] = mapped_column(JSONDict, default=list)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=20)
    min_delay_seconds: Mapped[float] = mapped_column(Float, default=1.5)
    max_records_per_run: Mapped[int] = mapped_column(Integer, default=250)
    max_requests_per_run: Mapped[int] = mapped_column(Integer, default=25)
    attribution: Mapped[str] = mapped_column(String(300), default="")
    licensing_status: Mapped[str] = mapped_column(String(40), default="unconfirmed")
    consent_default: Mapped[str] = mapped_column(String(20), default="unknown")
    credential_env: Mapped[str | None] = mapped_column(String(120), nullable=True)
    compliance_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    jobs: Mapped[list["CollectionJob"]] = relationship(back_populates="source")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "adapter": self.adapter,
            "url": self.url,
            "description": self.description,
            "mode": self.mode,
            "is_enabled": self.is_enabled,
            "config": self.config or {},
            "allowed_fields": self.allowed_fields or [],
            "rate_limit_per_minute": self.rate_limit_per_minute,
            "min_delay_seconds": self.min_delay_seconds,
            "max_records_per_run": self.max_records_per_run,
            "max_requests_per_run": self.max_requests_per_run,
            "attribution": self.attribution,
            "licensing_status": self.licensing_status,
            "consent_default": self.consent_default,
            "credential_env": self.credential_env,
            "compliance_notes": self.compliance_notes,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CollectionJob(Base):
    __tablename__ = "collection_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    mode: Mapped[str] = mapped_column(String(20), default="demo")
    triggered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    triggered_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    start_requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    records_collected: Mapped[int] = mapped_column(Integer, default=0)
    records_processed: Mapped[int] = mapped_column(Integer, default=0)
    records_failed: Mapped[int] = mapped_column(Integer, default=0)
    duplicates_found: Mapped[int] = mapped_column(Integer, default=0)
    invalid_found: Mapped[int] = mapped_column(Integer, default=0)
    requests_made: Mapped[int] = mapped_column(Integer, default=0)
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[dict | None] = mapped_column(JSONDict, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    source: Mapped[DataSource] = relationship(back_populates="jobs")

    def to_dict(self, source_name: str | None = None) -> dict[str, Any]:
        return {
            "id": self.id,
            "source_id": self.source_id,
            "source_name": source_name,
            "status": self.status,
            "mode": self.mode,
            "triggered_by_name": self.triggered_by_name,
            "start_requested_at": self.start_requested_at.isoformat() if self.start_requested_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "duration_ms": self.duration_ms,
            "records_collected": self.records_collected,
            "records_processed": self.records_processed,
            "records_failed": self.records_failed,
            "duplicates_found": self.duplicates_found,
            "invalid_found": self.invalid_found,
            "requests_made": self.requests_made,
            "progress_percent": self.progress_percent,
            "message": self.message,
        }


class JobEvent(Base):
    __tablename__ = "job_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("collection_jobs.id"), index=True)
    level: Mapped[str] = mapped_column(String(20), default="info")
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FailedRequest(Base):
    __tablename__ = "failed_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("collection_jobs.id"), nullable=True, index=True)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("data_sources.id"), nullable=True, index=True)
    url: Mapped[str | None] = mapped_column(String(600), nullable=True)
    error_type: Mapped[str] = mapped_column(String(60), default="fetch_error")
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_ref: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    business_name: Mapped[str] = mapped_column(String(240), index=True)
    contact_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    contact_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    phone_e164: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    phone_extension: Mapped[str | None] = mapped_column(String(10), nullable=True)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True, index=True)
    address_line1: Mapped[str | None] = mapped_column(String(240), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(160), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    state: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    zip_code: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True, default="US")
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    website: Mapped[str | None] = mapped_column(String(400), nullable=True)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("data_sources.id"), nullable=True, index=True)
    source_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(600), nullable=True)
    source_attribution: Mapped[str | None] = mapped_column(String(400), nullable=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    collected_date: Mapped[date] = mapped_column(Date, default=lambda: utcnow().date(), index=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    phone_verification_status: Mapped[str] = mapped_column(String(30), default="unverified", index=True)
    email_verification_status: Mapped[str] = mapped_column(String(30), default="unverified", index=True)
    licensing_status: Mapped[str] = mapped_column(String(30), default="unconfirmed")
    consent_status: Mapped[str] = mapped_column(String(20), default="unknown", index=True)
    consent_source: Mapped[str | None] = mapped_column(String(200), nullable=True)
    assigned_agent_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    lead_status: Mapped[str] = mapped_column(String(30), default="new", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    dedupe_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    duplicate_of_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    import_batch_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_score: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    assigned_agent: Mapped[User | None] = relationship(foreign_keys=[assigned_agent_id])

    __table_args__ = (
        Index("ix_leads_phone_email", "phone_e164", "email"),
        Index("ix_leads_name_city", "business_name", "city"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "lead_ref": self.lead_ref,
            "business_name": self.business_name,
            "contact_name": self.contact_name,
            "contact_title": self.contact_title,
            "phone": self.phone,
            "phone_e164": self.phone_e164,
            "phone_extension": self.phone_extension,
            "email": self.email,
            "address_line1": self.address_line1,
            "address_line2": self.address_line2,
            "city": self.city,
            "state": self.state,
            "zip_code": self.zip_code,
            "country": self.country,
            "industry": self.industry,
            "website": self.website,
            "source_id": self.source_id,
            "source_name": self.source_name,
            "source_url": self.source_url,
            "source_attribution": self.source_attribution,
            "collected_at": self.collected_at.isoformat() if self.collected_at else None,
            "last_verified_at": self.last_verified_at.isoformat() if self.last_verified_at else None,
            "phone_verification_status": self.phone_verification_status,
            "email_verification_status": self.email_verification_status,
            "licensing_status": self.licensing_status,
            "consent_status": self.consent_status,
            "consent_source": self.consent_source,
            "assigned_agent_id": self.assigned_agent_id,
            "assigned_agent_name": self.assigned_agent.full_name if self.assigned_agent else None,
            "lead_status": self.lead_status,
            "notes": self.notes,
            "is_duplicate": self.is_duplicate,
            "duplicate_of_id": self.duplicate_of_id,
            "quality_score": self.quality_score,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class LeadAudit(Base):
    """Record-level audit history: every field change is attributable to a user/job."""

    __tablename__ = "lead_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    action: Mapped[str] = mapped_column(String(50), index=True)
    field: Mapped[str | None] = mapped_column(String(60), nullable=True)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "lead_id": self.lead_id,
            "user_id": self.user_id,
            "actor_name": self.actor_name,
            "action": self.action,
            "field": self.field,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "note": self.note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SuppressionEntry(Base):
    __tablename__ = "suppression_list"
    __table_args__ = (UniqueConstraint("kind", "value", name="uq_suppression_kind_value"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)  # email | phone | domain | business_name
    value: Mapped[str] = mapped_column(String(254), index=True)
    reason: Mapped[str | None] = mapped_column(String(240), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "value": self.value,
            "reason": self.reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSONDict, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "actor_email": self.actor_email,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "detail": self.detail or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(300))
    source_id: Mapped[int | None] = mapped_column(ForeignKey("data_sources.id"), nullable=True)
    rows_total: Mapped[int] = mapped_column(Integer, default=0)
    imported: Mapped[int] = mapped_column(Integer, default=0)
    duplicates: Mapped[int] = mapped_column(Integer, default=0)
    invalid: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    mapping: Mapped[dict | None] = mapped_column(JSONDict, default=dict)
    attestation: Mapped[str | None] = mapped_column(String(240), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "filename": self.filename,
            "source_id": self.source_id,
            "rows_total": self.rows_total,
            "imported": self.imported,
            "duplicates": self.duplicates,
            "invalid": self.invalid,
            "status": self.status,
            "mapping": self.mapping or {},
            "attestation": self.attestation,
            "created_by_name": self.created_by_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ImportRowError(Base):
    __tablename__ = "import_row_errors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True)
    row_number: Mapped[int] = mapped_column(Integer)
    message: Mapped[str] = mapped_column(String(400))
    raw: Mapped[dict | None] = mapped_column(JSONDict, default=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "row_number": self.row_number,
            "message": self.message,
            "raw": self.raw or {},
        }


class ExportJob(Base):
    __tablename__ = "export_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    format: Mapped[str] = mapped_column(String(10), default="csv")
    filters: Mapped[dict | None] = mapped_column(JSONDict, default=dict)
    rows: Mapped[int] = mapped_column(Integer, default=0)
    blocked: Mapped[int] = mapped_column(Integer, default=0)
    file_name: Mapped[str] = mapped_column(String(300), default="leads.csv")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "format": self.format,
            "filters": self.filters or {},
            "rows": self.rows,
            "blocked": self.blocked,
            "file_name": self.file_name,
            "created_by_name": self.created_by_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    prefix: Mapped[str] = mapped_column(String(16), index=True)
    hashed_key: Mapped[str] = mapped_column(String(255))
    scopes: Mapped[list | None] = mapped_column(JSONDict, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "prefix": self.prefix,
            "scopes": self.scopes or [],
            "is_active": self.is_active,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict | None] = mapped_column(JSONDict, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

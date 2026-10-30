"""Pydantic request/response models."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

ROLE = Literal["admin", "manager", "agent"]
LEAD_STATUS = Literal[
    "new", "assigned", "contacted", "interested", "not_interested", "follow_up",
    "converted", "do_not_contact",
]
CONSENT = Literal["granted", "pending", "unknown", "denied", "withdrawn"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=200)


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=10, max_length=200)
    role: ROLE = "agent"
    team: str | None = None
    phone: str | None = None
    daily_quota: int = Field(default=60, ge=0, le=1000)


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: ROLE | None = None
    is_active: bool | None = None
    team: str | None = None
    phone: str | None = None
    daily_quota: int | None = Field(default=None, ge=0, le=1000)
    password: str | None = Field(default=None, min_length=10, max_length=200)


class SourceBase(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    adapter: str
    url: str = ""
    description: str | None = None
    mode: Literal["demo", "live"] = "demo"
    is_enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)
    allowed_fields: list[str] = Field(default_factory=list)
    rate_limit_per_minute: int = Field(default=20, ge=1, le=600)
    min_delay_seconds: float = Field(default=1.5, ge=0, le=120)
    max_records_per_run: int = Field(default=200, ge=1, le=5000)
    max_requests_per_run: int = Field(default=25, ge=1, le=500)
    attribution: str = ""
    licensing_status: Literal["licensed", "public_website", "user_provided", "unconfirmed"] = "unconfirmed"
    consent_default: CONSENT = "unknown"
    credential_env: str | None = None
    compliance_notes: str | None = None


class SourceCreate(SourceBase):
    pass


class SourceUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    description: str | None = None
    mode: Literal["demo", "live"] | None = None
    is_enabled: bool | None = None
    config: dict[str, Any] | None = None
    allowed_fields: list[str] | None = None
    rate_limit_per_minute: int | None = Field(default=None, ge=1, le=600)
    min_delay_seconds: float | None = Field(default=None, ge=0, le=120)
    max_records_per_run: int | None = Field(default=None, ge=1, le=5000)
    max_requests_per_run: int | None = Field(default=None, ge=1, le=500)
    attribution: str | None = None
    licensing_status: Literal["licensed", "public_website", "user_provided", "unconfirmed"] | None = None
    consent_default: CONSENT | None = None
    credential_env: str | None = None
    compliance_notes: str | None = None


class StartJobRequest(BaseModel):
    max_records: int | None = Field(default=None, ge=1, le=5000)
    max_requests: int | None = Field(default=None, ge=1, le=500)
    mode_override: Literal["demo", "live"] | None = None


class LeadUpdate(BaseModel):
    lead_status: LEAD_STATUS | None = None
    assigned_agent_id: int | None = None
    consent_status: CONSENT | None = None
    notes: str | None = None
    contact_name: str | None = None
    contact_title: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    industry: str | None = None
    website: str | None = None


class NoteCreate(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


class BulkAssign(BaseModel):
    lead_ids: list[int] = Field(min_length=1, max_length=1000)
    agent_id: int | None = None
    strategy: Literal["single", "round_robin"] = "single"


class BulkStatus(BaseModel):
    lead_ids: list[int] = Field(min_length=1, max_length=1000)
    lead_status: LEAD_STATUS


class VerificationRequest(BaseModel):
    channel: Literal["phone", "email"]
    status: Literal["verified_owner", "invalid", "disconnected", "mx_valid", "bounced"]
    evidence: str = Field(min_length=3, max_length=500,
                          description="How the verification was obtained (provider name, call report, etc.)")


class SuppressionCreate(BaseModel):
    kind: Literal["email", "phone", "domain", "business_name"]
    value: str = Field(min_length=2, max_length=254)
    reason: str | None = Field(default=None, max_length=240)


class SettingsUpdate(BaseModel):
    org_name: str | None = None
    export_require_consent: bool | None = None
    export_exclude_invalid: bool | None = None
    data_retention_days: int | None = Field(default=None, ge=30, le=3650)
    audit_retention_days: int | None = Field(default=None, ge=30, le=3650)
    allow_agent_export: bool | None = None
    collection_enabled: bool | None = None
    daily_collection_limit: int | None = Field(default=None, ge=1, le=100000)
    notes: str | None = None


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    scopes: list[str] = Field(default_factory=lambda: ["sources:manage", "jobs:manage"])


class ExportFilters(BaseModel):
    q: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    industry: str | None = None
    source_id: int | None = None
    lead_status: list[str] | None = None
    consent_status: list[str] | None = None
    phone_status: list[str] | None = None
    email_status: list[str] | None = None
    verification: str | None = None
    assigned_agent_id: str | int | None = None
    freshness: str | None = None
    include_duplicates: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.model_dump().items() if v not in (None, [], "")}


class ExportRequest(BaseModel):
    format: Literal["csv", "xlsx"] = "csv"
    filters: ExportFilters = Field(default_factory=ExportFilters)
    require_consent: bool | None = None
    exclude_invalid: bool | None = None
    include_notes: bool = True
    purpose: str | None = Field(default=None, max_length=240)


class AssignLeadsRequest(BaseModel):
    lead_ids: list[int] = Field(min_length=1, max_length=1000)
    agent_id: int


class PublicLeadForm(BaseModel):
    business_name: str = Field(min_length=2, max_length=240)
    contact_name: str | None = None
    contact_title: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    industry: str | None = None
    message: str | None = Field(default=None, max_length=2000)
    consent_granted: bool = False
    consent_text_version: str | None = None
    website: str | None = Field(default=None, description="Honeypot field — must stay empty")

    @field_validator("phone", "email")
    @classmethod
    def at_least_one(cls, value, info):
        return value

    def model_post_init(self, __context) -> None:  # noqa: D401
        if not (self.phone or self.email):
            raise ValueError("Provide a phone number or an e-mail address.")

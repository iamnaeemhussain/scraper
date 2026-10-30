"""Adapter contract shared by every data source."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Iterator, Protocol

from sqlalchemy.orm import Session

from ..models import DataSource


class AdapterError(RuntimeError):
    """Base class for adapter failures."""


class AdapterNotConfigured(AdapterError):
    """Raised when required configuration/credentials are missing."""


class AdapterUnavailable(AdapterError):
    """Raised when the upstream source is unreachable or refuses access."""


ALL_LEAD_FIELDS = [
    "business_name",
    "contact_name",
    "contact_title",
    "phone",
    "email",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "zip_code",
    "country",
    "industry",
    "website",
    "source_url",
    "consent_status",
]

# Fields that must never be collected by this platform, regardless of source.
PROHIBITED_FIELDS = [
    "personal_home_address",
    "date_of_birth",
    "age",
    "ssn",
    "social_security_number",
    "personal_cell_phone",
    "personal_email_outside_business_context",
    "race",
    "ethnicity",
    "religion",
    "sexual_orientation",
    "health_data",
    "biometric_data",
    "credit_score",
    "income",
    "criminal_record",
    "children",
    "relationship_status",
]


@dataclass
class CollectionContext:
    """Everything an adapter is allowed to know about a collection run."""

    source: DataSource
    config: dict[str, Any]
    allowed_fields: list[str]
    max_records: int
    max_requests: int
    min_delay: float
    run_index: int = 1
    db: Session | None = None
    should_stop: Callable[[], bool] = lambda: False
    wait_if_paused: Callable[[], None] = lambda: None
    log: Callable[[str, str], None] = lambda level, message: None
    record_failure: Callable[..., None] = lambda **kwargs: None
    stats: dict[str, Any] = field(default_factory=dict)

    def field_allowed(self, name: str) -> bool:
        return name in self.allowed_fields

    def emit(self, record: dict[str, Any]) -> dict[str, Any]:
        """Trim a raw record to the permitted extraction fields."""
        cleaned: dict[str, Any] = {}
        for key, value in record.items():
            if key in {"phone", "email", "business_name"} and not self.field_allowed(key):
                # phone/email/business_name are the identity of a lead; without the
                # permission to store them we cannot use the record at all.
                continue
            if key in ALL_LEAD_FIELDS and not self.field_allowed(key):
                continue
            cleaned[key] = value
        return cleaned


class SourceAdapter(Protocol):
    meta: "AdapterMeta"

    def collect(self, ctx: CollectionContext) -> Iterator[dict[str, Any]]: ...


@dataclass
class AdapterMeta:
    key: str
    label: str
    category: str
    description: str
    supports_live: bool
    supports_demo: bool
    default_mode: str
    requires_credentials: bool
    legal_basis: str
    compliance_notes: str
    config_fields: list[dict[str, Any]]
    default_allowed_fields: list[str]
    default_attribution: str = ""
    default_rate_limit: int = 20
    default_min_delay: float = 1.5
    default_max_records: int = 200
    credential_hint: str | None = None
    docs_url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "category": self.category,
            "description": self.description,
            "supports_live": self.supports_live,
            "supports_demo": self.supports_demo,
            "default_mode": self.default_mode,
            "requires_credentials": self.requires_credentials,
            "legal_basis": self.legal_basis,
            "compliance_notes": self.compliance_notes,
            "config_fields": self.config_fields,
            "default_allowed_fields": self.default_allowed_fields,
            "default_attribution": self.default_attribution,
            "default_rate_limit": self.default_rate_limit,
            "default_min_delay": self.default_min_delay,
            "default_max_records": self.default_max_records,
            "credential_hint": self.credential_hint,
            "docs_url": self.docs_url,
        }

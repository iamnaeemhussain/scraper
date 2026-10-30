"""Adapter registry — the single place that knows which sources exist."""
from __future__ import annotations

from typing import Any

from .base import ALL_LEAD_FIELDS, PROHIBITED_FIELDS, AdapterMeta, SourceAdapter
from .company_site import adapter as company_site_adapter
from .contact_api import adapter as contact_api_adapter
from .directories import adapter as directory_adapter
from .lead_form import adapter as lead_form_adapter
from .licensed import adapter as licensed_adapter
from .upload import adapter as upload_adapter

ADAPTERS: dict[str, SourceAdapter] = {
    adapter.meta.key: adapter
    for adapter in (
        directory_adapter,
        company_site_adapter,
        licensed_adapter,
        contact_api_adapter,
        upload_adapter,
        lead_form_adapter,
    )
}

ADAPTER_ORDER = [
    "business_directory",
    "company_website",
    "licensed_database",
    "contact_api",
    "upload",
    "lead_form",
]


def get_adapter(key: str) -> SourceAdapter | None:
    return ADAPTERS.get(key)


def get_meta(key: str) -> AdapterMeta | None:
    adapter = ADAPTERS.get(key)
    return adapter.meta if adapter else None


def catalog() -> list[dict[str, Any]]:
    return [ADAPTERS[key].meta.to_dict() for key in ADAPTER_ORDER if key in ADAPTERS]


def field_options() -> dict[str, Any]:
    return {
        "collectable_fields": ALL_LEAD_FIELDS,
        "prohibited_fields": PROHIBITED_FIELDS,
        "field_labels": FIELD_LABELS,
    }


FIELD_LABELS = {
    "business_name": "Business name",
    "contact_name": "Contact person name",
    "contact_title": "Contact title",
    "phone": "Business phone",
    "email": "Business email",
    "address_line1": "Address line 1",
    "address_line2": "Address line 2",
    "city": "City",
    "state": "State / region",
    "zip_code": "ZIP / postal code",
    "country": "Country",
    "industry": "Industry",
    "website": "Website",
    "source_url": "Source URL",
    "consent_status": "Consent status (from source)",
}

"""User-uploaded CSV/Excel dataset adapter.

Uploads are ingested through the Imports & Exports module (with header mapping,
row-level validation and duplicate detection). The adapter exists so upload sources
appear in Data Sources and carry attribution, field permissions and consent rules.
"""
from __future__ import annotations

from typing import Any, Iterator

from .base import AdapterMeta, CollectionContext


class UploadAdapter:
    meta = AdapterMeta(
        key="upload",
        label="Uploaded CSV / Excel dataset",
        category="First party / upload",
        description=(
            "Leads imported from files you own or are licensed to use. Rows are validated, "
            "normalised and de-duplicated before they reach the lead database."
        ),
        supports_live=True,
        supports_demo=False,
        default_mode="live",
        requires_credentials=False,
        legal_basis="User attestation that they hold the rights and lawful basis to contact these businesses.",
        compliance_notes=(
            "Every import requires an attestation that the uploader has permission to use the data. "
            "Imports are rejected if they contain prohibited (personal/sensitive) columns."
        ),
        config_fields=[
            {"name": "expected_columns", "label": "Expected columns (optional)", "type": "list",
             "required": False, "help": "If set, imports must contain these headers.",
             "placeholder": "business_name, phone, city, state"},
        ],
        default_allowed_fields=[
            "business_name", "contact_name", "contact_title", "phone", "email", "address_line1",
            "address_line2", "city", "state", "zip_code", "country", "industry", "website",
            "consent_status",
        ],
        default_attribution="User-uploaded dataset (licensed by the uploading organisation)",
        default_rate_limit=1,
        default_min_delay=0.0,
        default_max_records=5000,
    )

    def collect(self, ctx: CollectionContext) -> Iterator[dict[str, Any]]:
        ctx.log(
            "info",
            "This source accepts data through Imports & Exports → Upload file. "
            "No web collection is performed.",
        )
        ctx.stats["collector"] = "upload"
        return iter(())


adapter = UploadAdapter()

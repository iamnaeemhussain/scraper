"""First-party lead form adapter.

Collects submissions posted by your own website's contact/quote form through an
authenticated webhook endpoint. Because the form is first-party, submissions can
carry explicit consent.
"""
from __future__ import annotations

from typing import Any, Iterator

from sqlalchemy import func, select

from ..models import Lead
from .base import AdapterMeta, CollectionContext


class LeadFormAdapter:
    meta = AdapterMeta(
        key="lead_form",
        label="First-party lead form",
        category="First party / upload",
        description=(
            "Receives form submissions from your own website through a tokenised webhook. "
            "Consent text and its version are captured with each submission."
        ),
        supports_live=True,
        supports_demo=True,
        default_mode="live",
        requires_credentials=False,
        legal_basis="First-party submission with affirmative consent at the point of collection.",
        compliance_notes=(
            "Each source generates a public form token. Submissions are rate limited, spam-guarded "
            "and stored with the exact consent wording shown to the visitor."
        ),
        config_fields=[
            {"name": "form_token", "label": "Public form token", "type": "text", "required": False,
             "help": "Generated automatically. Embed it in your website form's POST endpoint.",
             "placeholder": "auto-generated on source creation"},
            {"name": "consent_text", "label": "Consent wording shown to visitors", "type": "text",
             "required": True,
             "default": "I agree to be contacted by phone or email about my enquiry.",
             "help": "Stored verbatim on every submission for audit purposes."},
        ],
        default_allowed_fields=[
            "business_name", "contact_name", "contact_title", "phone", "email", "address_line1",
            "city", "state", "zip_code", "country", "industry", "website", "consent_status",
        ],
        default_attribution="First-party web form submission",
        default_rate_limit=60,
        default_min_delay=0.0,
        default_max_records=500,
    )

    def collect(self, ctx: CollectionContext) -> Iterator[dict[str, Any]]:
        stats = ctx.stats
        if ctx.db is not None:
            total = ctx.db.scalar(select(func.count(Lead.id)).where(Lead.source_id == ctx.source.id)) or 0
            stats["form_submissions_total"] = total
            ctx.log("info", f"{total} first-party form submissions stored for this source.")
        ctx.log(
            "info",
            "First-party submissions arrive through the public form webhook in real time; "
            "there is nothing to crawl.",
        )
        return iter(())


adapter = LeadFormAdapter()

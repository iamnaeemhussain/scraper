"""Approved third-party contact API adapter."""
from __future__ import annotations

from typing import Any, Iterator

from .base import AdapterMeta, AdapterNotConfigured, CollectionContext
from .demo import run_demo
from .json_api import credential_for, iterate_api, parse_mapping


class ContactApiAdapter:
    meta = AdapterMeta(
        key="contact_api",
        label="Approved contact API",
        category="Partner API",
        description=(
            "Connects to an official, permission-based contact verification or enrichment API. "
            "Responses can also carry verification evidence which is mapped onto the record."
        ),
        supports_live=True,
        supports_demo=True,
        default_mode="demo",
        requires_credentials=True,
        credential_hint="Store the partner token in an environment variable, e.g. CONTACT_API_TOKEN.",
        legal_basis="API terms of service and granted scopes.",
        compliance_notes=(
            "Use only documented endpoints and stay within the published quota. Verification "
            "statuses are taken from the provider's response only; nothing is inferred. "
            "CAPTCHA-protected or login-protected sources are out of scope by design."
        ),
        config_fields=[
            {"name": "api_url", "label": "API endpoint", "type": "text", "required": True,
             "placeholder": "https://api.partner.example/v2/contacts"},
            {"name": "records_path", "label": "Records path", "type": "text", "required": False,
             "default": "results"},
            {"name": "field_map", "label": "Field mapping", "type": "mapping", "required": True,
             "placeholder": "business_name=organization.name\nphone=phone.number\nemail=email.address\nphone_verification=phone.status"},
            {"name": "query_params", "label": "Query parameters", "type": "mapping", "required": False,
             "placeholder": "region=us-south\nlimit=100"},
            {"name": "page_param", "label": "Pagination parameter", "type": "text", "required": False,
             "default": "page"},
            {"name": "auth_header", "label": "Auth header name", "type": "text", "required": False,
             "default": "Authorization"},
            {"name": "auth_prefix", "label": "Auth value prefix", "type": "text", "required": False,
             "default": "Bearer "},
            {"name": "verification_field_map", "label": "Verification evidence mapping", "type": "mapping",
             "required": False, "help": "Optional: phone_status=phone.status, email_status=email.status",
             "placeholder": "phone_status=phone.status\nemail_status=email.status"},
        ],
        default_allowed_fields=[
            "business_name", "contact_name", "contact_title", "phone", "email", "address_line1",
            "city", "state", "zip_code", "country", "industry", "website", "source_url",
            "consent_status",
        ],
        default_attribution="Third-party contact API (permission-based partner integration)",
        default_rate_limit=120,
        default_min_delay=0.25,
        default_max_records=500,
    )

    def collect(self, ctx: CollectionContext) -> Iterator[dict[str, Any]]:
        if (ctx.source.mode or "demo") == "demo":
            yield from run_demo(ctx, per_run=min(ctx.max_records, 100))
            return
        config = ctx.config or {}
        endpoint = config.get("api_url") or ctx.source.url
        if not endpoint:
            raise AdapterNotConfigured("Set the partner API endpoint.")
        mapping = parse_mapping(config.get("field_map"))
        if not mapping:
            raise AdapterNotConfigured("Map at least one field from the partner response.")
        credential = credential_for(ctx.source.credential_env)
        header_name = config.get("auth_header") or "Authorization"
        prefix = config.get("auth_prefix")
        if prefix is None:
            prefix = "Bearer " if header_name.lower() == "authorization" else ""
        verification_map = parse_mapping(config.get("verification_field_map"))

        for record in iterate_api(
            ctx,
            endpoint=endpoint,
            headers={header_name: f"{prefix}{credential}"},
            params=parse_mapping(config.get("query_params")),
            records_path=config.get("records_path") or "results",
            mapping=mapping,
            page_param=config.get("page_param") or "page",
        ):
            # Verification evidence is carried through on private keys and applied by
            # the ingest service (which validates it is provider-supplied).
            raw_status = record.pop("phone_verification", None)
            if raw_status is None and verification_map.get("phone_status"):
                raw_status = None
            record["_provider_phone_status"] = str(raw_status).lower() if raw_status else None
            yield record


adapter = ContactApiAdapter()

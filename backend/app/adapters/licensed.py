"""Licensed business database adapter (contract-based data provider)."""
from __future__ import annotations

import os
from typing import Any, Iterator

from .base import AdapterMeta, AdapterNotConfigured, CollectionContext
from .demo import run_demo
from .json_api import credential_for, iterate_api, parse_mapping


class LicensedDatabaseAdapter:
    meta = AdapterMeta(
        key="licensed_database",
        label="Licensed business database",
        category="Licensed provider",
        description=(
            "Pulls business records from a commercial data provider under your own licence "
            "(API or bulk export endpoint). Licence terms are stored on every record."
        ),
        supports_live=True,
        supports_demo=True,
        default_mode="demo",
        requires_credentials=True,
        credential_hint="Provide the provider API key via an environment variable name, e.g. DATA_PROVIDER_KEY.",
        legal_basis="Written licence agreement with the data provider.",
        compliance_notes=(
            "Only use data your licence explicitly permits to be used for outbound calling, and "
            "respect the provider's field-level restrictions and refresh requirements. The key is "
            "read from a server-side environment variable — never stored in the database or sent "
            "to the browser."
        ),
        config_fields=[
            {"name": "api_url", "label": "Provider API endpoint", "type": "text", "required": True,
             "placeholder": "https://api.provider.example/v1/businesses"},
            {"name": "records_path", "label": "Records path in response", "type": "text",
             "required": False, "default": "data.results", "help": "Dot notation, e.g. data.results[0] is not needed."},
            {"name": "field_map", "label": "Field mapping", "type": "mapping", "required": True,
             "help": "lead field = provider field path",
             "placeholder": "business_name=company.name\nphone=phones[0].number\nemail=contacts.email"},
            {"name": "query_params", "label": "Query parameters", "type": "mapping", "required": False,
             "placeholder": "country=US\nindustry=plumbing"},
            {"name": "page_param", "label": "Pagination parameter", "type": "text", "required": False,
             "default": "page"},
            {"name": "auth_header", "label": "Auth header name", "type": "text", "required": False,
             "default": "Authorization", "help": "Use 'Authorization' with 'Bearer ' prefix or set a raw header."},
            {"name": "auth_prefix", "label": "Auth value prefix", "type": "text", "required": False,
             "default": "Bearer "},
        ],
        default_allowed_fields=[
            "business_name", "contact_name", "contact_title", "phone", "email", "address_line1",
            "city", "state", "zip_code", "country", "industry", "website", "source_url",
            "consent_status",
        ],
        default_attribution="Licensed business database (see licence reference on the source)",
        default_rate_limit=60,
        default_min_delay=0.5,
        default_max_records=500,
    )

    def collect(self, ctx: CollectionContext) -> Iterator[dict[str, Any]]:
        if (ctx.source.mode or "demo") == "demo":
            yield from run_demo(ctx, per_run=min(ctx.max_records, 120))
            return
        config = ctx.config or {}
        endpoint = config.get("api_url") or ctx.source.url
        if not endpoint:
            raise AdapterNotConfigured("Set the provider API endpoint (or the source URL).")
        mapping = parse_mapping(config.get("field_map"))
        if not mapping:
            raise AdapterNotConfigured("Map at least one provider field to a lead field.")

        credential = credential_for(ctx.source.credential_env)
        header_name = config.get("auth_header") or "Authorization"
        prefix = config.get("auth_prefix")
        if prefix is None:
            prefix = "Bearer " if header_name.lower() == "authorization" else ""
        headers = {header_name: f"{prefix}{credential}"}
        if config.get("api_key_header"):
            headers[str(config["api_key_header"])] = credential

        yield from iterate_api(
            ctx,
            endpoint=endpoint,
            headers=headers,
            params=parse_mapping(config.get("query_params")),
            records_path=config.get("records_path") or "data.results",
            mapping=mapping,
            page_param=config.get("page_param") or "page",
        )


def credential_present(source_credential_env: str | None) -> bool:
    return bool(source_credential_env and os.environ.get(source_credential_env))


adapter = LicensedDatabaseAdapter()

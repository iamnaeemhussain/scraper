"""Authorized business directory adapter."""
from __future__ import annotations

from typing import Any, Iterator

from .base import AdapterMeta, AdapterNotConfigured, CollectionContext
from .demo import run_demo
from .html import parse, select_nodes, text_of
from .base import ALL_LEAD_FIELDS
from .net import ComplianceError, FetchError, assert_live_allowed, fetch


class BusinessDirectoryAdapter:
    meta = AdapterMeta(
        key="business_directory",
        label="Authorized business directory",
        category="Web extraction",
        description=(
            "Reads business listings from a directory you are permitted to use (checked for "
            "robots.txt compliance and domain allow-listing). Map listing pages with CSS selectors."
        ),
        supports_live=True,
        supports_demo=True,
        default_mode="demo",
        requires_credentials=False,
        legal_basis="Directory terms of use / written permission; robots.txt respected.",
        compliance_notes=(
            "Only public business listing pages are read. The crawler honours robots.txt, keeps "
            "one request per domain in flight, and never bypasses log-ins, paywalls or CAPTCHAs. "
            "Confirm the directory's terms permit automated collection before enabling live mode."
        ),
        config_fields=[
            {"name": "listing_urls", "label": "Listing page URLs", "type": "list", "required": True,
             "help": "One URL per line. Use {page} for pagination, e.g. https://dir.example.com/plumbers?page={page}",
             "placeholder": "https://directory.example.com/industry/plumbing?page={page}"},
            {"name": "max_pages", "label": "Pages per URL", "type": "number", "required": False,
             "default": 3, "help": "Upper bound per run (capped by the source request limit)."},
            {"name": "item_selector", "label": "Listing item CSS selector", "type": "text", "required": True,
             "placeholder": ".business-card"},
            {"name": "field_selectors", "label": "Field CSS selectors", "type": "mapping", "required": True,
             "help": "Map each lead field to a CSS selector relative to the listing item. "
                     "Use ::attr(href) for attributes.",
             "placeholder": "business_name=.card-title\nphone=.phone\nwebsite=a.website::attr(href)"},
            {"name": "contact_page_selector", "label": "Contact link selector (optional)", "type": "text",
             "required": False, "placeholder": "a.contact-link::attr(href)"},
        ],
        default_allowed_fields=[
            "business_name", "phone", "email", "address_line1", "city", "state", "zip_code",
            "country", "industry", "website", "source_url",
        ],
        default_attribution="Directory listing page (see source URL on each record)",
        default_rate_limit=15,
        default_min_delay=2.0,
        default_max_records=200,
    )

    def collect(self, ctx: CollectionContext) -> Iterator[dict[str, Any]]:
        if (ctx.source.mode or "demo") == "demo":
            yield from self._demo(ctx)
            return
        yield from self._live(ctx)

    # ------------------------------------------------------------------ demo
    def _demo(self, ctx: CollectionContext) -> Iterator[dict[str, Any]]:
        yield from run_demo(ctx, per_run=min(ctx.max_records, 90))

    # ------------------------------------------------------------------ live
    def _live(self, ctx: CollectionContext) -> Iterator[dict[str, Any]]:
        config = ctx.config or {}
        listing_urls = config.get("listing_urls") or ([ctx.source.url] if ctx.source.url else [])
        if isinstance(listing_urls, str):
            listing_urls = [u.strip() for u in listing_urls.splitlines() if u.strip()]
        item_selector = (config.get("item_selector") or "").strip()
        field_selectors = config.get("field_selectors") or {}
        if not listing_urls:
            raise AdapterNotConfigured("Add at least one listing URL before starting a collection.")
        if not item_selector:
            raise AdapterNotConfigured("A listing item selector is required for live extraction.")
        if isinstance(field_selectors, str):
            field_selectors = _parse_mapping(field_selectors)
        if not field_selectors:
            raise AdapterNotConfigured("Map at least one field to a CSS selector.")

        max_pages = int(config.get("max_pages") or 1)
        requests_made = 0
        emitted = 0

        for listing_url in listing_urls:
            for page in range(1, max_pages + 1):
                if ctx.should_stop() or emitted >= ctx.max_records or requests_made >= ctx.max_requests:
                    return
                ctx.wait_if_paused()
                url = listing_url.replace("{page}", str(page)) if "{page}" in listing_url else listing_url
                if page > 1 and "{page}" not in listing_url:
                    break
                try:
                    assert_live_allowed(url, config.get("allowed_domains") or [])
                    result = fetch(url, min_delay=ctx.min_delay)
                except ComplianceError as exc:
                    ctx.log("warn", str(exc))
                    ctx.record_failure(url=url, error_type="compliance_block", message=str(exc))
                    continue
                except FetchError as exc:
                    ctx.log("error", f"{exc.error_type}: {exc}")
                    ctx.record_failure(url=url, error_type=exc.error_type,
                                       status_code=exc.status_code, message=str(exc))
                    continue
                finally:
                    requests_made += 1
                ctx.stats["requests_made"] = requests_made

                page_root = parse(result.text)
                if page_root is None:
                    ctx.record_failure(url=url, error_type="parse_error",
                                       message="Could not parse the listing page HTML.")
                    continue
                items = select_nodes(page_root, item_selector)
                ctx.log("info", f"{len(items)} listings found on {url}")
                if not items:
                    ctx.record_failure(url=url, error_type="selector_miss",
                                       message="No items matched the listing selector; check the mapping.")
                for item in items:
                    if ctx.should_stop() or emitted >= ctx.max_records:
                        return
                    ctx.wait_if_paused()
                    record: dict[str, Any] = {}
                    for field, selector in field_selectors.items():
                        if field not in ALL_LEAD_FIELDS:
                            continue
                        if not ctx.field_allowed(field):
                            continue
                        value = text_of(item, str(selector))
                        if value:
                            record[field] = value
                    if not record.get("business_name") or not (record.get("phone") or record.get("email")):
                        continue
                    record["source_url"] = record.get("source_url") or url
                    yield ctx.emit(record)
                    emitted += 1


def _parse_mapping(raw: Any) -> dict[str, str]:
    mapping: dict[str, str] = {}
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items()}
    for line in str(raw).splitlines():
        if "=" in line:
            key, _, value = line.partition("=")
            if key.strip() and value.strip():
                mapping[key.strip()] = value.strip()
    return mapping


adapter = BusinessDirectoryAdapter()

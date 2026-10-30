"""Official company website adapter (public contact pages only)."""
from __future__ import annotations

import re
from typing import Any, Iterator
from urllib.parse import urljoin, urlparse

from .base import AdapterMeta, AdapterNotConfigured, CollectionContext
from .demo import run_demo
from .html import contact_links, looks_like_contact_page, organization_from_json_ld, json_ld_blocks, parse, select_nodes, text_of
from .net import ComplianceError, FetchError, assert_live_allowed, fetch

CONTACT_LINK_HINTS = ("contact", "contact-us", "contactus", "about", "get-in-touch")


class CompanyWebsiteAdapter:
    meta = AdapterMeta(
        key="company_website",
        label="Official company website",
        category="Web extraction",
        description=(
            "Reads structured business data (JSON-LD Organization/LocalBusiness, published "
            "telephone and e-mail links) from a company's own public contact page."
        ),
        supports_live=True,
        supports_demo=True,
        default_mode="demo",
        requires_credentials=False,
        legal_basis="Publicly published business contact details on the company's own site.",
        compliance_notes=(
            "Only the pages the site publishes openly are read, robots.txt is honoured and every "
            "request is delayed. Found contact details are stored as 'unverified' — publishing a "
            "phone number is not proof it is reachable or that the business consents to calls."
        ),
        config_fields=[
            {"name": "urls", "label": "Company website URLs", "type": "list", "required": True,
             "help": "One site per line, e.g. https://acme-plumbing.example.com",
             "placeholder": "https://example-business.com"},
            {"name": "contact_paths", "label": "Contact page paths", "type": "list", "required": False,
             "default": "/contact\n/contact-us\n/about", "help": "Tried in order when the home page has no contact data."},
        ],
        default_allowed_fields=[
            "business_name", "phone", "email", "address_line1", "city", "state",
            "zip_code", "country", "industry", "website", "source_url",
        ],
        default_attribution="Official company website contact page",
        default_rate_limit=10,
        default_min_delay=3.0,
        default_max_records=60,
    )

    def collect(self, ctx: CollectionContext) -> Iterator[dict[str, Any]]:
        if (ctx.source.mode or "demo") == "demo":
            yield from run_demo(ctx, per_run=min(ctx.max_records, 40))
            return
        yield from self._live(ctx)

    def _live(self, ctx: CollectionContext) -> Iterator[dict[str, Any]]:
        config = ctx.config or {}
        urls = config.get("urls") or ([ctx.source.url] if ctx.source.url else [])
        if isinstance(urls, str):
            urls = [u.strip() for u in urls.splitlines() if u.strip()]
        if not urls:
            raise AdapterNotConfigured("Add at least one company website URL.")
        contact_paths = config.get("contact_paths") or "/contact\n/contact-us\n/about"
        if isinstance(contact_paths, str):
            contact_paths = [p.strip() for p in contact_paths.splitlines() if p.strip()]

        for site_url in urls:
            if ctx.should_stop() or ctx.stats.get("requests_made", 0) >= ctx.max_requests:
                return
            ctx.wait_if_paused()
            record = self._extract_site(ctx, site_url, contact_paths)
            if record:
                yield ctx.emit(record)

    def _extract_site(self, ctx: CollectionContext, site_url: str, contact_paths: list[str]) -> dict[str, Any] | None:
        urls_to_try = [site_url] + [urljoin(site_url.rstrip("/") + "/", p.lstrip("/")) for p in contact_paths]
        best: dict[str, Any] = {}
        for url in urls_to_try:
            if ctx.should_stop() or ctx.stats.get("requests_made", 0) >= ctx.max_requests:
                break
            if not url.lower().startswith("http"):
                url = "https://" + url
            ctx.wait_if_paused()
            try:
                assert_live_allowed(url, (ctx.config or {}).get("allowed_domains") or [])
                result = fetch(url, min_delay=ctx.min_delay)
            except ComplianceError as exc:
                ctx.log("warn", f"{url}: {exc}")
                ctx.record_failure(url=url, error_type="compliance_block", message=str(exc))
                break
            except FetchError as exc:
                ctx.log("warn", f"{url}: {exc}")
                ctx.record_failure(url=url, error_type=exc.error_type, status_code=exc.status_code,
                                   message=str(exc))
                continue
            finally:
                ctx.stats["requests_made"] = ctx.stats.get("requests_made", 0) + 1

            html = result.text
            root = parse(html)
            if root is None:
                continue
            data = organization_from_json_ld(json_ld_blocks(html))
            links = contact_links(html)
            if not data.get("phone") and links["phones"]:
                data["phone"] = links["phones"][0]
            if not data.get("email") and links["emails"]:
                data["email"] = links["emails"][0]
            if not data.get("business_name"):
                data["business_name"] = (
                    text_of(root, "meta[property='og:site_name']::attr(content)")
                    or text_of(root, "title")
                    or urlparse(site_url).netloc
                )
            if not data.get("website"):
                data["website"] = site_url
            data["source_url"] = result.url
            data = {k: v for k, v in data.items() if v}
            if data.get("phone") or data.get("email"):
                best = data
                if data.get("phone") and data.get("email"):
                    break
            # Follow a published contact link if it exists and we have not looked at it yet.
            if looks_like_contact_page(html):
                candidate = self._find_contact_link(root, result.url)
                if candidate and candidate not in urls_to_try:
                    urls_to_try.append(candidate)
        if not best:
            ctx.log("warn", f"No usable public contact details found at {site_url}")
            ctx.record_failure(url=site_url, error_type="no_contact_data",
                               message="No published business phone/e-mail found on the site.")
            return None
        # Never inherit an unverified identity: mark provenance explicitly downstream.
        best.setdefault("consent_status", "unknown")
        return best

    @staticmethod
    def _find_contact_link(root: Any, base_url: str) -> str | None:
        for anchor in select_nodes(root, "a[href]"):
            href = (anchor.attr("href") or "").strip()
            label = anchor.text.lower()
            if not href or href.startswith(("mailto:", "tel:", "#", "javascript:")):
                continue
            if any(hint in href.lower() or hint in label for hint in CONTACT_LINK_HINTS):
                return urljoin(base_url, href)
        return None


adapter = CompanyWebsiteAdapter()

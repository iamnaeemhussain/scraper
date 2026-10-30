"""Shared helpers for adapters that talk to licensed/provider JSON APIs."""
from __future__ import annotations

import os
from typing import Any, Iterator

import httpx

from ..config import settings
from .base import ALL_LEAD_FIELDS, AdapterNotConfigured, CollectionContext, AdapterUnavailable


def parse_mapping(raw: Any) -> dict[str, str]:
    """Accept `{"field": "path"}` or newline text `field=path`."""
    if isinstance(raw, dict):
        return {str(k).strip(): str(v).strip() for k, v in raw.items()}
    mapping: dict[str, str] = {}
    for line in str(raw or "").splitlines():
        if "=" in line:
            key, _, value = line.partition("=")
            if key.strip() and value.strip():
                mapping[key.strip()] = value.strip()
    return mapping


def dig(payload: Any, path: str | None) -> Any:
    """Dot/bracket path lookup: `data.results[0].name`."""
    if not path:
        return payload
    current = payload
    for chunk in path.replace("[", ".").replace("]", "").split("."):
        if chunk == "":
            continue
        if isinstance(current, list):
            try:
                current = current[int(chunk)]
            except (ValueError, IndexError):
                return None
        elif isinstance(current, dict):
            current = current.get(chunk)
        else:
            return None
        if current is None:
            return None
    return current


def map_record(raw: dict[str, Any], mapping: dict[str, str], ctx: CollectionContext) -> dict[str, Any]:
    record: dict[str, Any] = {}
    for field, path in mapping.items():
        if field not in ALL_LEAD_FIELDS or not ctx.field_allowed(field):
            continue
        value = dig(raw, path)
        if isinstance(value, (int, float)):
            value = str(value)
        if value:
            record[field] = value
    return record


def credential_for(source_credential_env: str | None) -> str:
    if not source_credential_env:
        raise AdapterNotConfigured(
            "This adapter needs an API credential. Set the environment variable name on the "
            "source (e.g. PROVIDER_API_KEY) and export it on the server — secrets are never "
            "stored in the database or sent to the browser."
        )
    value = os.environ.get(source_credential_env)
    if not value:
        raise AdapterNotConfigured(
            f"Environment variable '{source_credential_env}' is not set on this server."
        )
    return value


def iterate_api(
    ctx: CollectionContext,
    *,
    endpoint: str,
    headers: dict[str, str],
    params: dict[str, Any],
    records_path: str,
    mapping: dict[str, str],
    page_param: str | None = None,
    page_size: int = 50,
) -> Iterator[dict[str, Any]]:
    emitted = 0
    page = 1
    requests_made = 0
    while emitted < ctx.max_records and requests_made < ctx.max_requests:
        if ctx.should_stop():
            return
        ctx.wait_if_paused()
        query = dict(params)
        if page_param:
            query[page_param] = page
            query.setdefault("per_page", page_size)
            query.setdefault("limit", page_size)
        try:
            response = httpx.get(
                endpoint,
                headers={**headers, "User-Agent": settings.user_agent},
                params=query,
                timeout=settings.http_timeout_seconds,
            )
        except httpx.HTTPError as exc:
            ctx.record_failure(url=endpoint, error_type="network_error", message=f"{type(exc).__name__}: {exc}")
            raise AdapterUnavailable(f"Provider request failed: {exc}") from exc
        requests_made += 1
        ctx.stats["requests_made"] = requests_made
        if response.status_code == 429:
            retry_after = response.headers.get("retry-after", "unknown")
            message = f"Provider rate limit hit (429, retry-after={retry_after}); stopping politely."
            ctx.record_failure(url=endpoint, error_type="rate_limited", status_code=429, message=message)
            ctx.log("warn", message)
            return
        if response.status_code >= 400:
            ctx.record_failure(url=endpoint, error_type="http_error", status_code=response.status_code,
                               message=f"HTTP {response.status_code} from provider.")
            raise AdapterUnavailable(f"Provider returned HTTP {response.status_code}")
        try:
            payload = response.json()
        except ValueError:
            ctx.record_failure(url=endpoint, error_type="parse_error", message="Provider did not return JSON.")
            return
        rows = dig(payload, records_path)
        if not isinstance(rows, list):
            ctx.log("warn", f"No records found at path '{records_path}'.")
            return
        if not rows:
            return
        for row in rows:
            if ctx.should_stop() or emitted >= ctx.max_records:
                return
            if not isinstance(row, dict):
                continue
            record = map_record(row, mapping, ctx)
            if record.get("business_name") and (record.get("phone") or record.get("email")):
                yield record
                emitted += 1
                ctx.wait_if_paused()
        if not page_param or len(rows) < page_size:
            return
        page += 1

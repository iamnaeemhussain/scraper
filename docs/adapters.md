# Source adapters

Every way of obtaining records is an **adapter**. Adapters are small, isolated modules with a
declared compliance contract, so adding a new authorized source never means touching the job
runner, the ingest pipeline or the UI.

Bundled adapters (`backend/app/adapters/registry.py`):

| Key | Label | Live | Demo | Credentials | Legal basis |
| --- | --- | :-: | :-: | :-: | --- |
| `business_directory` | Authorized business directory | ✓ | ✓ | — | Directory terms / written permission |
| `company_website` | Company website crawler | ✓ | ✓ | — | Public business contact pages |
| `licensed_database` | Licensed B2B database | ✓ | ✓ | ✓ | Licence agreement |
| `contact_api` | Approved partner API | ✓ | ✓ | ✓ | Partner contract |
| `upload` | CRM / spreadsheet upload | — | ✓ | — | First-party export |
| `lead_form` | First-party enquiry form | ✓ | ✓ | — | Visitor consent |

---

## The contract

```python
# backend/app/adapters/base.py
class SourceAdapter(Protocol):
    meta: AdapterMeta

    def collect(self, ctx: CollectionContext) -> Iterator[dict]:
        """Yield raw records until max_records, exhaustion or ctx.should_stop()."""
```

`AdapterMeta` is what the UI and the compliance checks read:

| Field | Purpose |
| --- | --- |
| `key`, `label`, `category`, `description` | Identity and copy in the source picker |
| `supports_live`, `supports_demo`, `default_mode` | What the adapter can do |
| `requires_credentials` | Forces `credential_env` to be set |
| `legal_basis` | Shown to the operator when choosing the adapter |
| `compliance_notes` | Copied into the source record by default |
| `config_fields` | Renders the editor form (`text`, `textarea`, `number`, `url_list`, `select`, `key_value`, `json`) |
| `default_allowed_fields` | Sensible permitted-field defaults |
| `default_attribution`, `default_rate_limit`, `default_min_delay`, `default_max_records` | Defaults for new sources |
| `credential_hint`, `docs_url` | Help text |

`CollectionContext` gives an adapter everything it may use — and nothing more:

| Member | Meaning |
| --- | --- |
| `source` | The SQLAlchemy source record (URL, attribution, licensing…) |
| `config` | The source's `config` dict (already JSON-safe) |
| `allowed_fields` | Fields the operator permitted; do not yield anything outside it |
| `max_records`, `max_requests` | Hard caps from the run |
| `min_delay` | Minimum delay between requests |
| `run_index` | How many times this source has run (demo data varies by run) |
| `db` | Session for read-only lookups (rarely needed) |
| `should_stop()` | Poll often; return promptly when true |
| `wait_if_paused()` | Call between records so pause/resume works |
| `log(level, message)` | Appears in the job event log |
| `record_failure(url=, status_code=, error_type=, message=)` | Register a failed request without aborting the run |

---

## Rules an adapter must follow

1. **Yield only business contact fields** from `ALL_LEAD_FIELDS`. Never yield a prohibited field
   (`PROHIBITED_FIELDS`), never personal/home data.
2. **Identify honestly.** Use `ctx`-provided HTTP helpers (they send `USER_AGENT`), never spoof a
   browser fingerprint to defeat protection, never solve CAPTCHAs, never log in with stolen or
   guessed credentials, never rotate IPs to evade limits.
3. **Respect the allowlist and `robots.txt`.** Live requests must go through
   `assert_live_allowed(url, allowed_domains)` followed by `fetch(url, min_delay=…)` from
   `app/adapters/net.py`; the first raises `ComplianceError` with a human-readable reason, which
   the job runner records and surfaces.
4. **Be polite.** Sleep at least `ctx.min_delay` between requests and honour
   `rate_limit_per_minute`.
5. **Fail in isolation.** A single bad page calls `ctx.record_failure(...)` and continues. Raise
   `AdapterUnavailable` only when the whole source is unusable (auth rejected, host down).
6. **Attribute.** Always set `source_url` on each record (the page or endpoint it came from).
7. **Cap yourself.** Stop at `ctx.max_records` / `ctx.max_requests`, then return.
8. **Demo mode must not touch the network.** Use `run_demo(ctx, per_run=…)`
   (`app/adapters/demo.py`) backed by `fixtures.py`, so the product can be demonstrated and tested
   offline.

Anything that cannot follow these rules does not belong in this repository.

---

## Adding an adapter

### 1. Create the module

`backend/app/adapters/my_partner.py`

```python
from __future__ import annotations

from typing import Iterator

from .base import AdapterMeta, CollectionContext
from .demo import run_demo
from .net import assert_live_allowed, fetch              # honest, robots-aware helpers

import json

META = AdapterMeta(
    key="my_partner",
    label="My partner feed",
    category="Partner API",
    description="Records from the partner's authorized B2B endpoint.",
    supports_live=True,
    supports_demo=True,
    default_mode="demo",
    requires_credentials=True,
    legal_basis="Signed data licence dated 2026-01-15; business contact data only.",
    compliance_notes="Business records only. No personal or sensitive attributes. "
                     "Requests are limited to the contracted endpoint.",
    config_fields=[
        {"name": "endpoint", "label": "Endpoint URL", "type": "text", "required": True},
        {"name": "records_path", "label": "JSON path to records", "type": "text", "default": "data"},
    ],
    default_allowed_fields=["business_name", "phone", "email", "city", "state", "zip_code",
                            "industry", "website", "source_url"],
    default_attribution="My Partner (licensed)",
    default_rate_limit=60,
    default_min_delay=0.5,
    default_max_records=500,
    credential_hint="Set MY_PARTNER_TOKEN in the API server environment.",
)


class MyPartnerAdapter:
    meta = META

    def collect(self, ctx: CollectionContext) -> Iterator[dict]:
        if ctx.source.mode == "demo":
            yield from run_demo(ctx, per_run=min(ctx.max_records, 100))
            return

        url = ctx.config["endpoint"]
        # Raises ComplianceError unless the host is allow-listed and robots.txt permits it.
        assert_live_allowed(url, (ctx.config or {}).get("allowed_domains") or [])
        result = fetch(url, min_delay=ctx.min_delay)   # honest USER_AGENT, timeout, throttle
        payload = json.loads(result.text)
        for index, row in enumerate(payload.get("data", [])):
            if ctx.should_stop() or index >= ctx.max_records:
                return
            if index:
                ctx.wait_if_paused()
            yield {
                "business_name": row.get("company"),
                "phone": row.get("phone"),
                "email": row.get("email"),
                "city": row.get("city"),
                "state": row.get("region"),
                "zip_code": row.get("postcode"),
                "industry": row.get("sector"),
                "website": row.get("site"),
                "source_url": url,
            }


adapter = MyPartnerAdapter()
```

### 2. Register it

```python
# backend/app/adapters/registry.py
from .my_partner import adapter as my_partner_adapter

ADAPTERS = {adapter.meta.key: adapter for adapter in (
    ..., my_partner_adapter,
)}

ADAPTER_ORDER = [..., "my_partner"]
```

### 3. Restart and check

```bash
cd backend && ../.venv/bin/uvicorn app.main:app --reload
curl -s localhost:8000/api/meta/bootstrap | python3 -m json.tool | grep -A2 my_partner
```

The adapter now appears in the source picker with its own form, compliance text and defaults. No
frontend change is needed.

### 4. Test it

- Run it in **demo** mode first; check the records in **Lead database**.
- `POST /api/sources/{id}/test` must report `pass` for all checks.
- Add a unit test in `backend/tests/` that exercises the parsing with a fixture (no network).

---

## How a run executes

```
POST /api/jobs?source_id=3
   │
   ├─ permission (jobs:manage), source enabled, no active run, daily limit, collection_enabled
   ├─ CollectionJob row (queued) + audit entry
   ├─ job_manager.submit(job.id) → background thread
   │     ├─ adapter.collect(ctx) yields raw dicts (demo or live)
   │     │     ├─ per record: ingest_record() → normalise → dedupe → suppression → store + audit
   │     │     ├─ per failure: FailedRequest row (status code, url, reason)
   │     │     └─ ctx.wait_if_paused() / should_stop() honour UI controls
   │     └─ job row updated: records_collected/processed/failed/duplicates/invalid, duration, message
   └─ events written to JobEvent (visible in the job detail dialog)
```

Because ingestion happens per record, a run that is stopped halfway keeps everything collected so
far — and every one of those records is already normalised, deduplicated and attributed.

## Demo dataset

`app/adapters/fixtures.py` holds a deterministic synthetic dataset (business names, industries,
cities, valid NANP phone numbers). `app/adapters/demo.py` turns it into paginated, adapter-shaped
responses, injects a couple of simulated `503`/`429` failures and varies output by `run_index` so
repeat runs are realistic. `backend/app/seed.py` uses the same fixtures to create the 500+ record
demo database.

If you extend the fixtures, keep phone numbers valid (`phonenumbers` rejects the reserved
`555-01xx` pattern in some regions — use exchange 200–999, line 1000–9999).

## Testing adapters without network access

The test suite never makes outbound requests: demo mode is the default for every seeded source and
`assert_live_allowed` refuses non-allowlisted hosts. If you need to test parsing, feed HTML/JSON
strings to your parser functions directly, or add a fixture file under `backend/tests/fixtures/`.

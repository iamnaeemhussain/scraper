# API reference

Interactive docs are generated from the code:

- Swagger UI — `http://localhost:8000/api/docs`
- ReDoc — `http://localhost:8000/api/redoc`
- OpenAPI JSON — `http://localhost:8000/api/openapi.json`

Everything is under `/api`. Requests are authenticated with the session cookie **or** an
`Authorization: Bearer lbk_…` API key (only where noted). Responses are JSON; errors look like
`{"detail": "message"}`.

---

## Authentication

```http
POST /api/auth/login
Content-Type: application/json

{"email": "admin@leadbridge.demo", "password": "LeadBridge#2024"}
```

```http
HTTP/1.1 200 OK
Set-Cookie: leadbridge_session=…; HttpOnly; SameSite=Lax; Path=/
{"user": {"id": 1, "email": "…", "role": "admin", "permissions": {…}}}
```

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | 401 on bad credentials, 429 when locked out |
| POST | `/api/auth/logout` | Clears the cookie |
| GET | `/api/auth/me` | `{"user": {...}}` including permissions |
| POST | `/api/auth/change-password` | `{current_password, new_password}` |

```bash
# keep the cookie in a jar and reuse it
curl -c cookies.txt -X POST http://localhost:8000/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@leadbridge.demo","password":"LeadBridge#2024"}'
curl -b cookies.txt http://localhost:8000/api/dashboard
```

## Bootstrap & health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | Public: status, version, environment, demo flag |
| GET | `/api/meta/bootstrap` | App config + user + adapters + status vocabularies + facets + field lists + limits |
| GET | `/api/meta/engine` | Extraction engine diagnostics (Scrapling availability, robots policy, allowlist) |

The SPA needs exactly one call (`bootstrap`) after login; it contains everything the UI renders.

## Leads

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/leads` | Search + filters + pagination |
| GET | `/api/leads/facets` | Industries, states, cities, status counts |
| GET | `/api/leads/{id}` | Full record + `history`, `duplicates`, `duplicate_of` |
| PATCH | `/api/leads/{id}` | Edit fields, status, assignment, consent |
| DELETE | `/api/leads/{id}` | Admin only; suppresses by default |
| POST | `/api/leads/{id}/notes` | `{note}` |
| POST | `/api/leads/{id}/verify` | `{channel, status, evidence}` |
| POST | `/api/leads/bulk/assign` | `{lead_ids[], agent_id}` |
| POST | `/api/leads/bulk/status` | `{lead_ids[], lead_status}` |

Query parameters for `GET /api/leads`:

```
q, business_name, phone, city, state, zip, industry, source_id,
phone_status, email_status, consent_status, lead_status,
assigned_agent_id (id | "unassigned"), verification (verified|invalid|unverified),
freshness (fresh|aging|stale|expired|unknown), include_duplicates,
sort (created_at|quality_score|business_name|collected_at), direction (asc|desc),
page, page_size
```

```bash
curl -b cookies.txt "http://localhost:8000/api/leads?state=TX&verification=verified&page_size=25"

curl -b cookies.txt -X PATCH http://localhost:8000/api/leads/42 \
     -H 'Content-Type: application/json' \
     -d '{"lead_status":"contacted"}'

curl -b cookies.txt -X POST http://localhost:8000/api/leads/42/verify \
     -H 'Content-Type: application/json' \
     -d '{"channel":"phone","status":"verified_owner","evidence":"Called 14 Oct, owner answered"}'
```

Setting `lead_status` to `do_not_contact` adds suppression entries and sets consent to `denied`.
Editing a phone number resets its verification status.

## Sources

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/sources` | Records + `meta` + `stats` + `live_ready` |
| POST | `/api/sources` | Create (admin/manager, or key scope `sources:manage`) |
| GET/PUT | `/api/sources/{id}` | Read / update |
| PATCH | `/api/sources/{id}/enabled?enabled=true\|false` | Toggle |
| DELETE | `/api/sources/{id}` | Refused (409) while records still reference it |
| POST | `/api/sources/{id}/test` | Readiness checks (`check`, `status`, `detail`) + engine info |
| POST | `/api/sources/{id}/robots-check` | Fetch and evaluate `robots.txt` |
| GET | `/api/sources/{id}/fields` | Fields actually present in collected records |

Creating a source:

```json
{
  "name": "Regional Business Directory",
  "adapter": "business_directory",
  "url": "https://directory.example.com/",
  "mode": "demo",
  "config": {"listing_urls": ["https://directory.example.com/b?page={page}"], "max_pages": 3},
  "allowed_fields": ["business_name", "phone", "email", "city", "state", "zip_code"],
  "rate_limit_per_minute": 15,
  "min_delay_seconds": 2.0,
  "max_records_per_run": 120,
  "max_requests_per_run": 20,
  "attribution": "Regional Business Directory (authorized partner)",
  "licensing_status": "public_website",
  "consent_default": "unknown"
}
```

`licensed_database` also requires `credential_env` naming an environment variable on the API host.
Prohibited field names are rejected with `400`.

## Collection jobs

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/jobs` | `?status=…&page_size=…` |
| POST | `/api/jobs?source_id=1` | Start: `{"max_records": 100, "mode_override": "live"}` |
| GET | `/api/jobs/{id}` | Metrics, events, source name, control flags |
| POST | `/api/jobs/{id}/pause` \| `/resume` \| `/stop` | 409 when the job is not in a suitable state |
| GET | `/api/jobs/{id}/failures` | Failed requests with status code, URL, message |
| GET | `/api/jobs/{id}/records` | Leads produced by that source |
| GET | `/api/jobs/failures/all` | Cross-job failure register |
| GET | `/api/jobs/summary?days=30` | Totals, `by_status`, `avg_duration_ms` |

Jobs run inside the API process. Starting a run twice for the same source is refused (409), as is
starting one while the global collection switch is off.

## Imports

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/imports/template?format=csv\|xlsx` | Download the empty template |
| POST | `/api/imports/preview` | multipart `file` → mapping, unmapped/prohibited headers, sample rows |
| POST | `/api/imports` | multipart `file`, `attestation` (≥15 chars), optional `source_id`, `consent_override`, `dry_run` |
| GET | `/api/imports` | Batch history |
| GET | `/api/imports/{id}` | One batch with row-level errors |

```bash
curl -b cookies.txt -F "file=@leads.csv" http://localhost:8000/api/imports/preview

curl -b cookies.txt \
     -F "file=@leads.csv" \
     -F "attestation=These businesses requested a quote at the trade fair." \
     -F "dry_run=false" \
     http://localhost:8000/api/imports
```

## Exports

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/exports/preview` | `{filters, require_consent?, exclude_invalid?, purpose?}` → eligible, blocked, reasons, sample, policy |
| POST | `/api/exports` | Same body + `format: "csv" \| "xlsx"` → file stream |
| GET | `/api/exports/history` | Who exported what, when, how many rows, how many blocked |

Response headers on a download: `Content-Disposition`, `X-Export-Rows`, `X-Export-Blocked`.
A request where every record is blocked returns `409` with the count.

```bash
curl -b cookies.txt -X POST http://localhost:8000/api/exports \
     -H 'Content-Type: application/json' \
     -d '{"filters":{"state":"TX"},"format":"csv","purpose":"Renewal campaign"}' \
     -o leads.csv -D -
```

Filter object: `q, city, state, zip, industry, source_id, lead_status[], consent_status[],
phone_status[], email_status[], verification, assigned_agent_id, freshness, include_duplicates`.

## Dashboard, reports, agents, settings

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/dashboard` | Cards, charts, recent jobs/leads, viewer info |
| GET | `/api/dashboard/quality` | Data-quality report |
| GET | `/api/reports/summary?days=30` | Everything Reports needs |
| GET | `/api/reports/{collection\|sources\|compliance\|audit\|jobs}.csv` | CSV downloads |
| GET | `/api/agents` | Team + per-agent stats + totals |
| POST | `/api/agents` | Create user `{email, full_name, password, role, team, daily_quota}` |
| PATCH | `/api/agents/{id}` | Update name/team/quota/role/password |
| POST | `/api/agents/{id}/activate` \| `/deactivate` | Enable/disable sign-in |
| GET | `/api/settings` | Org policy + environment summary |
| PUT | `/api/settings` | Admin only |
| GET/POST/DELETE | `/api/settings/suppression[/{id}]` | Suppression list |
| GET/POST/DELETE | `/api/settings/api-keys[/{id}]` | API keys — plaintext returned once, on create |
| GET | `/api/settings/audit` | Activity log with `action` filter and pagination |
| GET | `/api/settings/retention/preview` | What a purge would remove |
| POST | `/api/settings/retention/purge` | Run it (backup first) |
| POST | `/api/settings/backup` | Download a SQLite snapshot |
| GET | `/api/settings/data-inventory` | Row counts, database size, env vars present |

## Public lead form

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/public/lead-form/{token}` | Field schema + consent text (no auth) |
| POST | `/api/public/lead-form/{token}` | `{business_name, …, consent_granted, website (honeypot)}` |

Rate limited per IP, honeypot-aware, and refuses submissions without consent.

---

## API keys for the extraction worker

Splitting collection onto its own machine? Give that machine a scoped key instead of a password.

1. **Settings → API keys → New key**, scopes `jobs:manage` + `sources:manage`.
2. Copy the `lbk_…` value — it is shown once; only a hash is stored.
3. Use it as a bearer token:

```bash
export LB_KEY="lbk_…"
curl -H "Authorization: Bearer $LB_KEY" "$API/api/jobs?source_id=3"
curl -H "Authorization: Bearer $LB_KEY" -X POST "$API/api/jobs?source_id=3" \
     -H 'Content-Type: application/json' -d '{"max_records":200}'
curl -H "Authorization: Bearer $LB_KEY" "$API/api/jobs/summary?days=7"
```

A key acts as a *service principal*: it has only the scopes you granted, no user session, no access
to leads, settings, audit or the UI data. Revoke it in the same screen; revocation takes effect
immediately.

---

## Status codes used

| Code | Meaning here |
| --- | --- |
| 200 / 201 | Success |
| 204 | Deleted (some endpoints return `{"ok": true}`) |
| 400 | Business-rule violation (bad phone, prohibited field, missing attestation…) |
| 401 | No/invalid session or API key |
| 403 | Authenticated but not permitted (RBAC, agent scope, policy) |
| 404 | Unknown record or token |
| 409 | Conflict (job already running, source still has records, all export rows blocked) |
| 413 | Upload larger than 12 MB |
| 422 | Request body failed validation (details in `errors`) |
| 429 | Rate limited (`Retry-After` header) |
| 500 | Unexpected error (generic message unless `DEBUG=true`) |

## Conventions

- Datetimes are ISO-8601 UTC (`2026-10-31T09:15:00.123456`).
- Pagination: `page`, `page_size` (max 200); responses include `total`, `page`, `page_size`,
  `pages` where relevant.
- `Cache-Control: no-store` on all API responses; `X-Response-Time-ms` on every response.
- Bulk endpoints accept at most 1000 ids per call.

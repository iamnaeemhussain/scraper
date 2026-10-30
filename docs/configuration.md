# Configuration

LeadBridge is configured with environment variables. You can put them in a `.env` file at the
repository root (copy `.env.example`) or export them in the shell / your hosting provider's
dashboard. Real environment variables always win over `.env`.

After changing a variable, **restart the API** — settings are read once at start-up.

---

## Core

| Variable | Default | What it does |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `development`, `test` or `production`. `production` enables HSTS, disables demo seeding and hides debug detail from errors. |
| `DEBUG` | `false` | Verbose logging and full error messages. Never enable in production. |
| `APP_NAME` | `LeadBridge` | Title shown in the UI and API docs. |

## Database

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///backend/data/leadbridge.db` | SQLAlchemy URL. Use `postgresql+psycopg://user:pass@host:5432/leadbridge` for PostgreSQL. |
| `DATA_RETENTION_DAYS` | `365` | Default lead retention (overridden by the organisation setting). |
| `AUDIT_RETENTION_DAYS` | `730` | Default audit retention. |

SQLite is the zero-cost default: one file, WAL mode, foreign keys on, 30 s busy timeout. It is
fine for a small team on a single server. Switch to PostgreSQL when you need concurrent writers,
point-in-time recovery, or more than one API instance.

```bash
# migration outline
PGPASSWORD=… pg_dump "$OLD_SQLITE_EXPORT"   # not needed; see docs/operations.md
createdb leadbridge
export DATABASE_URL=postgresql+psycopg://leadbridge:secret@localhost:5432/leadbridge
python cli.py init-db
python cli.py create-admin
```

There is no destructive auto-migration: `Base.metadata.create_all()` creates missing tables at
start-up. For schema changes between versions, back up first (see [operations.md](operations.md)).

## Authentication and sessions

| Variable | Default | What it does |
| --- | --- | --- |
| `SECRET_KEY` | dev placeholder | Signs the JWT session cookie. **Must** be a long random string in production: `python -c "import secrets;print(secrets.token_urlsafe(48))"`. Changing it signs everyone out. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720` | Session lifetime (12 h). |
| `COOKIE_NAME` | `leadbridge_session` | Cookie name. |
| `COOKIE_SECURE` | `false` | Set `true` when the app is served over HTTPS; the cookie then requires TLS. |
| `PASSWORD_MIN_LENGTH` | `10` | Enforced on create/change/reset. Passwords also need a letter and a number. |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failed sign-ins before a temporary lockout. |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Lockout duration. |
| `CORS_ORIGINS` | dev origins | Comma-separated list of browser origins allowed to call the API, e.g. `https://leads.example.com`. Required when the SPA is hosted separately from the API. |

Sessions are **httpOnly, SameSite=Lax cookies**; the token is never exposed to JavaScript and is
not stored in `localStorage`.

## Extraction

| Variable | Default | What it does |
| --- | --- | --- |
| `FETCH_ENGINE` | `auto` | `scrapling` (full engine), `httpx` (lightweight) or `auto` (Scrapling if importable). |
| `USER_AGENT` | `LeadBridgeBot/1.0 (+compliance contact: …)` | Sent on every request. Keep it honest and put a real compliance contact in it. |
| `RESPECT_ROBOTS_TXT` | `true` | Refuse a live request when `robots.txt` disallows the path. Turning this off is strongly discouraged. |
| `HTTP_TIMEOUT_SECONDS` | `15` | Per-request timeout. |
| `ALLOWED_LIVE_DOMAINS` | empty | Comma-separated hosts (`directory.example.com,www.partner.example`). **Live collection only works for these hosts.** Empty = live collection disabled. |
| `DEFAULT_MIN_DELAY_SECONDS` | `1.5` | Fallback politeness delay between requests. |
| `MAX_PAGES_PER_RUN` | `25` | Hard cap on pagination. |
| `JOB_WORKERS` | `2` | In-process worker threads for collection jobs. |

Live collection is allowed only when **all** of these are true:

1. The source is in `live` mode and enabled.
2. The host is in `ALLOWED_LIVE_DOMAINS`.
3. The host is in the source's own `allowed_domains` config (if that list is set).
4. `robots.txt` permits the path.
5. Any required credential environment variable is present.

If any check fails the run stops with a clear `ComplianceError` message in the job log, and the
reason appears in the source's *Test* dialog before you even start.

## Rate limiting

| Variable | Default | What it does |
| --- | --- | --- |
| `RATE_LIMIT_PER_MINUTE` | `240` | Per-IP limit for authenticated API calls. |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | `12` | Per-IP limit for sign-in attempts. |
| `PUBLIC_FORM_RATE_LIMIT_PER_MINUTE` | `20` | Per-IP limit for the public lead form. |

Limits are in-process (a sliding window per IP). Behind a reverse proxy, set `X-Forwarded-For`
correctly (Caddy and nginx examples in [deploy/](../deploy/) do) — the app reads the left-most
address. For multi-instance deployments put rate limiting in front (Cloudflare, nginx
`limit_req`, or Redis-backed middleware).

## Demo data

| Variable | Default | What it does |
| --- | --- | --- |
| `SEED_DEMO_DATA` | `true` | Seeds demo users, sources, jobs, 500+ leads and suppression entries on first start. Ignored when `ENVIRONMENT=production`. |
| `DEMO_MODE_ENABLED` | `true` | Adds the "demo mode" badge and lets the UI explain that adapters use a bundled dataset. |

## Admin bootstrap

When no admin exists (typical on a fresh production install) the app creates one:

| Variable | Default | Notes |
| --- | --- | --- |
| `ADMIN_EMAIL` | `admin@leadbridge.demo` | Change before first start, or reset later with `cli.py create-admin` |
| `ADMIN_PASSWORD` | `LeadBridge#2024` | **Set this** (or change the password immediately after signing in) |

Better: leave `SEED_DEMO_DATA=false`, start the API, then run
`python cli.py create-admin --email you@example.com` and delete any bootstrap account you do not
want.

## Licensed adapter credentials

Licensed sources never store the secret itself. The source record stores a **name** of an
environment variable, and the adapter reads the value from the server process:

```bash
# on the API server only — never in the browser, never in git
export LICENSED_DB_API_KEY="…"
export PARTNER_CONTACT_API_KEY="…"
```

In the source editor, set *Credential environment variable* to `LICENSED_DB_API_KEY`. The UI shows
whether the variable is present, not its value.

## Organisation settings (in the app, not env)

These live in the database and are editable at **Settings → Organisation** by an admin:

| Setting | Effect |
| --- | --- |
| `org_name` | Shown in reports and page titles |
| `export_require_consent` | Only records with granted consent may be exported |
| `export_exclude_invalid` | Records marked invalid/bounced are always excluded |
| `allow_agent_export` | Agents may export their own assigned leads |
| `collection_enabled` | Global pause for all collection runs |
| `daily_collection_limit` | Hard cap on records collected per rolling 24 h |
| `data_retention_days` / `audit_retention_days` | Used by the retention purge (UI and CLI) |
| `notes` | Free-text internal notes (DPO contact, licence renewals) |

## Adapter configuration fields

Each adapter declares its own `config_fields`; the source editor renders them automatically.

| Adapter | Key config |
| --- | --- |
| `business_directory` | `listing_urls` (with `{page}`), `max_pages`, `item_selector`, `field_selectors` |
| `company_website` | `start_urls`, `contact_paths`, `max_pages`, `field_selectors` |
| `licensed_database` | `endpoint`, `records_path`, `credential_env`, `page_size` |
| `contact_api` | `endpoint`, `credential_env`, `records_path`, `query_params` |
| `upload` | `notes` (records arrive through CSV/XLSX import) |
| `lead_form` | `form_token`, `consent_text`, `success_message` |

All adapters also share: permitted fields (`allowed_fields`), `rate_limit_per_minute`,
`min_delay_seconds`, `max_records_per_run`, `max_requests_per_run`, attribution text, licensing
status, default consent status and compliance notes.

## Frontend configuration

The SPA needs no API keys. It calls same-origin `/api/...`.

| Where | Setting | Meaning |
| --- | --- | --- |
| `frontend/vite.config.js` | `server.proxy['/api']` | Dev proxy target (default `http://127.0.0.1:8000`) |
| `VITE_API_BASE_URL` | build-time env | Only if the API is on another origin; the API's `CORS_ORIGINS` must include the SPA origin |
| `frontend/src/styles/*` | design tokens | Colours, radii and typography live in `base.css` |

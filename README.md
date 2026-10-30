# LeadBridge

A self-hosted web application for collecting, cleaning, verifying, organising and exporting
**authorized business contact leads** for a call centre.

It is deliberately conservative: it only collects *business* contact data from sources you are
allowed to use, it never invents a "verified" status, and it refuses to export anyone who has
opted out. Guardrails like that are enforced in the code, not just in this document.

```
React 18 + Vite  ──HTTP──▶  FastAPI (Python 3.11)  ──▶  SQLite or PostgreSQL
                                   │
                                   └─▶ Scrapling / httpx+robots.txt (extraction engine)
```

---

## Contents

- [What it does](#what-it-does)
- [Screens](#screens)
- [Quick start (10 minutes)](#quick-start-10-minutes)
- [Five minute tour](#five-minute-tour)
- [Demo accounts](#demo-accounts)
- [How the pieces fit together](#how-the-pieces-fit-together)
- [Project layout](#project-layout)
- [Configuration](#configuration)
- [Testing](#testing)
- [Deployment](#deployment)
- [Compliance rules built into the product](#compliance-rules-built-into-the-product)
- [Troubleshooting](#troubleshooting)
- [Documentation index](#documentation-index)

---

## What it does

**Collect**
- Pluggable **source adapters**, each with a name, source URL, extraction config, permitted
  fields, request limits, error handling and attribution:
  `business_directory`, `company_website`, `licensed_database`, `contact_api`, `upload`, `lead_form`.
- Add / edit / enable / disable sources from the UI, test the connection, and see why a source is
  or is not ready for live collection.
- Start / pause / resume / stop collection runs, with per-run record caps, rate limits, an event
  log, and a failed-request register (HTTP status, URL, reason) that never aborts a whole run.
- Demo mode: every adapter ships with a synthetic dataset so the entire product works offline
  before you point it at a real, permitted source.

**Process**
- Phone normalisation to E.164 (`phonenumbers`), email syntax + placeholder-domain checks,
  address / city / state / ZIP normalisation, missing-field detection, freshness scoring and a
  quality score.
- Duplicate detection with a deterministic SHA-256 fingerprint (phone → email → name+ZIP → name)
  and `duplicate_of` links, so re-runs merge instead of inflating the database.
- Each record stores its source, source URL, attribution, collection timestamp and licensing
  status, plus a per-record audit history of every change.
- A phone number that merely *appeared on a website* is at most `format_valid`. `verified_owner`
  requires recorded human or provider evidence.

**Organise**
- Lead database searchable by business name, phone, city or ZIP, with filters for industry,
  source, verification status, consent, lead status, assignment and freshness.
- Assign leads to agents (single or bulk), add notes, change status, mark Do Not Contact.
- Role-based access: `admin`, `manager`, `agent` — enforced server-side on every request.

**Export**
- CSV and Excel exports with a compliance preview: how many records are eligible and exactly why
  the rest were blocked (Do Not Contact, consent withdrawn, suppression list, invalid contact,
  no contact channel).
- CSV/Excel **imports** with column mapping preview, prohibited-column blocking, a mandatory
  legal-basis attestation, dry-run mode and per-row error reporting.

**Measure**
- Dashboard cards (Total, New, Verified business contacts, Duplicates, Invalid, Assigned, Do Not
  Contact) and charts for daily collection, location, industry, source and agent performance.
- Compliance reports: collection trend, source attribution, consent/verification register, audit
  history and job log — all downloadable as CSV.

---

## Screens

| Route | What you get |
| --- | --- |
| `/login` | Split-screen sign-in with demo credential helper |
| `/` | KPI cards, collection trend, industry/location mix, consent mix, source and agent performance, recent activity |
| `/leads` | Filter panel, dense table with verification dots, bulk actions, lead drawer (fields, notes, audit timeline, duplicates), verification-evidence dialog, compliant export |
| `/sources` | Source cards, adapter picker editor (fields, limits, attribution, credentials), connection test, collect, delete |
| `/jobs` | Stats strip, run table with pause/resume/stop, progress, per-job event log and failures, failed-request register |
| `/agents` | Team cards with quotas, create/edit users, agent detail with activity |
| `/imports` | Drag-and-drop import with mapping preview and attestation, compliant export panel, import/export history |
| `/reports` | Compliance reporting and CSV downloads |
| `/settings` | Organisation policy, account, suppression list, API keys, audit log, data & backups, compliance policy |

---

## Quick start (10 minutes)

### 0. What you need

| Tool | Version | Check |
| --- | --- | --- |
| Python | 3.11 or 3.12 | `python3 --version` |
| Node.js | 18 or newer | `node --version` |
| npm | ships with Node | `npm --version` |

On Windows, use **PowerShell** and replace `python3` with `python`. Everything below works the
same on macOS, Linux and Windows.

### 1. Get the code

```bash
git clone <your-fork-or-repo-url> scraper
cd scraper
```

### 2. Create a virtual environment and install the backend

```bash
python3 -m venv .venv

# macOS / Linux
source .venv/bin/activate
# Windows (PowerShell)
# .venv\Scripts\Activate.ps1

pip install --upgrade pip
pip install -r backend/requirements.txt
```

Optional extras:

```bash
pip install -r backend/requirements-scraper.txt   # Scrapling + patchright browser engine
pip install -r backend/requirements-dev.txt          # pytest, for the test suite
pip install -r backend/requirements-postgres.txt     # PostgreSQL driver
```

> Scrapling is optional. Without it the app uses `httpx` and the demo dataset; nothing breaks.

### 3. Configure (optional on a laptop)

```bash
cp .env.example .env        # Windows: copy .env.example .env
```

The defaults are fine for local development. Before going live you **must** set a real
`SECRET_KEY`, `ENVIRONMENT=production`, `COOKIE_SECURE=true` and add your permitted
`ALLOWED_LIVE_DOMAINS`. See [docs/configuration.md](docs/configuration.md).

### 4. Start the API

```bash
cd backend
../.venv/bin/uvicorn app.main:app --reload --port 8000
```

On Windows: `..\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000`

The first start creates the database, seeds the demo dataset (500+ leads, 6 sources, 12 runs,
agents, suppression entries) and prints `LeadBridge ready`. Check it:

```bash
curl http://localhost:8000/api/health
# {"status":"ok","app":"LeadBridge",...}
```

### 5. Start the frontend (second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and sign in with a demo account below.

### Or: one command for both

```bash
make install   # Python venv + node modules
make api       # terminal 1
make web       # terminal 2
```

`make help` lists the rest (`make test`, `make build`, `make backup`, `make seed`).

### Or: single service (no Vite at all)

```bash
cd frontend && npm run build && cd ..
cd backend && ../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API serves the built SPA at `http://localhost:8000/`, so one process and one port is enough
for a small team. See [docs/deployment.md](docs/deployment.md).

---

## Five minute tour

1. **Dashboard** — the demo dataset is already populated. Notice *Verified business contacts* is
   much smaller than *Total*: only records with recorded owner/provider evidence count.
2. **Data sources** — press **Test** on any card to see the readiness checks (adapter, licensing,
   credentials, allowlist, robots policy). Press **Collect** to run a demo extraction.
3. **Collection jobs** — watch the run, open it to see the event log and the simulated `503`/`429`
   failures. Start another run on the same source and watch duplicates get detected.
4. **Lead database** — filter by state, open a lead, add a note, record verification evidence,
   then set a status to **Do Not Contact** and watch consent flip to `denied`.
5. **Imports & exports** — download the CSV template, import a couple of rows (you must write a
   ≥15 character legal-basis attestation), then open **Export** and look at the compliance preview
   explaining why some rows are blocked.
6. **Reports** — download the compliance register and the source attribution report.
7. **Settings** — the suppression list, API keys for the extraction worker, the audit log, and
   retention/backup tools.

---

## Demo accounts

The seed data only loads when `SEED_DEMO_DATA=true` and `ENVIRONMENT` is not `production`.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@leadbridge.demo` | `LeadBridge#2024` |
| Manager | `manager@leadbridge.demo` | `LeadBridge#2024` |
| Agent | `maya@leadbridge.demo` | `LeadBridge#2024` |
| Agents | `daniel@`, `priya@`, `tom@`, `sofia@leadbridge.demo` | `LeadBridge#2024` |

Change or delete these before exposing the app to a network. In production only
`admin@leadbridge.demo` is created (with the same demo password) when no users exist — sign in
and change the password immediately, or set `SEED_DEMO_DATA=false` and create your own admin with
`python cli.py create-admin` (run from `backend/`).

---

## How the pieces fit together

```
               ┌──────────────────────────────────────────────────────────┐
 browser ─────▶│ FastAPI                                                                  │
 (React SPA)   │  /api/auth      session cookie (httpOnly, SameSite=Lax)                 │
               │  /api/leads     search · filters · notes · status · verification         │
               │  /api/sources   adapter config, allowed fields, rate limits, lifecycle   │
               │  /api/jobs      start/pause/stop, events, failures, records              │
               │  /api/imports   CSV/XLSX mapping, attestation, dry run                   │
               │  /api/exports   policy gate → CSV/XLSX + blocked-reason report           │
               │  /api/reports   compliance CSVs      /api/settings  policy, keys, audit  │
               │                                                                          │
               │  services: normalization · ingest · jobs · suppression · analytics       │
               │  adapters: registry → business_directory | company_website | licensed…   │
               └───────────────┬──────────────────────────────────────────────────────────┘
                               │  authenticated job run (in-process worker)
                               ▼
                Scrapling / httpx  →  allowed domain + robots.txt  →  parse  →  normalise
                               │
                               ▼
                        dedupe → suppression → store + audit
```

Key behaviours worth knowing:

- **Live collection is opt-in per domain.** `ALLOWED_LIVE_DOMAINS` plus each source's
  `allowed_domains` must both allow the host, and `robots.txt` must permit the path. With an
  empty allowlist every live run fails with a clear compliance message instead of silently
  scraping.
- **Adapters are isolated.** A failing request is recorded in `failed_requests` and the run
  continues; one broken site never loses the records collected before it.
- **Everything is attributed.** Each lead stores its source name, source URL, attribution string
  and licensing status. Imports create a `CRM Export Upload` batch record.
- **Exports are gated.** The export builder applies Do Not Contact, consent, suppression and
  invalid-contact rules *after* your filters, and reports what it removed.
- **Nothing secret reaches the browser.** The SPA only receives permissions and status
  vocabularies; adapter credentials live in server environment variables referenced by name.

---

## Project layout

```
backend/
  app/
    main.py              FastAPI app, middleware, SPA mount
    config.py            settings from environment / .env
    database.py          engine, session, SQLite pragmas
    models.py            SQLAlchemy models (leads, sources, jobs, audits, keys…)
    schemas.py           Pydantic request/response models
    security.py          password hashing, JWT cookies, RBAC, rate limiting, audit
    deps.py              auth dependencies, pagination, permission gates
    seed.py              demo dataset + admin bootstrap
    adapters/            one module per source type + registry & compliance helpers
    services/            normalization, ingest, jobs, suppression, analytics, import/export
    routers/             HTTP layer (auth, leads, sources, jobs, imports, exports, …)
  tests/                 pytest suite (no network required)
  requirements*.txt
frontend/
  src/                   React app: api client, auth context, UI kit, charts, pages
  scripts/               headless smoke + interaction tests (jsdom)
docs/                    installation, configuration, deployment, security, compliance, API
deploy/                  Dockerfile, compose, Caddy/nginx, systemd, Cloudflare notes, backups
```

---

## Configuration

All settings are environment variables (or a `.env` file at the repository root). The essentials:

| Variable | Default | Notes |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `production` enables HSTS, disables demo seeding |
| `SECRET_KEY` | dev placeholder | **Change in production** — signs session cookies |
| `DATABASE_URL` | SQLite file | `postgresql+psycopg://user:pass@host/db` for PostgreSQL |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `CORS_ORIGINS` | localhost dev origins | Comma-separated, e.g. `https://leads.example.com` |
| `ALLOWED_LIVE_DOMAINS` | empty | Comma-separated hosts allowed for live extraction |
| `FETCH_ENGINE` | `auto` | `scrapling`, `httpx` or `auto` |
| `RATE_LIMIT_PER_MINUTE` | `240` | Per-IP API limit |
| `SEED_DEMO_DATA` | `true` | Never seeds when `ENVIRONMENT=production` |

Full reference: [docs/configuration.md](docs/configuration.md).

---

## Testing

```bash
# backend — 119 tests, no network access required
cd backend && ../.venv/bin/python -m pytest -q

# frontend — production build plus a headless render of every route
cd frontend && npm run build && npm run smoke

# interactive checks (modals, drawers, tabs) against a running dev server
cd frontend && npm run smoke:ui
```

The backend suite uses a temporary SQLite database, so it never touches your development data.
It covers authentication and RBAC, lead editing and consent rules, source lifecycle and
compliance validation, job execution and failure isolation, imports/exports including
suppression enforcement, retention/backups and the public lead form.

---

## Deployment

Short version: **the extraction engine is Python — host it on a normal server.** Cloudflare Pages
can serve the static frontend, and a Cloudflare Worker can proxy authenticated API calls, but the
Scrapling runtime must not be squeezed into Workers.

- [docs/deployment.md](docs/deployment.md) — Cloudflare Pages + Worker + Python engine (Fly.io /
  Render / VPS), Caddy or nginx TLS reverse proxy, systemd, Docker Compose, backups, upgrades.
- [deploy/](deploy/) — ready-to-edit `Dockerfile`, `docker-compose.yml`, `Caddyfile`,
  `nginx.conf`, `leadbridge.service`, `cloudflare/` worker, backup script.

Minimum production checklist:

1. `ENVIRONMENT=production`, strong `SECRET_KEY`, `COOKIE_SECURE=true`.
2. HTTPS terminated in front of the API (Caddy, nginx, Cloudflare, or the platform's proxy).
3. `SEED_DEMO_DATA=false`; sign in as admin and change the password immediately.
4. `ALLOWED_LIVE_DOMAINS` limited to domains you are permitted to collect from.
5. A nightly backup of the database (`make backup` or `deploy/backup.sh`) stored off the server.

---

## Compliance rules built into the product

These are code paths, not policies on a wiki page:

- Only **business** contact fields are collectable. Home addresses, ages, SSNs, personal mobiles,
  health/biometric data and other sensitive attributes are rejected in adapter field config,
  import column mapping and the public form.
- No CAPTCHA solving, login bypass, paywall circumvention, rate-limit evasion or anti-bot
  trickery. The crawler identifies itself honestly and honours `robots.txt`.
- Website discovery never yields `verified_owner`. Verification requires recorded evidence
  ("called the shop, owner answered").
- Do Not Contact and withdrawn consent automatically create suppression entries.
- Nothing on the suppression list, DNC, or consent-denied status can be exported, regardless of
  filters.
- Every collection, edit, verification, export, import and setting change is written to an audit
  log with actor, IP and timestamp.

Read [docs/compliance.md](docs/compliance.md) before connecting a live source. This project is a
tool, not legal advice.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Address already in use` | Port 8000 or 5173 busy — stop the other process or pass `--port 8010` / `strictPort: false` |
| Frontend shows *You do not have access* | Your role lacks the permission — sign in as admin (`admin@leadbridge.demo`) |
| `401 Not authenticated` on every call | Cookies blocked or `COOKIE_SECURE=true` on plain HTTP. Set `COOKIE_SECURE=false` locally |
| Live run fails with *domain not on allowlist* | Add the host to `ALLOWED_LIVE_DOMAINS` **and** the source's allowed domains |
| Live run fails with *robots.txt disallows* | The site forbids automated collection at that path — pick another permitted source |
| `scrapling` import error | `pip install -r backend/requirements-scraper.txt` or set `FETCH_ENGINE=httpx` |
| Import preview says *No recognised columns* | Use the downloaded template; check the header row |
| Export says *No leads passed the compliance checks* | Expected: the policy blocked every row. Open the preview to see why |
| `database is locked` | Another process holds the SQLite file (WAL). Stop the second process or move to PostgreSQL |
| Seed data did not appear | `SEED_DEMO_DATA=true` and `ENVIRONMENT` not `production`; run `make seed` |

---

## Documentation index

| Document | What it covers |
| --- | --- |
| [docs/installation.md](docs/installation.md) | Step-by-step install on macOS, Linux, Windows and Docker |
| [docs/configuration.md](docs/configuration.md) | Every environment variable and adapter setting |
| [docs/deployment.md](docs/deployment.md) | Cloudflare Pages + Worker + Python engine, VPS, Docker, TLS, backups, upgrades |
| [docs/security.md](docs/security.md) | Auth model, RBAC matrix, rate limits, audit, retention, hardening checklist |
| [docs/compliance.md](docs/compliance.md) | What may be collected, verification rules, consent and suppression workflows |
| [docs/api.md](docs/api.md) | Endpoint reference with examples and the worker/API-key flow |
| [docs/adapters.md](docs/adapters.md) | Adapter contract and how to add a new authorized source |
| [docs/operations.md](docs/operations.md) | Runbook: stuck jobs, restores, retention, suppression, incident response |

---

## License

Released under the MIT License — see `LICENSE`. Use it for legitimate, permitted business-contact
collection; the authors accept no liability for how you configure your sources.

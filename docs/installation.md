# Installation

Beginner-friendly instructions for running LeadBridge on your own machine. No prior Docker,
Cloudflare or Python packaging experience is assumed.

There are three ways to run it:

| Option | Best for | Time |
| --- | --- | --- |
| [A. Local development](#option-a--local-development-two-terminals) | Trying it out, editing code | ~10 min |
| [B. Single service](#option-b--single-service-one-port) | A small office server | ~10 min |
| [C. Docker Compose](#option-c--docker-compose) | A server you want to keep tidy | ~5 min |

---

## Before you begin

You need:

- **Python 3.11 or 3.12** — check with `python3 --version`. On Windows use `python --version`.
- **Node.js 18+ and npm** — check with `node --version`.
- Git (to clone the repository).
- About 300 MB of disk space for dependencies.

Nothing else. No database server is required: SQLite is a single file.

> Windows notes: use PowerShell, replace `python3` with `python`, and activate the environment with
> `.venv\Scripts\Activate.ps1` (if PowerShell blocks scripts, run
> `Set-ExecutionPolicy -Scope Process RemoteSigned` first).

---

## Option A — local development (two terminals)

### 1. Clone and enter the project

```bash
git clone <your-repo-url> scraper
cd scraper
```

### 2. Create a virtual environment

A virtual environment keeps this project's Python packages separate from your system Python.

```bash
python3 -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\Activate.ps1       # Windows PowerShell
```

Your prompt should now start with `(.venv)`.

### 3. Install the backend dependencies

```bash
pip install --upgrade pip
pip install -r backend/requirements.txt
```

Optional, but recommended:

```bash
pip install -r backend/requirements-dev.txt        # pytest (test suite)
pip install -r backend/requirements-scraper.txt  # Scrapling live extraction engine
pip install -r backend/requirements-postgres.txt   # only if you will use PostgreSQL
```

If the Scrapling install fails on your machine (it pulls browser tooling), skip it — the app falls
back to `httpx` and the demo dataset. You can add it later.

### 4. Create your configuration file

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

The defaults work on a laptop. You only *must* edit it before production (see
[configuration.md](configuration.md)).

### 5. Start the API (terminal 1)

```bash
cd backend
../.venv/bin/uvicorn app.main:app --reload --port 8000
```

Windows: `..\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000`

You should see:

```
INFO leadbridge Demo data seeded: {'seeded': True, 'users': 7, 'sources': 6, 'leads': 500, ...}
INFO leadbridge LeadBridge ready · env=development · engine=auto
INFO:     Uvicorn running on http://127.0.0.1:8000
```

Verify in a browser or with curl:

```bash
curl http://localhost:8000/api/health
```

### 6. Start the frontend (terminal 2)

Open a **new** terminal window (leave the API running), then:

```bash
cd scraper/frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

Vite proxies `/api` to `http://127.0.0.1:8000`, so there is only one origin as far as the browser
is concerned — no CORS headaches and cookies just work.

### 7. Sign in

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@leadbridge.demo` | `LeadBridge#2024` |
| Manager | `manager@leadbridge.demo` | `LeadBridge#2024` |
| Agent | `maya@leadbridge.demo` | `LeadBridge#2024` |

### 8. Stop everything

Press `Ctrl+C` in each terminal. Deactivate the environment with `deactivate`.

---

## Option B — single service (one port)

Build the frontend once, and the API serves it from the same process. Good for a small office
server.

```bash
cd frontend && npm ci && npm run build && cd ..
cd backend && ../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000**. The React bundle is served from `frontend/dist`, and unknown
routes fall back to `index.html` so client-side routing works.

To update later: `git pull`, `cd frontend && npm run build`, restart the API.

---

## Option C — Docker Compose

```bash
cp .env.example .env
# edit .env: set a real SECRET_KEY, ENVIRONMENT=production, COOKIE_SECURE=true
docker compose -f deploy/docker-compose.yml up -d --build
```

Open **http://localhost:8000**. Lead data lives in the `leadbridge-data` Docker volume; back it up
with `deploy/backup.sh` (see [deployment.md](deployment.md)).

Useful commands:

```bash
docker compose -f deploy/docker-compose.yml logs -f        # follow logs
docker compose -f deploy/docker-compose.yml restart
docker compose -f deploy/docker-compose.yml down            # stop (keeps the volume)
```

---

## Useful commands

From the repository root, if you have `make`:

```bash
make help        # list every task
make install     # python venv + node modules
make api         # API with auto-reload
make web         # frontend dev server
make test        # backend test suite
make build       # production frontend bundle
make backup      # timestamped database snapshot into ./backups
make seed        # wipe and re-seed the demo database (destructive)
```

Without `make`, use the equivalent commands from options A and B.

### Backend CLI

Run these from `backend/`:

```bash
../.venv/bin/python cli.py status            # counts + configuration overview
../.venv/bin/python cli.py create-admin      # create or promote an admin (prompts for a password)
../.venv/bin/python cli.py reset-password you@example.com
../.venv/bin/python cli.py seed --force      # load demo data into an existing database
../.venv/bin/python cli.py purge-retention --dry-run
../.venv/bin/python cli.py backup --out ../backups
```

---

## Verifying your installation

1. `curl http://localhost:8000/api/health` → `{"status": "ok", ...}`.
2. Sign in at http://localhost:5173 with the admin account.
3. The dashboard shows numbers (not zeros) — that is the seeded demo dataset.
4. **Data sources** → press **Test** on a card → the dialog lists readiness checks.
5. **Collection jobs** → **New collection** → pick a source → watch the run complete.
6. **Imports & exports** → **CSV template** downloads a file.

If all six work, the installation is complete.

---

## Running the tests

```bash
# backend (119 tests, uses a temporary database, no network needed)
cd backend && ../.venv/bin/python -m pytest -q

# frontend: production build + headless render of every route
cd frontend && npm run build && npm run smoke
```

The frontend smoke test needs the API running. The interaction test (`npm run smoke:ui`) exercises
the drawers, modals and tabs of a running dev server.

---

## Troubleshooting installation

| Symptom | Fix |
| --- | --- |
| `command not found: python3` | Install Python 3.11+ or use `python` |
| `No module named app` | Run uvicorn from `backend/`, not from the repository root |
| `ModuleNotFoundError: fastapi` | The virtual environment is not activated, or you ran the wrong `uvicorn` (`../.venv/bin/uvicorn`) |
| Port 8000 already in use | `uvicorn app.main:app --port 8010`, and point the Vite proxy at 8010 in `frontend/vite.config.js` |
| Port 5173 already in use | Stop the other dev server, or change `server.port` in `frontend/vite.config.js` |
| Login says "Invalid e-mail or password" | Database was seeded with different credentials; run `cli.py status` / `cli.py create-admin` |
| Blank page after `npm run build` | Check the API log: the SPA is only mounted if `frontend/dist` exists when the API starts |
| `scrapling` fails to import | `pip install -r backend/requirements-scraper.txt`, or set `FETCH_ENGINE=httpx` |
| `database is locked` | Two processes are writing the SQLite file — stop one, or move to PostgreSQL |

Next: [configuration.md](configuration.md) → [deployment.md](deployment.md) →
[compliance.md](compliance.md).

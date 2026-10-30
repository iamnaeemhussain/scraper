# Deployment

LeadBridge has two parts with very different hosting needs:

| Part | What it is | Where it can run |
| --- | --- | --- |
| **Web app** | Static React bundle (`frontend/dist`) | Any static host: Cloudflare Pages, Netlify, nginx, S3, the Python server itself |
| **API + extraction engine** | Python 3.11 / FastAPI / Scrapling | A normal server or container host: VPS, Docker, Fly.io, Render, Railway, Hetzner… |

> **Hard rule:** Scrapling, Patchright and a full Python runtime **cannot** run inside Cloudflare
> Pages or a standard Cloudflare Worker. Do not try to bundle the crawler into a Worker. Workers
> can serve the static app and *proxy authenticated API calls* to the Python engine — that is all.

Three reference topologies follow. Pick one; they are all inexpensive.

1. [Single server (recommended for a small call centre)](#1-single-server-caddy--systemd)
2. [Cloudflare Pages + Worker + Python engine](#2-cloudflare-pages--worker--python-engine)
3. [Docker / Docker Compose](#3-docker--docker-compose)

---

## 0. Production checklist (read before anything else)

```bash
ENVIRONMENT=production
SECRET_KEY=<48+ random characters>       # python -c "import secrets;print(secrets.token_urlsafe(48))"
COOKIE_SECURE=true                       # only if HTTPS (you will use HTTPS)
SEED_DEMO_DATA=false
ADMIN_EMAIL=you@yourcompany.com
ADMIN_PASSWORD=<strong password>          # or create the admin with cli.py and unset this
CORS_ORIGINS=https://leads.yourcompany.com
ALLOWED_LIVE_DOMAINS=directory.partner.com   # only domains you are permitted to collect
```

Also:

- [ ] HTTPS everywhere (HSTS is sent automatically when `ENVIRONMENT=production`).
- [ ] Database backed up nightly, stored off the server.
- [ ] Real `USER_AGENT` with a monitoring contact.
- [ ] Suppression list and consent policy reviewed by whoever owns compliance.
- [ ] Only staff accounts enabled; demo accounts disabled or password-changed.
- [ ] Logs shipped somewhere you can read them (`journalctl`, Docker logs, or a log drain).

Health check for any platform: `GET /api/health` → `{"status":"ok",...}`.

---

## 1. Single server (Caddy + systemd)

**Cost:** one small VPS (~$5/month) runs everything. This is the simplest correct deployment.

```
Internet ──HTTPS──▶ Caddy (443) ──▶ uvicorn 127.0.0.1:8000 ──▶ SQLite file
                                        └─ serves frontend/dist for non-/api routes
```

### 1.1 Prepare the server (Ubuntu 22.04/24.04 example)

```bash
sudo apt update && sudo apt install -y python3 python3-venv python3-pip git caddy nodejs npm
sudo useradd --system --create-home --home-dir /opt/leadbridge --shell /usr/sbin/nologin leadbridge
sudo -u leadbridge git clone <your-repo-url> /opt/leadbridge/app
```

### 1.2 Install dependencies

```bash
cd /opt/leadbridge/app
sudo -u leadbridge python3 -m venv .venv
sudo -u leadbridge .venv/bin/pip install --upgrade pip
sudo -u leadbridge .venv/bin/pip install -r backend/requirements.txt
sudo -u leadbridge .venv/bin/pip install -r backend/requirements-postgres.txt   # optional
sudo -u leadbridge .venv/bin/pip install -r backend/requirements-scraper.txt  # live extraction

sudo -u leadbridge bash -c 'cd frontend && npm ci && npm run build'
```

### 1.3 Configure

```bash
sudo -u leadbridge cp /opt/leadbridge/app/.env.example /opt/leadbridge/app/.env
sudo -u leadbridge nano /opt/leadbridge/app/.env      # apply the checklist above
sudo chmod 600 /opt/leadbridge/app/.env
```

### 1.4 Run it as a service

Copy [`deploy/leadbridge.service`](../deploy/leadbridge.service) to `/etc/systemd/system/`, adjust
paths/user if needed, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now leadbridge
sudo systemctl status leadbridge
curl http://127.0.0.1:8000/api/health
```

### 1.5 Put TLS in front (Caddy)

Copy [`deploy/Caddyfile`](../deploy/Caddyfile) to `/etc/caddy/Caddyfile`, replace the domain, then:

```bash
sudo systemctl reload caddy
```

Caddy fetches a Let's Encrypt certificate automatically and proxies to uvicorn. Because the SPA is
served by the Python app (it mounts `frontend/dist`), the browser sees a single origin — cookies
and CORS just work.

> Using nginx instead? [`deploy/nginx.conf`](../deploy/nginx.conf) has an equivalent server block
> with `X-Forwarded-For` and `proxy_buffering off` for streaming downloads.

### 1.6 Backups

```bash
chmod +x deploy/backup.sh
sudo -u leadbridge ./deploy/backup.sh /var/backups/leadbridge 14
# add to root's crontab: 15 2 * * * /opt/leadbridge/app/deploy/backup.sh /var/backups/leadbridge 14
```

Then copy the directory somewhere else (rsync, rclone, S3) — a backup on the same disk is not a
backup.

---

## 2. Cloudflare Pages + Worker + Python engine

This is the topology the brief asks for: static hosting at the edge, Python extraction engine
elsewhere, and **no Scrapling inside Workers**.

```
                   ┌──────────────────────────── Cloudflare ────────────────────────────┐
browser ──HTTPS──▶ │ Pages (leads.example.com)   React bundle                            │
                   │ Worker  (/api/*)            authenticated proxy, no secrets in JS    │
                   └──────────────────────────────────┬──────────────────────────────────┘
                                                      │ HTTPS + Authorization header
                                                      ▼
                              ┌────────────────────────────────────────────┐
                              │ Python engine (Fly.io / Render / VPS)      │
                              │ FastAPI + Scrapling + SQLite/PostgreSQL    │
                              └────────────────────────────────────────────┘
```

### 2.1 Deploy the Python engine first

Any container host works. Fly.io example (a `fly.toml` and Dockerfile are in
[`deploy/`](../deploy/)):

```bash
cd deploy
fly launch --no-deploy --name leadbridge-api --region fra
fly secrets set SECRET_KEY="$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')" \
                ENVIRONMENT=production \
                COOKIE_SECURE=true \
                SEED_DEMO_DATA=false \
                ADMIN_EMAIL=you@yourcompany.com \
                ADMIN_PASSWORD='a-strong-password' \
                CORS_ORIGINS=https://leads.example.com \
                ALLOWED_LIVE_DOMAINS=directory.partner.com
fly volumes create leadbridge_data --size 3        # SQLite lives on the volume
fly deploy
```

Notes for any platform:

- **Persistent disk required** for SQLite (`/data/leadbridge.db`), or use PostgreSQL (Neon,
  Supabase, RDS) and forget about volumes.
- Set `DATABASE_URL=sqlite:////data/leadbridge.db` when using a mounted volume — four slashes for
  an absolute path.
- Keep the engine's hostname private if you can (Fly private networking, Render private service,
  VPN). A public hostname is acceptable: auth is enforced on every route.
- The engine must allow the browser origin **or** the Worker origin in `CORS_ORIGINS` — with the
  proxy in 2.3 you can keep it to your public site origin.

### 2.2 Deploy the static app to Cloudflare Pages

```bash
cd frontend
npm ci
npm run build
npx wrangler pages deploy dist --project-name leadbridge
```

Or connect the repository in the Cloudflare dashboard:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | `frontend` |
| Environment variable | `VITE_API_BASE_URL=` *(empty — same origin via the Worker)* |

Add `_redirects` fallback for client-side routing (already produced by the Vite build as a copy of
`index.html`; if you use a SPA preset Cloudflare handles it, otherwise add):

```
/*    /index.html   200
```

### 2.3 Proxy `/api/*` with a Worker (same origin, cookies intact)

Why a proxy rather than calling the Python host directly from the browser?

- **Cookies.** Session cookies are `SameSite=Lax` (and should stay that way). A browser will not
  send them to a different site, so direct cross-site calls would silently sign the user out.
- **CORS and credentials** get simpler: the browser only ever talks to `leads.example.com`.
- **Rate limiting / WAF** can be applied at the edge.
- **No secrets in the browser** — the Worker can add a shared header, but the browser never sees it.

[`deploy/cloudflare/worker.js`](../deploy/cloudflare/worker.js) is a ready-to-use proxy:

```js
// abbreviated — see the file for the full version with timeouts and allowlists
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const target = new URL(url.pathname + url.search, env.API_ORIGIN);
    const upstream = new Request(target, request);
    upstream.headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");
    upstream.headers.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "");
    const response = await fetch(upstream);          // cookies pass through untouched
    return new Response(response.body, response);
  },
};
```

Deploy it as a Pages Function or a route-bound Worker:

```toml
# wrangler.toml
name = "leadbridge-edge"
main = "worker.js"
compatibility_date = "2024-11-01"

[vars]
API_ORIGIN = "https://leadbridge-api.fly.dev"

[[routes]]
pattern = "leads.example.com/api/*"
zone_name = "example.com"
```

```bash
npx wrangler deploy
```

Set `API_ORIGIN` via `wrangler secret put`/dashboard rather than committing it if you prefer.

**What a Worker must never do here:** run Scrapling, hold the database, embed API keys in the
served JavaScript, or attempt to solve CAPTCHAs / bypass anti-bot protection.

### 2.4 Authenticate the extraction worker (optional split-service mode)

If you run collection from a *separate* machine (for example one with residential egress or a
fixed IP allowlisted by a partner), it authenticates with an API key instead of a cookie:

```bash
# 1. In the UI: Settings → API keys → New key, scopes: jobs:manage, sources:manage
KEY="lbk_…"

# 2. From the worker host
curl -X POST "$API/api/jobs?source_id=3" \
     -H "Authorization: Bearer $KEY" \
     -H "Content-Type: application/json" \
     -d '{"max_records":100}'
```

The key is hashed at rest, scoped, revocable, and audited on every use. See
[docs/api.md](api.md#api-keys-for-the-extraction-worker).

### 2.5 Checklist for the Cloudflare topology

- [ ] Pages serves only static assets.
- [ ] Worker proxies `/api/*` to the Python origin, preserving cookies and setting
      `X-Forwarded-For`.
- [ ] Python engine has a persistent disk (SQLite) or PostgreSQL.
- [ ] `CORS_ORIGINS` includes `https://leads.example.com`.
- [ ] `COOKIE_SECURE=true`, `ENVIRONMENT=production`, real `SECRET_KEY`.
- [ ] Nightly backup of the engine's database, copied off the engine.
- [ ] No API keys or adapter credentials in any frontend bundle (`grep -r "lbk_" dist/` returns
      nothing).

---

## 3. Docker / Docker Compose

```bash
cp .env.example .env     # apply the production checklist
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f app
```

What the compose file does:

- builds `deploy/Dockerfile` (multi-stage: builds the SPA, then a slim Python runtime with the
  API and the Scrapling extras),
- mounts the `leadbridge-data` volume at `/data` for SQLite,
- restarts on failure, exposes port 8000 (put Caddy or Cloudflare in front for TLS).

PostgreSQL variant:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: leadbridge
      POSTGRES_USER: leadbridge
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [ "leadbridge-pg:/var/lib/postgresql/data" ]
  app:
    build: { context: .., dockerfile: deploy/Dockerfile }
    environment:
      DATABASE_URL: postgresql+psycopg://leadbridge:${POSTGRES_PASSWORD}@db:5432/leadbridge
    depends_on: [ db ]
    ports: [ "8000:8000" ]
volumes: { leadbridge-pg: {} }
```

Backups inside Docker:

```bash
docker compose -f deploy/docker-compose.yml exec app python cli.py backup --out /data/backups
docker cp $(docker compose -f deploy/docker-compose.yml ps -q app):/data/backups ./backups
```

---

## Upgrades

```bash
# 1. back up first — always
python cli.py backup --out /var/backups/leadbridge

# 2. update code and dependencies
git pull
.venv/bin/pip install -r backend/requirements.txt
cd frontend && npm ci && npm run build && cd ..

# 3. restart
sudo systemctl restart leadbridge        # or: docker compose up -d --build
```

Schema changes are additive (`create_all`). If a release contains a destructive migration, its
notes will say so — restore the backup if you need to roll back.

## Scaling notes

- **SQLite** handles a call centre of a few dozen agents comfortably. Enable WAL (done), keep the
  database on local SSD, run one API process.
- **More than one API instance** needs PostgreSQL, because SQLite is a single-writer file.
- **Job workers** run inside the API process (`JOB_WORKERS`, default 2). Running several API
  instances means jobs may execute on any of them; the job table is the coordination point, so do
  not run the same source twice (the API already refuses concurrent runs per source).
- **Rate limiting** is per process; move it to Cloudflare/nginx or Redis when you scale out.
- **Logs** go to stdout — collect them with your platform's log drain.

## Monitoring

| Signal | Where |
| --- | --- |
| Liveness | `GET /api/health` |
| Job failures | **Collection jobs → Failed requests**, or `GET /api/jobs/failures/all` |
| Compliance drift | **Reports → Compliance register**, source attribution CSV |
| Auth anomalies | **Settings → Audit log**, filter `auth` |
| Disk usage | SQLite file + `backups/` |

A five-line uptime check:

```bash
curl -fsS https://leads.example.com/api/health | grep -q '"status":"ok"' || echo "ALERT: API down"
```

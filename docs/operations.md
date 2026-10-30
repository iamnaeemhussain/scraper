# Operations runbook

Day-to-day tasks and what to do when something breaks. Commands assume you are in the repository
root with the virtual environment active; `$VENV` is `.venv`.

---

## Daily / weekly checks

| Cadence | Check | How |
| --- | --- | --- |
| Daily | API is alive | `curl -fsS https://leads.example.com/api/health` |
| Daily | Failed requests | **Collection jobs → Failed requests**, or `GET /api/jobs/failures/all` |
| Daily | Backup written | `ls -lh /var/backups/leadbridge` |
| Weekly | Duplicate/quality trend | **Reports** → summary, or `/api/reports/compliance.csv` |
| Weekly | Suppression list sanity | **Settings → Suppression list** (counts by kind) |
| Weekly | Audit log anomalies | **Settings → Audit log**, filter `auth`, look for repeated failures |
| Monthly | Restore drill | Restore a backup into a scratch directory (below) |
| Monthly | Retention purge | **Settings → Data & backups → Run purge** (after a backup) |
| Quarterly | Rotate API keys | **Settings → API keys** → revoke and recreate |
| Quarterly | Re-review sources | Each source's licensing basis and allowlist |

---

## Health and diagnostics

```bash
curl -s localhost:8000/api/health | python3 -m json.tool
$VENV/bin/python backend/cli.py status         # counts, environment, allowlist size
curl -s localhost:8000/api/meta/engine         # Scrapling availability, robots policy, allowlist
journalctl -u leadbridge -n 200 --no-pager     # systemd installs
docker compose -f deploy/docker-compose.yml logs --tail=200
```

`/api/health` returns `status: ok` even when jobs are failing — it is a liveness probe, not a
business-data probe. Use the job summary for that:

```bash
curl -s -b cookies.txt "localhost:8000/api/jobs/summary?days=7" | python3 -m json.tool
```

---

## Common incidents

### A collection job is stuck in `running`

**Symptoms:** progress stops moving; `X` minutes pass; the job still says running.

1. Look at the job dialog's event log — the last event usually names the URL or the reason.
2. Check the API log for a traceback.
3. If the process was killed, jobs are recovered on start-up (`recover_stale_jobs()` marks orphaned
   runs as `failed` with a message). Simply restart:

   ```bash
   sudo systemctl restart leadbridge
   ```

4. If it is genuinely hung (a source that never times out), stop it from the UI (**Stop**) or:

   ```bash
   curl -b cookies.txt -X POST localhost:8000/api/jobs/123/stop
   ```

5. The collected records are already saved — a stuck run never loses completed work.

### Every live run fails with a compliance message

| Message | Meaning | Fix |
| --- | --- | --- |
| `domain not on the approved live-collection allowlist` | Host missing from `ALLOWED_LIVE_DOMAINS` or the source's domains | Add the exact host, restart the API |
| `robots.txt disallows` | The site forbids that path | Use a permitted source, do not work around it |
| `credential ... not set` | `credential_env` names a variable that is empty | Export the variable on the API host and restart |
| `Unrecognized adapter configuration` | Missing required config field | Fix it in the source editor; **Test** shows which |

Run **POST /api/sources/{id}/test** first — it reports each check before you start a run.

### Exports return 409 "No leads passed the compliance checks"

That is the policy working. Open **Imports & exports → Export → Preview** to see the blocked
reasons and counts. Typical causes: `export_require_consent` is on and most leads are `unknown`;
everything is Do Not Contact; wrong filters (e.g. a city with no eligible records).

### Login fails for everyone after a deploy

- `SECRET_KEY` changed → all sessions invalid (expected). Sign in again.
- `COOKIE_SECURE=true` on plain HTTP → the browser never sends the cookie. Either enable HTTPS or
  set `COOKIE_SECURE=false` for that environment.
- Behind a proxy on a different domain → cookies are cross-site; use the same-origin proxy
  pattern from [deployment.md](deployment.md#23-proxy-api-with-a-worker-same-origin-cookies-intact).
- Everyone locked out: `LOGIN_MAX_ATTEMPTS` is per IP; wait `LOGIN_LOCKOUT_MINUTES` or restart the
  API (the limiter is in memory).

### `database is locked` (SQLite)

Only one writer at a time. Usually a second API process, a long `sqlite3` shell holding a
transaction, or a backup script. `cli.py status` and `ps aux | grep uvicorn` reveal duplicates.
If it persists, move to PostgreSQL — the code needs only `DATABASE_URL`.

### Disk filling up

- `backend/data/*.db-wal` can grow during heavy imports; a checkpoint happens on restart.
- `backups/` — prune with the retention argument in `deploy/backup.sh`.
- Audit rows: run **Settings → Data & backups → Run purge** (deletes rows older than
  `audit_retention_days`).

---

## Backups and restores

### Take one

```bash
# CLI (SQLite only, uses VACUUM INTO)
$VENV/bin/python backend/cli.py backup --out /var/backups/leadbridge

# or the shipped script (gzips and prunes)
./deploy/backup.sh /var/backups/leadbridge 14

# or from the UI
# Settings → Data & backups → Download backup
```

PostgreSQL:

```bash
pg_dump "$DATABASE_URL" | gzip > /var/backups/leadbridge/leadbridge-$(date +%F).sql.gz
```

### Restore (SQLite)

```bash
sudo systemctl stop leadbridge                    # stop writers first
cp backend/data/leadbridge.db backend/data/leadbridge.db.before-restore
gunzip -c /var/backups/leadbridge/leadbridge-2026-10-30.db.gz > backend/data/leadbridge.db
rm -f backend/data/leadbridge.db-wal backend/data/leadbridge.db-shm
sudo systemctl start leadbridge
$VENV/bin/python backend/cli.py status            # sanity check counts
```

### Restore drill (do this monthly, into a scratch copy)

```bash
mkdir -p /tmp/restore-test
gunzip -c /var/backups/leadbridge/leadbridge-latest.db.gz > /tmp/restore-test/leadbridge.db
DATABASE_URL=sqlite:////tmp/restore-test/leadbridge.db $VENV/bin/python backend/cli.py status
```

If `status` prints plausible counts, the backup is usable.

### PostgreSQL restore

```bash
createdb leadbridge_restore
gunzip -c backup.sql.gz | psql leadbridge_restore
DATABASE_URL=postgresql+psycopg://user:pass@host/leadbridge_restore $VENV/bin/python backend/cli.py status
```

---

## Retention and deletion

```bash
$VENV/bin/python backend/cli.py purge-retention --dry-run   # what would go
$VENV/bin/python backend/cli.py purge-retention             # do it
```

Rules: converted, interested and Do Not Contact leads are kept; everything else older than
`data_retention_days` is deleted along with its audit rows. Audit rows older than
`audit_retention_days` are removed regardless. Always take a backup first — a purge is not
reversible.

Single-record deletion (erasure request): open the lead → **Delete**. It writes the contact to the
suppression list by default and records the action in the organisation audit log.

---

## Users and access

```bash
$VENV/bin/python backend/cli.py create-admin              # create or promote, prompts for password
$VENV/bin/python backend/cli.py reset-password user@example.com
```

In the UI: **Agent management** to add people, set roles (`admin`/`manager`/`agent`) and daily
quotas, disable a leaver with the toggle, reset a password from the edit dialog.

Review the audit log after any staff change: `action=auth` shows sign-ins, `action=user` shows
account changes.

---

## Upgrades

```bash
# 1. backup
$VENV/bin/python backend/cli.py backup --out /var/backups/leadbridge

# 2. code + dependencies
git pull
$VENV/bin/pip install -r backend/requirements.txt
$VENV/bin/pip install -r backend/requirements-scraper.txt   # if you use live extraction
cd frontend && npm ci && npm run build && cd ..

# 3. restart and verify
sudo systemctl restart leadbridge
curl -fsS localhost:8000/api/health
```

Run the test suite after pulling, before restarting production:

```bash
cd backend && ../$VENV/bin/python -m pytest -q
```

Rollback: `git checkout <previous-tag>`, restore the matching backup, rebuild the frontend,
restart.

---

## Scaling and performance

| Symptom | Action |
| --- | --- |
| Lead list feels slow with >50k rows | Add `state`, `city`, `industry`, `lead_status` filters; check indexes (they ship with the schema). Consider PostgreSQL |
| Multiple API instances needed | Move to PostgreSQL first; rate limiting and job coordination are per process |
| Imports time out | Split the file (max 20k rows / 12 MB); run imports outside business hours |
| Long exports | Use filters; CSV streams, XLSX buffers in memory |
| Slow crawls | Lower `min_delay_seconds` only if the source permits it — politeness beats speed |

---

## Logs

| Source | Where |
| --- | --- |
| API | stdout → `journalctl -u leadbridge` / Docker logs / platform log drain |
| Access + errors | Caddy `/var/log/caddy/leadbridge.log`, nginx `/var/log/nginx/leadbridge.*` |
| Job events | UI → Collection jobs → job dialog; stored in `job_events` |
| Failed requests | UI → Failed requests; stored in `failed_requests` |
| Who did what | Settings → Audit log; stored in `activity_log` / `lead_audit` |

Log lines contain actor e-mails, entity ids and error messages — they do not contain phone numbers
or e-mail addresses of leads except inside import row errors (kept intentionally small: first
100 characters of the offending row).

---

## Emergency contacts and escalation

Fill this in for your organisation:

| Role | Who | Contact |
| --- | --- | --- |
| System owner | | |
| Compliance / DPO | | |
| Hosting provider support | | |
| Data source partner contact | | |

For a suspected data breach: rotate `SECRET_KEY` and API keys, preserve logs, notify your DPO,
and follow your local breach-notification timeline (72 hours under GDPR, for example).

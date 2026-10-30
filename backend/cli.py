#!/usr/bin/env python
"""LeadBridge command line tools.

Run from the `backend/` directory (the same place you start uvicorn from):

    python cli.py init-db
    python cli.py create-admin --email you@example.com
    python cli.py seed --force
    python cli.py status
    python cli.py purge-retention
    python cli.py backup --out ../backups

Every command uses the same configuration as the API (env vars / `.env`), so it operates on the
same database the app uses.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select

from app.config import BASE_DIR, settings
from app.database import Base, SessionLocal, engine
from app.models import ApiKey, CollectionJob, DataSource, Lead, LeadAudit, SuppressionEntry, User
from app.security import hash_password, password_problems
from app.seed import ensure_admin, seed_database


def _session():
    return SessionLocal()


def cmd_init_db(_args) -> int:
    Base.metadata.create_all(bind=engine)
    print(f"[ok] schema created in {settings.database_url}")
    with _session() as db:
        ensure_admin(db)
    return 0


def cmd_seed(args) -> int:
    Base.metadata.create_all(bind=engine)
    with _session() as db:
        if db.scalar(select(func.count(Lead.id))) and not args.force:
            print("[skip] database already contains leads — pass --force to add demo data anyway")
            return 0
        result = seed_database(db, force=args.force)
    if result.get("seeded"):
        print(f"[ok] seeded {result['leads']} leads across {result['sources']} sources")
        print(f"     admin: {result['admin_email']} / {result['demo_password']}")
    else:
        print(f"[skip] {result.get('reason', 'nothing to do')}")
    return 0


def cmd_create_admin(args) -> int:
    Base.metadata.create_all(bind=engine)
    email = (args.email or input("Admin e-mail: ")).strip().lower()
    password = args.password
    if not password:
        password = getpass.getpass("Password (min 10 chars, letters and numbers): ")
        confirm = getpass.getpass("Repeat password: ")
        if password != confirm:
            print("[error] passwords do not match")
            return 1
    problems = password_problems(password)
    if problems:
        print(f"[error] {'; '.join(problems)}")
        return 1
    with _session() as db:
        existing = db.scalar(select(User).where(User.email == email))
        if existing:
            existing.role = "admin"
            existing.is_active = True
            existing.hashed_password = hash_password(password)
            db.commit()
            print(f"[ok] {email} promoted to admin and password reset")
            return 0
        db.add(User(email=email, full_name=args.name or "Administrator", role="admin",
                    hashed_password=hash_password(password)))
        db.commit()
    print(f"[ok] created admin {email}")
    return 0


def cmd_status(_args) -> int:
    engine_name = "PostgreSQL" if "postgres" in settings.database_url else "SQLite"
    with _session() as db:
        counts = {
            "users": db.scalar(select(func.count(User.id))),
            "admins": db.scalar(select(func.count(User.id)).where(User.role == "admin")),
            "sources": db.scalar(select(func.count(DataSource.id))),
            "enabled sources": db.scalar(select(func.count(DataSource.id)).where(DataSource.is_enabled.is_(True))),
            "jobs": db.scalar(select(func.count(CollectionJob.id))),
            "active jobs": db.scalar(select(func.count(CollectionJob.id)).where(
                CollectionJob.status.in_(["queued", "running", "paused", "stopping"]))),
            "leads": db.scalar(select(func.count(Lead.id))),
            "usable leads": db.scalar(select(func.count(Lead.id)).where(Lead.is_duplicate.is_(False))),
            "duplicates": db.scalar(select(func.count(Lead.id)).where(Lead.is_duplicate.is_(True))),
            "do not contact": db.scalar(select(func.count(Lead.id)).where(Lead.lead_status == "do_not_contact")),
            "suppression entries": db.scalar(select(func.count(SuppressionEntry.id))),
            "audit entries": db.scalar(select(func.count(LeadAudit.id))),
            "api keys": db.scalar(select(func.count(ApiKey.id)).where(ApiKey.is_active.is_(True))),
        }
    print(f"LeadBridge · {settings.app_name} · environment={settings.environment}")
    print(f"database   : {engine_name} · {settings.database_url}")
    print(f"demo mode  : {settings.demo_mode_enabled}")
    print(f"live domains allowlisted: {len(settings.allowed_domain_list)}")
    for label, value in counts.items():
        print(f"{label:<24}: {value}")
    return 0


def cmd_purge_retention(args) -> int:
    """Delete leads and audit rows older than the organisation's retention windows."""
    from app.services import org_settings

    with _session() as db:
        lead_days = int(org_settings.get(db, "data_retention_days", settings.data_retention_days) or 365)
        audit_days = int(org_settings.get(db, "audit_retention_days", settings.audit_retention_days) or 730)
        lead_cutoff = datetime.now(timezone.utc) - timedelta(days=lead_days)
        audit_cutoff = datetime.now(timezone.utc) - timedelta(days=audit_days)

        keep_statuses = ("converted", "interested", "do_not_contact")
        stale = db.scalars(
            select(Lead).where(Lead.collected_at < lead_cutoff, Lead.lead_status.not_in(keep_statuses))
        ).all()
        print(f"[plan] leads older than {lead_days} days: {len(stale)} (keeping converted/interested/DNC)")
        print(f"[plan] audit entries older than {audit_days} days")
        if args.dry_run:
            print("[dry-run] nothing deleted")
            return 0

        for lead in stale:
            db.execute(LeadAudit.__table__.delete().where(LeadAudit.lead_id == lead.id))
            db.delete(lead)
        audit_removed = db.execute(
            LeadAudit.__table__.delete().where(LeadAudit.created_at < audit_cutoff)
        ).rowcount
        db.commit()
    print(f"[ok] purged {len(stale)} leads and {audit_removed} audit entries")
    return 0


def cmd_backup(args) -> int:
    if not settings.database_url.startswith("sqlite"):
        print("[error] this command only backs up SQLite. For PostgreSQL use pg_dump, e.g.")
        print("        pg_dump \"$DATABASE_URL\" | gzip > leadbridge-$(date +%F).sql.gz")
        return 1
    source = settings.database_url.replace("sqlite:///", "")
    if source.startswith("./"):
        source = str((BASE_DIR / source[2:]).resolve())
    out_dir = Path(args.out or (BASE_DIR / "backups"))
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"leadbridge-{datetime.now():%Y%m%d-%H%M%S}.db"
    with sqlite3.connect(source) as connection:
        connection.execute(f"VACUUM INTO '{target}'")
    size = target.stat().st_size
    print(f"[ok] wrote {target} ({size / 1024 / 1024:.2f} MB)")
    return 0


def cmd_reset_password(args) -> int:
    with _session() as db:
        user = db.scalar(select(User).where(User.email == args.email.strip().lower()))
        if not user:
            print("[error] no user with that e-mail")
            return 1
        password = args.password or getpass.getpass("New password: ")
        problems = password_problems(password)
        if problems:
            print(f"[error] {'; '.join(problems)}")
            return 1
        user.hashed_password = hash_password(password)
        user.is_active = True
        db.commit()
    print(f"[ok] password updated for {args.email}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cli.py", description="LeadBridge administration CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init-db", help="create tables and ensure an admin exists").set_defaults(func=cmd_init_db)

    seed = sub.add_parser("seed", help="load the demo dataset")
    seed.add_argument("--force", action="store_true", help="seed even if data already exists")
    seed.set_defaults(func=cmd_seed)

    admin = sub.add_parser("create-admin", help="create or promote an administrator")
    admin.add_argument("--email")
    admin.add_argument("--name")
    admin.add_argument("--password", help="omit to be prompted (recommended)")
    admin.set_defaults(func=cmd_create_admin)

    reset = sub.add_parser("reset-password", help="set a new password for a user")
    reset.add_argument("email")
    reset.add_argument("--password", help="omit to be prompted")
    reset.set_defaults(func=cmd_reset_password)

    sub.add_parser("status", help="print database counts and configuration").set_defaults(func=cmd_status)

    purge = sub.add_parser("purge-retention", help="delete records past the retention windows")
    purge.add_argument("--dry-run", action="store_true")
    purge.set_defaults(func=cmd_purge_retention)

    backup = sub.add_parser("backup", help="write a consistent SQLite snapshot")
    backup.add_argument("--out", help="target directory (default: ./backups)")
    backup.set_defaults(func=cmd_backup)
    return parser


def main(argv: list[str] | None = None) -> int:
    os.chdir(Path(__file__).resolve().parent)  # keep relative DB paths stable
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

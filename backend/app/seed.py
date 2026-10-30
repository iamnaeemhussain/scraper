"""Seed a fresh install with demo users, sources, history and leads.

Everything inserted here is synthetic. Demo sources are clearly marked as using the
bundled dataset so no one mistakes them for a live integration.
"""
from __future__ import annotations

import random
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .adapters.fixtures import DATASET
from .config import settings
from .models import (
    CollectionJob,
    DataSource,
    ExportJob,
    FailedRequest,
    ImportBatch,
    ImportRowError,
    JobEvent,
    Lead,
    LeadAudit,
    SuppressionEntry,
    User,
)
from .security import hash_password
from .services.ingest import ingest_record

DEMO_PASSWORD = "LeadBridge#2024"
ADMIN_EMAIL = "admin@leadbridge.demo"

SOURCE_BLUEPRINTS = [
    {
        "name": "Regional Business Directory",
        "adapter": "business_directory",
        "url": "https://directory.example.com/",
        "description": "Public business listings from a directory partner that permits automated collection.",
        "mode": "demo",
        "licensing_status": "public_website",
        "attribution": "Regional Business Directory (authorized listing partner)",
        "allowed_fields": ["business_name", "contact_name", "contact_title", "phone", "email",
                           "address_line1", "city", "state", "zip_code", "country", "industry",
                           "website", "source_url"],
        "rate_limit_per_minute": 15,
        "min_delay_seconds": 2.0,
        "max_records_per_run": 120,
        "max_requests_per_run": 20,
        "consent_default": "unknown",
        "config": {"listing_urls": ["https://directory.example.com/business?page={page}"],
                   "max_pages": 3, "item_selector": ".business-card",
                   "field_selectors": {"business_name": ".card-title", "phone": ".phone",
                                       "email": "a.email::attr(href)", "website": "a.site::attr(href)"}},
    },
    {
        "name": "Company Website Crawler",
        "adapter": "company_website",
        "url": "https://example.com/",
        "description": "Reads published contact details from companies' own contact pages.",
        "mode": "demo",
        "licensing_status": "public_website",
        "attribution": "Official company website contact page",
        "allowed_fields": ["business_name", "phone", "email", "address_line1", "city", "state",
                           "zip_code", "country", "industry", "website", "source_url"],
        "rate_limit_per_minute": 10,
        "min_delay_seconds": 3.0,
        "max_records_per_run": 40,
        "max_requests_per_run": 25,
        "consent_default": "unknown",
        "config": {"urls": ["https://example.com/"], "contact_paths": "/contact\n/contact-us"},
    },
    {
        "name": "Licensed B2B Database",
        "adapter": "licensed_database",
        "url": "https://api.data-provider.example/v1/businesses",
        "description": "Commercial B2B dataset used under a written licence (renewed annually).",
        "mode": "demo",
        "licensing_status": "licensed",
        "attribution": "DataCo B2B licence #LB-2024-118",
        "credential_env": "DATA_PROVIDER_KEY",
        "allowed_fields": ["business_name", "contact_name", "contact_title", "phone", "email",
                           "address_line1", "city", "state", "zip_code", "country", "industry",
                           "website", "source_url"],
        "rate_limit_per_minute": 60,
        "min_delay_seconds": 0.5,
        "max_records_per_run": 150,
        "max_requests_per_run": 10,
        "consent_default": "pending",
        "config": {"api_url": "https://api.data-provider.example/v1/businesses",
                   "records_path": "data.results",
                   "field_map": {"business_name": "company.name", "phone": "phones.0.number",
                                 "email": "contacts.0.email", "city": "address.city",
                                 "state": "address.region", "zip_code": "address.postal_code"},
                   "page_param": "page"},
    },
    {
        "name": "Partner Contact API",
        "adapter": "contact_api",
        "url": "https://api.partner.example/v2/contacts",
        "description": "Permission-based partner API that also returns reachability evidence.",
        "mode": "demo",
        "licensing_status": "licensed",
        "attribution": "Partner Contact API (permission-based integration)",
        "credential_env": "CONTACT_API_TOKEN",
        "allowed_fields": ["business_name", "contact_name", "contact_title", "phone", "email",
                           "city", "state", "zip_code", "country", "industry", "website", "source_url"],
        "rate_limit_per_minute": 120,
        "min_delay_seconds": 0.25,
        "max_records_per_run": 100,
        "max_requests_per_run": 5,
        "consent_default": "granted",
        "config": {"api_url": "https://api.partner.example/v2/contacts", "records_path": "results",
                   "field_map": {"business_name": "organization.name", "phone": "phone.number",
                                 "email": "email.address", "city": "location.city",
                                 "state": "location.region"},
                   "verification_field_map": {"phone_status": "phone.status"}},
    },
    {
        "name": "Website Enquiry Form",
        "adapter": "lead_form",
        "url": "https://www.example.com/contact",
        "description": "First-party inbound form on our own website (consent captured verbatim).",
        "mode": "live",
        "licensing_status": "user_provided",
        "attribution": "First-party web form submission",
        "allowed_fields": ["business_name", "contact_name", "contact_title", "phone", "email",
                           "city", "state", "zip_code", "country", "industry", "consent_status"],
        "rate_limit_per_minute": 60,
        "min_delay_seconds": 0.0,
        "max_records_per_run": 200,
        "max_requests_per_run": 1,
        "consent_default": "granted",
        "config": {"form_token": secrets.token_urlsafe(24),
                   "consent_text": "I agree to be contacted by phone or email about my enquiry."},
    },
    {
        "name": "CRM Export Upload",
        "adapter": "upload",
        "url": "",
        "description": "Monthly CRM export uploaded by the sales team (contracts on file).",
        "mode": "live",
        "licensing_status": "user_provided",
        "attribution": "Uploaded CRM export (sales team attested licence)",
        "allowed_fields": ["business_name", "contact_name", "contact_title", "phone", "email",
                           "address_line1", "address_line2", "city", "state", "zip_code", "country",
                           "industry", "website", "consent_status"],
        "rate_limit_per_minute": 1,
        "min_delay_seconds": 0.0,
        "max_records_per_run": 5000,
        "max_requests_per_run": 1,
        "consent_default": "unknown",
        "config": {"expected_columns": ["business_name", "phone"]},
    },
]

AGENTS = [
    {"full_name": "Maya Rodriguez", "email": "maya@leadbridge.demo", "team": "Inbound", "daily_quota": 80},
    {"full_name": "Daniel Okafor", "email": "daniel@leadbridge.demo", "team": "Inbound", "daily_quota": 70},
    {"full_name": "Priya Raman", "email": "priya@leadbridge.demo", "team": "Outbound", "daily_quota": 90},
    {"full_name": "Tom Whitfield", "email": "tom@leadbridge.demo", "team": "Outbound", "daily_quota": 60},
    {"full_name": "Sofia Delgado", "email": "sofia@leadbridge.demo", "team": "Enterprise", "daily_quota": 50},
]

STATUS_WEIGHTS = [
    ("new", 22), ("assigned", 14), ("contacted", 20), ("interested", 10),
    ("not_interested", 9), ("follow_up", 12), ("converted", 6), ("do_not_contact", 7),
]


def _weighted_status(rng: random.Random) -> str:
    total = sum(weight for _, weight in STATUS_WEIGHTS)
    pick = rng.uniform(0, total)
    upto = 0
    for status, weight in STATUS_WEIGHTS:
        upto += weight
        if pick <= upto:
            return status
    return "new"


def seed_database(db: Session, *, force: bool = False) -> dict:
    existing = db.scalar(select(func.count(User.id))) or 0
    if existing and not force:
        return {"seeded": False, "reason": "database already contains users"}

    rng = random.Random(20241031)
    now = datetime.now(timezone.utc)

    admin = User(
        email=ADMIN_EMAIL,
        full_name="Avery Stone",
        role="admin",
        hashed_password=hash_password(DEMO_PASSWORD),
        team="Operations",
        daily_quota=0,
    )
    manager = User(
        email="manager@leadbridge.demo",
        full_name="Jordan Lee",
        role="manager",
        hashed_password=hash_password(DEMO_PASSWORD),
        team="Operations",
        daily_quota=0,
    )
    db.add_all([admin, manager])
    agents = []
    for blueprint in AGENTS:
        agent = User(
            email=blueprint["email"],
            full_name=blueprint["full_name"],
            role="agent",
            hashed_password=hash_password(DEMO_PASSWORD),
            team=blueprint["team"],
            daily_quota=blueprint["daily_quota"],
            is_active=True,
            last_login_at=now - timedelta(hours=rng.randint(1, 40)),
        )
        agents.append(agent)
        db.add(agent)
    db.commit()

    sources: list[DataSource] = []
    for blueprint in SOURCE_BLUEPRINTS:
        source = DataSource(
            name=blueprint["name"],
            adapter=blueprint["adapter"],
            url=blueprint["url"],
            description=blueprint["description"],
            mode=blueprint["mode"],
            is_enabled=True,
            config=blueprint["config"],
            allowed_fields=blueprint["allowed_fields"],
            rate_limit_per_minute=blueprint["rate_limit_per_minute"],
            min_delay_seconds=blueprint["min_delay_seconds"],
            max_records_per_run=blueprint["max_records_per_run"],
            max_requests_per_run=blueprint["max_requests_per_run"],
            attribution=blueprint["attribution"],
            licensing_status=blueprint["licensing_status"],
            consent_default=blueprint["consent_default"],
            credential_env=blueprint.get("credential_env"),
            compliance_notes=None,
            last_run_at=now - timedelta(hours=rng.randint(2, 60)),
            created_by=admin.id,
        )
        db.add(source)
        sources.append(source)
    db.commit()

    # ---------------------------------------------------------------- leads
    directories = [s for s in sources if s.adapter in {"business_directory", "company_website"}]
    licensed = [s for s in sources if s.adapter in {"licensed_database", "contact_api"}]
    first_party = [s for s in sources if s.adapter in {"lead_form", "upload"}]

    total_leads = 0
    for index, record in enumerate(DATASET[:520]):
        bucket = index % 10
        if bucket < 5:
            source = rng.choice(directories)
        elif bucket < 8:
            source = rng.choice(licensed)
        else:
            source = rng.choice(first_party)

        days_ago = int((index / 520) ** 1.6 * 44) + rng.randint(0, 1)
        collected_at = now - timedelta(days=days_ago, hours=rng.randint(0, 20), minutes=rng.randint(0, 59))

        payload = dict(record)
        if source in first_party:
            payload["consent_status"] = "granted"
        elif source in licensed:
            payload["consent_status"] = "pending"
        else:
            payload["consent_status"] = "unknown"

        # Verification evidence only exists for licensed/API sources — never for a
        # number merely seen on a website.
        if source in licensed:
            roll = rng.random()
            if roll < 0.45:
                payload["_provider_phone_status"] = "verified"
        result = ingest_record(db, payload, source=source, collected_at=collected_at,
                               actor_label=f"source:{source.name}", commit=False)
        if result.lead and result.status in {"created", "duplicate"} and not result.lead.is_duplicate:
            lead = result.lead
            lead.lead_status = _weighted_status(rng)
            lead.consent_status = payload.get("consent_status", "unknown")
            if lead.lead_status != "new" or rng.random() < 0.5:
                lead.assigned_agent_id = rng.choice(agents).id
            if lead.lead_status == "new" and lead.assigned_agent_id:
                lead.lead_status = "assigned"
            if lead.lead_status == "do_not_contact":
                lead.consent_status = "denied"
                existing_entry = db.scalar(
                    select(SuppressionEntry).where(
                        SuppressionEntry.value == (lead.phone_e164 or lead.email or lead.business_name)
                    )
                )
                if not existing_entry and (lead.phone_e164 or lead.email):
                    db.add(SuppressionEntry(
                        kind="phone" if lead.phone_e164 else "email",
                        value=(lead.phone_e164 or lead.email)[:254],
                        reason=f"Do Not Contact requested ({lead.lead_ref})",
                        created_by=admin.id,
                    ))
            if rng.random() < 0.35:
                stamp = (collected_at + timedelta(days=rng.randint(0, 4))).strftime("%Y-%m-%d %H:%M UTC")
                note = rng.choice([
                    "Left voicemail, will retry next week.",
                    "Spoke with the office manager — asked for a quote by e-mail.",
                    "Gatekeeper requested we call back after 2pm.",
                    "Not the right contact anymore; asked to remove from list.",
                    "Interested in a demo next month.",
                ])
                lead.notes = f"[{stamp} · {rng.choice(agents).full_name}] {note}"
            total_leads += 1
        if index % 40 == 0:
            db.commit()
    db.commit()

    # couple of dedicated suppression entries
    for kind, value, reason in [
        ("email", "info@sunrisedental.example", "Opt-out requested by phone"),
        ("phone", "+15125550123", "Customer asked never to be contacted again"),
        ("domain", "competitor.example", "Blocked by compliance policy"),
        ("business_name", "Sunrise Dental Studio", "Business requested removal from all lists"),
    ]:
        if not db.scalar(select(SuppressionEntry).where(SuppressionEntry.value == value)):
            db.add(SuppressionEntry(kind=kind, value=value, reason=reason, created_by=admin.id))
    db.commit()

    # ------------------------------------------------------------- job history
    job_specs = [
        (0, "completed", 118, 104, 9, 5, 61200, 3),
        (1, "completed", 42, 39, 3, 0, 148000, 2),
        (2, "completed", 148, 121, 19, 8, 94200, 4),
        (3, "completed", 96, 88, 7, 1, 41200, 1),
        (0, "completed", 88, 79, 6, 3, 52300, 2),
        (2, "completed", 132, 110, 16, 6, 88600, 300),
        (3, "stopped", 54, 49, 4, 1, 21800, 120),
        (1, "failed", 0, 0, 0, 3, 4100, 1),
        (0, "completed", 124, 112, 9, 3, 64100, 1),
        (2, "completed", 141, 119, 18, 4, 90500, 5),
    ]
    for offset, (source_index, status, collected, processed, duplicates, failed, duration, hours_ago) in enumerate(job_specs):
        source = sources[source_index]
        started = now - timedelta(hours=hours_ago + offset, minutes=rng.randint(0, 50))
        job = CollectionJob(
            source_id=source.id,
            status=status,
            mode=source.mode,
            triggered_by=manager.id,
            triggered_by_name=manager.full_name,
            start_requested_at=started,
            started_at=started,
            finished_at=started + timedelta(milliseconds=duration),
            duration_ms=duration,
            records_collected=collected,
            records_processed=processed,
            records_failed=failed,
            duplicates_found=duplicates,
            invalid_found=max(0, collected - processed - duplicates),
            requests_made=max(1, collected // 25),
            progress_percent=100.0 if status == "completed" else round(rng.uniform(35, 80), 1),
            message=(
                f"{processed} new leads, {duplicates} duplicates, "
                f"{max(0, collected - processed - duplicates)} invalid, {failed} failed in {duration / 1000:.1f}s."
                if status == "completed"
                else ("Stopped by operator." if status == "stopped" else
                      "ComplianceError: domain not on the approved live-collection allowlist.")
            ),
            options={"max_records": source.max_records_per_run, "run_index": offset + 1},
        )
        db.add(job)
        db.flush()
        db.add(JobEvent(job_id=job.id, level="info",
                        message=f"Collection started for '{source.name}' (demo dataset mode)."))
        if status == "completed":
            db.add(JobEvent(job_id=job.id, level="success", message=job.message))
        elif status == "stopped":
            db.add(JobEvent(job_id=job.id, level="warn", message="Stop requested by operator."))
        else:
            db.add(JobEvent(job_id=job.id, level="error", message=job.message or "Collection failed"))
        for failure_index in range(failed):
            db.add(FailedRequest(
                job_id=job.id,
                source_id=source.id,
                url=f"https://demo-directory.example.com/business?page={7 + failure_index}",
                error_type="simulated_http_error" if status != "failed" else "compliance_block",
                status_code=429 if failure_index % 2 == 0 else 503,
                message=("HTTP 429 — upstream asked us to slow down; request skipped."
                         if failure_index % 2 == 0 else
                         "HTTP 503 — upstream temporarily unavailable; page skipped."),
                created_at=started + timedelta(seconds=failure_index * 3),
            ))
    db.commit()

    # --------------------------------------------------------- import/export
    batch = ImportBatch(
        filename="crm-export-october.csv",
        source_id=sources[5].id,
        rows_total=214,
        imported=186,
        duplicates=21,
        invalid=7,
        status="completed",
        mapping={"Business Name": "business_name", "Phone": "phone", "Email": "email",
                 "City": "city", "State": "state", "ZIP": "zip_code"},
        attestation="CRM export owned by our organisation; contracts on file with each business.",
        created_by=manager.id,
        created_by_name=manager.full_name,
        created_at=now - timedelta(days=6, hours=3),
    )
    db.add(batch)
    db.flush()
    for row_number, message in [
        (12, "Missing business name"),
        (47, "No usable business phone or e-mail"),
        (88, "Unrecognised state/region"),
        (129, "No usable business phone or e-mail"),
        (170, "Missing business name"),
        (188, "No usable business phone or e-mail"),
        (203, "Unrecognised ZIP/postal code"),
    ]:
        db.add(ImportRowError(batch_id=batch.id, row_number=row_number, message=message,
                             raw={"Business Name": "", "Phone": "555-01"}))
    db.add(ExportJob(
        format="csv", filters={"lead_status": ["new", "assigned"], "purpose": "October outbound wave"},
        rows=142, blocked=11, file_name="leads-20241024-0912.csv",
        created_by=manager.id, created_by_name=manager.full_name,
        created_at=now - timedelta(days=5, hours=2),
    ))
    db.add(ExportJob(
        format="xlsx", filters={"assigned_agent_id": agents[0].id, "purpose": "Maya call list"},
        rows=38, blocked=2, file_name="leads-20241027-1401.xlsx",
        created_by=admin.id, created_by_name=admin.full_name,
        created_at=now - timedelta(days=2, hours=5),
    ))
    db.commit()

    return {
        "seeded": True,
        "users": 2 + len(agents),
        "sources": len(sources),
        "leads": total_leads,
        "admin_email": ADMIN_EMAIL,
        "demo_password": DEMO_PASSWORD,
    }


def ensure_admin(db: Session) -> None:
    """Guarantee at least one usable admin exists (used on production start-up)."""
    count = db.scalar(select(func.count(User.id)).where(User.role == "admin")) or 0
    if count:
        return
    import os

    email = os.environ.get("ADMIN_EMAIL", ADMIN_EMAIL)
    password = os.environ.get("ADMIN_PASSWORD") or DEMO_PASSWORD
    db.add(User(email=email.lower(), full_name="Administrator", role="admin",
                hashed_password=hash_password(password)))
    db.commit()
    print(f"[seed] created admin {email}")

"""Shared pytest fixtures.

Every test run uses a throwaway SQLite database in a temporary directory, so the
developer's real `backend/data/leadbridge.db` is never touched. Environment
variables are set *before* the application package is imported because
`app.config` builds its settings once.
"""
from __future__ import annotations

import os
import secrets
import sys
import tempfile
from pathlib import Path

import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

TMP_DB_DIR = Path(tempfile.mkdtemp(prefix="leadbridge-test-db-"))

os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DEBUG": "false",
        "DATABASE_URL": f"sqlite:///{TMP_DB_DIR / 'test.db'}",
        "SECRET_KEY": secrets.token_urlsafe(48),
        "SEED_DEMO_DATA": "true",
        "DEMO_MODE_ENABLED": "true",
        # Keep the auth/rate-limit behaviour but give the suite enough headroom.
        "RATE_LIMIT_PER_MINUTE": "100000",
        "LOGIN_RATE_LIMIT_PER_MINUTE": "100000",
        "PUBLIC_FORM_RATE_LIMIT_PER_MINUTE": "100000",
    }
)

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402

ADMIN = {"email": "admin@leadbridge.demo", "password": "LeadBridge#2024"}
MANAGER = {"email": "manager@leadbridge.demo", "password": "LeadBridge#2024"}
AGENT = {"email": "maya@leadbridge.demo", "password": "LeadBridge#2024"}
AGENT2 = {"email": "daniel@leadbridge.demo", "password": "LeadBridge#2024"}


@pytest.fixture(scope="session")
def client():
    """Authenticated as the seeded admin (the demo password is public)."""
    with TestClient(app) as test_client:
        response = test_client.post("/api/auth/login", json=ADMIN)
        assert response.status_code == 200, response.text
        yield test_client


@pytest.fixture()
def anon():
    """A client with no session cookie (function-scoped so tests cannot leak logins)."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def agent_client():
    with TestClient(app) as test_client:
        response = test_client.post("/api/auth/login", json=AGENT)
        assert response.status_code == 200, response.text
        yield test_client


@pytest.fixture()
def manager_client():
    with TestClient(app) as test_client:
        response = test_client.post("/api/auth/login", json=MANAGER)
        assert response.status_code == 200, response.text
        yield test_client


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="session")
def seeded():
    """Counts produced by the demo seed, used for sanity assertions."""
    with TestClient(app) as test_client:
        test_client.post("/api/auth/login", json=ADMIN)
        dashboard = test_client.get("/api/dashboard").json()
        leads = test_client.get("/api/leads", params={"page_size": 1}).json()
        return {"cards": dashboard["cards"], "leads_total": leads["total"]}


@pytest.fixture()
def make_lead(client):
    """Create a throwaway lead through the public form (no direct DB writes)."""
    counter = {"n": 0}

    def _make(**overrides):
        counter["n"] += 1
        token = _lead_form_token(client)
        payload = {
            "business_name": f"Test Business {secrets.token_hex(3)}",
            "contact_name": "Test Contact",
            "contact_title": "Owner",
            "phone": "(512) 555-0100",
            "email": f"owner{secrets.token_hex(4)}@example.com",
            "city": "Austin",
            "state": "TX",
            "zip_code": "78701",
            "industry": "Retail",
            "consent_granted": True,
            "consent_text_version": "2024-01",
        }
        payload.update(overrides)
        response = client.post(f"/api/public/lead-form/{token}", json=payload)
        assert response.status_code in (201, 200), response.text
        reference = response.json()["reference"]
        return client.get(f"/api/leads/{_lead_id_for(reference)}").json()

    return _make


def _lead_id_for(reference: str) -> int:
    from app.models import Lead

    session = SessionLocal()
    try:
        lead = session.query(Lead).filter(Lead.lead_ref == reference).one()
        return lead.id
    finally:
        session.close()


def _lead_form_token(client) -> str:
    sources = client.get("/api/sources").json()["items"]
    lead_form = next(source for source in sources if source["adapter"] == "lead_form")
    token = lead_form["config"].get("form_token")
    assert token, "demo lead-form source is missing a token"
    return token


@pytest.fixture()
def settings_snapshot(client):
    """Restore organisation settings after a test changes them."""
    original = client.get("/api/settings").json()
    keys = (
        "export_require_consent",
        "export_exclude_invalid",
        "allow_agent_export",
        "collection_enabled",
        "daily_collection_limit",
        "data_retention_days",
        "audit_retention_days",
        "org_name",
    )
    snapshot = {key: original[key] for key in keys if key in original}
    yield snapshot
    client.put("/api/settings", json=snapshot)


def pytest_report_header(config):
    return f"LeadBridge tests · database={settings.database_url} · environment={settings.environment}"

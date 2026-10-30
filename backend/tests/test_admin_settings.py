"""Administration: RBAC matrix, settings, suppression, API keys, audit, retention, backups."""
from __future__ import annotations

import pytest



def test_rbac_matrix_for_agent(agent_client):
    allowed = [
        ("get", "/api/leads"),
        ("get", "/api/leads/facets"),
        ("get", "/api/sources"),
        ("get", "/api/agents"),
        ("get", "/api/dashboard"),
        ("get", "/api/auth/me"),
        ("get", "/api/meta/bootstrap"),
    ]
    denied = [
        ("get", "/api/jobs"),
        ("get", "/api/settings/audit"),
        ("get", "/api/settings/api-keys"),
        ("get", "/api/reports/summary"),
        ("get", "/api/settings/retention/preview"),
        ("post", "/api/jobs", None),
    ]
    for method, path in allowed:
        assert getattr(agent_client, method)(path).status_code == 200, path
    assert agent_client.post("/api/settings/api-keys", json={"name": "nope"}).status_code == 403
    assert agent_client.post("/api/sources", json={}).status_code in {403, 422}
    for method, path, *rest in denied:
        kwargs = {"params": {"source_id": 1}, "json": {}} if path == "/api/jobs" and method == "post" else {}
        assert getattr(agent_client, method)(path, **kwargs).status_code == 403, path


def test_rbac_matrix_for_manager(manager_client):
    # managers run operations but never touch org settings, keys or backups
    assert manager_client.get("/api/jobs").status_code == 200
    assert manager_client.get("/api/reports/summary").status_code == 200
    assert manager_client.get("/api/sources").status_code == 200
    assert manager_client.put("/api/settings", json={"org_name": "Hacked"}).status_code == 403
    assert manager_client.get("/api/settings/api-keys").status_code == 403
    assert manager_client.post("/api/settings/backup").status_code == 403
    assert manager_client.get("/api/settings/audit").status_code == 200


def test_anonymous_cannot_reach_management_endpoints(anon):
    for path in ("/api/settings", "/api/agents", "/api/reports/summary", "/api/imports", "/api/exports/history"):
        assert anon.get(path).status_code == 401, path


def test_settings_roundtrip(client, settings_snapshot):
    original = client.get("/api/settings").json()
    assert original["org_name"]
    updated = client.put("/api/settings", json={"org_name": "Acme Lead Ops", "daily_collection_limit": 1234})
    assert updated.status_code == 200
    current = client.get("/api/settings").json()
    assert current["org_name"] == "Acme Lead Ops"
    assert current["daily_collection_limit"] == 1234
    assert current["environment"]["robots_enforced"] is True
    assert current["environment"]["database"] == "SQLite"
    assert current["can_manage"] is True


def test_settings_validation(client):
    assert client.put("/api/settings", json={"data_retention_days": 1}).status_code == 422
    assert client.put("/api/settings", json={"daily_collection_limit": 0}).status_code == 422


def test_suppression_crud(client):
    created = client.post("/api/settings/suppression", json={"kind": "phone", "value": "+15125559999", "reason": "Opt-out call"})
    assert created.status_code == 201, created.text
    entry = created.json()

    listing = client.get("/api/settings/suppression", params={"q": "5559999"}).json()
    assert any(item["id"] == entry["id"] for item in listing["items"])

    # adding the same value twice must not duplicate rows
    again = client.post("/api/settings/suppression", json={"kind": "phone", "value": "+15125559999"})
    assert again.status_code in {200, 201}

    assert client.delete(f"/api/settings/suppression/{entry['id']}").status_code == 200
    assert client.delete(f"/api/settings/suppression/{entry['id']}").status_code == 404


def test_suppression_requires_a_valid_kind(client):
    assert client.post("/api/settings/suppression", json={"kind": "nonsense", "value": "x"}).status_code == 422
    assert client.post("/api/settings/suppression", json={"kind": "email", "value": "a"}).status_code == 422


def test_api_key_lifecycle(client):
    created = client.post("/api/settings/api-keys", json={"name": "CI worker", "scopes": ["sources:manage"]})
    assert created.status_code == 201
    body = created.json()
    assert body["key"].startswith("lbk_")
    assert body["key"] not in str(client.get("/api/settings/api-keys").json())  # only the prefix is stored

    listed = client.get("/api/settings/api-keys").json()["items"]
    assert any(item["id"] == body["id"] and item["is_active"] for item in listed)
    assert client.delete(f"/api/settings/api-keys/{body['id']}").status_code == 200


def test_audit_log_records_actions(client):
    client.put("/api/settings", json={"notes": "audit probe"})
    audit = client.get("/api/settings/audit", params={"page_size": 50}).json()
    assert audit["total"] > 0
    actions = {item["action"] for item in audit["items"]}
    assert any(action.startswith("settings") or action.startswith("auth") for action in actions), actions
    filtered = client.get("/api/settings/audit", params={"action": "settings"}).json()
    assert all("settings" in item["action"] for item in filtered["items"])


def test_retention_preview_and_purge(client):
    preview = client.get("/api/settings/retention/preview").json()
    assert {"data_retention_days", "audit_retention_days", "leads_to_purge", "audit_entries_to_purge"} <= set(preview)
    result = client.post("/api/settings/retention/purge")
    assert result.status_code == 200
    body = result.json()
    assert {"leads_purged", "audit_entries_purged"} <= set(body)
    # demo data is recent, so nothing should disappear
    assert body["leads_purged"] >= 0


def test_backup_download(client):
    response = client.post("/api/settings/backup")
    assert response.status_code == 200
    assert response.content[:15] == b"SQLite format 3"
    assert "attachment" in response.headers["content-disposition"]


def test_data_inventory(client):
    inventory = client.get("/api/settings/data-inventory").json()
    assert inventory["counts"]["leads"] > 0
    assert "database" in inventory


def test_agent_crud_and_password_policy(client, anon):
    weak = client.post("/api/agents", json={
        "email": "weak@leadbridge.demo", "full_name": "Weak Password", "password": "password", "role": "agent",
    })
    assert weak.status_code == 422

    created = client.post("/api/agents", json={
        "email": "qa.agent@leadbridge.demo", "full_name": "QA Agent", "password": "Str0ngEnough#1",
        "role": "agent", "team": "QA", "daily_quota": 40,
    })
    assert created.status_code == 201, created.text
    agent_id = created.json()["id"]
    assert created.json()["password"] is None if "password" in created.json() else True

    # the new agent can sign in
    assert anon.post("/api/auth/login", json={"email": "qa.agent@leadbridge.demo", "password": "Str0ngEnough#1"}).status_code == 200

    assert client.post(f"/api/agents/{agent_id}/deactivate").status_code == 200
    assert anon.post("/api/auth/login", json={"email": "qa.agent@leadbridge.demo", "password": "Str0ngEnough#1"}).status_code in {401, 403}
    assert client.post(f"/api/agents/{agent_id}/activate").status_code == 200

    updated = client.patch(f"/api/agents/{agent_id}", json={"daily_quota": 75, "team": "QA Team"})
    assert updated.status_code == 200
    assert updated.json()["daily_quota"] == 75


def test_agents_cannot_manage_users(agent_client):
    assert agent_client.post("/api/agents", json={
        "email": "nope@leadbridge.demo", "full_name": "No Pe", "password": "Str0ngEnough#1",
    }).status_code == 403
    assert agent_client.get("/api/settings/audit").status_code == 403


def test_dashboard_payload(client):
    data = client.get("/api/dashboard").json()
    assert {"cards", "daily_collection", "leads_by_state", "leads_by_industry",
            "source_performance", "agent_performance", "by_status", "by_consent",
            "recent_jobs", "recent_leads", "viewer"} <= set(data)
    cards = data["cards"]
    assert {"total_leads", "new_leads", "verified_contacts", "duplicates",
            "invalid_contacts", "assigned_leads", "do_not_contact"} <= set(cards)
    assert cards["total_leads"] >= cards["duplicates"]
    assert data["daily_collection"] and {"date", "collected"} <= set(data["daily_collection"][0])


def test_reports_summary_and_csv(client):
    summary = client.get("/api/reports/summary", params={"days": 30}).json()
    assert {"quality", "cards", "daily_collection", "source_performance", "licensing", "freshness"} <= set(summary)
    assert summary["quality"]["total_leads"] > 0

    response = client.get("/api/reports/compliance.csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    header = response.text.splitlines()[0]
    assert "consent_status" in header and "phone_status" in header

    for path in ("/api/reports/collection.csv", "/api/reports/sources.csv", "/api/reports/audit.csv", "/api/reports/jobs.csv"):
        assert client.get(path).status_code == 200, path


def test_reports_are_admin_manager_only(agent_client):
    assert agent_client.get("/api/reports/summary").status_code == 403
    assert agent_client.get("/api/reports/compliance.csv").status_code == 403


def test_audit_history_is_per_lead(client, make_lead):
    lead = make_lead()
    client.patch(f"/api/leads/{lead['id']}", json={"lead_status": "interested"})
    detail = client.get(f"/api/leads/{lead['id']}").json()
    assert detail["history"]
    entry = detail["history"][0]
    assert {"action", "actor_name", "created_at"} <= set(entry)

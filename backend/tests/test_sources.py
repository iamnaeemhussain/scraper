"""Source management: adapters, configuration, readiness, lifecycle and RBAC."""
from __future__ import annotations

import pytest


def _new_source_payload(**overrides):
    payload = {
        "name": "QA Test Directory",
        "adapter": "business_directory",
        "url": "https://qa-directory.test/businesses",
        "description": "Created by the test suite.",
        "mode": "demo",
        "licensing_status": "public_website",
        "consent_default": "unknown",
        "allowed_fields": ["business_name", "phone", "email", "city", "state", "zip_code"],
        "rate_limit_per_minute": 10,
        "min_delay_seconds": 2,
        "max_records_per_run": 25,
        "max_requests_per_run": 5,
        "attribution": "QA Test Directory",
        "config": {"listing_urls": ["https://qa-directory.test/businesses?page={page}"], "max_pages": 2},
    }
    payload.update(overrides)
    return payload


def test_list_sources_includes_adapter_metadata_and_stats(client):
    payload = client.get("/api/sources").json()
    assert payload["items"]
    source = payload["items"][0]
    assert source["meta"]["key"] == source["adapter"]
    assert {"leads", "duplicates", "jobs", "failed_requests"} <= set(source["stats"])
    assert "live_ready" in source
    assert source["attribution"]


def test_adapter_registry_exposes_compliance_metadata(client):
    adapters = client.get("/api/meta/bootstrap").json()["adapters"]
    keys = {adapter["key"] for adapter in adapters}
    assert {"business_directory", "company_website", "licensed_database", "contact_api", "upload", "lead_form"} <= keys
    for adapter in adapters:
        assert adapter["label"] and adapter["legal_basis"] and adapter["compliance_notes"]
        assert adapter["default_allowed_fields"]
        assert adapter["config_fields"]


def test_source_crud_lifecycle(client):
    created = client.post("/api/sources", json=_new_source_payload())
    assert created.status_code == 201, created.text
    source = created.json()
    source_id = source["id"]
    assert source["name"] == "QA Test Directory"
    assert source["stats"]["leads"] == 0

    updated = client.put(f"/api/sources/{source_id}", json={"name": "QA Renamed Directory", "max_records_per_run": 40})
    assert updated.status_code == 200
    assert updated.json()["name"] == "QA Renamed Directory"
    assert updated.json()["max_records_per_run"] == 40

    disabled = client.patch(f"/api/sources/{source_id}/enabled", params={"enabled": "false"})
    assert disabled.status_code == 200
    assert disabled.json()["is_enabled"] is False

    assert client.delete(f"/api/sources/{source_id}").status_code == 200
    assert client.get(f"/api/sources/{source_id}").status_code == 404


def test_source_validation_rejects_unknown_adapter_and_unsafe_fields(client):
    response = client.post("/api/sources", json=_new_source_payload(adapter="people_search_scraper"))
    assert response.status_code == 400
    assert "adapter" in response.text.lower()

    response = client.post(
        "/api/sources",
        json=_new_source_payload(name="PII Collector", allowed_fields=["business_name", "social_security_number", "age"]),
    )
    assert response.status_code == 400
    assert "prohibited" in response.text.lower()


def test_licensed_adapter_requires_credential_reference(client):
    response = client.post(
        "/api/sources",
        json=_new_source_payload(name="Licensed QA", adapter="licensed_database", credential_env=None),
    )
    assert response.status_code == 400
    assert "credential" in response.text.lower()


def test_lead_form_source_gets_a_public_token(client):
    source = client.post(
        "/api/sources",
        json=_new_source_payload(name="QA Enquiry Form", adapter="lead_form", url=""),
    ).json()
    assert source["config"].get("form_token")
    schema = client.get(f"/api/public/lead-form/{source['config']['form_token']}")
    assert schema.status_code == 200
    assert schema.json()["consent_text"]
    client.delete(f"/api/sources/{source['id']}")


def test_connection_test_reports_checks(client):
    source = client.post("/api/sources", json=_new_source_payload(name="QA Connection Test")).json()
    response = client.post(f"/api/sources/{source['id']}/test")
    assert response.status_code == 200
    body = response.json()
    assert body.get("checks"), body
    assert all({"check", "status", "detail"} <= set(check) for check in body["checks"])
    assert body["engine"]["robots_enforced"] is True
    client.delete(f"/api/sources/{source['id']}")


def test_live_mode_is_blocked_without_allowlist(client):
    source = client.post(
        "/api/sources",
        json=_new_source_payload(name="QA Live Attempt", mode="live", url="https://not-allowed-domain.test/"),
    ).json()
    assert source["mode"] == "live"
    assert source["live_ready"]["ready"] is False
    assert "domain" in (source["live_ready"]["reason"] or "").lower()
    client.delete(f"/api/sources/{source['id']}")


def test_source_fields_endpoint(client):
    source = client.get("/api/sources").json()["items"][0]
    response = client.get(f"/api/sources/{source['id']}/fields")
    assert response.status_code == 200
    assert response.json()


@pytest.mark.parametrize("method,path", [
    ("post", "/api/sources"),
    ("delete", "/api/sources/1"),
])
def test_agents_cannot_manage_sources(agent_client, method, path):
    response = getattr(agent_client, method)(path, json=_new_source_payload()) if method == "post" else agent_client.delete(path)
    assert response.status_code == 403


def test_agent_can_still_read_sources(agent_client):
    assert agent_client.get("/api/sources").status_code == 200

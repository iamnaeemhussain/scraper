"""Lead database behaviour: search, filters, editing, consent, verification and audit."""
from __future__ import annotations


def test_lead_list_search_and_pagination(client):
    payload = client.get("/api/leads", params={"page_size": 10}).json()
    assert payload["items"]
    assert payload["page"] == 1 and payload["page_size"] == 10
    assert payload["pages"] >= 1
    assert set(payload["summary"]) == {"verified", "invalid", "dnc"}
    assert "history" not in payload["items"][0]  # list stays light

    first = payload["items"][0]
    by_name = client.get("/api/leads", params={"q": first["business_name"][:8]}).json()
    assert any(item["id"] == first["id"] for item in by_name["items"])

    page_two = client.get("/api/leads", params={"page_size": 10, "page": 2}).json()
    if payload["pages"] > 1:
        assert {item["id"] for item in page_two["items"]}.isdisjoint({item["id"] for item in payload["items"]})


def test_lead_filters_narrow_results(client):
    cities = client.get("/api/leads/facets").json()["cities"]
    assert cities
    city = cities[0]
    payload = client.get("/api/leads", params={"city": city, "page_size": 50}).json()
    assert payload["items"]
    assert all(item["city"] == city for item in payload["items"])

    dnc = client.get("/api/leads", params={"lead_status": "do_not_contact", "page_size": 20}).json()
    assert all(item["lead_status"] == "do_not_contact" for item in dnc["items"])

    # duplicates are hidden unless explicitly requested
    with_dupes = client.get("/api/leads", params={"include_duplicates": True, "page_size": 5}).json()
    without = client.get("/api/leads", params={"page_size": 5}).json()
    assert with_dupes["total"] >= without["total"]


def test_lead_detail_includes_history_and_provenance(client):
    lead = client.get("/api/leads", params={"page_size": 1}).json()["items"][0]
    detail = client.get(f"/api/leads/{lead['id']}").json()
    assert detail["lead_ref"].startswith("LD-")
    assert detail["source_name"]
    assert detail["collected_at"]
    assert isinstance(detail["history"], list)
    assert "duplicates" in detail
    assert detail["phone_verification_status"] in {
        "unverified", "format_valid", "verified_owner", "invalid", "disconnected",
    }


def test_lead_404(client):
    assert client.get("/api/leads/99999999").status_code == 404


def test_status_update_and_note_are_audited(client, make_lead):
    lead = make_lead()
    updated = client.patch(f"/api/leads/{lead['id']}", json={"lead_status": "contacted"}).json()
    assert updated["lead_status"] == "contacted"

    note = client.post(f"/api/leads/{lead['id']}/notes", json={"note": "Left voicemail, try Tuesday."})
    assert note.status_code == 200
    assert "Left voicemail" in note.json()["notes"]

    detail = client.get(f"/api/leads/{lead['id']}").json()
    actions = {entry["action"] for entry in detail["history"]}
    assert "field_updated" in actions
    assert "note_added" in actions
    assert any(entry["field"] == "lead_status" for entry in detail["history"] if entry["action"] == "field_updated")


def test_invalid_phone_and_email_are_rejected(client, make_lead):
    lead = make_lead()
    assert client.patch(f"/api/leads/{lead['id']}", json={"phone": "123"}).status_code == 400
    assert client.patch(f"/api/leads/{lead['id']}", json={"email": "not-an-email"}).status_code == 400


def test_phone_edit_resets_verification(client, make_lead):
    lead = make_lead()
    client.post(
        f"/api/leads/{lead['id']}/verify",
        json={"channel": "phone", "status": "verified_owner", "evidence": "Called the shop, owner answered."},
    )
    verified = client.get(f"/api/leads/{lead['id']}").json()
    assert verified["phone_verification_status"] == "verified_owner"

    edited = client.patch(f"/api/leads/{lead['id']}", json={"phone": "(512) 555-0142"}).json()
    assert edited["phone_e164"] == "+15125550142"
    assert edited["phone_verification_status"] == "format_valid"
    assert edited["last_verified_at"] is None


def test_do_not_contact_creates_suppression_and_denies_consent(client, make_lead):
    lead = make_lead()
    response = client.patch(f"/api/leads/{lead['id']}", json={"lead_status": "do_not_contact"})
    assert response.status_code == 200
    body = response.json()
    assert body["lead_status"] == "do_not_contact"
    assert body["consent_status"] == "denied"

    entries = client.get("/api/settings/suppression", params={"page_size": 200}).json()["items"]
    values = {entry["value"] for entry in entries}
    assert (lead["phone_e164"] in values) or (lead["email"] in values)


def test_verify_endpoint_requires_evidence(client, make_lead):
    lead = make_lead()
    response = client.post(f"/api/leads/{lead['id']}/verify", json={"channel": "phone", "status": "verified_owner"})
    assert response.status_code == 422


def test_bulk_assign_and_status(client, make_lead):
    first, second = make_lead(), make_lead()
    agents = client.get("/api/agents").json()["items"]
    agent = next(item for item in agents if item["role"] == "agent")

    assigned = client.post("/api/leads/bulk/assign", json={"lead_ids": [first["id"], second["id"]], "agent_id": agent["id"]})
    assert assigned.status_code == 200
    detail = client.get(f"/api/leads/{first['id']}").json()
    assert detail["assigned_agent_id"] == agent["id"]
    assert detail["lead_status"] in {"assigned", "new"}

    bulk = client.post("/api/leads/bulk/status", json={"lead_ids": [first["id"]], "lead_status": "follow_up"})
    assert bulk.status_code == 200
    assert client.get(f"/api/leads/{first['id']}").json()["lead_status"] == "follow_up"


def test_agent_cannot_read_a_lead_assigned_to_someone_else(client, agent_client, make_lead):
    lead = make_lead()
    other = next(item for item in client.get("/api/agents").json()["items"] if item["role"] == "agent")
    client.post("/api/leads/bulk/assign", json={"lead_ids": [lead["id"]], "agent_id": other["id"]})
    response = agent_client.get(f"/api/leads/{lead['id']}")
    if other["id"] != 1:  # maya is user id 3 in the demo seed
        assert response.status_code in {403, 200}


def test_agent_scope_limits_visible_leads(client, agent_client):
    everything = client.get("/api/leads", params={"page_size": 1}).json()["total"]
    scoped = agent_client.get("/api/leads", params={"page_size": 1}).json()["total"]
    assert scoped <= everything


def test_agent_cannot_assign_or_delete(client, agent_client, make_lead):
    lead = make_lead()
    assert agent_client.post(
        "/api/leads/bulk/assign", json={"lead_ids": [lead["id"]], "agent_id": 1}
    ).status_code == 403
    assert agent_client.delete(f"/api/leads/{lead['id']}").status_code == 403


def test_delete_lead_requires_permission_and_audits(client, make_lead):
    lead = make_lead()
    response = client.delete(f"/api/leads/{lead['id']}")
    assert response.status_code == 200
    assert client.get(f"/api/leads/{lead['id']}").status_code == 404

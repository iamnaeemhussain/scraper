"""CSV/Excel imports and compliance-gated exports."""
from __future__ import annotations

import io

import pytest

IMPORT_HEADERS = (
    "Business Name,Contact Name,Contact Title,Phone,Email,Address,City,State,ZIP,"
    "Country,Industry,Website,Consent Status,Notes\n"
)
ATTESTATION = "Authorized: these businesses asked us to quote for their facility services."


def _csv(rows: list[str]) -> bytes:
    return (IMPORT_HEADERS + "\n".join(rows) + "\n").encode("utf-8")


def _upload(client, content: bytes, filename="leads.csv"):
    return {"file": (filename, io.BytesIO(content), "text/csv")}


def test_template_download(client):
    response = client.get("/api/imports/template")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    body = response.text
    for header in ("Business Name", "Phone", "Email", "Consent Status"):
        assert header in body
    assert "attachment" in response.headers["content-disposition"]

    xlsx = client.get("/api/imports/template", params={"format": "xlsx"})
    assert xlsx.status_code == 200
    assert xlsx.content[:2] == b"PK"


def test_preview_maps_columns_and_flags_unknowns(client):
    content = (
        IMPORT_HEADERS.rstrip("\n") + ",Favourite Colour\n"
        "Sunrise Cafe,Rita Sun,Owner,(512) 555-0132,rita@sunrisecafe.com,12 Main St,Austin,TX,78701,"
        "USA,Food & Beverage,https://sunrisecafe.com,granted,Call after 10am,blue\n"
    ).encode()
    response = client.post("/api/imports/preview", files=_upload(client, content))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["can_import"] is True
    assert body["mapping"]["Business Name"] == "business_name"
    assert body["mapping"]["Phone"] == "phone"
    assert body["mapping"]["Consent Status"] == "consent_status"
    assert body["unmapped_headers"] == ["Favourite Colour"]
    assert body["rows"] == 1
    assert body["preview"][0]["business_name"] == "Sunrise Cafe"


def test_preview_rejects_prohibited_columns(client):
    content = (
        "Business Name,Phone,SSN,Date of Birth,Ethnicity\n"
        "Sneaky Corp,(512) 555-0199,123-45-6789,1980-01-01,unknown\n"
    ).encode()
    body = client.post("/api/imports/preview", files=_upload(client, content)).json()
    assert body["can_import"] is False
    assert set(body["prohibited_headers"]) == {"SSN", "Date of Birth", "Ethnicity"}


def test_preview_requires_a_recognisable_header(client):
    response = client.post("/api/imports/preview", files=_upload(client, b"a,b,c\n1,2,3\n"))
    assert response.status_code == 400


def test_import_requires_attestation(client):
    content = _csv(["Attestation Test Co,Ann,Owner,(512) 555-0111,ann@attestationtest.com,1 Main,Austin,TX,78701,USA,Retail,,unknown,"])
    files = _upload(client, content)
    short = client.post("/api/imports", files=files, data={"attestation": "too short"})
    assert short.status_code == 400

    files = _upload(client, content)
    ok = client.post("/api/imports", files=files, data={"attestation": ATTESTATION})
    assert ok.status_code == 200, ok.text
    result = ok.json()
    assert result["imported"] == 1
    assert result["batch_id"]


def test_import_detects_duplicates_within_and_across_batches(client):
    row = "Dupe Bakery,Sam,Owner,(512) 555-0166,sam@dupebakery.com,9 Oak,Austin,TX,78702,USA,Food,,unknown,"
    first = client.post("/api/imports", files=_upload(client, _csv([row])), data={"attestation": ATTESTATION})
    assert first.json()["imported"] == 1

    second = client.post("/api/imports", files=_upload(client, _csv([row])), data={"attestation": ATTESTATION})
    assert second.json()["imported"] == 0
    assert second.json()["duplicates"] == 1

    # a suppression hit is stored, but only as a Do Not Contact record that can never be exported
    suppressed = client.post("/api/settings/suppression", json={"kind": "email", "value": "blocked@nope.com"})
    assert suppressed.status_code == 201
    blocked_row = "Blocked Co,Bob,Owner,(512) 555-0188,blocked@nope.com,4 Elm,Dallas,TX,75201,USA,Retail,,unknown,"
    result = client.post("/api/imports", files=_upload(client, _csv([blocked_row])), data={"attestation": ATTESTATION})
    assert result.json()["imported"] == 1
    found = client.get("/api/leads", params={"q": "Blocked Co"}).json()["items"]
    assert found and found[0]["lead_status"] == "do_not_contact"
    assert found[0]["consent_status"] == "denied"
    client.delete(f"/api/settings/suppression/{suppressed.json()['id']}")


def test_import_dry_run_does_not_persist(client):
    row = "Dry Run Co,Kim,Owner,(512) 555-0155,kim@dryrunco.com,7 Pine,Houston,TX,77002,USA,Retail,,unknown,"
    before = client.get("/api/leads", params={"q": "Dry Run Co"}).json()["total"]
    result = client.post(
        "/api/imports", files=_upload(client, _csv([row])),
        data={"attestation": ATTESTATION, "dry_run": "true"},
    ).json()
    after = client.get("/api/leads", params={"q": "Dry Run Co"}).json()["total"]
    assert result.get("dry_run") is True
    assert after == before


def test_import_history_and_detail(client):
    history = client.get("/api/imports", params={"page_size": 5}).json()
    assert history["items"]
    batch = history["items"][0]
    assert {"filename", "rows_total", "imported", "duplicates", "invalid", "mapping"} <= set(batch)
    detail = client.get(f"/api/imports/{batch['id']}").json()
    assert detail["id"] == batch["id"]


def test_export_preview_reports_blockers(client, settings_snapshot):
    body = client.post("/api/exports/preview", json={"filters": {}}).json()
    assert body["eligible"] >= 0
    assert "blocked" in body and "blocked_reasons" in body
    assert all({"reason", "count"} <= set(item) for item in body["blocked_reasons"])
    assert body["policy"]["exclude_invalid"] in {True, False}


def test_export_csv_headers_and_filename(client):
    response = client.post("/api/exports", json={"filters": {}, "format": "csv"})
    assert response.status_code == 200, response.text
    assert "text/csv" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]
    header = response.text.splitlines()[0]
    lowered = header.lower()
    for column in ("business name", "phone", "email", "lead status", "consent", "source url"):
        assert column in lowered
    assert response.headers.get("x-export-rows")


def test_export_xlsx(client):
    response = client.post("/api/exports", json={"filters": {}, "format": "xlsx"})
    assert response.status_code == 200
    assert response.content[:2] == b"PK"
    assert "spreadsheet" in response.headers["content-type"]


def test_export_never_includes_dnc_or_suppressed(client):
    """Whatever the filters, blocked records must not appear in the file."""
    lead = client.get("/api/leads", params={"page_size": 1, "lead_status": "do_not_contact"}).json()["items"]
    if not lead:
        pytest.skip("no DNC lead in the demo data")
    dnc = lead[0]
    response = client.post("/api/exports", json={"filters": {}, "format": "csv", "require_consent": False})
    assert response.status_code == 200
    assert dnc["business_name"] not in response.text


def test_export_with_impossible_filters_is_409(client):
    response = client.post("/api/exports", json={"filters": {"city": "Nowhereville-xyz"}})
    assert response.status_code == 409


def test_export_history(client):
    history = client.get("/api/exports/history", params={"page_size": 5}).json()
    assert history["items"]
    entry = history["items"][0]
    assert {"format", "rows", "blocked", "file_name", "created_by_name"} <= set(entry)


def test_import_and_export_require_permission(agent_client):
    assert agent_client.post("/api/imports/preview", files=_upload(agent_client, _csv([]))).status_code == 403
    assert agent_client.get("/api/imports/template").status_code == 403
    # agents may export only their own leads when policy allows it
    response = agent_client.post("/api/exports/preview", json={"filters": {}})
    assert response.status_code in {200, 403}
    if response.status_code == 200:
        assert response.json()["policy"]["agent_scoped"] is True


def test_export_policy_can_require_consent(client, settings_snapshot):
    client.put("/api/settings", json={"export_require_consent": True})
    body = client.post("/api/exports/preview", json={"filters": {}}).json()
    assert body["policy"]["require_consent"] is True
    reasons = " ".join(item["reason"] for item in body["blocked_reasons"]).lower()
    assert "consent" in reasons

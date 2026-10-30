"""The first-party lead form: tokenised, consented, rate limited, honeypot-protected."""
from __future__ import annotations

import pytest

from app.security import limiter


def _token(client) -> str:
    sources = client.get("/api/sources").json()["items"]
    source = next(item for item in sources if item["adapter"] == "lead_form")
    return source["config"]["form_token"]


def _payload(**overrides):
    payload = {
        "business_name": "Public Form Bakery",
        "contact_name": "Dana Form",
        "contact_title": "Owner",
        "phone": "(512) 555-0170",
        "email": "dana@publicformbakery.com",
        "city": "Austin",
        "state": "TX",
        "zip_code": "78704",
        "industry": "Food & Beverage",
        "consent_granted": True,
        "consent_text_version": "2024-01",
    }
    payload.update(overrides)
    return payload


def test_form_schema_is_public(client, anon):
    token = _token(client)
    schema = anon.get(f"/api/public/lead-form/{token}")
    assert schema.status_code == 200
    assert schema.json()["consent_text"]
    assert any(field["name"] == "business_name" for field in schema.json()["fields"])


def test_unknown_token_is_404(anon):
    assert anon.get("/api/public/lead-form/not-a-real-token").status_code == 404
    assert anon.post("/api/public/lead-form/not-a-real-token", json=_payload()).status_code == 404


def test_submission_requires_consent(client, anon):
    token = _token(client)
    response = anon.post(f"/api/public/lead-form/{token}", json=_payload(consent_granted=False))
    assert response.status_code == 400
    assert "consent" in response.text.lower()


def test_submission_is_stored_with_consent_evidence(client, anon):
    token = _token(client)
    response = anon.post(f"/api/public/lead-form/{token}", json=_payload(
        business_name="Consented Contact Co", email="hello@consentedcontact.co",
        message="Please quote our office cleaning.",
    ))
    assert response.status_code == 201, response.text
    reference = response.json()["reference"]
    assert reference.startswith("LD-")

    leads = client.get("/api/leads", params={"q": "Consented Contact Co"}).json()["items"]
    assert leads
    lead = client.get(f"/api/leads/{leads[0]['id']}").json()
    assert lead["consent_status"] == "granted"
    assert "consent" in (lead["consent_source"] or "").lower()
    assert lead["source_name"] == "Website Enquiry Form"


def test_honeypot_submission_is_silently_dropped(client, anon):
    token = _token(client)
    response = anon.post(f"/api/public/lead-form/{token}", json=_payload(
        business_name="Spam Bot Co", website="http://spam.example",
    ))
    assert response.status_code in {200, 201}
    found = client.get("/api/leads", params={"q": "Spam Bot Co"}).json()["total"]
    assert found == 0


def test_submission_is_rate_limited(client, anon):
    from app.config import settings

    token = _token(client)
    limiter.reset()
    original = settings.public_form_rate_limit_per_minute
    settings.public_form_rate_limit_per_minute = 3
    try:
        codes = [
            anon.post(f"/api/public/lead-form/{token}", json=_payload(
                business_name=f"Rate Limited {index}", email=f"rate{index}@ratelimit.test",
            )).status_code
            for index in range(5)
        ]
    finally:
        settings.public_form_rate_limit_per_minute = original
        limiter.reset()
    assert 429 in codes
    assert codes.index(429) >= 1


def test_disabled_form_is_refused(client, anon):
    sources = client.get("/api/sources").json()["items"]
    source = next(item for item in sources if item["adapter"] == "lead_form")
    client.patch(f"/api/sources/{source['id']}/enabled", params={"enabled": "false"})
    try:
        response = anon.post(f"/api/public/lead-form/{source['config']['form_token']}", json=_payload())
        assert response.status_code == 403
    finally:
        client.patch(f"/api/sources/{source['id']}/enabled", params={"enabled": "true"})


@pytest.mark.parametrize("bad", [{"business_name": ""}, {"email": "not-an-email", "phone": None}])
def test_invalid_submissions_are_rejected(client, anon, bad):
    token = _token(client)
    response = anon.post(f"/api/public/lead-form/{token}", json=_payload(**bad))
    assert response.status_code in {400, 422}

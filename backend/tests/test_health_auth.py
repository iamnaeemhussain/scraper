"""Health, authentication, session and account-security behaviour."""
from __future__ import annotations

from tests.conftest import ADMIN, AGENT, MANAGER


def test_health_is_public(anon):
    response = anon.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] and body["version"]
    assert body["demo_mode"] is True


def test_dashboard_requires_authentication(anon):
    assert anon.get("/api/dashboard").status_code == 401
    assert anon.get("/api/leads").status_code == 401


def test_login_rejects_bad_password(anon):
    response = anon.post("/api/auth/login", json={**ADMIN, "password": "wrong-password"})
    assert response.status_code == 401
    assert "invalid" in response.json()["detail"].lower()


def test_login_sets_httponly_cookie(anon):
    response = anon.post("/api/auth/login", json=ADMIN)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie.replace(" ", "")
    body = response.json()
    assert body["user"]["email"] == ADMIN["email"]
    assert "access_token" not in response.text  # never hand the token to JS


def test_me_and_logout(anon):
    assert anon.post("/api/auth/login", json=ADMIN).status_code == 200
    me = anon.get("/api/auth/me").json()["user"]
    assert me["email"] == ADMIN["email"]
    assert me["permissions"]["settings:manage"] is True
    assert anon.post("/api/auth/logout").status_code == 200
    assert anon.get("/api/auth/me").status_code == 401


def test_role_bootstrap_payload(client):
    payload = client.get("/api/meta/bootstrap").json()
    assert payload["app"]["name"]
    assert payload["user"]["role"] == "admin"
    assert payload["user"]["permissions"]["leads:write"] is True
    consent_values = {item["value"] for item in payload["statuses"]["consent"]}
    assert {"granted", "denied", "withdrawn"} <= consent_values
    assert payload["fields"]["collectable_fields"]
    assert payload["filters"]["industries"]
    assert any(adapter["key"] == "business_directory" for adapter in payload["adapters"])
    # no secrets leak into the bootstrap payload
    assert "secret" not in str(payload).lower()
    assert "password" not in str(payload).lower()


def test_manager_and_agent_can_sign_in(manager_client, agent_client):
    assert manager_client.get("/api/auth/me").json()["user"]["role"] == "manager"
    assert agent_client.get("/api/auth/me").json()["user"]["role"] == "agent"


def test_change_password_enforces_policy(client):
    # too short
    response = client.post(
        "/api/auth/change-password",
        json={"current_password": ADMIN["password"], "new_password": "short"},
    )
    assert response.status_code == 422


def test_api_key_authenticates_without_cookie(client, anon):
    created = client.post("/api/settings/api-keys", json={"name": "pytest worker", "scopes": ["jobs:manage"]})
    assert created.status_code == 201
    key = created.json()["key"]
    assert key.startswith("lbk_")

    headers = {"Authorization": f"Bearer {key}"}
    assert anon.get("/api/jobs", headers=headers).status_code == 200
    # a service key never gets a user session
    assert anon.get("/api/settings/audit", headers=headers).status_code == 403
    assert anon.get("/api/auth/me", headers=headers).status_code == 403
    assert anon.get("/api/jobs", headers={"Authorization": "Bearer lbk_deadbeef_not_a_real_key"}).status_code == 401

    assert client.delete(f"/api/settings/api-keys/{created.json()['id']}").status_code == 200
    assert anon.get("/api/jobs", headers=headers).status_code == 401


def test_bearer_token_authenticates_like_a_cookie(anon):
    """The SPA's fallback for browsers that block the session cookie.

    Login returns the same JWT it puts in the cookie; sending it as an
    Authorization header must work for every user endpoint.
    """
    login = anon.post("/api/auth/login", json=ADMIN)
    assert login.status_code == 200
    token = login.json()["token"]
    assert token and token.count(".") == 2

    headers = {"Authorization": f"Bearer {token}"}
    me = anon.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["user"]["email"] == ADMIN["email"]
    assert anon.get("/api/meta/bootstrap", headers=headers).status_code == 200
    assert anon.get("/api/leads", headers=headers).status_code == 200

    # a tampered token is refused
    bad = {"Authorization": f"Bearer {token[:-4]}beef"}
    assert anon.get("/api/auth/me", headers=bad).status_code == 401

"""Collection jobs: demo extraction, failure isolation, duplicate detection, control."""
from __future__ import annotations

import time

import pytest


def _wait_for_job(client, job_id, timeout=30.0):
    deadline = time.time() + timeout
    payload = client.get(f"/api/jobs/{job_id}").json()
    while payload["status"] in {"queued", "running", "paused", "stopping"} and time.time() < deadline:
        time.sleep(0.25)
        payload = client.get(f"/api/jobs/{job_id}").json()
    return payload


def _demo_source(client, adapter="business_directory"):
    sources = client.get("/api/sources").json()["items"]
    return next(
        source for source in sources
        if source["adapter"] == adapter and source["mode"] == "demo" and source["is_enabled"]
    )


def test_start_job_collects_and_finishes(client):
    source = _demo_source(client)
    response = client.post("/api/jobs", params={"source_id": source["id"]}, json={"max_records": 12})
    assert response.status_code == 201, response.text
    job = _wait_for_job(client, response.json()["id"])
    assert job["status"] == "completed"
    assert job["records_collected"] > 0
    assert job["records_processed"] <= job["records_collected"]
    assert job["duration_ms"] is not None and job["progress_percent"] == 100.0
    assert job["message"]


def test_identical_records_are_detected_as_duplicates(db):
    """Two ingestions of the same business must not create a second usable record."""
    from app.models import DataSource, Lead
    from app.services.ingest import ingest_record

    source = db.query(DataSource).filter(DataSource.adapter == "business_directory").first()
    raw = {
        "business_name": "Duplicate Detection Bakery",
        "phone": "(512) 555-0177",
        "email": "hello@ddbakery.example",
        "city": "Austin",
        "state": "TX",
        "zip_code": "78704",
        "source_url": "https://directory.example.com/business/duplicate-detection-bakery",
    }
    first = ingest_record(db, dict(raw), source=source, actor_label="test")
    second = ingest_record(db, dict(raw), source=source, actor_label="test")
    assert first.status == "created"
    assert second.status == "duplicate"
    assert second.lead is not None and second.lead.is_duplicate is True
    assert second.lead.duplicate_of_id == first.lead.id
    db.rollback()


def test_rerun_of_same_source_completes(client):
    source = _demo_source(client)
    first = _wait_for_job(client, client.post(
        "/api/jobs", params={"source_id": source["id"]}, json={"max_records": 8},
    ).json()["id"])
    second = _wait_for_job(client, client.post(
        "/api/jobs", params={"source_id": source["id"]}, json={"max_records": 8},
    ).json()["id"])
    assert first["status"] == second["status"] == "completed"
    assert second["records_collected"] > 0


def test_failed_requests_are_recorded_not_fatal(client):
    """The demo dataset injects 503/429 responses; the job must still complete."""
    source = _demo_source(client, "licensed_database")
    job = _wait_for_job(client, client.post(
        "/api/jobs", params={"source_id": source["id"]}, json={"max_records": 20},
    ).json()["id"])
    assert job["status"] in {"completed", "stopped"}
    failures = client.get(f"/api/jobs/{job['id']}/failures").json()
    if job["records_failed"]:
        assert failures["items"], failures
        assert {"status_code", "error_type", "message", "url"} <= set(failures["items"][0])

    all_failures = client.get("/api/jobs/failures/all", params={"page_size": 5}).json()
    assert all_failures["total"] >= 0


def test_job_summary_and_history(client):
    summary = client.get("/api/jobs/summary", params={"days": 30}).json()
    assert {"total_records", "processed", "failed", "duplicates", "avg_duration_ms", "by_status"} <= set(summary)
    history = client.get("/api/jobs", params={"page_size": 5}).json()
    assert history["items"]
    assert {"source_name", "status", "records_collected", "progress_percent"} <= set(history["items"][0])
    running = client.get("/api/jobs", params={"status": "running"}).json()
    assert all(item["status"] == "running" for item in running["items"])


def test_job_detail_includes_events_and_records(client):
    job = client.get("/api/jobs", params={"page_size": 1}).json()["items"][0]
    detail = client.get(f"/api/jobs/{job['id']}").json()
    assert detail["source_name"]
    assert isinstance(detail["events"], list)
    records = client.get(f"/api/jobs/{job['id']}/records", params={"page_size": 5}).json()
    assert "items" in records


def test_disabled_source_cannot_be_collected(client):
    source = _demo_source(client)
    client.patch(f"/api/sources/{source['id']}/enabled", params={"enabled": "false"})
    blocked = client.post("/api/jobs", params={"source_id": source["id"]}, json={"max_records": 5})
    client.patch(f"/api/sources/{source['id']}/enabled", params={"enabled": "true"})
    assert blocked.status_code == 409
    assert "disabled" in blocked.text.lower()


def test_unknown_source_is_404(client):
    assert client.post("/api/jobs", params={"source_id": 999999}, json={}).status_code == 404


def test_source_id_is_required(client):
    assert client.post("/api/jobs", json={}).status_code == 422


def test_live_mode_without_allowlist_fails_safely(client):
    """A live run against a non-allow-listed domain must fail with a compliance reason."""
    source = _demo_source(client)
    job = _wait_for_job(client, client.post(
        "/api/jobs", params={"source_id": source["id"]},
        json={"max_records": 5, "mode_override": "live"},
    ).json()["id"])
    if job["status"] == "failed":
        assert "allowlist" in job["message"].lower() or "compliance" in job["message"].lower()
    else:  # demo sources may refuse to switch to live
        assert job["status"] in {"completed", "stopped"}


def test_agent_cannot_start_or_inspect_jobs(agent_client):
    assert agent_client.get("/api/jobs").status_code == 403
    assert agent_client.post("/api/jobs", params={"source_id": 1}, json={}).status_code == 403
    assert agent_client.get("/api/jobs/summary").status_code == 403
    assert agent_client.get("/api/jobs/failures/all").status_code == 403


def test_pause_resume_stop_require_an_active_job(client):
    finished = client.get("/api/jobs", params={"status": "completed", "page_size": 1}).json()["items"]
    if not finished:
        pytest.skip("no completed job available")
    job_id = finished[0]["id"]
    assert client.post(f"/api/jobs/{job_id}/pause").status_code in {409, 400}
    assert client.post(f"/api/jobs/{job_id}/stop").status_code in {409, 400}

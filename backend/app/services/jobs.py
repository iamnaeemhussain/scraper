"""Background collection runner with pause / stop / progress control.

Jobs run in worker threads inside the Python API process (the extraction engine is
Python-only — it is never run inside Cloudflare Workers/Pages). A job only writes
through the ingest pipeline, so all validation and audit rules still apply.
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from sqlalchemy import select

from ..adapters.base import AdapterError, CollectionContext
from ..adapters.net import engine_info
from ..adapters.registry import get_adapter, get_meta
from ..config import settings
from ..database import session_scope
from ..models import CollectionJob, DataSource, FailedRequest, JobEvent, Lead, User
from .ingest import ingest_record

logger = logging.getLogger("leadbridge.jobs")


class JobControl:
    def __init__(self) -> None:
        self.stop_event = threading.Event()
        self.pause_event = threading.Event()  # set == paused
        self.paused = False
        self.stop_requested = False

    def request_pause(self) -> None:
        self.paused = True
        self.pause_event.set()

    def request_resume(self) -> None:
        self.paused = False
        self.pause_event.clear()

    def request_stop(self) -> None:
        self.stop_requested = True
        self.pause_event.clear()
        self.stop_event.set()

    def wait_if_paused(self) -> None:
        while self.pause_event.is_set() and not self.stop_event.is_set():
            time.sleep(0.25)

    def should_stop(self) -> bool:
        return self.stop_event.is_set()


class JobManager:
    def __init__(self) -> None:
        self._controls: dict[int, JobControl] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=settings.job_workers, thread_name_prefix="collect")

    # ------------------------------------------------------------------ API
    def submit(self, job_id: int) -> None:
        with self._lock:
            self._controls[job_id] = JobControl()
        self._executor.submit(self._run, job_id)

    def control(self, job_id: int) -> JobControl | None:
        return self._controls.get(job_id)

    def pause(self, job_id: int) -> bool:
        control = self._controls.get(job_id)
        if not control:
            return False
        control.request_pause()
        return True

    def resume(self, job_id: int) -> bool:
        control = self._controls.get(job_id)
        if not control:
            return False
        control.request_resume()
        return True

    def stop(self, job_id: int) -> bool:
        control = self._controls.get(job_id)
        if not control:
            return False
        control.request_stop()
        return True

    def is_running(self, job_id: int) -> bool:
        control = self._controls.get(job_id)
        return bool(control and not control.stop_event.is_set())

    # -------------------------------------------------------------- worker
    def _run(self, job_id: int) -> None:
        db = session_scope()
        control = self._controls.get(job_id) or JobControl()
        started = time.perf_counter()
        try:
            job = db.get(CollectionJob, job_id)
            if not job:
                return
            source = db.get(DataSource, job.source_id)
            if not source:
                job.status = "failed"
                job.message = "Source no longer exists."
                db.commit()
                return

            meta = get_meta(source.adapter)
            adapter = get_adapter(source.adapter)
            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            job.mode = source.mode
            db.commit()
            self._event(db, job_id, "info",
                        f"Collection started for '{source.name}' ({meta.label if meta else source.adapter}).")
            self._event(db, job_id, "info", f"Fetch engine: {engine_info()['active']} · "
                                            f"robots.txt enforced: {settings.respect_robots_txt}")

            if adapter is None:
                raise AdapterError(f"Unknown adapter '{source.adapter}'")

            # Provider evidence is only meaningful for API-based sources.
            options = job.options or {}
            run_index = int(options.get("run_index") or 1)
            ctx = CollectionContext(
                source=source,
                config=source.config or {},
                allowed_fields=list(source.allowed_fields or []),
                max_records=min(int(options.get("max_records") or source.max_records_per_run), 5000),
                max_requests=min(int(options.get("max_requests") or source.max_requests_per_run), 500),
                min_delay=float(source.min_delay_seconds or 0),
                run_index=run_index,
                db=db,
                should_stop=control.should_stop,
                wait_if_paused=control.wait_if_paused,
                log=lambda level, message: self._event(db, job_id, level, message),
                record_failure=lambda **kwargs: self._failure(db, job_id, source.id, **kwargs),
                stats={"requests_made": 0},
            )

            counts = {"created": 0, "duplicate": 0, "invalid": 0, "failed": 0, "seen": 0}
            last_commit = time.monotonic()

            for raw in adapter.collect(ctx):
                if control.should_stop():
                    break
                control.wait_if_paused()
                counts["seen"] += 1
                try:
                    result = ingest_record(
                        db, raw, source=source, actor_label=f"source:{source.name}",
                        commit=False, merge_missing=True,
                    )
                except Exception as exc:  # noqa: BLE001 - one bad record must not kill the job
                    db.rollback()
                    counts["failed"] += 1
                    self._failure(db, job_id, source.id, url=str(raw.get("source_url") or ""),
                                  error_type="ingest_error", message=f"{type(exc).__name__}: {exc}")
                    logger.exception("Ingest failure in job %s", job_id)
                    continue

                if result.status == "created":
                    counts["created"] += 1
                elif result.status == "duplicate":
                    counts["duplicate"] += 1
                else:
                    counts["invalid"] += 1

                job.records_collected = counts["seen"]
                job.records_processed = counts["created"]
                job.duplicates_found = counts["duplicate"]
                job.invalid_found = counts["invalid"]
                job.requests_made = int(ctx.stats.get("requests_made") or 0)
                job.progress_percent = float(ctx.stats.get("progress") or 0)
                if time.monotonic() - last_commit > 1.0:
                    db.commit()
                    last_commit = time.monotonic()

            db.commit()
            job.finished_at = datetime.now(timezone.utc)
            job.duration_ms = int((time.perf_counter() - started) * 1000)
            job.requests_made = int(ctx.stats.get("requests_made") or 0)
            job.progress_percent = 100.0 if not control.should_stop() else job.progress_percent
            if control.stop_requested:
                job.status = "stopped"
                job.message = "Stopped by operator."
            else:
                job.status = "completed"
                job.message = (
                    f"{counts['created']} new leads, {counts['duplicate']} duplicates, "
                    f"{counts['invalid']} invalid, {job.records_failed} failed request(s) in "
                    f"{job.duration_ms / 1000:.1f}s."
                )
            source.last_run_at = datetime.now(timezone.utc)
            db.commit()
            self._event(db, job_id, "success" if job.status == "completed" else "warn", job.message)
        except Exception as exc:  # noqa: BLE001 - surface error to the operator
            logger.exception("Collection job %s failed", job_id)
            db.rollback()
            try:
                job = db.get(CollectionJob, job_id)
                if job:
                    job.status = "failed"
                    job.finished_at = datetime.now(timezone.utc)
                    job.duration_ms = int((time.perf_counter() - started) * 1000)
                    job.message = f"{type(exc).__name__}: {exc}"[:900]
                    db.commit()
                    self._event(db, job_id, "error", job.message)
            except Exception:  # pragma: no cover
                db.rollback()
        finally:
            db.close()
            with self._lock:
                self._controls.pop(job_id, None)

    # ------------------------------------------------------------- helpers
    @staticmethod
    def _event(db, job_id: int, level: str, message: str) -> None:
        db.add(JobEvent(job_id=job_id, level=level, message=message[:1500]))
        try:
            db.commit()
        except Exception:  # pragma: no cover
            db.rollback()

    @staticmethod
    def _failure(db, job_id: int, source_id: int, **kwargs) -> None:
        db.add(
            FailedRequest(
                job_id=job_id,
                source_id=source_id,
                url=(kwargs.get("url") or "")[:600] or None,
                error_type=(kwargs.get("error_type") or "error")[:60],
                status_code=kwargs.get("status_code"),
                message=(kwargs.get("message") or "")[:1500],
            )
        )
        job = db.get(CollectionJob, job_id)
        if job:
            job.records_failed = (job.records_failed or 0) + 1
        try:
            db.commit()
        except Exception:  # pragma: no cover
            db.rollback()


job_manager = JobManager()


def recover_stale_jobs() -> None:
    """Jobs left 'running' by a restart are marked interrupted so the UI is honest."""
    db = session_scope()
    try:
        stale = db.scalars(
            select(CollectionJob).where(CollectionJob.status.in_(["running", "queued", "paused", "stopping"]))
        ).all()
        for job in stale:
            job.status = "failed"
            job.message = "Interrupted by a server restart. Start a new collection."
            job.finished_at = datetime.now(timezone.utc)
        if stale:
            db.commit()
            logger.info("Marked %s interrupted jobs as failed", len(stale))
    finally:
        db.close()

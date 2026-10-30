"""Shared demo-mode collection used by the adapters when no live credentials exist."""
from __future__ import annotations

from typing import Any, Iterator

from .base import CollectionContext
from .fixtures import demo_records


def run_demo(ctx: CollectionContext, *, per_run: int = 120, simulate_failures: bool = True) -> Iterator[dict[str, Any]]:
    """Stream a deterministic slice of the bundled synthetic dataset.

    A couple of synthetic upstream failures are emitted so that the "failed
    requests" view, retry handling and duration metrics can be exercised offline.
    They are clearly labelled as simulated in the job log.
    """
    ctx.log("info", f"Demo dataset mode: streaming synthetic records for '{ctx.source.name}'.")
    config = ctx.config or {}
    if config.get("simulate_failures", simulate_failures):
        pages = [
            ("https://demo-directory.example.com/business?page=7", 429,
             "HTTP 429 — upstream asked us to slow down. Request skipped, no retry storm."),
            ("https://demo-directory.example.com/business?page=9", 503,
             "HTTP 503 — upstream temporarily unavailable; page skipped."),
        ]
        for url, status, message in pages:
            ctx.record_failure(url=url, error_type="simulated_http_error", status_code=status,
                               message=f"[simulated] {message}")
        ctx.log("warn", "2 simulated upstream failures recorded (demo mode).")

    count = min(per_run, ctx.max_records)
    records = demo_records(ctx.source.adapter + f":{ctx.source.name}", ctx.run_index, count)
    for index, record in enumerate(records, start=1):
        if ctx.should_stop():
            return
        ctx.wait_if_paused()
        if index % 25 == 0:
            ctx.log("info", f"Demo stream progress: {index}/{len(records)} records.")
            ctx.stats["progress"] = round(index / max(len(records), 1) * 100, 1)
        yield record

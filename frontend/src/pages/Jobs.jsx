import { useCallback, useEffect, useMemo, useState } from "react";
import { api, duration, formatDate, formatNumber, timeAgo } from "../api";
import { useAuth } from "../auth";
import {
  Badge, Button, EmptyState, ErrorState, Field, Icon, Loading, Modal, NoAccess, Pagination, Progress,
  SkeletonRows, Tabs, useToast,
} from "../ui";

const STATUS_TONE = {
  queued: "blue", running: "indigo", paused: "amber", stopping: "amber",
  stopped: "neutral", completed: "green", failed: "red",
};

const STATUS_LABEL = {
  queued: "Queued", running: "Running", paused: "Paused", stopping: "Stopping",
  stopped: "Stopped", completed: "Completed", failed: "Failed",
};

export default function Jobs() {
  const { can } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [failures, setFailures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);
  const [startOpen, setStartOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [view, setView] = useState("jobs");

  const permitted = can("jobs:manage");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!permitted) {
      setLoading(false);
      return null;
    }
    if (!silent) setLoading(true);
    try {
      const params = { page, page_size: 15 };
      if (tab !== "all") params.status = tab;
      const [jobsResult, summaryResult] = await Promise.all([
        api.get("/api/jobs", params),
        api.get("/api/jobs/summary", { days: 30 }),
      ]);
      setData(jobsResult);
      setSummary(summaryResult);
      setError(null);
      return jobsResult;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [page, tab, permitted]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const anyRunning = data?.items?.some((job) => ["running", "queued", "paused", "stopping"].includes(job.status));
    if (!anyRunning) return undefined;
    const timer = setInterval(() => load({ silent: true }), 4000);
    return () => clearInterval(timer);
  }, [data, load]);

  useEffect(() => {
    if (view !== "failures") return;
    api.get("/api/jobs/failures/all", { page_size: 50 })
      .then(setFailures)
      .catch((err) => toast.error("Could not load failed requests", err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  if (!permitted) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Collection jobs</h1>
            <div className="sub">Start, pause and stop extraction runs. Every request that fails is recorded with its reason.</div>
          </div>
        </div>
        <div className="card"><NoAccess permission="jobs:manage" message="Only managers and administrators can start, pause or inspect collection jobs." /></div>
      </div>
    );
  }

  const action = async (job, kind) => {
    setBusyId(job.id);
    try {
      await api.post(`/api/jobs/${job.id}/${kind}`);
      toast.success(`Job #${job.id} ${kind === "stop" ? "stopping" : `${kind}d`}`);
      await load({ silent: true });
    } catch (err) {
      toast.error(`Could not ${kind} job`, err.message);
    } finally {
      setBusyId(null);
    }
  };

  const tabs = useMemo(() => {
    const counts = summary?.by_status || {};
    return [
      { value: "all", label: "All jobs" },
      { value: "running", label: "Running", count: (counts.running || 0) + (counts.queued || 0) },
      { value: "paused", label: "Paused", count: counts.paused || 0 },
      { value: "completed", label: "Completed", count: counts.completed || 0 },
      { value: "failed,stopped", label: "Failed / stopped", count: (counts.failed || 0) + (counts.stopped || 0) },
    ];
  }, [summary]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Collection jobs</h1>
          <div className="sub">Start, pause and stop extraction runs. Every request that fails is recorded with its reason.</div>
        </div>
        <div className="page-head-actions">
          <Button icon="refresh" onClick={() => load()} disabled={loading}>Refresh</Button>
          {can("jobs:manage") && <Button variant="primary" icon="play" onClick={() => setStartOpen(true)}>New collection</Button>}
        </div>
      </div>

      <div className="stat-strip">
        <div className="hero-metric">
          <div className="hm-label">Records collected (30d)</div>
          <div className="hm-value">{formatNumber(summary?.total_records ?? 0)}</div>
          <div className="hm-sub">{summary?.running || 0} running now</div>
        </div>
        <div className="hero-metric">
          <div className="hm-label">Processed &amp; saved</div>
          <div className="hm-value" style={{ color: "var(--success)" }}>{formatNumber(summary?.processed ?? 0)}</div>
          <div className="hm-sub">new unique leads</div>
        </div>
        <div className="hero-metric">
          <div className="hm-label">Duplicates</div>
          <div className="hm-value" style={{ color: "var(--warning)" }}>{formatNumber(summary?.duplicates ?? 0)}</div>
          <div className="hm-sub">merged or flagged</div>
        </div>
        <div className="hero-metric">
          <div className="hm-label">Failed records</div>
          <div className="hm-value" style={{ color: "var(--danger)" }}>{formatNumber(summary?.failed ?? 0)}</div>
          <div className="hm-sub">{summary?.invalid || 0} invalid</div>
        </div>
        <div className="hero-metric">
          <div className="hm-label">Duration</div>
          <div className="hm-value">{duration(summary?.avg_duration_ms)}</div>
          <div className="hm-sub">average per run</div>
        </div>
      </div>

      <div className="row between wrap" style={{ gap: 10 }}>
        <Tabs
          tabs={[...tabs, { value: "failures", label: "Failed requests", icon: "alert" }]}
          value={view === "failures" ? "failures" : tab}
          onChange={(value) => {
            if (value === "failures") setView("failures");
            else { setView("jobs"); setTab(value); setPage(1); }
          }}
        />
      </div>

      {view === "failures" ? (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Failed requests</h3>
              <div className="sub">Every failed fetch, compliance block and rate-limit skip, newest first</div>
            </div>
            <div className="card-head-actions"><Badge tone="red">{failures?.total ?? 0} total</Badge></div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>When</th><th>Source</th><th>Job</th><th>Type</th><th>Status</th><th>URL</th><th>Message</th></tr>
              </thead>
              <tbody>
                {!failures && <tr><td colSpan={7}><Loading label="Loading failures…" /></td></tr>}
                {failures?.items?.length === 0 && <tr><td colSpan={7}><EmptyState icon="check" title="No failed requests" message="Every request completed cleanly." /></td></tr>}
                {failures?.items?.map((failure) => (
                  <tr key={failure.id}>
                    <td className="nowrap small muted">{timeAgo(failure.created_at)}</td>
                    <td className="small">{failure.source_name || "—"}</td>
                    <td className="mono">#{failure.job_id}</td>
                    <td><Badge tone={failure.error_type.includes("compliance") ? "red" : "amber"}>{failure.error_type.replace(/_/g, " ")}</Badge></td>
                    <td className="mono">{failure.status_code || "—"}</td>
                    <td className="small truncate" style={{ maxWidth: 260 }} title={failure.url}>{failure.url || "—"}</td>
                    <td className="small muted" style={{ maxWidth: 320 }}>{failure.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th><th>Source</th><th>Status</th><th>Progress</th>
                  <th className="num">Collected</th><th className="num">New</th><th className="num">Dupes</th>
                  <th className="num">Failed</th><th>Duration</th><th>Started</th><th style={{ width: 150 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data && <tr><td colSpan={11}><SkeletonRows rows={6} columns={7} /></td></tr>}
                {error && <tr><td colSpan={11}><ErrorState message={error} onRetry={() => load()} /></td></tr>}
                {!loading && data?.items?.length === 0 && (
                  <tr><td colSpan={11}><EmptyState icon="jobs" title="No collection jobs yet" message="Start a collection from a data source to see its history here." /></td></tr>
                )}
                {data?.items?.map((job) => {
                  const active = ["running", "queued", "paused", "stopping"].includes(job.status);
                  const progress = job.status === "completed" ? 100 : job.progress_percent || (job.records_collected ? Math.min(96, job.records_collected / Math.max(job.options?.max_records || 100, 1) * 100) : 0);
                  return (
                    <tr key={job.id} className="clickable" onClick={() => setDetailId(job.id)}>
                      <td><span className="mono">#{job.id}</span></td>
                      <td>
                        <div className="cell-title truncate" style={{ maxWidth: 190 }}>{job.source_name}</div>
                        <div className="cell-sub">{job.mode === "demo" ? "demo dataset" : "live"} · {job.triggered_by_name || "system"}</div>
                      </td>
                      <td><Badge tone={STATUS_TONE[job.status]} dot>{STATUS_LABEL[job.status] || job.status}</Badge></td>
                      <td>
                        <div className="job-progress">
                          <Progress value={progress} tone={job.status === "failed" ? "red" : job.status === "completed" ? "green" : ""} />
                          <span className="meta"><span>{job.status === "completed" ? "done" : `${Math.round(progress)}%`}</span><span>{job.records_processed}/{job.records_collected}</span></span>
                        </div>
                      </td>
                      <td className="num">{job.records_collected}</td>
                      <td className="num strong">{job.records_processed}</td>
                      <td className="num">{job.duplicates_found}</td>
                      <td className="num" style={{ color: job.records_failed ? "var(--danger)" : undefined }}>{job.records_failed}</td>
                      <td className="small muted nowrap">{duration(job.duration_ms)}</td>
                      <td className="small muted nowrap">{job.started_at ? timeAgo(job.started_at) : "queued"}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <div className="row" style={{ gap: 5 }}>
                          {job.status === "running" && (
                            <Button size="sm" icon="pause" disabled={busyId === job.id} onClick={() => action(job, "pause")} title="Pause" />
                          )}
                          {job.status === "paused" && (
                            <Button size="sm" icon="play" disabled={busyId === job.id} onClick={() => action(job, "resume")} title="Resume" />
                          )}
                          {active && (
                            <Button size="sm" variant="danger" icon="stop" disabled={busyId === job.id} onClick={() => action(job, "stop")} title="Stop" />
                          )}
                          <Button size="sm" variant="ghost" icon="eye" onClick={() => setDetailId(job.id)} title="View" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={setPage} label="jobs" />}
        </div>
      )}

      <JobDetail jobId={detailId} onClose={() => setDetailId(null)} onChanged={() => load({ silent: true })} />

      <StartCollectionModal
        open={startOpen}
        onClose={() => setStartOpen(false)}
        onStarted={() => { setStartOpen(false); setTab("running"); setView("jobs"); setPage(1); load(); }}
      />
    </div>
  );
}

function JobDetail({ jobId, onClose, onChanged }) {
  const toast = useToast();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!jobId) return;
    try {
      setJob(await api.get(`/api/jobs/${jobId}`));
    } catch (err) {
      toast.error("Could not load job", err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, toast]);

  useEffect(() => {
    if (!jobId) return undefined;
    setJob(null);
    setLoading(true);
    load();
    const timer = setInterval(() => load(), 4000);
    return () => clearInterval(timer);
  }, [jobId, load]);

  if (!jobId) return null;

  const act = async (kind) => {
    try {
      await api.post(`/api/jobs/${jobId}/${kind}`);
      toast.success(`Job ${kind === "stop" ? "stopping" : `${kind}d`}`);
      load();
      onChanged?.();
    } catch (err) {
      toast.error("Action failed", err.message);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xwide"
      title={job ? `Job #${job.id} · ${job.source_name}` : "Collection job"}
      subtitle={job ? `${STATUS_LABEL[job.status]} · ${job.mode} mode · started by ${job.triggered_by_name || "system"}` : ""}
      footer={
        job ? (
          <>
            <span className="left xs muted" style={{ maxWidth: 420 }}>{job.message}</span>
            {job.status === "running" && <Button icon="pause" onClick={() => act("pause")}>Pause</Button>}
            {job.status === "paused" && <Button icon="play" onClick={() => act("resume")}>Resume</Button>}
            {["running", "paused", "queued"].includes(job.status) && <Button variant="danger" icon="stop" onClick={() => act("stop")}>Stop</Button>}
            <Button onClick={onClose}>Close</Button>
          </>
        ) : <Button onClick={onClose}>Close</Button>
      }
    >
      {loading && !job && <Loading label="Loading job…" />}
      {job && (
        <div className="col" style={{ gap: 18 }}>
          <div className="metric-row">
            <div className="metric"><div className="m-label">Collected</div><div className="m-value">{job.records_collected}</div></div>
            <div className="metric"><div className="m-label">New leads</div><div className="m-value" style={{ color: "var(--success)" }}>{job.records_processed}</div></div>
            <div className="metric"><div className="m-label">Duplicates</div><div className="m-value">{job.duplicates_found}</div></div>
            <div className="metric"><div className="m-label">Invalid</div><div className="m-value">{job.invalid_found}</div></div>
            <div className="metric"><div className="m-label">Failed requests</div><div className="m-value" style={{ color: "var(--danger)" }}>{job.records_failed}</div></div>
            <div className="metric"><div className="m-label">Duration</div><div className="m-value">{duration(job.duration_ms)}</div></div>
            <div className="metric"><div className="m-label">Requests made</div><div className="m-value">{job.requests_made}</div></div>
          </div>

          <Progress value={job.status === "completed" ? 100 : job.progress_percent} tone={job.status === "failed" ? "red" : job.status === "completed" ? "green" : ""} height={8} />

          <div className="grid cols-2">
            <div>
              <div className="row between mb-2"><strong style={{ fontSize: 13 }}>Event log</strong><span className="xs faint">{job.events?.length} events</span></div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {(job.events || []).map((event) => (
                  <div className="job-event" key={event.id}>
                    <span className={`level ${event.level}`}>{event.level}</span>
                    <span className="msg">{event.message}</span>
                    <span className="time">{timeAgo(event.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="row between mb-2"><strong style={{ fontSize: 13 }}>Failed requests</strong><span className="xs faint">{job.failures?.length || 0} recorded</span></div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {(job.failures || []).map((failure) => (
                  <div className="job-event" key={failure.id}>
                    <Badge tone={failure.error_type?.includes("compliance") ? "red" : "amber"}>
                      {failure.status_code || failure.error_type}
                    </Badge>
                    <span className="msg">
                      <span className="mono xs">{failure.error_type}</span>
                      <span style={{ display: "block", fontSize: 12 }}>{failure.message}</span>
                    </span>
                  </div>
                ))}
                {!job.failures?.length && <div className="empty small" style={{ padding: 20 }}>No failed requests 🎉</div>}
              </div>
            </div>
          </div>

          <div>
            <div className="row between mb-2"><strong style={{ fontSize: 13 }}>Recently collected records</strong><span className="xs faint">from this source</span></div>
            <div className="table-wrap">
              <table className="data compact">
                <thead><tr><th>Record</th><th>Business</th><th>Phone</th><th>Location</th><th>Status</th></tr></thead>
                <tbody>
                  {(job.records || []).map((record) => (
                    <tr key={record.id}>
                      <td className="mono">{record.lead_ref}</td>
                      <td>{record.business_name}</td>
                      <td>{record.phone || "—"}</td>
                      <td className="small muted">{[record.city, record.state].filter(Boolean).join(", ") || "—"}</td>
                      <td><Badge tone="neutral">{record.lead_status.replace(/_/g, " ")}</Badge></td>
                    </tr>
                  ))}
                  {!job.records?.length && <tr><td colSpan={5}><div className="empty small">No records collected by this source yet.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StartCollectionModal({ open, onClose, onStarted }) {
  const toast = useToast();
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [maxRecords, setMaxRecords] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    api.get("/api/sources")
      .then((result) => {
        const enabled = (result.items || []).filter((item) => item.is_enabled);
        setSources(enabled);
        if (enabled.length) {
          setSourceId(enabled[0].id);
          setMaxRecords(enabled[0].max_records_per_run);
        }
      })
      .catch((err) => setError(err.message));
  }, [open]);

  const source = sources.find((item) => String(item.id) === String(sourceId));

  const start = async () => {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const job = await api.post(`/api/jobs?source_id=${source.id}`, { max_records: Number(maxRecords) });
      toast.success("Collection started", `${job.source_name} · job #${job.id}`);
      onStarted?.(job);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a collection"
      subtitle="Choose an enabled source and a per-run record cap"
      footer={
        <>
          {error && <span className="left small" style={{ color: "var(--danger)", maxWidth: 380 }}>{error}</span>}
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon="play" onClick={start} loading={busy} disabled={!source}>Start collection</Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {!sources.length && <div className="alert warning"><Icon name="alert" size={16} /><span>No enabled sources. Enable a source in Data Sources first.</span></div>}
        <Field label="Data source" required>
          <select className="select" value={sourceId} onChange={(event) => {
            const id = event.target.value;
            setSourceId(id);
            const chosen = sources.find((item) => String(item.id) === String(id));
            if (chosen) setMaxRecords(chosen.max_records_per_run);
          }}>
            {sources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.mode === "demo" ? "demo" : "live"} · {item.adapter.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Maximum records" hint="The source's own cap still applies.">
          <input className="input" type="number" min="1" max="5000" value={maxRecords} onChange={(event) => setMaxRecords(event.target.value)} />
        </Field>
        {source && (
          <div className="alert info">
            <Icon name="info" size={16} />
            <span>
              {source.mode === "demo"
                ? "This source streams the bundled synthetic dataset — no external requests are made."
                : `Live mode. Domain allowlist and robots.txt are checked before every request (≤ ${source.rate_limit_per_minute}/min, ${source.min_delay_seconds}s delay).`}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

import { useState } from "react";
import { api, downloadFile, formatDate, formatNumber } from "../api";
import { useAuth } from "../auth";
import { AreaChart, BarList, Donut } from "../charts";
import { Badge, Button, ErrorState, Icon, Loading, NoAccess, Progress, useFetch, useToast } from "../ui";

const REPORTS = [
  {
    id: "collection",
    title: "Daily collection",
    description: "New leads and duplicate sightings per day over the reporting period.",
    endpoint: "/api/reports/collection.csv",
    icon: "activity",
  },
  {
    id: "sources",
    title: "Source performance & attribution",
    description: "Records, duplicates, runs and licence status for every adapter — proves provenance.",
    endpoint: "/api/reports/sources.csv",
    icon: "sources",
  },
  {
    id: "compliance",
    title: "Compliance register",
    description: "Per-record consent, verification status, licensing and data freshness.",
    endpoint: "/api/reports/compliance.csv",
    icon: "shield",
  },
  {
    id: "audit",
    title: "Record audit history",
    description: "Every change made to a lead with the actor, field and timestamp.",
    endpoint: "/api/reports/audit.csv",
    icon: "list",
  },
  {
    id: "jobs",
    title: "Collection job log",
    description: "Run outcomes, duration, duplicates and failed request counts.",
    endpoint: "/api/reports/jobs.csv",
    icon: "jobs",
  },
];

export default function Reports() {
  const { can } = useAuth();
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(null);
  const { data, loading, error, refresh } = useFetch(() => api.get("/api/reports/summary", { days }), [days]);

  if (!can("reports:read")) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Reports</h1>
            <div className="sub">Evidence for compliance reviews: where every record came from and what was exported.</div>
          </div>
        </div>
        <div className="card"><NoAccess permission="reports:read" message="Compliance reports are limited to managers and administrators." /></div>
      </div>
    );
  }

  if (loading && !data) return <div className="page"><div className="card"><Loading label="Building report…" /></div></div>;
  if (error) return <div className="page"><div className="card"><ErrorState message={error} onRetry={refresh} /></div></div>;

  const download = async (report) => {
    setBusy(report.id);
    try {
      const result = await downloadFile(report.endpoint, { method: "GET" });
      toast.success("Report downloaded", result.filename);
    } catch (err) {
      toast.error("Download failed", err.message);
    } finally {
      setBusy(null);
    }
  };

  const { quality, cards } = data;
  const verificationColors = {
    verified_owner: "#12b76a", mx_valid: "#0d9488", format_valid: "#f79009", syntax_valid: "#fbbf24",
    unverified: "#cbd5e1", invalid: "#f04438", disconnected: "#b42318", bounced: "#912018",
  };

  const phoneDonut = Object.entries(
    data.verification_matrix.reduce((acc, row) => {
      acc[row.phone] = (acc[row.phone] || 0) + row.count;
      return acc;
    }, {}),
  ).map(([label, value]) => ({ label: label.replace(/_/g, " "), value, color: verificationColors[label] }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <div className="sub">
            Evidence for compliance reviews: where every record came from, how it was verified and what was exported.
          </div>
        </div>
        <div className="page-head-actions">
          <div className="segmented">
            {[7, 30, 90].map((value) => (
              <button key={value} className={days === value ? "active" : ""} onClick={() => setDays(value)}>{value}d</button>
            ))}
          </div>
          <Button icon="refresh" onClick={refresh} disabled={loading}>Refresh</Button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="hero-metric"><div className="hm-label">Total leads</div><div className="hm-value">{formatNumber(quality.total_leads)}</div><div className="hm-sub">{quality.duplicates} duplicate sightings</div></div>
        <div className="hero-metric"><div className="hm-label">Duplicate rate</div><div className="hm-value">{quality.duplicate_rate}%</div><div className="hm-sub">of all collected rows</div></div>
        <div className="hero-metric"><div className="hm-label">Verified phone</div><div className="hm-value" style={{ color: "var(--success)" }}>{formatNumber(quality.verified_phone)}</div><div className="hm-sub">provider / owner confirmed</div></div>
        <div className="hero-metric"><div className="hm-label">Do Not Contact</div><div className="hm-value" style={{ color: "var(--danger)" }}>{formatNumber(quality.dnc)}</div><div className="hm-sub">{quality.suppressed} suppression entries</div></div>
        <div className="hero-metric"><div className="hm-label">Missing phone</div><div className="hm-value">{formatNumber(quality.missing_phone)}</div><div className="hm-sub">{quality.missing_email} missing e-mail</div></div>
      </div>

      <div className="grid cols-3 mt-2">
        {REPORTS.map((report) => (
          <div className="card report-card" key={report.id}>
            <h3><span className="kpi-icon" style={{ width: 26, height: 26, flexBasis: 26 }}><Icon name={report.icon} size={14} /></span>{report.title}</h3>
            <p>{report.description}</p>
            <Button size="sm" icon="download" onClick={() => download(report)} loading={busy === report.id}>Download CSV</Button>
          </div>
        ))}
      </div>

      <div className="dash-grid-main">
        <div className="card">
          <div className="card-head">
            <div><h3>Collection trend</h3><div className="sub">Last {days} days</div></div>
          </div>
          <div className="card-body">
            <AreaChart
              data={data.daily_collection}
              height={220}
              series={[{ key: "collected", label: "New leads", color: "#4f46e5" }]}
              formatLabel={(row) => new Date(`${row.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div><h3>Phone verification mix</h3><div className="sub">Only provider evidence reaches “verified”</div></div>
          </div>
          <div className="card-body">
            <Donut items={phoneDonut} centerLabel="records" size={158} thickness={21} />
          </div>
        </div>
      </div>

      <div className="dash-grid-secondary">
        <div className="card">
          <div className="card-head"><div><h3>Leads by state</h3><div className="sub">Coverage across regions</div></div></div>
          <div className="card-body"><BarList items={data.by_state} tone="teal" /></div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Data freshness</h3><div className="sub">Age of the collected records</div></div></div>
          <div className="card-body">
            <div className="col" style={{ gap: 12 }}>
              {Object.entries(data.freshness).map(([label, count]) => (
                <div key={label}>
                  <div className="row between small" style={{ marginBottom: 4 }}>
                    <span style={{ textTransform: "capitalize" }}>{label}</span>
                    <span className="muted">{formatNumber(count)}</span>
                  </div>
                  <Progress
                    value={(count / Math.max(1, quality.total_leads)) * 100}
                    tone={label === "fresh" ? "green" : label === "expired" ? "red" : label === "stale" ? "amber" : ""}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-head">
          <div><h3>Source attribution</h3><div className="sub">Every record is traceable to the source that produced it</div></div>
          <div className="card-head-actions"><Badge tone="indigo">{data.source_performance.length} sources</Badge></div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Source</th><th>Adapter</th><th className="num">Records</th><th className="num">Duplicates</th><th className="num">Invalid</th><th>Status</th></tr></thead>
            <tbody>
              {data.source_performance.map((source) => (
                <tr key={source.source_id}>
                  <td className="strong">{source.label}</td>
                  <td className="small muted">{source.adapter.replace(/_/g, " ")}</td>
                  <td className="num">{formatNumber(source.value)}</td>
                  <td className="num">{source.duplicates}</td>
                  <td className="num">{source.invalid}</td>
                  <td><Badge tone={source.is_enabled ? "green" : "neutral"} dot>{source.is_enabled ? "enabled" : "disabled"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dash-grid-secondary">
        <div className="card">
          <div className="card-head"><div><h3>Job outcomes</h3><div className="sub">All runs, grouped by status</div></div></div>
          <div className="table-wrap">
            <table className="data compact">
              <thead><tr><th>Status</th><th className="num">Jobs</th><th className="num">Processed</th><th className="num">Duplicates</th><th className="num">Failed</th><th>Duration</th></tr></thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job.status}>
                    <td><Badge tone={job.status === "completed" ? "green" : job.status === "failed" ? "red" : "neutral"}>{job.status}</Badge></td>
                    <td className="num">{job.count}</td>
                    <td className="num">{job.processed}</td>
                    <td className="num">{job.duplicates}</td>
                    <td className="num">{job.failed}</td>
                    <td className="small muted">{Math.round(job.duration_ms / 1000)}s</td>
                  </tr>
                ))}
                {!data.jobs.length && <tr><td colSpan={6}><div className="empty small">No jobs recorded yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div><h3>Licensing & consent posture</h3><div className="sub">How the database was sourced</div></div></div>
          <div className="card-body">
            <div className="row wrap" style={{ gap: 16 }}>
              <Donut
                items={data.licensing.map((row, index) => ({
                  label: row.status.replace(/_/g, " "),
                  value: row.count,
                  color: ["#4f46e5", "#0d9488", "#f79009", "#94a3b8"][index % 4],
                }))}
                centerLabel="leads"
                size={150}
                thickness={20}
              />
            </div>
            <div className="divider soft" />
            <div className="kv">
              <dt>Suppression entries</dt><dd>{data.suppression.total}</dd>
              <dt>Licensed records</dt><dd>{formatNumber(data.licensing.find((row) => row.status === "licensed")?.count || 0)}</dd>
              <dt>Generated</dt><dd>{formatDate(data.generated_at, { withTime: true })}</dd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

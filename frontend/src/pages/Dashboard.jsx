import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, duration, formatNumber, timeAgo } from "../api";
import { consentTone, statusTone, useAuth, verificationTone } from "../auth";
import { AreaChart, BarList, Donut, Sparkline } from "../charts";
import { Badge, Button, EmptyState, ErrorState, Icon, Loading, Progress, useFetch } from "../ui";

const RANGES = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

const STATUS_LABELS = {
  new: "New", assigned: "Assigned", contacted: "Contacted", interested: "Interested",
  not_interested: "Not interested", follow_up: "Follow-up", converted: "Converted",
  do_not_contact: "Do Not Contact",
};

const CONSENT_LABELS = {
  granted: "Granted", pending: "Pending", unknown: "Unknown", denied: "Denied", withdrawn: "Withdrawn",
};

const CONSENT_COLORS = {
  granted: "#12b76a", pending: "#f79009", unknown: "#94a3b8", denied: "#f04438", withdrawn: "#b42318",
};

const INDUSTRY_COLORS = ["#4f46e5", "#0d9488", "#f79009", "#7c3aed", "#0284c7", "#ec4899", "#12b76a", "#64748b"];

function KpiCard({ label, value, icon, tone = "", foot, spark, hint }) {
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <span className={`kpi-icon ${tone}`}><Icon name={icon} size={16} /></span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{formatNumber(value)}</div>
      <div className="kpi-foot">{foot || <span className="faint">{hint}</span>}</div>
      {spark && <div className="kpi-spark"><Sparkline data={spark} /></div>}
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user, org } = useAuth();
  const [days, setDays] = useState(30);
  const { data, loading, error, refresh } = useFetch(() => api.get("/api/dashboard", { days }), [days]);

  const derived = useMemo(() => {
    if (!data) return null;
    const daily = data.daily_collection || [];
    const last7 = daily.slice(-7).reduce((sum, row) => sum + row.collected, 0);
    const prev7 = daily.slice(-14, -7).reduce((sum, row) => sum + row.collected, 0);
    const delta = prev7 === 0 ? null : Math.round(((last7 - prev7) / prev7) * 100);
    return {
      spark: daily.map((row) => row.collected),
      last7,
      delta,
      consent: Object.entries(data.by_consent || {})
        .map(([key, value]) => ({ label: CONSENT_LABELS[key] || key, value, color: CONSENT_COLORS[key] }))
        .sort((a, b) => b.value - a.value),
      statuses: Object.entries(data.by_status || {})
        .map(([key, value]) => ({ label: STATUS_LABELS[key] || key, value, key }))
        .sort((a, b) => b.value - a.value),
      industries: (data.leads_by_industry || []).map((item, index) => ({
        label: item.label, value: item.value, color: INDUSTRY_COLORS[index % INDUSTRY_COLORS.length],
      })),
    };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="page">
        <div className="grid kpi">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="kpi-card" key={index}><div className="skeleton" style={{ height: 74 }} /></div>
          ))}
        </div>
        <div className="card mt-3"><Loading label="Loading your dashboard…" /></div>
      </div>
    );
  }
  if (error) {
    return <div className="page"><div className="card"><ErrorState message={error} onRetry={refresh} /></div></div>;
  }

  const { cards } = data;
  const maxAgentConverted = Math.max(1, ...(data.agent_performance || []).map((agent) => agent.converted));

  return (
    <div className="page">
      <div className="dash-hero">
        <div>
          <h1>{greeting()}, {user?.full_name?.split(" ")[0]}</h1>
          <div className="sub">
            {org.org_name || "LeadBridge"} is tracking {formatNumber(cards.total_leads)} business leads from{" "}
            {cards.sources_active} authorized source{cards.sources_active === 1 ? "" : "s"}.
            {cards.running_jobs > 0 && ` ${cards.running_jobs} collection${cards.running_jobs === 1 ? "" : "s"} running now.`}
          </div>
          <div className="row mt-2" style={{ gap: 8 }}>
            <span className="live-pill">Compliance checks active</span>
            <Badge tone="outline" className="lg" style={{ color: "#cbd5e1", borderColor: "rgba(255,255,255,.2)" }}>
              {data.failed_requests_7d} failed request{data.failed_requests_7d === 1 ? "" : "s"} this week
            </Badge>
          </div>
        </div>
        <div className="dash-hero-actions">
          <div className="segmented" style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.14)" }}>
            {RANGES.map((range) => (
              <button
                key={range.value}
                className={days === range.value ? "active" : ""}
                onClick={() => setDays(range.value)}
                style={days === range.value ? { background: "rgba(255,255,255,.92)" } : { color: "#b6c2d9" }}
              >
                {range.label}
              </button>
            ))}
          </div>
          <Link to="/jobs"><Button icon="play" variant="primary">New collection</Button></Link>
        </div>
      </div>

      <div className="grid kpi">
        <KpiCard
          label="Total leads"
          value={cards.total_leads}
          icon="leads"
          spark={derived.spark}
          foot={
            <>
              <span className="kpi-trend up">+{formatNumber(derived.last7)}</span>
              <span className="faint">new in the last 7 days</span>
            </>
          }
        />
        <KpiCard
          label="New leads"
          value={cards.new_leads}
          icon="sparkles"
          tone="blue"
          hint="Not yet assigned or worked"
        />
        <KpiCard
          label="Verified business contacts"
          value={cards.verified_contacts}
          icon="shield"
          tone="green"
          hint="Owner-confirmed numbers / provider-verified e-mail only"
        />
        <KpiCard
          label="Duplicates"
          value={cards.duplicates}
          icon="copy"
          tone="amber"
          hint="Merged or flagged at ingest"
        />
      </div>

      <div className="grid kpi mt-2">
        <KpiCard label="Invalid contacts" value={cards.invalid_contacts} icon="ban" tone="red" hint="Failing syntax or provider checks" />
        <KpiCard label="Assigned leads" value={cards.assigned_leads} icon="agents" tone="blue" hint="Owned by an agent" />
        <KpiCard label="Do Not Contact" value={cards.do_not_contact} icon="lock" tone="slate" hint="Blocked from every export" />
        <KpiCard label="Suppression list" value={cards.suppressed} icon="shield" tone="green" hint="Phones, e-mails, domains, businesses" />
      </div>

      <div className="dash-grid-main">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Daily collection</h3>
              <div className="sub">Records captured per day, with duplicate sightings</div>
            </div>
            <div className="card-head-actions">
              <Badge tone="indigo">{formatNumber(cards.collected_period)} in {data.period_days}d</Badge>
            </div>
          </div>
          <div className="card-body">
            <AreaChart
              data={data.daily_collection}
              height={230}
              series={[
                { key: "collected", label: "New leads", color: "#4f46e5" },
                { key: "duplicates", label: "Duplicates", color: "#f79009", dashed: true },
              ]}
              formatLabel={(row) => new Date(`${row.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Leads by industry</h3>
              <div className="sub">Top verticals in the database</div>
            </div>
          </div>
          <div className="card-body">
            <Donut items={derived.industries} centerLabel="leads" size={158} thickness={21} />
          </div>
        </div>
      </div>

      <div className="dash-grid-secondary">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Leads by location</h3>
              <div className="sub">Top city / state pairs</div>
            </div>
          </div>
          <div className="card-body">
            <BarList items={data.leads_by_location} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Consent & contact permission</h3>
              <div className="sub">Only granted / permitted records can be exported</div>
            </div>
          </div>
          <div className="card-body">
            <Donut items={derived.consent} centerLabel="records" centerValue={formatNumber(cards.total_leads)} size={150} thickness={20} />
          </div>
        </div>
      </div>

      <div className="dash-grid-secondary">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Collection source performance</h3>
              <div className="sub">Leads contributed per source</div>
            </div>
            <div className="card-head-actions"><Link className="small" to="/sources">Manage sources →</Link></div>
          </div>
          <div className="card-body">
            <BarList items={data.source_performance.map((source) => ({ label: source.label, value: source.value }))} />
            <div className="divider soft" />
            <div className="row wrap" style={{ gap: 14 }}>
              {(data.source_performance || []).slice(0, 4).map((source) => (
                <div className="metric" key={source.source_id}>
                  <div className="m-label truncate" style={{ maxWidth: 150 }}>{source.label}</div>
                  <div className="m-value">{formatNumber(source.value)}</div>
                  <div className="m-sub">{source.duplicates} dupes · {source.invalid} invalid</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Agent performance</h3>
              <div className="sub">Assigned pipeline and conversions</div>
            </div>
            <div className="card-head-actions"><Link className="small" to="/agents">View team →</Link></div>
          </div>
          <div className="table-wrap">
            <table className="data compact">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th className="num">Assigned</th>
                  <th className="num">Contacted</th>
                  <th className="num">Interested</th>
                  <th style={{ minWidth: 110 }}>Converted</th>
                </tr>
              </thead>
              <tbody>
                {(data.agent_performance || []).map((agent) => (
                  <tr key={agent.agent_id}>
                    <td><span className="strong">{agent.label}</span></td>
                    <td className="num">{agent.assigned}</td>
                    <td className="num">{agent.contacted}</td>
                    <td className="num">{agent.interested}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <Progress value={(agent.converted / maxAgentConverted) * 100} tone="green" height={5} />
                        <span className="small strong" style={{ minWidth: 18, textAlign: "right" }}>{agent.converted}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {!data.agent_performance?.length && (
                  <tr><td colSpan={5}><div className="empty small">No agents assigned yet.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="dash-grid-secondary">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Recent collection jobs</h3>
              <div className="sub">Latest runs across all sources</div>
            </div>
            <div className="card-head-actions"><Link className="small" to="/jobs">All jobs →</Link></div>
          </div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            {(data.recent_jobs || []).map((job) => (
              <div className="activity-item" key={job.id}>
                <span className={`kpi-icon ${job.status === "completed" ? "green" : job.status === "failed" ? "red" : job.status === "stopped" ? "amber" : "blue"}`} style={{ width: 28, height: 28, flexBasis: 28 }}>
                  <Icon name={job.status === "completed" ? "check" : job.status === "failed" ? "alert" : "clock"} size={14} />
                </span>
                <div className="a-body">
                  <div className="a-title truncate">{job.source_name}</div>
                  <div className="a-meta">
                    {job.status} · {job.records_processed} new · {job.duplicates_found} dupes · {duration(job.duration_ms)}
                  </div>
                </div>
                <span className="xs faint nowrap">{timeAgo(job.finished_at || job.started_at)}</span>
              </div>
            ))}
            {!data.recent_jobs?.length && <EmptyState icon="jobs" title="No collections yet" message="Start a collection from Data Sources to see it here." />}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Newest leads</h3>
              <div className="sub">Latest records added to the database</div>
            </div>
            <div className="card-head-actions"><Link className="small" to="/leads">Open leads →</Link></div>
          </div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            {(data.recent_leads || []).map((lead) => (
              <div className="activity-item" key={lead.id}>
                <span className="kpi-icon slate" style={{ width: 28, height: 28, flexBasis: 28 }}>
                  <Icon name="building" size={14} />
                </span>
                <div className="a-body">
                  <div className="a-title truncate">{lead.business_name}</div>
                  <div className="a-meta truncate">
                    {lead.city ? `${lead.city}, ${lead.state}` : "Location unknown"} · {lead.source_name}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Badge tone={statusTone(lead.lead_status)}>{STATUS_LABELS[lead.lead_status] || lead.lead_status}</Badge>
                </div>
              </div>
            ))}
            {!data.recent_leads?.length && <EmptyState icon="leads" title="No leads yet" message="Run a collection or import a CSV to get started." />}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, downloadFile, formatDate, formatNumber, timeAgo } from "../api";
import { consentTone, statusTone, useAuth, verificationTone } from "../auth";
import {
  Avatar, Badge, Button, ConfirmDialog, Drawer, EmptyState, Field, Icon, Modal, Pagination,
  SearchInput, SkeletonRows, useToast,
} from "../ui";

const STATUS_LABELS = {
  new: "New", assigned: "Assigned", contacted: "Contacted", interested: "Interested",
  not_interested: "Not interested", follow_up: "Follow-up", converted: "Converted",
  do_not_contact: "Do Not Contact",
};
const CONSENT_LABELS = { granted: "Granted", pending: "Pending", unknown: "Unknown", denied: "Denied", withdrawn: "Withdrawn" };
const PHONE_LABELS = {
  unverified: "Unverified", format_valid: "Format valid", verified_owner: "Verified with owner",
  invalid: "Invalid", disconnected: "Disconnected",
};
const EMAIL_LABELS = {
  unverified: "Unverified", syntax_valid: "Syntax valid", mx_valid: "MX verified",
  verified_owner: "Verified with provider", invalid: "Invalid", bounced: "Bounced",
};
const VERIFY_CLASS = {
  verified_owner: "verified", mx_valid: "verified", format_valid: "format", syntax_valid: "format",
  invalid: "invalid", disconnected: "invalid", bounced: "invalid", unverified: "unverified",
};

const EMPTY_FILTERS = {
  q: "", industry: "", state: "", zip: "", lead_status: "", consent_status: "",
  verification: "", phone_status: "", source_id: "", assigned_agent_id: "", freshness: "",
  include_duplicates: false,
};

export default function Leads() {
  const { can, filters: facets } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, q: searchParams.get("q") || "" });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sources, setSources] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [drawerId, setDrawerId] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get("/api/leads", { ...filters, page, page_size: pageSize, sort: "created_at", direction: "desc" });
      setData(result);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get("/api/sources").then((result) => setSources(result.items || [])).catch(() => {});
    api.get("/api/agents").then((result) => setAgents(result.items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null) setFilters((current) => ({ ...current, q }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("q")]);

  const update = (patch) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const activeChips = useMemo(() => {
    const chips = [];
    const labels = {
      industry: "Industry", state: "State", lead_status: "Status", consent_status: "Consent",
      verification: "Verification", phone_status: "Phone", source_id: "Source",
      assigned_agent_id: "Agent", freshness: "Freshness", zip: "ZIP",
    };
    Object.entries(labels).forEach(([key, label]) => {
      if (!filters[key]) return;
      let value = filters[key];
      if (key === "source_id") value = sources.find((source) => String(source.id) === String(value))?.name || value;
      else if (key === "assigned_agent_id") value = agents.find((agent) => String(agent.id) === String(value))?.full_name || value;
      else if (key === "lead_status") value = STATUS_LABELS[value] || value;
      else if (key === "consent_status") value = CONSENT_LABELS[value] || value;
      else if (key === "verification") value = value === "verified" ? "Verified" : "Invalid";
      else if (key === "phone_status") value = PHONE_LABELS[value] || value;
      chips.push({ key, label: `${label}: ${value}` });
    });
    return chips;
  }, [filters, sources, agents]);

  const allSelected = data?.items?.length > 0 && data.items.every((lead) => selected.has(lead.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(data.items.map((lead) => lead.id)));
  };
  const toggleOne = (id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkAssign = async (agentId) => {
    try {
      await api.post("/api/leads/bulk/assign", {
        lead_ids: Array.from(selected),
        agent_id: agentId ? Number(agentId) : null,
        strategy: agentId === "round_robin" ? "round_robin" : "single",
      });
      toast.success("Leads assigned", `${selected.size} record(s) updated.`);
      load();
    } catch (err) {
      toast.error("Assignment failed", err.message);
    }
  };

  const bulkStatus = async (status) => {
    if (!status) return;
    try {
      await api.post("/api/leads/bulk/status", { lead_ids: Array.from(selected), lead_status: status });
      toast.success("Status updated", `${selected.size} record(s) set to ${STATUS_LABELS[status]}.`);
      load();
    } catch (err) {
      toast.error("Update failed", err.message);
    }
  };

  const applySearch = (value) => {
    setFilters((current) => ({ ...current, q: value }));
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (value) params.set("q", value);
    else params.delete("q");
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Lead database</h1>
          <div className="sub">
            {data ? `${formatNumber(data.total)} matching records` : "Loading records"} · verification and
            consent are tracked per record, never assumed.
          </div>
        </div>
        <div className="page-head-actions">
          <Button icon="refresh" onClick={load} disabled={loading}>Refresh</Button>
          <Button
            variant="primary"
            icon="download"
            onClick={() => setExportOpen(true)}
          >
            Export calling list
          </Button>
        </div>
      </div>

      <div className="card filter-card">
        <div className="filter-grid">
          <SearchInput
            value={filters.q}
            onChange={applySearch}
            placeholder="Search business, phone, e-mail, city, ZIP or record ID…"
          />
          <select className="select" value={filters.industry} onChange={(event) => update({ industry: event.target.value })}>
            <option value="">All industries</option>
            {(facets.industries || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="select" value={filters.state} onChange={(event) => update({ state: event.target.value })}>
            <option value="">All states</option>
            {(facets.states || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="select" value={filters.lead_status} onChange={(event) => update({ lead_status: event.target.value })}>
            <option value="">Any status</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="filter-grid mt-1">
          <select className="select" value={filters.consent_status} onChange={(event) => update({ consent_status: event.target.value })}>
            <option value="">Any consent</option>
            {Object.entries(CONSENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="select" value={filters.verification} onChange={(event) => update({ verification: event.target.value })}>
            <option value="">Any verification</option>
            <option value="verified">Verified only</option>
            <option value="invalid">Invalid only</option>
          </select>
          <select className="select" value={filters.phone_status} onChange={(event) => update({ phone_status: event.target.value })}>
            <option value="">Any phone status</option>
            {Object.entries(PHONE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="select" value={filters.source_id} onChange={(event) => update({ source_id: event.target.value })}>
            <option value="">Any source</option>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </select>
        </div>
        <div className="row wrap mt-1" style={{ gap: 10 }}>
          <select className="select" style={{ maxWidth: 190 }} value={filters.assigned_agent_id} onChange={(event) => update({ assigned_agent_id: event.target.value })}>
            <option value="">Any assignee</option>
            <option value="unassigned">Unassigned</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 170 }} value={filters.freshness} onChange={(event) => update({ freshness: event.target.value })}>
            <option value="">Any freshness</option>
            <option value="fresh">Fresh (≤30 days)</option>
            <option value="aging">Aging (31–90)</option>
            <option value="stale">Stale (91–180)</option>
            <option value="expired">Expired (&gt;180)</option>
          </select>
          <input
            className="input"
            style={{ maxWidth: 150 }}
            placeholder="ZIP code"
            value={filters.zip}
            onChange={(event) => update({ zip: event.target.value.replace(/[^\d-]/g, "").slice(0, 9) })}
          />
          <label className="check" style={{ marginLeft: "auto", alignItems: "center" }}>
            <input type="checkbox" checked={filters.include_duplicates} onChange={(event) => update({ include_duplicates: event.target.checked })} />
            Show duplicate sightings
          </label>
          <Button size="sm" variant="ghost" icon="x" onClick={() => { setFilters({ ...EMPTY_FILTERS }); setPage(1); }}>
            Reset
          </Button>
        </div>
        {activeChips.length > 0 && (
          <div className="active-filters">
            {activeChips.map((chip) => (
              <span className="chip" key={chip.key}>
                {chip.label}
                <button onClick={() => update({ [chip.key]: "" })} aria-label={`Remove ${chip.label}`}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card mt-2" style={{ overflow: "hidden" }}>
        <div className="row between" style={{ padding: "11px 16px", gap: 10, flexWrap: "wrap" }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <Badge tone="green" dot>{data?.summary?.verified ?? 0} verified</Badge>
            <Badge tone="red" dot>{data?.summary?.invalid ?? 0} invalid</Badge>
            <Badge tone="neutral" dot>{data?.summary?.dnc ?? 0} do not contact</Badge>
          </div>
          <div className="xs faint">Sorted by newest first · click a row for details and audit history</div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th>Business</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Location</th>
                <th>Source</th>
                <th>Status</th>
                <th>Assignee</th>
                <th className="num">Quality</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && <tr><td colSpan={10}><SkeletonRows rows={8} columns={6} /></td></tr>}
              {error && <tr><td colSpan={10}><div className="empty"><h3>Could not load leads</h3><p>{error}</p><Button size="sm" className="mt-2" onClick={load}>Retry</Button></div></td></tr>}
              {!loading && data?.items?.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      icon="search"
                      title="No leads match these filters"
                      message="Try clearing a filter or collecting from a data source."
                      action={<Button size="sm" onClick={() => { setFilters({ ...EMPTY_FILTERS }); setPage(1); }}>Clear filters</Button>}
                    />
                  </td>
                </tr>
              )}
              {data?.items?.map((lead) => (
                <tr key={lead.id} className="clickable" onClick={() => setDrawerId(lead.id)}>
                  <td onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)} aria-label={`Select ${lead.business_name}`} />
                  </td>
                  <td>
                    <div className="lead-name">
                      <span className="n truncate" style={{ maxWidth: 230 }}>{lead.business_name}</span>
                      <span className="r">
                        {lead.lead_ref}
                        {lead.is_duplicate && " · duplicate"}
                        {lead.source_attribution?.startsWith("Demo") ? "" : ""}
                      </span>
                    </div>
                  </td>
                  <td>
                    {lead.contact_name ? (
                      <div>
                        <div className="cell-title" style={{ fontWeight: 500 }}>{lead.contact_name}</div>
                        <div className="cell-sub">{lead.contact_title || "—"}</div>
                      </div>
                    ) : <span className="faint small">No named contact</span>}
                  </td>
                  <td>
                    <div className="contact-cell">
                      <span className={`line ${lead.phone ? "" : "empty"}`}>
                        <span className={`verify-dot ${VERIFY_CLASS[lead.phone_verification_status]}`} title={PHONE_LABELS[lead.phone_verification_status]} />
                        {lead.phone || "No phone"}
                      </span>
                      <span className="cell-sub">{PHONE_LABELS[lead.phone_verification_status]}</span>
                    </div>
                  </td>
                  <td>
                    <div className="contact-cell">
                      <span className={`line ${lead.email ? "" : "empty"}`}>
                        <span className={`verify-dot ${VERIFY_CLASS[lead.email_verification_status]}`} title={EMAIL_LABELS[lead.email_verification_status]} />
                        <span className="truncate" style={{ maxWidth: 190 }}>{lead.email || "No email"}</span>
                      </span>
                      <span className="cell-sub">{EMAIL_LABELS[lead.email_verification_status]}</span>
                    </div>
                  </td>
                  <td>
                    {lead.city ? (
                      <div>
                        <div className="small">{lead.city}, {lead.state}</div>
                        <div className="cell-sub">{lead.zip_code || "—"}</div>
                      </div>
                    ) : <span className="faint small">Unknown</span>}
                  </td>
                  <td><span className="small truncate" style={{ display: "block", maxWidth: 150 }} title={lead.source_name}>{lead.source_name || "—"}</span></td>
                  <td><Badge tone={statusTone(lead.lead_status)} dot>{STATUS_LABELS[lead.lead_status]}</Badge></td>
                  <td>
                    {lead.assigned_agent_name ? (
                      <div className="row" style={{ gap: 7 }}>
                        <Avatar name={lead.assigned_agent_name} size="sm" />
                        <span className="small truncate" style={{ maxWidth: 100 }}>{lead.assigned_agent_name}</span>
                      </div>
                    ) : <span className="faint small">Unassigned</span>}
                  </td>
                  <td className="num">
                    <Badge tone={lead.quality_score >= 80 ? "green" : lead.quality_score >= 55 ? "amber" : "neutral"}>
                      {lead.quality_score}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && (
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            pageSize={data.page_size}
            onPage={setPage}
            label="leads"
          />
        )}
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="count">{selected.size} selected</span>
          {can("leads:assign") && (
            <>
              <select className="select" onChange={(event) => bulkAssign(event.target.value)} defaultValue="">
                <option value="" disabled>Assign to agent…</option>
                <option value="round_robin">Round-robin (all active agents)</option>
                {agents.filter((agent) => agent.role !== "admin").map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.full_name}</option>
                ))}
              </select>
              <select className="select" onChange={(event) => bulkStatus(event.target.value)} defaultValue="">
                <option value="" disabled>Change status…</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </>
          )}
          <Button size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <LeadDrawer
        leadId={drawerId}
        onClose={() => setDrawerId(null)}
        onChanged={load}
        agents={agents}
      />

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} filters={filters} />
    </div>
  );
}

/* ------------------------------------------------------------------ drawer */
function LeadDrawer({ leadId, onClose, onChanged, agents }) {
  const { can } = useAuth();
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      setLead(await api.get(`/api/leads/${leadId}`));
    } catch (err) {
      toast.error("Could not load lead", err.message);
    } finally {
      setLoading(false);
    }
  }, [leadId, toast]);

  useEffect(() => { setLead(null); setNote(""); load(); }, [leadId, load]);

  if (!leadId) return null;

  const patch = async (payload) => {
    setBusy(true);
    try {
      const updated = await api.patch(`/api/leads/${leadId}`, payload);
      setLead(updated);
      toast.success("Lead updated");
      onChanged?.();
    } catch (err) {
      toast.error("Update failed", err.message);
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const result = await api.post(`/api/leads/${leadId}/notes`, { note });
      setLead((current) => ({ ...current, notes: result.notes, history: result.history }));
      setNote("");
      toast.success("Note added");
      onChanged?.();
    } catch (err) {
      toast.error("Could not add note", err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/api/leads/${leadId}`, { suppress: true, reason: "Deleted via lead database" });
      toast.success("Lead deleted", "Contact added to the suppression list.");
      setDeleteOpen(false);
      onClose();
      onChanged?.();
    } catch (err) {
      toast.error("Delete failed", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        open={Boolean(leadId)}
        onClose={onClose}
        title={lead?.business_name || "Loading lead…"}
        subtitle={lead ? `${lead.lead_ref} · ${lead.source_name || "unknown source"}` : ""}
        footer={
          lead && (
            <>
              <select className="select" style={{ maxWidth: 180 }} value={lead.lead_status} disabled={busy}
                onChange={(event) => patch({ lead_status: event.target.value })}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {can("leads:assign") && (
                <select className="select" style={{ maxWidth: 180 }} value={lead.assigned_agent_id || ""} disabled={busy}
                  onChange={(event) => patch({ assigned_agent_id: event.target.value ? Number(event.target.value) : null })}>
                  <option value="">Unassigned</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                </select>
              )}
              <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
                {can("leads:verify") && <Button size="sm" icon="shield" onClick={() => setVerifyOpen(true)} disabled={busy}>Record verification</Button>}
                {can("leads:delete") && <Button size="sm" variant="danger" icon="trash" onClick={() => setDeleteOpen(true)} disabled={busy}>Delete</Button>}
              </div>
            </>
          )
        }
      >
        {loading && !lead && <div className="loading-block"><span className="spinner dark" /> Loading record…</div>}
        {lead && (
          <div className="col" style={{ gap: 16 }}>
            {lead.suppression && (
              <div className="alert danger">
                <Icon name="ban" size={16} />
                <span><strong>Suppressed:</strong> {lead.suppression}. This record cannot be exported or called.</span>
              </div>
            )}
            {lead.is_duplicate && (
              <div className="alert warning">
                <Icon name="copy" size={16} />
                <span>This is a duplicate sighting{lead.duplicate_of ? ` of ${lead.duplicate_of.lead_ref} — ${lead.duplicate_of.business_name}` : ""}. Duplicates are never exported.</span>
              </div>
            )}

            <div className="row wrap" style={{ gap: 8 }}>
              <Badge tone={statusTone(lead.lead_status)} dot>{STATUS_LABELS[lead.lead_status]}</Badge>
              <Badge tone="neutral">{lead.industry || "No industry"}</Badge>
              <Badge tone="outline">{lead.freshness}{lead.age_days !== null ? ` · ${lead.age_days}d old` : ""}</Badge>
              <Badge tone="indigo">Quality {lead.quality_score}/100</Badge>
              <Badge tone={consentTone(lead.consent_status)}>Consent: {CONSENT_LABELS[lead.consent_status]}</Badge>
            </div>

            <div className="card pad" style={{ background: "var(--surface-2)" }}>
              <div className="lead-drawer-grid">
                <div>
                  <div className="lbl">Business phone</div>
                  <div className="val">
                    {lead.phone || "—"}
                    {lead.phone_extension ? ` ext. ${lead.phone_extension}` : ""}
                  </div>
                  <div className="mt-1"><Badge tone={verificationTone(lead.phone_verification_status)}>{PHONE_LABELS[lead.phone_verification_status]}</Badge></div>
                </div>
                <div>
                  <div className="lbl">Business email</div>
                  <div className="val">{lead.email || "—"}</div>
                  <div className="mt-1"><Badge tone={verificationTone(lead.email_verification_status)}>{EMAIL_LABELS[lead.email_verification_status]}</Badge></div>
                </div>
                <div>
                  <div className="lbl">Contact person</div>
                  <div className="val">{lead.contact_name || "—"}{lead.contact_title ? ` · ${lead.contact_title}` : ""}</div>
                </div>
                <div>
                  <div className="lbl">Website</div>
                  <div className="val">
                    {lead.website ? (
                      <a href={lead.website} target="_blank" rel="noreferrer noopener">{lead.website.replace(/^https?:\/\//, "")}</a>
                    ) : "—"}
                  </div>
                </div>
                <div className="full">
                  <div className="lbl">Business address</div>
                  <div className="val">
                    {[lead.address_line1, lead.address_line2].filter(Boolean).join(", ") || "—"}
                  </div>
                </div>
                <div>
                  <div className="lbl">City / State / ZIP</div>
                  <div className="val">{[lead.city, lead.state, lead.zip_code].filter(Boolean).join(", ") || "—"}</div>
                </div>
                <div>
                  <div className="lbl">Country</div>
                  <div className="val">{lead.country || "—"}</div>
                </div>
                <div>
                  <div className="lbl">Collected</div>
                  <div className="val">{formatDate(lead.collected_at, { withTime: true })}</div>
                </div>
                <div>
                  <div className="lbl">Last verified</div>
                  <div className="val">{lead.last_verified_at ? formatDate(lead.last_verified_at, { withTime: true }) : "Never"}</div>
                </div>
                <div className="full">
                  <div className="lbl">Source attribution</div>
                  <div className="val">
                    {lead.source_attribution || "—"}
                    {lead.source_url && (
                      <> · <a href={lead.source_url} target="_blank" rel="noreferrer noopener">original source <Icon name="external" size={11} /></a></>
                    )}
                  </div>
                </div>
                <div>
                  <div className="lbl">Licensing status</div>
                  <div className="val" style={{ textTransform: "capitalize" }}>{lead.licensing_status?.replace(/_/g, " ")}</div>
                </div>
                <div>
                  <div className="lbl">Consent source</div>
                  <div className="val">{lead.consent_source || "Not recorded"}</div>
                </div>
                {lead.missing_fields?.length > 0 && (
                  <div className="full">
                    <div className="lbl">Missing fields</div>
                    <div className="val"><Badge tone="amber">{lead.missing_fields.join(", ")}</Badge></div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="row between mb-2">
                <strong style={{ fontSize: 13 }}>Notes</strong>
                <span className="xs faint">Visible to the whole team</span>
              </div>
              <textarea
                className="textarea"
                placeholder="Add a note about this business (call outcome, best time to reach, etc.)"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="row mt-1" style={{ justifyContent: "flex-end" }}>
                <Button size="sm" variant="primary" onClick={addNote} disabled={!note.trim() || busy} loading={busy}>Add note</Button>
              </div>
              {lead.notes && (
                <div className="mt-2" style={{ fontSize: 12.5, whiteSpace: "pre-wrap", color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.6 }}>
                  {lead.notes}
                </div>
              )}
            </div>

            <div>
              <div className="row between mb-2">
                <strong style={{ fontSize: 13 }}>Record audit history</strong>
                <span className="xs faint">{lead.history?.length || 0} entries</span>
              </div>
              <div className="timeline">
                {(lead.history || []).map((entry) => (
                  <div className="timeline-item" key={entry.id}>
                    <span className={`timeline-dot ${entry.action === "collected" ? "primary" : entry.action === "deleted" ? "red" : entry.action === "verification_recorded" ? "green" : ""}`}>
                      <Icon
                        name={
                          entry.action === "collected" ? "download"
                            : entry.action === "duplicate_seen" || entry.action === "duplicate_merged" ? "copy"
                            : entry.action === "verification_recorded" ? "shield"
                            : entry.action === "assigned" ? "agents"
                            : entry.action === "status_changed" ? "activity"
                            : entry.action === "note_added" ? "edit"
                            : entry.action === "deleted" ? "trash"
                            : "file"
                        }
                        size={11}
                      />
                    </span>
                    <div className="timeline-body">
                      <div className="t-head">{historyLabel(entry)}</div>
                      <div className="t-meta">{entry.actor_name || "system"} · {formatDate(entry.created_at, { withTime: true })}</div>
                      {entry.field && (
                        <div className="xs muted" style={{ marginTop: 2 }}>
                          {entry.field}: {entry.old_value || "—"} → {entry.new_value || "—"}
                        </div>
                      )}
                      {entry.note && <div className="t-note">{entry.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {lead.duplicates?.length > 0 && (
              <div>
                <strong style={{ fontSize: 13 }}>Duplicate sightings</strong>
                <div className="mt-1 col" style={{ gap: 6 }}>
                  {lead.duplicates.map((duplicate) => (
                    <div className="row between card pad" key={duplicate.id} style={{ padding: "8px 12px" }}>
                      <span className="small">{duplicate.lead_ref} · {duplicate.source_name}</span>
                      <span className="xs faint">{timeAgo(duplicate.collected_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <VerifyModal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        lead={lead}
        onSaved={(updated) => { setLead(updated); onChanged?.(); }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        loading={busy}
        title="Delete this lead?"
        confirmLabel="Delete and suppress"
        message={`This permanently removes ${lead?.business_name || "the record"} and adds its phone/e-mail to the suppression list so it can never be re-imported or exported. The deletion is written to the audit log.`}
      />
    </>
  );
}

function historyLabel(entry) {
  const map = {
    collected: "Collected from source",
    duplicate_seen: "Duplicate sighting recorded",
    duplicate_merged: "Duplicate merged into this record",
    field_updated: "Field updated",
    note_added: "Note added",
    status_changed: "Lead status changed",
    assigned: "Assigned to agent",
    reassigned: "Reassigned",
    verification_recorded: "Verification recorded",
    deleted: "Record deleted",
  };
  return map[entry.action] || entry.action.replace(/_/g, " ");
}

function VerifyModal({ open, onClose, lead, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ channel: "phone", status: "verified_owner", evidence: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const updated = await api.post(`/api/leads/${lead.id}/verify`, form);
      toast.success("Verification recorded", `${form.channel} marked ${form.status.replace(/_/g, " ")}.`);
      onSaved?.(updated);
      onClose();
      setForm({ channel: "phone", status: "verified_owner", evidence: "" });
    } catch (err) {
      toast.error("Could not record verification", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record verification evidence"
      subtitle="Only real evidence (provider response, call report, written confirmation) may verify a contact."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={form.evidence.trim().length < 3}>
            Save verification
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="alert info">
          <Icon name="info" size={16} />
          <span>
            A phone number found on a website is stored as <strong>format valid</strong>, never verified.
            Attach the evidence so the status is defensible in an audit.
          </span>
        </div>
        <div className="grid cols-2">
          <Field label="Channel">
            <select className="select" value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>
              <option value="phone">Business phone</option>
              <option value="email">Business email</option>
            </select>
          </Field>
          <Field label="Result">
            <select className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="verified_owner">Verified with owner / provider</option>
              {form.channel === "email" && <option value="mx_valid">MX verified</option>}
              {form.channel === "phone" && <option value="disconnected">Disconnected</option>}
              <option value="invalid">{form.channel === "email" ? "Invalid / bounced" : "Invalid"}</option>
            </select>
          </Field>
        </div>
        <Field label="Evidence" required hint="e.g. “Called 14 Oct, owner confirmed number” or “Provider API status: verified (ref 88AF)”.">
          <textarea
            className="textarea"
            value={form.evidence}
            onChange={(event) => setForm({ ...form, evidence: event.target.value })}
            placeholder="Describe how this was verified and where the evidence is stored…"
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ export modal */
function ExportModal({ open, onClose, filters }) {
  const toast = useToast();
  const { can } = useAuth();
  const [policy, setPolicy] = useState({ require_consent: false, exclude_invalid: true });
  const [format, setFormat] = useState("csv");
  const [purpose, setPurpose] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const requestFilters = useMemo(() => {
    const payload = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value === "" || value === false || value === null) return;
      if (key === "phone_status") payload.phone_status = [value];
      else payload[key] = value;
    });
    return payload;
  }, [filters]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setPreview(null);
    api.post("/api/exports/preview", { filters: requestFilters, require_consent: policy.require_consent, exclude_invalid: policy.exclude_invalid })
      .then(setPreview)
      .catch((err) => toast.error("Preview failed", err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, policy, requestFilters]);

  const download = async () => {
    setDownloading(true);
    try {
      const result = await downloadFile("/api/exports", {
        body: { format, filters: requestFilters, require_consent: policy.require_consent, exclude_invalid: policy.exclude_invalid, purpose: purpose || null },
      });
      toast.success("Export ready", `${result.rows} record(s) exported${result.blocked ? `, ${result.blocked} blocked` : ""}.`);
      onClose();
    } catch (err) {
      toast.error("Export blocked", err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="wide"
      title="Build a compliant calling list"
      subtitle="Suppression, Do Not Contact and consent rules are applied before the file is generated."
      footer={
        <>
          <div className="left xs muted" style={{ maxWidth: 340, lineHeight: 1.5 }}>
            Every export is logged with the filters, purpose and blocked count for audit purposes.
          </div>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="download" onClick={download} loading={downloading} disabled={!preview?.eligible}>
            Download {format.toUpperCase()} ({preview?.eligible ?? 0})
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 16 }}>
        <div className="grid cols-2">
          <Field label="Format">
            <div className="segmented">
              <button className={format === "csv" ? "active" : ""} onClick={() => setFormat("csv")}>CSV</button>
              <button className={format === "xlsx" ? "active" : ""} onClick={() => setFormat("xlsx")}>Excel</button>
            </div>
          </Field>
          <Field label="Purpose (stored in the audit log)" hint="e.g. October outbound wave — insurance vertical">
            <input className="input" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Optional but recommended" />
          </Field>
        </div>

        <div className="card pad" style={{ background: "var(--surface-2)" }}>
          <div className="row between wrap" style={{ gap: 10 }}>
            <label className="check">
              <input
                type="checkbox"
                checked={policy.require_consent}
                onChange={(event) => setPolicy({ ...policy, require_consent: event.target.checked })}
              />
              <span>
                <strong>Require explicit consent</strong>
                <span className="small muted" style={{ display: "block" }}>
                  Only export records with granted permission (strictest policy).
                </span>
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={policy.exclude_invalid}
                onChange={(event) => setPolicy({ ...policy, exclude_invalid: event.target.checked })}
              />
              <span>
                <strong>Exclude records marked invalid</strong>
                <span className="small muted" style={{ display: "block" }}>
                  Numbers flagged invalid/disconnected or e-mails bounced.
                </span>
              </span>
            </label>
          </div>
        </div>

        {loading && <div className="loading-block"><span className="spinner dark" /> Checking compliance…</div>}

        {preview && !loading && (
          <div className="col" style={{ gap: 12 }}>
            <div className="row wrap" style={{ gap: 18 }}>
              <div className="metric">
                <div className="m-label">Eligible</div>
                <div className="m-value" style={{ color: "var(--success)" }}>{preview.eligible}</div>
                <div className="m-sub">records can be called</div>
              </div>
              <div className="metric">
                <div className="m-label">Blocked</div>
                <div className="m-value" style={{ color: preview.blocked ? "var(--danger)" : "var(--muted)" }}>{preview.blocked}</div>
                <div className="m-sub">suppressed or not permitted</div>
              </div>
              <div className="metric">
                <div className="m-label">Policy</div>
                <div className="m-value" style={{ fontSize: 14 }}>{preview.policy?.require_consent ? "Consent required" : "Legitimate interest"}</div>
                <div className="m-sub">{preview.policy?.agent_scoped ? "agent-scoped export" : "organisation-wide export"}</div>
              </div>
            </div>

            {preview.blocked_reasons?.length > 0 && (
              <div className="alert warning">
                <Icon name="shield" size={16} />
                <div>
                  <strong>Excluded automatically</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {preview.blocked_reasons.map((reason) => (
                      <li key={reason.reason}>{reason.reason} — {reason.count} record(s)</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="table-wrap">
              <table className="data compact">
                <thead>
                  <tr><th>Record</th><th>Business</th><th>Phone</th><th>Location</th><th>Consent</th><th>Freshness</th></tr>
                </thead>
                <tbody>
                  {preview.sample?.map((row) => (
                    <tr key={row.lead_ref}>
                      <td className="mono">{row.lead_ref}</td>
                      <td>{row.business_name}</td>
                      <td>{row.phone || "—"}</td>
                      <td>{[row.city, row.state].filter(Boolean).join(", ") || "—"}</td>
                      <td><Badge tone={consentTone(row.consent_status)}>{CONSENT_LABELS[row.consent_status] || row.consent_status}</Badge></td>
                      <td><span className="small muted">{row.freshness}</span></td>
                    </tr>
                  ))}
                  {!preview.sample?.length && <tr><td colSpan={6}><div className="empty small">No eligible records for this selection.</div></td></tr>}
                </tbody>
              </table>
            </div>
            {preview.eligible > 10 && <div className="xs faint">Showing the first 10 of {preview.eligible} eligible records.</div>}
            {!can("exports:manage") && (
              <div className="alert info">
                <Icon name="info" size={15} />
                <span>Your export is limited to leads assigned to you.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

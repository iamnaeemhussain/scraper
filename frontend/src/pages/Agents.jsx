import { useCallback, useEffect, useMemo, useState } from "react";
import { api, timeAgo } from "../api";
import { useAuth } from "../auth";
import {
  Avatar, Badge, Button, EmptyState, Field, Icon, Modal, Progress, Switch, useToast,
} from "../ui";

const TONES = ["", "teal", "amber", "rose", "slate"];

const ROLE_HELP = {
  admin: "Full access including users, settings, backups and retention.",
  manager: "Sources, jobs, imports, exports, audit and agent management.",
  agent: "Works assigned leads; no export of other agents' data or source configuration.",
};

export default function Agents() {
  const { can, user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editor, setEditor] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get("/api/agents"));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (agent) => {
    try {
      if (agent.is_active) await api.post(`/api/agents/${agent.id}/deactivate`);
      else await api.post(`/api/agents/${agent.id}/activate`);
      toast.success(agent.is_active ? "Agent deactivated" : "Agent activated", agent.full_name);
      load();
    } catch (err) {
      toast.error("Could not update agent", err.message);
    }
  };

  const totals = useMemo(() => {
    const items = data?.items || [];
    const assigned = items.reduce((sum, item) => sum + item.stats.assigned, 0);
    const converted = items.reduce((sum, item) => sum + item.stats.converted, 0);
    return {
      active: items.filter((item) => item.is_active).length,
      assigned,
      converted,
      rate: assigned ? Math.round((converted / assigned) * 100) : 0,
    };
  }, [data]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Agent management</h1>
          <div className="sub">Assign leads, track quotas and review each agent&apos;s pipeline. Roles control every permission in the app.</div>
        </div>
        <div className="page-head-actions">
          <Button icon="refresh" onClick={load} disabled={loading}>Refresh</Button>
          {can("users:manage") && <Button variant="primary" icon="plus" onClick={() => setEditor({ mode: "create" })}>Add user</Button>}
        </div>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <div className="hero-metric"><div className="hm-label">Team members</div><div className="hm-value">{data?.items?.length ?? 0}</div><div className="hm-sub">{totals.active} active</div></div>
        <div className="hero-metric"><div className="hm-label">Assigned leads</div><div className="hm-value">{totals.assigned.toLocaleString()}</div><div className="hm-sub">across the team</div></div>
        <div className="hero-metric"><div className="hm-label">Converted</div><div className="hm-value" style={{ color: "var(--success)" }}>{totals.converted}</div><div className="hm-sub">closed won</div></div>
        <div className="hero-metric"><div className="hm-label">Conversion rate</div><div className="hm-value">{totals.rate}%</div><div className="hm-sub">converted ÷ assigned</div></div>
      </div>

      {error && <div className="alert danger mt-2"><Icon name="alert" size={16} /><span>{error}</span></div>}

      <div className="grid auto mt-2">
        {(data?.items || []).map((agent, index) => (
          <article className="card agent-card" key={agent.id}>
            <div className="agent-top">
              <Avatar name={agent.full_name} size="lg" tone={TONES[index % TONES.length]} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 className="truncate">{agent.full_name}{agent.id === user?.id ? " (you)" : ""}</h3>
                <div className="email truncate">{agent.email}</div>
                <div className="row wrap mt-1" style={{ gap: 5 }}>
                  <Badge tone={agent.role === "admin" ? "indigo" : agent.role === "manager" ? "blue" : "teal"}>{agent.role}</Badge>
                  {agent.team && <Badge tone="neutral">{agent.team}</Badge>}
                  {!agent.is_active && <Badge tone="red">inactive</Badge>}
                </div>
              </div>
              {can("users:manage") && agent.id !== user?.id && (
                <Switch checked={agent.is_active} onChange={() => toggleActive(agent)} label={`Toggle ${agent.full_name}`} />
              )}
            </div>

            <div className="agent-metrics">
              <div><div className="am-value">{agent.stats.assigned}</div><div className="am-label">Assigned</div></div>
              <div><div className="am-value">{agent.stats.contacted}</div><div className="am-label">Contacted</div></div>
              <div><div className="am-value">{agent.stats.interested}</div><div className="am-label">Interested</div></div>
              <div><div className="am-value" style={{ color: "var(--success)" }}>{agent.stats.converted}</div><div className="am-label">Converted</div></div>
            </div>

            <div>
              <div className="row between xs muted" style={{ marginBottom: 4 }}>
                <span>Daily quota</span>
                <span>{agent.stats.added_today} / {agent.daily_quota || "—"} today</span>
              </div>
              <Progress
                value={agent.daily_quota ? (agent.stats.added_today / agent.daily_quota) * 100 : 0}
                tone={agent.daily_quota && agent.stats.added_today >= agent.daily_quota ? "amber" : ""}
              />
            </div>

            <div className="row" style={{ gap: 6 }}>
              <Button size="sm" icon="eye" onClick={() => setDetailId(agent.id)}>View</Button>
              {can("users:manage") && <Button size="sm" icon="edit" onClick={() => setEditor({ mode: "edit", agent })}>Edit</Button>}
              <span className="xs faint" style={{ marginLeft: "auto" }}>
                {agent.last_login_at ? `seen ${timeAgo(agent.last_login_at)}` : "never signed in"}
              </span>
            </div>
          </article>
        ))}
        {!loading && !data?.items?.length && (
          <div className="card"><EmptyState icon="agents" title="No team members yet" message="Add an agent to start assigning leads." /></div>
        )}
      </div>

      <div className="card mt-3">
        <div className="card-head">
          <div>
            <h3>Roles & permissions</h3>
            <div className="sub">Enforced server-side on every request, not just hidden in the UI</div>
          </div>
        </div>
        <div className="card-body">
          <div className="grid cols-3">
            {Object.entries(ROLE_HELP).map(([role, description]) => (
              <div key={role} className="card pad" style={{ background: "var(--surface-2)" }}>
                <Badge tone={role === "admin" ? "indigo" : role === "manager" ? "blue" : "teal"}>{role}</Badge>
                <p className="small muted mt-1" style={{ lineHeight: 1.55 }}>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editor && (
        <AgentEditor
          state={editor}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(); }}
        />
      )}

      <AgentDetail agentId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function AgentEditor({ state, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = state.mode === "edit";
  const agent = state.agent;
  const [form, setForm] = useState({
    full_name: agent?.full_name || "",
    email: agent?.email || "",
    role: agent?.role || "agent",
    team: agent?.team || "",
    phone: agent?.phone || "",
    daily_quota: agent?.daily_quota ?? 60,
    password: "",
    is_active: agent?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isEdit) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await api.patch(`/api/agents/${agent.id}`, payload);
        toast.success("User updated", form.full_name);
      } else {
        await api.post("/api/agents", {
          email: form.email,
          full_name: form.full_name,
          password: form.password,
          role: form.role,
          team: form.team || null,
          phone: form.phone || null,
          daily_quota: Number(form.daily_quota),
        });
        toast.success("User created", form.full_name);
      }
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit ${agent.full_name}` : "Add a team member"}
      subtitle="Roles are enforced on the API for every action"
      footer={
        <>
          {error && <span className="left small" style={{ color: "var(--danger)", maxWidth: 380 }}>{error}</span>}
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>{isEdit ? "Save changes" : "Create user"}</Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="grid cols-2">
          <Field label="Full name" required>
            <input className="input" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
          </Field>
          <Field label="Work email" required>
            <input className="input" type="email" value={form.email} disabled={isEdit} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Role" required hint={ROLE_HELP[form.role]}>
            <select className="select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
          <Field label="Team">
            <input className="input" value={form.team} onChange={(event) => setForm({ ...form, team: event.target.value })} placeholder="Inbound / Outbound" />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="Daily lead quota">
            <input className="input" type="number" min="0" max="1000" value={form.daily_quota} onChange={(event) => setForm({ ...form, daily_quota: event.target.value })} />
          </Field>
        </div>
        <Field
          label={isEdit ? "Reset password" : "Temporary password"}
          required={!isEdit}
          hint="At least 10 characters with a letter and a number. Users should change it after first sign-in."
        >
          <input className="input" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={isEdit ? "Leave blank to keep current password" : "••••••••••"} />
        </Field>
        <div className="alert info">
          <Icon name="shield" size={16} />
          <span>Passwords are hashed with bcrypt. Failed sign-ins lock the account for 15 minutes after 5 attempts.</span>
        </div>
      </div>
    </Modal>
  );
}

function AgentDetail({ agentId, onClose }) {
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    setAgent(null);
    setLoading(true);
    api.get(`/api/agents/${agentId}`)
      .then(setAgent)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  if (!agentId) return null;

  return (
    <Modal
      open
      onClose={onClose}
      size="wide"
      title={agent?.full_name || "Agent"}
      subtitle={agent ? `${agent.email} · ${agent.role}${agent.team ? ` · ${agent.team}` : ""}` : ""}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {loading && !agent && <div className="loading-block"><span className="spinner dark" /> Loading…</div>}
      {agent && (
        <div className="col" style={{ gap: 16 }}>
          <div className="metric-row">
            <div className="metric"><div className="m-label">Assigned</div><div className="m-value">{agent.stats.assigned}</div></div>
            <div className="metric"><div className="m-label">Contacted</div><div className="m-value">{agent.stats.contacted}</div></div>
            <div className="metric"><div className="m-label">Interested</div><div className="m-value">{agent.stats.interested}</div></div>
            <div className="metric"><div className="m-label">Converted</div><div className="m-value">{agent.stats.converted}</div></div>
            <div className="metric"><div className="m-label">Conversion</div><div className="m-value">{agent.stats.conversion_rate}%</div></div>
            <div className="metric"><div className="m-label">Quota left</div><div className="m-value">{agent.stats.quota_remaining}</div></div>
          </div>

          <div>
            <strong style={{ fontSize: 13 }}>Recently assigned leads</strong>
            <div className="table-wrap mt-1">
              <table className="data compact">
                <thead><tr><th>Business</th><th>Status</th><th>Phone</th><th>Location</th></tr></thead>
                <tbody>
                  {(agent.recent_leads || []).map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.business_name}</td>
                      <td><Badge tone="neutral">{lead.lead_status.replace(/_/g, " ")}</Badge></td>
                      <td>{lead.phone || "—"}</td>
                      <td className="small muted">{[lead.city, lead.state].filter(Boolean).join(", ")}</td>
                    </tr>
                  ))}
                  {!agent.recent_leads?.length && <tr><td colSpan={4}><div className="empty small">No leads assigned yet.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <strong style={{ fontSize: 13 }}>Recent activity</strong>
            <div className="timeline mt-1">
              {(agent.recent_activity || []).map((entry) => (
                <div className="timeline-item" key={entry.id}>
                  <span className="timeline-dot primary"><Icon name="activity" size={11} /></span>
                  <div className="timeline-body">
                    <div className="t-head">{entry.action.replace(/_/g, " ")}</div>
                    <div className="t-meta">lead #{entry.lead_id} · {timeAgo(entry.created_at)}</div>
                    {entry.note && <div className="t-note">{entry.note}</div>}
                  </div>
                </div>
              ))}
              {!agent.recent_activity?.length && <div className="empty small">No recorded activity.</div>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

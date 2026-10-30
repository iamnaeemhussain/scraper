import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadFile, formatDate, formatNumber } from "../api";
import { useAuth } from "../auth";
import {
  Badge, Button, ConfirmDialog, Field, Icon, Modal, Pagination, Switch, useToast,
} from "../ui";

const SECTIONS = [
  { value: "organisation", label: "Organisation", icon: "building" },
  { value: "security", label: "My account", icon: "lock" },
  { value: "suppression", label: "Suppression list", icon: "ban" },
  { value: "apikeys", label: "API keys", icon: "key" },
  { value: "audit", label: "Audit log", icon: "list" },
  { value: "data", label: "Data & backups", icon: "database" },
  { value: "compliance", label: "Compliance policy", icon: "shield" },
];

const SETTING_LABELS = {
  export_require_consent: "Require explicit consent before export",
  export_exclude_invalid: "Exclude invalid contacts from exports",
  allow_agent_export: "Allow agents to export their assigned leads",
  collection_enabled: "Allow new collection jobs",
  daily_collection_limit: "Daily collection record limit",
  data_retention_days: "Lead retention (days)",
  audit_retention_days: "Audit retention (days)",
  org_name: "Organisation name",
  notes: "Internal notes",
};

export default function SettingsPage() {
  const { user, can, refresh } = useAuth();
  const toast = useToast();
  const canManage = can("settings:manage");
  const allowedSections = SECTIONS.filter((item) => {
    if (item.value === "organisation" && !canManage) return false;
    if (item.value === "apikeys" && !can("apikeys:manage")) return false;
    if (item.value === "audit" && !can("audit:read")) return false;
    if (item.value === "data" && !canManage) return false;
    return true;
  });
  const [section, setSection] = useState(allowedSections[0]?.value || "security");
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/settings");
      setSettings(data);
      setDraft({
        org_name: data.org_name,
        export_require_consent: data.export_require_consent,
        export_exclude_invalid: data.export_exclude_invalid,
        allow_agent_export: data.allow_agent_export,
        collection_enabled: data.collection_enabled,
        daily_collection_limit: data.daily_collection_limit,
        data_retention_days: data.data_retention_days,
        audit_retention_days: data.audit_retention_days,
        notes: data.notes || "",
      });
    } catch (err) {
      toast.error("Could not load settings", err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/api/settings", {
        ...draft,
        daily_collection_limit: Number(draft.daily_collection_limit),
        data_retention_days: Number(draft.data_retention_days),
        audit_retention_days: Number(draft.audit_retention_days),
      });
      toast.success("Settings saved");
      await load();
      refresh?.();
    } catch (err) {
      toast.error("Could not save settings", err.message);
    } finally {
      setSaving(false);
    }
  };

  const activeSection = allowedSections.some((item) => item.value === section) ? section : allowedSections[0]?.value;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Organisation policy, suppression, API access, audit history and data retention.</div>
        </div>
        <div className="page-head-actions">
          <Badge tone="indigo">{user?.role}</Badge>
          <Link to="/reports" className="btn">Compliance reports</Link>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {allowedSections.map((item) => (
            <button key={item.value} className={activeSection === item.value ? "active" : ""} onClick={() => setSection(item.value)}>
              <Icon name={item.icon} size={15} /> {item.label}
            </button>
          ))}
        </nav>

        <div className="settings-panel">
          {loading && <div className="card"><div className="loading-block"><span className="spinner dark" /> Loading settings…</div></div>}

          {!loading && activeSection === "organisation" && settings && (
            <>
              <div className="card pad">
                <div className="row between mb-2">
                  <div>
                    <h3 style={{ fontSize: 14 }}>Organisation</h3>
                    <div className="xs muted">Stored in the database and applied immediately.</div>
                  </div>
                  <Badge tone={settings.environment.environment === "production" ? "green" : "amber"}>
                    {settings.environment.environment}
                  </Badge>
                </div>
                <div className="grid cols-2">
                  <Field label="Organisation name">
                    <input className="input" value={draft.org_name || ""} onChange={(event) => setDraft({ ...draft, org_name: event.target.value })} disabled={!canManage} />
                  </Field>
                  <Field label="Daily collection limit" hint="Hard ceiling on records collected per rolling 24h.">
                    <input className="input" type="number" min="1" value={draft.daily_collection_limit || 0} onChange={(event) => setDraft({ ...draft, daily_collection_limit: event.target.value })} disabled={!canManage} />
                  </Field>
                </div>
                <Field label="Internal notes" className="mt-1">
                  <textarea className="textarea" value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} disabled={!canManage} placeholder="Data protection officer contact, licence renewal dates…" />
                </Field>
              </div>

              <div className="card pad">
                <h3 style={{ fontSize: 14 }}>Export & collection policy</h3>
                <div className="col mt-2" style={{ gap: 14 }}>
                  {[
                    ["export_require_consent", "Require explicit consent", "Only records with granted permission may be exported. Strictest setting."],
                    ["export_exclude_invalid", "Exclude invalid contacts", "Records marked invalid or bounced never reach a calling list."],
                    ["allow_agent_export", "Allow agent exports", "Agents may export only the leads assigned to them."],
                    ["collection_enabled", "Allow new collection jobs", "Pause all collection without disabling individual sources."],
                  ].map(([key, label, help]) => (
                    <div className="row between" key={key} style={{ alignItems: "flex-start", gap: 14 }}>
                      <div>
                        <div className="small strong">{label}</div>
                        <div className="xs muted" style={{ marginTop: 2 }}>{help}</div>
                      </div>
                      <Switch checked={Boolean(draft[key])} onChange={(value) => setDraft({ ...draft, [key]: value })} disabled={!canManage} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="card pad">
                <h3 style={{ fontSize: 14 }}>Data retention</h3>
                <div className="grid cols-2 mt-2">
                  <Field label="Lead retention (days)" hint="Records older than this are purged by the retention job (converted leads are kept).">
                    <input className="input" type="number" min="30" max="3650" value={draft.data_retention_days || 365} onChange={(event) => setDraft({ ...draft, data_retention_days: event.target.value })} disabled={!canManage} />
                  </Field>
                  <Field label="Audit retention (days)" hint="Audit logs must be kept long enough to evidence compliance.">
                    <input className="input" type="number" min="30" max="3650" value={draft.audit_retention_days || 730} onChange={(event) => setDraft({ ...draft, audit_retention_days: event.target.value })} disabled={!canManage} />
                  </Field>
                </div>
              </div>

              <div className="row" style={{ justifyContent: "flex-end" }}>
                <Button variant="primary" onClick={save} loading={saving} disabled={!canManage}>Save settings</Button>
              </div>
            </>
          )}

          {!loading && activeSection === "security" && <AccountPanel />}
          {!loading && activeSection === "suppression" && <SuppressionPanel settings={settings} />}
          {!loading && activeSection === "apikeys" && <ApiKeysPanel />}
          {!loading && activeSection === "audit" && <AuditPanel />}
          {!loading && activeSection === "data" && <DataPanel settings={settings} onChanged={load} />}
          {!loading && activeSection === "compliance" && <CompliancePanel settings={settings} />}
        </div>
      </div>
    </div>
  );
}

function AccountPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (form.new_password !== form.confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      await api.post("/api/auth/change-password", { current_password: form.current_password, new_password: form.new_password });
      toast.success("Password updated");
      setForm({ current_password: "", new_password: "", confirm: "" });
    } catch (err) {
      toast.error("Could not change password", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card pad">
        <h3 style={{ fontSize: 14 }}>Account</h3>
        <div className="kv mt-2">
          <dt>Name</dt><dd>{user?.full_name}</dd>
          <dt>Email</dt><dd>{user?.email}</dd>
          <dt>Role</dt><dd style={{ textTransform: "capitalize" }}>{user?.role}</dd>
          <dt>Team</dt><dd>{user?.team || "—"}</dd>
          <dt>Last sign-in</dt><dd>{user?.last_login_at ? formatDate(user.last_login_at, { withTime: true }) : "—"}</dd>
        </div>
        <div className="alert info mt-2">
          <Icon name="shield" size={16} />
          <span>Sessions are httpOnly cookies. Your permissions are re-checked on every request, so role changes apply immediately.</span>
        </div>
      </div>

      <div className="card pad">
        <h3 style={{ fontSize: 14 }}>Change password</h3>
        <div className="grid cols-2 mt-2">
          <Field label="Current password" required>
            <input className="input" type="password" value={form.current_password} onChange={(event) => setForm({ ...form, current_password: event.target.value })} />
          </Field>
          <div />
          <Field label="New password" required hint="At least 10 characters with a letter and a number.">
            <input className="input" type="password" value={form.new_password} onChange={(event) => setForm({ ...form, new_password: event.target.value })} />
          </Field>
          <Field label="Confirm new password" required>
            <input className="input" type="password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
          </Field>
        </div>
        <div className="row mt-2" style={{ justifyContent: "flex-end" }}>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!form.current_password || !form.new_password}>Update password</Button>
        </div>
      </div>
    </>
  );
}

function SuppressionPanel({ settings }) {
  const { can } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ kind: "email", value: "", reason: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/api/settings/suppression", { page, page_size: 20, q: query || undefined })
      .then(setData)
      .catch((err) => toast.error("Could not load suppression list", err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, query]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setBusy(true);
    try {
      await api.post("/api/settings/suppression", form);
      toast.success("Added to suppression list", form.value);
      setForm({ kind: form.kind, value: "", reason: "" });
      load();
    } catch (err) {
      toast.error("Could not add entry", err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry) => {
    try {
      await api.del(`/api/settings/suppression/${entry.id}`);
      toast.success("Removed from suppression list", entry.value);
      load();
    } catch (err) {
      toast.error("Could not remove entry", err.message);
    }
  };

  return (
    <>
      <div className="card pad">
        <div className="row between wrap" style={{ gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 14 }}>Suppression list</h3>
            <div className="xs muted" style={{ marginTop: 2 }}>
              Checked at ingest, at assignment and before every export. {data?.stats?.total ?? settings?.suppression?.total ?? 0} entries.
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {Object.entries(data?.stats?.by_kind || {}).map(([kind, count]) => (
              <Badge key={kind} tone="neutral">{kind}: {count}</Badge>
            ))}
          </div>
        </div>

        {can("suppression:manage") && (
          <div className="grid cols-4 mt-2">
            <Field label="Type">
              <select className="select" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="domain">Domain</option>
                <option value="business_name">Business name</option>
              </select>
            </Field>
            <Field label="Value">
              <input className="input" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} placeholder="info@example.com" />
            </Field>
            <Field label="Reason">
              <input className="input" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Opt-out request 14 Oct" />
            </Field>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <Button variant="primary" icon="plus" onClick={add} loading={busy} disabled={form.value.length < 2} block>Add</Button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="table-toolbar">
          <div className="input-icon grow" style={{ maxWidth: 320 }}>
            <Icon name="search" size={15} />
            <input className="input" placeholder="Search by value…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          </div>
          <span className="xs faint" style={{ marginLeft: "auto" }}>Removing an entry allows future collections to store that business again.</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Type</th><th>Value</th><th>Reason</th><th>Added</th><th /></tr></thead>
            <tbody>
              {data?.items?.map((entry) => (
                <tr key={entry.id}>
                  <td><Badge tone="neutral">{entry.kind.replace(/_/g, " ")}</Badge></td>
                  <td className="mono small">{entry.value}</td>
                  <td className="small muted">{entry.reason || "—"}</td>
                  <td className="small muted">{formatDate(entry.created_at)}</td>
                  <td>
                    {can("suppression:manage") && (
                      <Button size="sm" variant="ghost" icon="trash" onClick={() => remove(entry)}>Remove</Button>
                    )}
                  </td>
                </tr>
              ))}
              {!data?.items?.length && <tr><td colSpan={5}><div className="empty small">No suppression entries yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
        {data && <Pagination page={data.page} pages={Math.max(1, Math.ceil(data.total / 20))} total={data.total} pageSize={20} onPage={setPage} label="entries" />}
      </div>
    </>
  );
}

function ApiKeysPanel() {
  const { can } = useAuth();
  const toast = useToast();
  const [data, setData] = useState({ items: [] });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", scopes: ["jobs:manage", "sources:manage"] });
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/api/settings/api-keys").then(setData).catch((err) => toast.error("Could not load API keys", err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const key = await api.post("/api/settings/api-keys", form);
      setCreated(key);
      setOpen(false);
      load();
    } catch (err) {
      toast.error("Could not create key", err.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key) => {
    try {
      await api.del(`/api/settings/api-keys/${key.id}`);
      toast.success("API key revoked", key.name);
      load();
    } catch (err) {
      toast.error("Could not revoke key", err.message);
    }
  };

  if (!can("apikeys:manage")) {
    return <div className="card"><div className="empty"><h3>API keys are admin-only</h3><p>Ask an administrator for machine-to-machine access.</p></div></div>;
  }

  return (
    <>
      <div className="card pad">
        <div className="row between wrap" style={{ gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 14 }}>API keys</h3>
            <div className="xs muted" style={{ marginTop: 2 }}>
              For the extraction worker or server-to-server integrations. Keys are stored hashed and shown once.
            </div>
          </div>
          <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>New API key</Button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Last used</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.items?.map((key) => (
                <tr key={key.id}>
                  <td className="strong">{key.name}</td>
                  <td className="mono small">{key.prefix}…</td>
                  <td className="small muted">{key.scopes.join(", ") || "—"}</td>
                  <td className="small muted">{key.last_used_at ? formatDate(key.last_used_at, { withTime: true }) : "Never"}</td>
                  <td><Badge tone={key.is_active ? "green" : "neutral"}>{key.is_active ? "active" : "revoked"}</Badge></td>
                  <td>{key.is_active && <Button size="sm" variant="danger" onClick={() => revoke(key)}>Revoke</Button>}</td>
                </tr>
              ))}
              {!data.items?.length && <tr><td colSpan={6}><div className="empty small">No API keys yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create an API key"
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={create} loading={busy} disabled={form.name.length < 2}>Create key</Button></>}
      >
        <div className="col" style={{ gap: 14 }}>
          <Field label="Key name" required>
            <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Extraction worker (production)" />
          </Field>
          <Field label="Scopes" hint="The worker needs jobs:manage and sources:manage.">
            <div className="field-picker">
              {["jobs:manage", "sources:manage", "leads:write", "imports:manage", "reports:read", "*"].map((scope) => (
                <label className="check" key={scope}>
                  <input
                    type="checkbox"
                    checked={form.scopes.includes(scope)}
                    onChange={() => setForm({
                      ...form,
                      scopes: form.scopes.includes(scope) ? form.scopes.filter((item) => item !== scope) : [...form.scopes, scope],
                    })}
                  />
                  <span className="mono small">{scope}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(created)}
        onClose={() => setCreated(null)}
        title="API key created"
        subtitle="Copy it now — it cannot be retrieved again."
        footer={<Button variant="primary" onClick={() => setCreated(null)}>I have copied it</Button>}
      >
        <div className="key-reveal">
          <strong className="small">{created?.name}</strong>
          <code>{created?.key}</code>
          <div className="xs muted mt-1">Send it as <span className="mono">Authorization: Bearer &lt;key&gt;</span>.</div>
        </div>
      </Modal>
    </>
  );
}

function AuditPanel() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");

  const load = useCallback(() => {
    api.get("/api/settings/audit", { page, page_size: 25, action: action || undefined })
      .then(setData)
      .catch((err) => toast.error("Could not load the audit log", err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, action]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="card">
      <div className="table-toolbar">
        <div>
          <h3 style={{ fontSize: 14 }}>Audit log</h3>
          <div className="xs muted">Authentication, collection, export and administrative events</div>
        </div>
        <select className="select" style={{ maxWidth: 200, marginLeft: "auto" }} value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }}>
          <option value="">All actions</option>
          <option value="auth">Authentication</option>
          <option value="source">Sources</option>
          <option value="job">Collection jobs</option>
          <option value="lead">Leads</option>
          <option value="import">Imports</option>
          <option value="export">Exports</option>
          <option value="settings">Settings</option>
          <option value="suppression">Suppression</option>
          <option value="user">Users</option>
        </select>
      </div>
      <div className="table-wrap">
        <table className="data compact">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>IP</th><th>Detail</th></tr></thead>
          <tbody>
            {data?.items?.map((entry) => (
              <tr key={entry.id}>
                <td className="small muted nowrap">{formatDate(entry.created_at, { withTime: true })}</td>
                <td className="small">{entry.actor_email || "system"}</td>
                <td><span className="mono xs">{entry.action}</span></td>
                <td className="small muted">{entry.entity_type}{entry.entity_id ? ` #${entry.entity_id}` : ""}</td>
                <td className="mono xs">{entry.ip_address || "—"}</td>
                <td className="xs muted truncate" style={{ maxWidth: 320 }}>{JSON.stringify(entry.detail)}</td>
              </tr>
            ))}
            {!data?.items?.length && <tr><td colSpan={6}><div className="empty small">No audit entries yet.</div></td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={data.page} pages={Math.max(1, Math.ceil(data.total / 25))} total={data.total} pageSize={25} onPage={setPage} label="events" />}
    </div>
  );
}

function DataPanel({ settings, onChanged }) {
  const toast = useToast();
  const [inventory, setInventory] = useState(null);
  const [retention, setRetention] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    api.get("/api/settings/data-inventory").then(setInventory).catch(() => {});
    api.get("/api/settings/retention/preview").then(setRetention).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const purge = async () => {
    setBusy(true);
    try {
      const result = await api.post("/api/settings/retention/purge");
      toast.success("Retention applied", `${result.leads_purged} leads and ${result.audit_entries_purged} audit entries removed.`);
      setConfirmOpen(false);
      load();
      onChanged?.();
    } catch (err) {
      toast.error("Retention failed", err.message);
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    setExporting(true);
    try {
      const result = await downloadFile("/api/settings/backup", { method: "POST" });
      toast.success("Backup downloaded", result.filename);
    } catch (err) {
      toast.error("Backup failed", err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="card pad">
        <h3 style={{ fontSize: 14 }}>Data inventory</h3>
        <div className="grid cols-3 mt-2">
          {Object.entries(inventory?.counts || {}).map(([key, value]) => (
            <div className="hero-metric" key={key}>
              <div className="hm-label" style={{ textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</div>
              <div className="hm-value">{formatNumber(value)}</div>
            </div>
          ))}
        </div>
        <div className="kv mt-3">
          <dt>Database engine</dt><dd>{settings?.environment?.database || inventory?.database}</dd>
          <dt>Database size</dt><dd>{inventory?.database_size_bytes ? `${(inventory.database_size_bytes / 1024 / 1024).toFixed(2)} MB` : "—"}</dd>
          <dt>Environment variables</dt>
          <dd>
            {Object.entries(inventory?.environment_variables_set || {}).map(([key, set]) => (
              <Badge key={key} tone={set ? "green" : "amber"} className="mr-1" style={{ marginRight: 6 }}>{key}: {set ? "set" : "missing"}</Badge>
            ))}
          </dd>
        </div>
      </div>

      <div className="card pad">
        <div className="row between wrap" style={{ gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 14 }}>Backups</h3>
            <div className="xs muted" style={{ marginTop: 2 }}>
              Download a consistent SQLite snapshot. In production, schedule this daily and store it off-server.
            </div>
          </div>
          <Button icon="database" onClick={backup} loading={exporting}>Download backup</Button>
        </div>
        <div className="code-block mt-2">{settings?.environment?.database === "PostgreSQL"
          ? "pg_dump $DATABASE_URL | gzip > leadbridge-$(date +%F).sql.gz"
          : "sqlite3 data/leadbridge.db \".backup 'backup-$(date +%F).db'\""}</div>
      </div>

      <div className="card pad">
        <div className="row between wrap" style={{ gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 14 }}>Retention purge</h3>
            <div className="xs muted" style={{ marginTop: 2 }}>
              Removes leads older than {retention?.data_retention_days ?? "—"} days (converted and interested leads are kept)
              and audit entries older than {retention?.audit_retention_days ?? "—"} days.
            </div>
          </div>
          <Button variant="danger" icon="trash" onClick={() => setConfirmOpen(true)}>Run purge</Button>
        </div>
        <div className="alert warning mt-2">
          <Icon name="alert" size={16} />
          <span>
            Currently eligible: <strong>{retention?.leads_to_purge ?? 0} leads</strong> and{" "}
            <strong>{retention?.audit_entries_to_purge ?? 0} audit entries</strong>. This cannot be undone — take a backup first.
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={purge}
        loading={busy}
        title="Run retention purge?"
        confirmLabel="Purge records"
        message={`This permanently deletes ${retention?.leads_to_purge ?? 0} stale leads and ${retention?.audit_entries_to_purge ?? 0} audit entries. Take a backup first if you need an archive.`}
      />
    </>
  );
}

function CompliancePanel({ settings }) {
  return (
    <>
      <div className="card pad">
        <h3 style={{ fontSize: 14 }}>What this platform will and will not do</h3>
        <p className="small muted mt-1" style={{ lineHeight: 1.6 }}>
          LeadBridge is designed for authorized B2B contact collection. The guardrails below are enforced in code,
          not just in documentation.
        </p>
        <div className="grid cols-2 mt-2" style={{ gap: 18 }}>
          <div>
            <div className="label mb-2" style={{ color: "var(--success)" }}>Supported</div>
            <div className="policy-list">
              {[
                "Authorized business directories with permitted terms",
                "Official company websites and published contact pages",
                "Licensed business databases under written agreement",
                "Approved, permission-based partner APIs",
                "Your own CSV/Excel exports and first-party form submissions",
                "robots.txt compliance, honest user-agent, per-domain delays",
              ].map((item) => (
                <div className="policy-item" key={item}><Icon name="check" size={15} /><span>{item}</span></div>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-2" style={{ color: "var(--danger)" }}>Never supported</div>
            <div className="policy-list">
              {[
                "CAPTCHA, login, paywall or anti-bot circumvention",
                "People-search sites and bulk personal profiles",
                "Home addresses, ages, SSN, personal mobiles, health data",
                "Ethnicity, religion, orientation or biometric data",
                "Calling a Do Not Contact record or suppressed number",
                "Exporting records without a permitted contact basis",
              ].map((item) => (
                <div className="policy-item blocked" key={item}><Icon name="ban" size={15} /><span>{item}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card pad">
        <h3 style={{ fontSize: 14 }}>Active enforcement settings</h3>
        <div className="kv mt-2">
          <dt>robots.txt</dt><dd>{settings?.environment?.robots_enforced ? "Enforced on every live request" : "Disabled (not recommended)"}</dd>
          <dt>Live domain allowlist</dt>
          <dd>{settings?.environment?.live_allowlist?.length ? settings.environment.live_allowlist.join(", ") : "Empty — live collection disabled until an admin adds domains"}</dd>
          <dt>Crawler user agent</dt><dd className="mono xs">{settings?.environment?.user_agent}</dd>
          <dt>Consent required for export</dt><dd>{settings?.export_require_consent ? "Yes" : "No — denied/withdrawn and DNC are still blocked"}</dd>
          <dt>Invalid contacts in exports</dt><dd>{settings?.export_exclude_invalid ? "Excluded" : "Included"}</dd>
          <dt>Suppression entries</dt><dd>{settings?.suppression?.total ?? 0}</dd>
        </div>
      </div>

      <div className="card pad">
        <h3 style={{ fontSize: 14 }}>Contact permission checklist</h3>
        <div className="policy-list mt-2">
          {[
            "Confirm the source's terms allow automated collection before enabling live mode.",
            "Record the legal basis for each source (licence, permission, first-party enquiry).",
            "Honour opt-outs immediately — Do Not Contact adds the contact to the suppression list.",
            "Re-verify numbers periodically; freshly collected does not mean reachable.",
            "Keep the audit log long enough to evidence compliance with your regulator.",
            "Apply your local telemarketing rules (e.g. TCPA / GDPR / PECR) before dialling.",
          ].map((item) => (
            <div className="policy-item" key={item}><Icon name="check" size={15} /><span>{item}</span></div>
          ))}
        </div>
        <div className="alert info mt-2">
          <Icon name="info" size={16} />
          <span>This application is a tool, not legal advice. Have your compliance lead review sources and consent wording.</span>
        </div>
      </div>
    </>
  );
}

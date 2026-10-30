import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatDate, formatNumber, timeAgo } from "../api";
import { useAuth } from "../auth";
import {
  Badge, Button, ConfirmDialog, CopyButton, EmptyState, Field, Icon, Modal, Switch, useToast,
} from "../ui";

const ADAPTER_ICON = {
  business_directory: "list",
  company_website: "globe",
  licensed_database: "database",
  contact_api: "cpu",
  upload: "upload",
  lead_form: "inbox",
};

const ADAPTER_TONE = {
  business_directory: "",
  company_website: "teal",
  licensed_database: "amber",
  contact_api: "teal",
  upload: "slate",
  lead_form: "slate",
};

const LICENSING_OPTIONS = [
  { value: "licensed", label: "Licensed agreement" },
  { value: "public_website", label: "Public website (permitted)" },
  { value: "user_provided", label: "Provided by us / first party" },
  { value: "unconfirmed", label: "Not confirmed" },
];

function configToForm(config = {}) {
  const form = {};
  Object.entries(config).forEach(([key, value]) => {
    if (Array.isArray(value)) form[key] = value.join("\n");
    else if (value && typeof value === "object") form[key] = Object.entries(value).map(([k, v]) => `${k}=${v}`).join("\n");
    else form[key] = value ?? "";
  });
  return form;
}

function formToConfig(form = {}) {
  const config = {};
  Object.entries(form).forEach(([key, value]) => {
    if (value === "" || value === null || value === undefined) return;
    if (typeof value === "string" && value.includes("\n") && value.includes("=")) {
      const mapping = {};
      value.split("\n").forEach((line) => {
        const [k, ...rest] = line.split("=");
        if (k?.trim() && rest.join("=").trim()) mapping[k.trim()] = rest.join("=").trim();
      });
      config[key] = mapping;
    } else if (typeof value === "string" && value.includes("\n")) {
      config[key] = value.split("\n").map((line) => line.trim()).filter(Boolean);
    } else {
      config[key] = value;
    }
  });
  return config;
}

export default function Sources() {
  const { can, adapters, fields } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [collectTarget, setCollectTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get("/api/sources");
      setItems(result.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = items;
    if (tab === "enabled") list = list.filter((item) => item.is_enabled);
    if (tab === "disabled") list = list.filter((item) => !item.is_enabled);
    if (search.trim()) {
      const needle = search.toLowerCase();
      list = list.filter((item) => `${item.name} ${item.adapter} ${item.url}`.toLowerCase().includes(needle));
    }
    return list;
  }, [items, tab, search]);

  const toggle = async (source) => {
    try {
      const updated = await api.patch(`/api/sources/${source.id}/enabled`, null, { enabled: !source.is_enabled });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(updated.is_enabled ? "Source enabled" : "Source disabled", source.name);
    } catch (err) {
      toast.error("Could not update source", err.message);
    }
  };

  const test = async (source) => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await api.post(`/api/sources/${source.id}/test`);
      setTestResult({ source, ...result });
    } catch (err) {
      toast.error("Connection test failed", err.message);
    } finally {
      setTestLoading(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/api/sources/${deleteTarget.id}`);
      toast.success("Source deleted");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error("Cannot delete source", err.message);
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(() => ({
    leads: items.reduce((sum, item) => sum + (item.stats?.leads || 0), 0),
    jobs: items.reduce((sum, item) => sum + (item.stats?.jobs || 0), 0),
    failures: items.reduce((sum, item) => sum + (item.stats?.failed_requests || 0), 0),
    enabled: items.filter((item) => item.is_enabled).length,
  }), [items]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Data sources</h1>
          <div className="sub">
            Each adapter has its own limits, permitted fields and attribution. Live extraction is only
            allowed for domains an administrator has reviewed.
          </div>
        </div>
        <div className="page-head-actions">
          <Button icon="refresh" onClick={load} disabled={loading}>Refresh</Button>
          {can("sources:manage") && (
            <Button variant="primary" icon="plus" onClick={() => setEditor({ mode: "create" })}>Add source</Button>
          )}
        </div>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <div className="hero-metric">
          <div className="hm-label"><Icon name="sources" size={13} /> Sources</div>
          <div className="hm-value">{items.length}</div>
          <div className="hm-sub">{totals.enabled} enabled</div>
        </div>
        <div className="hero-metric">
          <div className="hm-label"><Icon name="leads" size={13} /> Records collected</div>
          <div className="hm-value">{formatNumber(totals.leads)}</div>
          <div className="hm-sub">across all adapters</div>
        </div>
        <div className="hero-metric">
          <div className="hm-label"><Icon name="jobs" size={13} /> Collection runs</div>
          <div className="hm-value">{formatNumber(totals.jobs)}</div>
          <div className="hm-sub">all-time</div>
        </div>
        <div className="hero-metric">
          <div className="hm-label"><Icon name="alert" size={13} /> Failed requests</div>
          <div className="hm-value">{formatNumber(totals.failures)}</div>
          <div className="hm-sub">visible in job history</div>
        </div>
      </div>

      <div className="row wrap between mt-2" style={{ gap: 10 }}>
        <div className="segmented">
          {[["all", "All sources"], ["enabled", "Enabled"], ["disabled", "Disabled"]].map(([value, label]) => (
            <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>
        <div className="input-icon" style={{ maxWidth: 280, flex: 1 }}>
          <Icon name="search" size={15} />
          <input className="input" placeholder="Search sources…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>

      {error && (
        <div className="alert danger mt-2">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="card mt-2">
          <EmptyState
            icon="sources"
            title={items.length ? "No sources match that filter" : "Add your first data source"}
            message={items.length ? "Try a different search or filter." : "Connect an authorized directory, your own website, a licensed provider or an upload workflow."}
            action={can("sources:manage") && <Button variant="primary" icon="plus" onClick={() => setEditor({ mode: "create" })}>Add source</Button>}
          />
        </div>
      )}

      <div className="grid auto mt-2">
        {filtered.map((source) => (
          <article className="card source-card" key={source.id}>
            <div className="source-card-head">
              <span className={`source-icon ${ADAPTER_TONE[source.adapter] || ""}`}>
                <Icon name={ADAPTER_ICON[source.adapter] || "sources"} size={18} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row between" style={{ gap: 8 }}>
                  <h3 className="truncate">{source.name}</h3>
                  <Switch checked={source.is_enabled} onChange={() => toggle(source)} label={`Toggle ${source.name}`} disabled={!can("sources:manage")} />
                </div>
                <div className="url" title={source.url}>{source.url || "No URL — data arrives by upload or form"}</div>
                <div className="row wrap mt-1" style={{ gap: 6 }}>
                  <Badge tone={source.mode === "demo" ? "amber" : "green"} dot>
                    {source.mode === "demo" ? "Demo dataset" : "Live"}
                  </Badge>
                  {source.meta && <Badge tone="neutral">{source.meta.label}</Badge>}
                  {source.mode === "live" && source.live_ready && !source.live_ready.ready && (
                    <Badge tone="red" title={source.live_ready.reason}>Not ready</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="source-stats">
              <div>
                <div className="s-label">Leads</div>
                <div className="s-value">{formatNumber(source.stats?.leads || 0)}</div>
              </div>
              <div>
                <div className="s-label">Duplicates</div>
                <div className="s-value">{formatNumber(source.stats?.duplicates || 0)}</div>
              </div>
              <div>
                <div className="s-label">Failed req.</div>
                <div className="s-value">{formatNumber(source.stats?.failed_requests || 0)}</div>
              </div>
            </div>

            <div className="row between small muted">
              <span>Last run</span>
              <span className="strong" style={{ color: "var(--text-2)" }}>
                {source.last_run_at ? timeAgo(source.last_run_at) : "Never"}
              </span>
            </div>
            <div className="row between small muted">
              <span>Limits</span>
              <span>{source.rate_limit_per_minute}/min · {source.max_records_per_run} records/run</span>
            </div>

            <div className="source-foot">
              <Button
                size="sm"
                variant="primary"
                icon="play"
                disabled={!can("jobs:manage") || !source.is_enabled}
                onClick={() => setCollectTarget(source)}
              >
                Collect
              </Button>
              <Button size="sm" icon="bolt" onClick={() => test(source)} disabled={testLoading}>Test</Button>
              {can("sources:manage") && <Button size="sm" icon="edit" onClick={() => setEditor({ mode: "edit", source })}>Edit</Button>}
              {can("sources:manage") && (
                <button
                  className="icon-btn"
                  style={{ marginLeft: "auto", width: 30, height: 30 }}
                  onClick={() => setDeleteTarget(source)}
                  title="Delete source"
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {editor && (
        <SourceEditor
          state={editor}
          adapters={adapters}
          fields={fields}
          onClose={() => setEditor(null)}
          onSaved={(source) => {
            setEditor(null);
            load();
            if (source) setCollectTarget(source);
          }}
        />
      )}

      <CollectModal
        source={collectTarget}
        onClose={() => setCollectTarget(null)}
        onStarted={(job) => {
          setCollectTarget(null);
          toast.success("Collection started", `${job.source_name} · job #${job.id}`);
          navigate("/jobs");
        }}
      />

      <Modal
        open={Boolean(testResult)}
        onClose={() => setTestResult(null)}
        title={`Connection test · ${testResult?.source?.name || ""}`}
        subtitle="Configuration, credentials, allowlist and robots policy checks"
        footer={<Button onClick={() => setTestResult(null)}>Close</Button>}
      >
        <div className="col" style={{ gap: 9 }}>
          <div className={`alert ${testResult?.ok ? "success" : "warning"}`}>
            <Icon name={testResult?.ok ? "check" : "alert"} size={16} />
            <span>
              {testResult?.ok
                ? "All checks passed — this source is ready to collect."
                : "Some checks need attention before a live collection can run."}
            </span>
          </div>
          {(testResult?.checks || []).map((check) => (
            <div className="row" key={check.check} style={{ alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid #eef0f6" }}>
              <Badge tone={check.status === "pass" ? "green" : check.status === "warn" ? "amber" : "red"}>
                {check.status}
              </Badge>
              <div style={{ flex: 1 }}>
                <div className="small strong">{check.check}</div>
                <div className="xs muted" style={{ marginTop: 2 }}>{check.detail}</div>
              </div>
            </div>
          ))}
          {testResult?.engine && (
            <div className="xs faint">
              Engine: {testResult.engine.active} · Scrapling {testResult.engine.scrapling_available ? "available" : "not installed"} ·
              robots.txt {testResult.engine.robots_enforced ? "enforced" : "not enforced"}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
        title="Delete this source?"
        confirmLabel="Delete source"
        message={`Deleting "${deleteTarget?.name}" removes its configuration. Sources that already collected records cannot be deleted — disable them instead so attribution and audit history stay intact.`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ editor */
function SourceEditor({ state, adapters, fields, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = state.mode === "edit";
  const [adapterKey, setAdapterKey] = useState(state.source?.adapter || "");
  const meta = adapters.find((adapter) => adapter.key === adapterKey);
  const [form, setForm] = useState(() => {
    const source = state.source;
    return {
      name: source?.name || "",
      url: source?.url || "",
      description: source?.description || "",
      mode: source?.mode || (meta?.default_mode ?? "demo"),
      allowed_fields: source?.allowed_fields || meta?.default_allowed_fields || [],
      rate_limit_per_minute: source?.rate_limit_per_minute ?? meta?.default_rate_limit ?? 20,
      min_delay_seconds: source?.min_delay_seconds ?? meta?.default_min_delay ?? 1.5,
      max_records_per_run: source?.max_records_per_run ?? meta?.default_max_records ?? 200,
      max_requests_per_run: source?.max_requests_per_run ?? 25,
      attribution: source?.attribution || meta?.default_attribution || "",
      licensing_status: source?.licensing_status || "unconfirmed",
      consent_default: source?.consent_default || "unknown",
      credential_env: source?.credential_env || "",
      compliance_notes: source?.compliance_notes || meta?.compliance_notes || "",
      config: state.source ? configToForm(state.source.config) : configToForm(meta?.config_defaults || {}),
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const chooseAdapter = (adapter) => {
    setAdapterKey(adapter.key);
    setForm((current) => ({
      ...current,
      mode: adapter.default_mode,
      allowed_fields: adapter.default_allowed_fields,
      rate_limit_per_minute: adapter.default_rate_limit,
      min_delay_seconds: adapter.default_min_delay,
      max_records_per_run: adapter.default_max_records,
      attribution: adapter.default_attribution,
      compliance_notes: adapter.compliance_notes,
      licensing_status:
        adapter.key === "licensed_database" || adapter.key === "contact_api" ? "licensed"
        : adapter.key === "upload" || adapter.key === "lead_form" ? "user_provided"
        : "public_website",
      config: configToForm(adapter.key === "lead_form" ? { consent_text: "I agree to be contacted by phone or email about my enquiry." } : {}),
    }));
  };

  const setConfig = (key, value) => setForm((current) => ({ ...current, config: { ...current.config, [key]: value } }));
  const toggleField = (field) => setForm((current) => ({
    ...current,
    allowed_fields: current.allowed_fields.includes(field)
      ? current.allowed_fields.filter((item) => item !== field)
      : [...current.allowed_fields, field],
  }));

  const save = async () => {
    setError(null);
    if (!form.name.trim()) return setError("Give this source a name.");
    if (!adapterKey) return setError("Choose an adapter type.");
    if (form.mode === "live" && meta?.requires_credentials && !form.credential_env.trim()) {
      return setError("This adapter needs an API credential — set the environment variable name.");
    }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      adapter: adapterKey,
      url: form.url.trim(),
      description: form.description || null,
      mode: form.mode,
      is_enabled: state.source?.is_enabled ?? true,
      config: formToConfig(form.config),
      allowed_fields: form.allowed_fields,
      rate_limit_per_minute: Number(form.rate_limit_per_minute),
      min_delay_seconds: Number(form.min_delay_seconds),
      max_records_per_run: Number(form.max_records_per_run),
      max_requests_per_run: Number(form.max_requests_per_run),
      attribution: form.attribution,
      licensing_status: form.licensing_status,
      consent_default: form.consent_default,
      credential_env: form.credential_env || null,
      compliance_notes: form.compliance_notes || null,
    };
    try {
      if (isEdit) {
        await api.put(`/api/sources/${state.source.id}`, payload);
        toast.success("Source updated", payload.name);
        onSaved?.(null);
      } else {
        const source = await api.post("/api/sources", payload);
        toast.success("Source created", payload.name);
        setCreated(source);
        onSaved?.(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const token = created.config?.form_token;
    return (
      <Modal
        open
        onClose={onClose}
        title="Source created"
        subtitle={created.name}
        footer={<>
          <Button onClick={onClose}>Done</Button>
          <Button variant="primary" icon="play" onClick={() => { onClose(); onSaved?.(created); }}>Collect now</Button>
        </>}
      >
        <div className="col" style={{ gap: 14 }}>
          <div className="alert success">
            <Icon name="check" size={16} />
            <span>The adapter is configured with {created.allowed_fields.length} permitted fields and {created.rate_limit_per_minute} requests/min.</span>
          </div>
          {token && (
            <div>
              <strong className="small">Public form endpoint</strong>
              <div className="code-block mt-1">{`POST ${window.location.origin}/api/public/lead-form/${token}`}</div>
              <div className="row mt-1" style={{ gap: 8 }}>
                <CopyButton value={`${window.location.origin}/api/public/lead-form/${token}`} label="Copy endpoint" />
                <span className="xs faint">Embed this in your website form. Consent text is stored with each submission.</span>
              </div>
            </div>
          )}
          <div className="compliance-box">
            <strong>Compliance notes.</strong> {created.compliance_notes}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xwide"
      title={isEdit ? `Edit ${state.source.name}` : "Add a data source"}
      subtitle={isEdit ? "Update configuration, limits and permitted fields" : "Choose an adapter, then configure its extraction rules"}
      footer={
        <>
          {error && <span className="left small" style={{ color: "var(--danger)", maxWidth: 420 }}>{error}</span>}
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>{isEdit ? "Save changes" : "Create source"}</Button>
        </>
      }
    >
      <div className="col" style={{ gap: 18 }}>
        {!isEdit && (
          <div>
            <div className="label mb-2">Adapter type</div>
            <div className="adapter-pick">
              {adapters.map((adapter) => (
                <button
                  type="button"
                  key={adapter.key}
                  className={`adapter-option ${adapterKey === adapter.key ? "selected" : ""}`}
                  onClick={() => chooseAdapter(adapter)}
                >
                  <span className="ao-title">
                    <Icon name={ADAPTER_ICON[adapter.key] || "sources"} size={15} />
                    {adapter.label}
                  </span>
                  <span className="ao-desc">{adapter.description}</span>
                  <span className="row" style={{ gap: 5, marginTop: 2 }}>
                    <Badge tone="neutral">{adapter.category}</Badge>
                    {adapter.requires_credentials && <Badge tone="amber">credentials</Badge>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {meta && (
          <>
            <div className="grid cols-2">
              <Field label="Source name" required>
                <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Regional business directory" />
              </Field>
              <Field label="Source URL" hint="Used for attribution and allowlist checks.">
                <input className="input" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://directory.example.com/" />
              </Field>
            </div>

            <Field label="Description">
              <input className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Why this source is authorized and what it is used for" />
            </Field>

            <div className="grid cols-2">
              <Field label="Collection mode" hint={form.mode === "demo" ? "Streams the bundled synthetic dataset — no external requests." : "Requires an approved domain allowlist and robots.txt compliance."}>
                <div className="segmented">
                  <button className={form.mode === "demo" ? "active" : ""} onClick={() => setForm({ ...form, mode: "demo" })} disabled={!meta.supports_demo} type="button">Demo dataset</button>
                  <button className={form.mode === "live" ? "active" : ""} onClick={() => setForm({ ...form, mode: "live" })} type="button">Live collection</button>
                </div>
              </Field>
              <Field label="Licensing status" hint="Stored on every record this source produces.">
                <select className="select" value={form.licensing_status} onChange={(event) => setForm({ ...form, licensing_status: event.target.value })}>
                  {LICENSING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>

            <div className="divider" />

            <div>
              <div className="section-title" style={{ marginTop: 0 }}>Extraction configuration</div>
              <div className="grid cols-2">
                {meta.config_fields.map((field) => {
                  const value = form.config?.[field.name] ?? "";
                  const isTextarea = field.type === "list" || field.type === "mapping";
                  return (
                    <Field
                      key={field.name}
                      label={field.label}
                      required={field.required && form.mode === "live"}
                      hint={field.help}
                      className={isTextarea ? "full" : ""}
                    >
                      {isTextarea ? (
                        <textarea
                          className="textarea"
                          style={{ minHeight: field.type === "mapping" ? 96 : 78, fontFamily: "var(--font-mono)", fontSize: 12 }}
                          value={Array.isArray(value) ? value.join("\n") : value}
                          placeholder={field.placeholder || ""}
                          onChange={(event) => setConfig(field.name, event.target.value)}
                        />
                      ) : field.type === "number" ? (
                        <input className="input" type="number" value={value} onChange={(event) => setConfig(field.name, event.target.value)} />
                      ) : (
                        <input className="input" value={value} onChange={(event) => setConfig(field.name, event.target.value)} placeholder={field.placeholder || ""} />
                      )}
                    </Field>
                  );
                })}
              </div>
            </div>

            <div className="divider" />

            <div>
              <div className="row between mb-2">
                <div>
                  <div className="label">Permitted extraction fields</div>
                  <div className="hint">Only these fields will be stored. Prohibited personal attributes are never available.</div>
                </div>
                <Badge tone="indigo">{form.allowed_fields.length} selected</Badge>
              </div>
              <div className="field-picker">
                {fields.collectable_fields.map((field) => (
                  <label className="check" key={field}>
                    <input
                      type="checkbox"
                      checked={form.allowed_fields.includes(field)}
                      onChange={() => toggleField(field)}
                    />
                    <span>
                      <span className="small">{fields.field_labels?.[field] || field}</span>
                      <span className="xs faint mono" style={{ display: "block" }}>{field}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="compliance-box mt-2">
                <strong>Never collected:</strong> home addresses, ages/DOB, SSN, personal mobile numbers,
                health, ethnicity, religion, financial or biometric data. Those fields are blocked at the API level.
              </div>
            </div>

            <div className="divider" />

            <div>
              <div className="section-title" style={{ marginTop: 0 }}>Request frequency & limits</div>
              <div className="grid cols-4">
                <Field label="Requests / minute">
                  <input className="input" type="number" min="1" max="600" value={form.rate_limit_per_minute} onChange={(event) => setForm({ ...form, rate_limit_per_minute: event.target.value })} />
                </Field>
                <Field label="Min delay (seconds)">
                  <input className="input" type="number" min="0" step="0.5" value={form.min_delay_seconds} onChange={(event) => setForm({ ...form, min_delay_seconds: event.target.value })} />
                </Field>
                <Field label="Max records / run">
                  <input className="input" type="number" min="1" max="5000" value={form.max_records_per_run} onChange={(event) => setForm({ ...form, max_records_per_run: event.target.value })} />
                </Field>
                <Field label="Max requests / run">
                  <input className="input" type="number" min="1" max="500" value={form.max_requests_per_run} onChange={(event) => setForm({ ...form, max_requests_per_run: event.target.value })} />
                </Field>
              </div>
            </div>

            <div className="grid cols-2">
              <Field label="Source attribution" hint="Printed on every record and export for traceability.">
                <input className="input" value={form.attribution} onChange={(event) => setForm({ ...form, attribution: event.target.value })} />
              </Field>
              <Field label="Default consent status" hint="Applied when the source does not provide a consent value.">
                <select className="select" value={form.consent_default} onChange={(event) => setForm({ ...form, consent_default: event.target.value })}>
                  <option value="unknown">Unknown — no permission recorded</option>
                  <option value="pending">Pending</option>
                  <option value="granted">Granted — explicit consent</option>
                  <option value="denied">Denied</option>
                </select>
              </Field>
            </div>

            {meta.requires_credentials && (
              <Field
                label="Credential environment variable"
                hint="The API key itself stays on the server as an environment variable — it is never stored in the database or sent to the browser."
                required
              >
                <input
                  className="input"
                  value={form.credential_env}
                  onChange={(event) => setForm({ ...form, credential_env: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                  placeholder="DATA_PROVIDER_KEY"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </Field>
            )}

            <div className="compliance-box">
              <strong>Compliance notes for this adapter.</strong> {meta.compliance_notes}
              <div className="xs mt-1" style={{ color: "var(--faint)" }}>Legal basis: {meta.legal_basis}</div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- collect */
function CollectModal({ source, onClose, onStarted }) {
  const toast = useToast();
  const [maxRecords, setMaxRecords] = useState(source?.max_records_per_run || 100);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (source) setMaxRecords(source.max_records_per_run || 100);
  }, [source]);

  if (!source) return null;

  const start = async () => {
    setBusy(true);
    try {
      const job = await api.post(`/api/jobs?source_id=${source.id}`, { max_records: Number(maxRecords) });
      onStarted(job);
    } catch (err) {
      toast.error("Could not start collection", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Collect from ${source.name}`}
      subtitle={`${source.mode === "demo" ? "Demo dataset" : "Live"} mode · ${source.rate_limit_per_minute} requests/min · ${source.min_delay_seconds}s delay`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon="play" onClick={start} loading={busy}>Start collection</Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="alert info">
          <Icon name="shield" size={16} />
          <span>
            Collections honour robots.txt, per-domain delays and this source&apos;s permitted fields.
            You can pause or stop the run at any time from Collection Jobs.
          </span>
        </div>
        <Field label="Maximum records for this run" hint={`Source default is ${source.max_records_per_run}; hard cap is 5000.`}>
          <input className="input" type="number" min="1" max="5000" value={maxRecords} onChange={(event) => setMaxRecords(event.target.value)} />
        </Field>
        <div className="kv">
          <dt>Adapter</dt><dd>{source.meta?.label || source.adapter}</dd>
          <dt>Permitted fields</dt><dd>{source.allowed_fields.join(", ")}</dd>
          <dt>Attribution</dt><dd>{source.attribution}</dd>
          <dt>Licensing</dt><dd style={{ textTransform: "capitalize" }}>{source.licensing_status.replace(/_/g, " ")}</dd>
        </div>
      </div>
    </Modal>
  );
}

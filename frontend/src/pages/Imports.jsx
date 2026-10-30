import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, downloadFile, formatDate, formatNumber } from "../api";
import { consentTone, useAuth } from "../auth";
import {
  Badge, Button, EmptyState, Field, Icon, Modal, Pagination, Tabs, useToast,
} from "../ui";

const MAX_BYTES = 12 * 1024 * 1024;

const STATUS_LABELS = {
  new: "New", assigned: "Assigned", contacted: "Contacted", interested: "Interested",
  not_interested: "Not interested", follow_up: "Follow-up", converted: "Converted", do_not_contact: "Do Not Contact",
};

export default function Imports() {
  const { can } = useAuth();
  const [tab, setTab] = useState("import");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Imports &amp; exports</h1>
          <div className="sub">
            Bring in files you are licensed to use, and build calling lists that respect suppression,
            Do Not Contact and consent rules.
          </div>
        </div>
        <div className="page-head-actions">
          <a className="btn" href="/api/imports/template?format=csv" download>
            <Icon name="download" size={15} /> CSV template
          </a>
          <a className="btn" href="/api/imports/template?format=xlsx" download>
            <Icon name="download" size={15} /> Excel template
          </a>
        </div>
      </div>

      <Tabs
        tabs={[
          { value: "import", label: "Import leads", icon: "upload" },
          { value: "export", label: "Export calling list", icon: "download" },
          { value: "history", label: "History", icon: "clock" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "import" && (can("imports:manage") ? <ImportPanel /> : <NoAccess />)}
      {tab === "export" && <ExportPanel />}
      {tab === "history" && <HistoryPanel />}
    </div>
  );
}

function NoAccess() {
  return (
    <div className="card">
      <EmptyState icon="lock" title="Imports are restricted" message="Ask a manager or administrator to import data on your behalf." />
    </div>
  );
}

/* ------------------------------------------------------------------ import */
function ImportPanel() {
  const toast = useToast();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState({ source_id: "", attestation: "", consent_override: "", dry_run: false });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    api.get("/api/sources").then((data) => {
      const uploads = (data.items || []).filter((source) => ["upload", "lead_form"].includes(source.adapter));
      setSources(uploads);
      if (uploads.length) setForm((current) => ({ ...current, source_id: uploads[0].id }));
    }).catch(() => {});
  }, []);

  const pick = async (selected) => {
    if (!selected) return;
    if (selected.size > MAX_BYTES) {
      setError("File is larger than the 12 MB limit.");
      return;
    }
    setError(null);
    setFile(selected);
    setResult(null);
    setPreview(null);
    setPreviewing(true);
    const body = new FormData();
    body.append("file", selected);
    try {
      setPreview(await api.upload("/api/imports/preview", body));
    } catch (err) {
      setError(err.message);
      setFile(null);
    } finally {
      setPreviewing(false);
    }
  };

  const runImport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    if (form.source_id) body.append("source_id", form.source_id);
    body.append("attestation", form.attestation);
    if (form.consent_override) body.append("consent_override", form.consent_override);
    body.append("dry_run", String(form.dry_run));
    try {
      const data = await api.upload("/api/imports", body);
      setResult(data);
      toast.success(
        form.dry_run ? "Dry run complete" : "Import complete",
        `${data.imported} imported · ${data.duplicates} duplicates · ${data.invalid} invalid`,
      );
    } catch (err) {
      setError(err.message);
      toast.error("Import failed", err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    doneReset();
  };
  const doneReset = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const ready = file && preview?.can_import && form.attestation.trim().length >= 15;

  return (
    <div className="import-grid">
      <div className="col" style={{ gap: 16 }}>
        <div className="card pad">
          <div className="row between mb-2">
            <div>
              <strong style={{ fontSize: 13.5 }}>1 · Upload a file</strong>
              <div className="xs muted" style={{ marginTop: 2 }}>CSV, XLSX or XLSM · up to 12 MB / 20,000 rows</div>
            </div>
            {file && <Badge tone="indigo">{file.name}</Badge>}
          </div>

          <div
            className={`dropzone ${dragging ? "drag" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              pick(event.dataTransfer.files?.[0]);
            }}
          >
            <div className="dz-icon"><Icon name="upload" size={20} /></div>
            <h4>{file ? "Choose a different file" : "Drop your CSV or Excel export here"}</h4>
            <p>or click to browse. Columns are detected automatically.</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: "none" }}
            onChange={(event) => pick(event.target.files?.[0])}
          />

          {previewing && <div className="loading-block"><span className="spinner dark" /> Reading file…</div>}

          {error && <div className="alert danger mt-2"><Icon name="alert" size={16} /><span>{error}</span></div>}

          {preview && (
            <div className="mt-2">
              <div className="row wrap" style={{ gap: 12 }}>
                <Badge tone="neutral">{formatNumber(preview.rows)} rows</Badge>
                <Badge tone="green">{preview.fields_detected.length} fields detected</Badge>
                {preview.unmapped_headers.length > 0 && <Badge tone="amber">{preview.unmapped_headers.length} ignored columns</Badge>}
                {preview.prohibited_headers.length > 0 && <Badge tone="red">{preview.prohibited_headers.length} prohibited</Badge>}
              </div>

              {preview.prohibited_headers.length > 0 && (
                <div className="alert danger mt-2">
                  <Icon name="ban" size={16} />
                  <span>
                    <strong>This file cannot be imported.</strong> It contains prohibited personal or sensitive
                    columns ({preview.prohibited_headers.join(", ")}). Only business contact data is accepted.
                  </span>
                </div>
              )}

              <div className="mapping-table mt-2">
                {preview.headers.map((header) => {
                  const mapped = preview.mapping[header];
                  const prohibited = preview.prohibited_headers.includes(header);
                  return (
                    <div className="mapping-line" key={header}>
                      <span className="truncate" style={{ maxWidth: 190 }}>{header}</span>
                      <span className="arrow">→</span>
                      <span className={prohibited ? "unmapped" : mapped ? "mapped" : "unmapped"}>
                        {prohibited ? "blocked" : mapped || "ignored"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {preview?.preview?.length > 0 && (
          <div className="card">
            <div className="card-head"><div><h3>First rows preview</h3><div className="sub">Normalisation happens on import</div></div></div>
            <div className="table-wrap">
              <table className="data compact">
                <thead>
                  <tr>{Object.keys(preview.preview[0]).map((key) => <th key={key}>{key}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, index) => (
                    <tr key={index}>
                      {Object.keys(preview.preview[0]).map((key) => (
                        <td key={key} className="small truncate" style={{ maxWidth: 180 }}>{String(row[key] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="col" style={{ gap: 16 }}>
        <div className="card pad">
          <strong style={{ fontSize: 13.5 }}>2 · Attestation &amp; source</strong>
          <p className="xs muted mt-1" style={{ lineHeight: 1.55 }}>
            Every import is recorded with who uploaded it, which source it belongs to and the legal basis
            you provide. Files containing personal or sensitive attributes are rejected automatically.
          </p>

          <div className="col mt-2" style={{ gap: 12 }}>
            <Field label="Attribute to source">
              <select className="select" value={form.source_id} onChange={(event) => setForm({ ...form, source_id: event.target.value })}>
                <option value="">No specific source</option>
                {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
              </select>
            </Field>

            <Field label="Legal basis / attestation" required hint="Minimum 15 characters. Stored with the batch and in the audit log.">
              <textarea
                className="textarea"
                value={form.attestation}
                onChange={(event) => setForm({ ...form, attestation: event.target.value })}
                placeholder="e.g. Our own CRM export; each business has a signed service agreement permitting contact."
              />
            </Field>

            <Field label="Consent override (optional)" hint="Use only when the file itself has no consent column.">
              <select className="select" value={form.consent_override} onChange={(event) => setForm({ ...form, consent_override: event.target.value })}>
                <option value="">Use the file / source default</option>
                <option value="granted">Granted — explicit consent</option>
                <option value="pending">Pending</option>
                <option value="unknown">Unknown</option>
                <option value="denied">Denied (will suppress)</option>
              </select>
            </Field>

            <label className="check">
              <input type="checkbox" checked={form.dry_run} onChange={(event) => setForm({ ...form, dry_run: event.target.checked })} />
              <span>
                <strong>Dry run</strong>
                <span className="small muted" style={{ display: "block" }}>Validate rows without saving any leads.</span>
              </span>
            </label>

            <div className="row" style={{ gap: 8 }}>
              <Button variant="primary" icon="upload" onClick={runImport} disabled={!ready} loading={busy}>
                {form.dry_run ? "Validate file" : "Import leads"}
              </Button>
              <Button icon="x" onClick={reset} disabled={!file || busy}>Clear</Button>
            </div>
            {!ready && file && (
              <div className="xs faint">
                {preview && !preview.can_import
                  ? "Fix the detected columns before importing."
                  : "Add an attestation of at least 15 characters to continue."}
              </div>
            )}
          </div>
        </div>

        {result && (
          <div className="card pad">
            <div className="row between mb-2">
              <strong style={{ fontSize: 13.5 }}>{result.dry_run ? "Validation result" : "Import result"}</strong>
              {result.batch_id && <Badge tone="neutral">batch #{result.batch_id}</Badge>}
            </div>
            <div className="metric-row">
              <div className="metric"><div className="m-label">Rows</div><div className="m-value">{result.rows_total}</div></div>
              <div className="metric"><div className="m-label">Imported</div><div className="m-value" style={{ color: "var(--success)" }}>{result.imported}</div></div>
              <div className="metric"><div className="m-label">Duplicates</div><div className="m-value" style={{ color: "var(--warning)" }}>{result.duplicates}</div></div>
              <div className="metric"><div className="m-label">Invalid</div><div className="m-value" style={{ color: "var(--danger)" }}>{result.invalid}</div></div>
            </div>
            {result.errors?.length > 0 && (
              <div className="table-wrap mt-2" style={{ maxHeight: 240, overflowY: "auto" }}>
                <table className="data compact">
                  <thead><tr><th>Row</th><th>Problem</th></tr></thead>
                  <tbody>
                    {result.errors.map((item) => (
                      <tr key={item.row_number}><td className="mono">{item.row_number}</td><td className="small">{item.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="compliance-box">
          <strong>What happens on import.</strong> Phones are reformatted, e-mails validated, addresses normalised,
          duplicates detected against the whole database, suppression lists applied and every row written to the
          record audit history. Invalid rows are reported — never silently dropped.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ export */
function ExportPanel() {
  const toast = useToast();
  const { can, filters: facets } = useAuth();
  const [sources, setSources] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ lead_status: "", consent_status: "", source_id: "", assigned_agent_id: "", verification: "", state: "", freshness: "" });
  const [policy, setPolicy] = useState({ require_consent: false, exclude_invalid: true });
  const [format, setFormat] = useState("csv");
  const [purpose, setPurpose] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get("/api/sources").then((data) => setSources(data.items || [])).catch(() => {});
    api.get("/api/agents").then((data) => setAgents(data.items || [])).catch(() => {});
  }, []);

  const cleanFilters = useMemo(() => {
    const payload = {};
    Object.entries(filters).forEach(([key, value]) => { if (value) payload[key] = value; });
    return payload;
  }, [filters]);

  const runPreview = useCallback(async () => {
    setLoading(true);
    try {
      setPreview(await api.post("/api/exports/preview", { filters: cleanFilters, require_consent: policy.require_consent, exclude_invalid: policy.exclude_invalid }));
    } catch (err) {
      toast.error("Preview failed", err.message);
    } finally {
      setLoading(false);
    }
  }, [cleanFilters, policy, toast]);

  useEffect(() => { runPreview(); }, [runPreview]);

  const download = async () => {
    setDownloading(true);
    try {
      const result = await downloadFile("/api/exports", {
        body: { format, filters: cleanFilters, require_consent: policy.require_consent, exclude_invalid: policy.exclude_invalid, purpose: purpose || null },
      });
      toast.success("Export ready", `${result.rows} rows · ${result.blocked} blocked · ${result.filename}`);
    } catch (err) {
      toast.error("Export blocked", err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="import-grid">
      <div className="card pad">
        <strong style={{ fontSize: 13.5 }}>Filters</strong>
        <p className="xs muted mt-1">Only records that pass every compliance check will be included.</p>
        <div className="grid cols-2 mt-2">
          <Field label="Lead status">
            <select className="select" value={filters.lead_status} onChange={(event) => setFilters({ ...filters, lead_status: event.target.value })}>
              <option value="">Any status (excl. DNC)</option>
              {Object.entries(STATUS_LABELS).filter(([value]) => value !== "do_not_contact").map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Consent">
            <select className="select" value={filters.consent_status} onChange={(event) => setFilters({ ...filters, consent_status: event.target.value })}>
              <option value="">Any consent</option>
              <option value="granted">Granted</option>
              <option value="pending">Pending</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
          <Field label="Source">
            <select className="select" value={filters.source_id} onChange={(event) => setFilters({ ...filters, source_id: event.target.value })}>
              <option value="">Any source</option>
              {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
          </Field>
          <Field label="Assigned agent">
            <select className="select" value={filters.assigned_agent_id} onChange={(event) => setFilters({ ...filters, assigned_agent_id: event.target.value })}>
              <option value="">Any assignee</option>
              <option value="unassigned">Unassigned</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
            </select>
          </Field>
          <Field label="State">
            <select className="select" value={filters.state} onChange={(event) => setFilters({ ...filters, state: event.target.value })}>
              <option value="">Any state</option>
              {(facets.states || []).map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </Field>
          <Field label="Freshness">
            <select className="select" value={filters.freshness} onChange={(event) => setFilters({ ...filters, freshness: event.target.value })}>
              <option value="">Any age</option>
              <option value="fresh">Fresh (≤30 days)</option>
              <option value="aging">Aging (31–90)</option>
            </select>
          </Field>
        </div>

        <div className="divider" />

        <div className="col" style={{ gap: 10 }}>
          <label className="check">
            <input type="checkbox" checked={policy.require_consent} onChange={(event) => setPolicy({ ...policy, require_consent: event.target.checked })} />
            <span><strong>Require explicit consent</strong><span className="small muted" style={{ display: "block" }}>Only granted records.</span></span>
          </label>
          <label className="check">
            <input type="checkbox" checked={policy.exclude_invalid} onChange={(event) => setPolicy({ ...policy, exclude_invalid: event.target.checked })} />
            <span><strong>Exclude invalid contacts</strong><span className="small muted" style={{ display: "block" }}>Numbers flagged invalid, bounced e-mails.</span></span>
          </label>
        </div>

        <div className="divider" />

        <div className="grid cols-2">
          <Field label="Format">
            <div className="segmented">
              <button className={format === "csv" ? "active" : ""} onClick={() => setFormat("csv")}>CSV</button>
              <button className={format === "xlsx" ? "active" : ""} onClick={() => setFormat("xlsx")}>Excel</button>
            </div>
          </Field>
          <Field label="Purpose">
            <input className="input" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Outbound wave — October" />
          </Field>
        </div>
      </div>

      <div className="col" style={{ gap: 16 }}>
        <div className="card pad">
          <div className="row between">
            <strong style={{ fontSize: 13.5 }}>Compliance preview</strong>
            <Button size="sm" icon="refresh" onClick={runPreview} loading={loading}>Re-check</Button>
          </div>

          {preview && (
            <>
              <div className="row wrap mt-2" style={{ gap: 20 }}>
                <div className="metric">
                  <div className="m-label">Eligible</div>
                  <div className="m-value" style={{ color: "var(--success)" }}>{formatNumber(preview.eligible)}</div>
                  <div className="m-sub">will be exported</div>
                </div>
                <div className="metric">
                  <div className="m-label">Blocked</div>
                  <div className="m-value" style={{ color: preview.blocked ? "var(--danger)" : "var(--muted)" }}>{formatNumber(preview.blocked)}</div>
                  <div className="m-sub">suppression / DNC / consent</div>
                </div>
              </div>

              {preview.blocked_reasons?.length > 0 && (
                <div className="alert warning mt-2">
                  <Icon name="shield" size={16} />
                  <div>
                    <strong>Automatically excluded</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                      {preview.blocked_reasons.map((reason) => <li key={reason.reason}>{reason.reason} — {reason.count}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              <Button
                className="mt-2"
                variant="primary"
                icon="download"
                onClick={download}
                loading={downloading}
                disabled={!preview.eligible}
                block
              >
                Download {format.toUpperCase()} · {preview.eligible} records
              </Button>
              {!can("exports:manage") && <div className="xs faint mt-1">Your export is scoped to leads assigned to you.</div>}
            </>
          )}
        </div>

        <div className="table-wrap card">
          <table className="data compact">
            <thead><tr><th>Record</th><th>Business</th><th>Consent</th><th>Phone</th></tr></thead>
            <tbody>
              {(preview?.sample || []).map((row) => (
                <tr key={row.lead_ref}>
                  <td className="mono">{row.lead_ref}</td>
                  <td className="truncate" style={{ maxWidth: 180 }}>{row.business_name}</td>
                  <td><Badge tone={consentTone(row.consent_status)}>{row.consent_status}</Badge></td>
                  <td className="small">{row.phone || "—"}</td>
                </tr>
              ))}
              {!preview?.sample?.length && <tr><td colSpan={4}><div className="empty small">No eligible records for these filters.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- history */
function HistoryPanel() {
  const [batches, setBatches] = useState(null);
  const [exports, setExports] = useState(null);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    api.get("/api/imports", { page, page_size: 10 }).then(setBatches).catch(() => {});
    api.get("/api/exports/history", { page, page_size: 10 }).then(setExports).catch(() => {});
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <div><h3>Import history</h3><div className="sub">Every uploaded file with its attestation and row outcomes</div></div>
          <div className="card-head-actions">
            {batches?.stats && (
              <Badge tone="neutral">
                {batches.stats.imported} imported · {batches.stats.duplicates} dupes · {batches.stats.invalid} invalid
              </Badge>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>File</th><th>Uploaded</th><th className="num">Rows</th><th className="num">Imported</th><th className="num">Dupes</th><th className="num">Invalid</th><th>Status</th><th /></tr></thead>
            <tbody>
              {batches?.items?.map((batch) => (
                <tr key={batch.id}>
                  <td><span className="strong">{batch.filename}</span></td>
                  <td className="small muted">{formatDate(batch.created_at, { withTime: true })}<div className="xs faint">{batch.created_by_name}</div></td>
                  <td className="num">{batch.rows_total}</td>
                  <td className="num strong" style={{ color: "var(--success)" }}>{batch.imported}</td>
                  <td className="num">{batch.duplicates}</td>
                  <td className="num" style={{ color: batch.invalid ? "var(--danger)" : undefined }}>{batch.invalid}</td>
                  <td><Badge tone="green">{batch.status}</Badge></td>
                  <td><Button size="sm" variant="ghost" icon="eye" onClick={() => setDetail(batch.id)}>Errors</Button></td>
                </tr>
              ))}
              {batches?.items?.length === 0 && <tr><td colSpan={8}><EmptyState icon="file" title="No imports yet" message="Upload a CSV or Excel file to get started." /></td></tr>}
            </tbody>
          </table>
        </div>
        {batches && <Pagination page={batches.page} pages={Math.max(1, Math.ceil(batches.total / 10))} total={batches.total} pageSize={10} onPage={setPage} label="imports" />}
      </div>

      <div className="card">
        <div className="card-head">
          <div><h3>Export history</h3><div className="sub">Audit trail of every calling list generated</div></div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>File</th><th>Format</th><th>Exported</th><th className="num">Rows</th><th className="num">Blocked</th><th>Purpose</th></tr></thead>
            <tbody>
              {exports?.items?.map((item) => (
                <tr key={item.id}>
                  <td className="mono small">{item.file_name}</td>
                  <td><Badge tone="neutral">{item.format.toUpperCase()}</Badge></td>
                  <td className="small muted">{formatDate(item.created_at, { withTime: true })}<div className="xs faint">{item.created_by_name}</div></td>
                  <td className="num strong">{item.rows}</td>
                  <td className="num" style={{ color: item.blocked ? "var(--warning)" : undefined }}>{item.blocked}</td>
                  <td className="small muted">{item.filters?.purpose || "—"}</td>
                </tr>
              ))}
              {exports?.items?.length === 0 && <tr><td colSpan={6}><EmptyState icon="download" title="No exports yet" message="Build a calling list from the Export tab." /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <ImportDetail batchId={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function ImportDetail({ batchId, onClose }) {
  const [batch, setBatch] = useState(null);
  useEffect(() => {
    if (!batchId) return;
    setBatch(null);
    api.get(`/api/imports/${batchId}`).then(setBatch).catch(() => {});
  }, [batchId]);

  if (!batchId) return null;
  return (
    <Modal open onClose={onClose} title={batch?.filename || "Import batch"} subtitle={batch ? `${batch.rows_total} rows · ${batch.imported} imported` : ""} footer={<Button onClick={onClose}>Close</Button>}>
      {!batch && <div className="loading-block"><span className="spinner dark" /> Loading…</div>}
      {batch && (
        <div className="col" style={{ gap: 14 }}>
          <div className="kv">
            <dt>Attestation</dt><dd>{batch.attestation || "—"}</dd>
            <dt>Mapping</dt><dd className="mono xs">{Object.entries(batch.mapping || {}).map(([k, v]) => `${k} → ${v}`).join(" · ") || "—"}</dd>
            <dt>Uploaded by</dt><dd>{batch.created_by_name} · {formatDate(batch.created_at, { withTime: true })}</dd>
          </div>
          <div>
            <strong style={{ fontSize: 13 }}>Row errors</strong>
            <div className="table-wrap mt-1" style={{ maxHeight: 320, overflowY: "auto" }}>
              <table className="data compact">
                <thead><tr><th>Row</th><th>Problem</th><th>Raw</th></tr></thead>
                <tbody>
                  {(batch.errors || []).map((error) => (
                    <tr key={error.id}>
                      <td className="mono">{error.row_number}</td>
                      <td className="small">{error.message}</td>
                      <td className="xs muted mono truncate" style={{ maxWidth: 240 }}>{JSON.stringify(error.raw)}</td>
                    </tr>
                  ))}
                  {!batch.errors?.length && <tr><td colSpan={3}><div className="empty small">No row errors.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

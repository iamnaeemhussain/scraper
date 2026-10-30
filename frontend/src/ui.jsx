import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ------------------------------------------------------------------ icons */
const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  sources: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  jobs: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  leads: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  agents: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M17 11.5a3 3 0 1 0 0-6" /><path d="M19 20a6 6 0 0 0-3-5.2" /></>,
  transfers: <><path d="M4 7h13l-3-3" /><path d="M20 17H7l3 3" /></>,
  reports: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10.1 3V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  chevronRight: <><path d="m9 6 6 6-6 6" /></>,
  chevronLeft: <><path d="m15 6-6 6 6 6" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  play: <><path d="m7 4 13 8-13 8V4Z" /></>,
  pause: <><rect x="7" y="4" width="3.5" height="16" rx="1" /><rect x="14" y="4" width="3.5" height="16" rx="1" /></>,
  stop: <><rect x="6" y="6" width="12" height="12" rx="2" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>,
  check: <><path d="m20 6-11 11-5-5" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>,
  filter: <><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z" /></>,
  external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14 21 3" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6" /><path d="M14 11v6" /></>,
  edit: <><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></>,
  mapPin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m11 12 9-9" /><path d="m17 6 3 3" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  sparkles: <><path d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z" /></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></>,
  activity: <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" /></>,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  arrowUp: <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
  arrowDown: <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>,
  arrowRight: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  bolt: <><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12Z" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" /></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></>,
};

export function Icon({ name, size = 16, strokeWidth = 1.8, className = "", style }) {
  const path = ICONS[name] || ICONS.info;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

/* ---------------------------------------------------------------- buttons */
export function Button({ variant = "default", size, icon, iconRight, loading, block = false, children, className = "", ...props }) {
  const classes = ["btn", variant !== "default" ? variant : "", size || "", block ? "block" : "", className].filter(Boolean).join(" ");
  return (
    <button className={classes} {...props} disabled={props.disabled || loading}>
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={15} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={15} /> : null}
    </button>
  );
}

export function Badge({ tone = "neutral", dot = false, children, className = "", title }) {
  return (
    <span className={`badge ${tone} ${className}`} title={title}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function Avatar({ name = "", size = "", tone = "" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
  return <span className={`avatar ${size} ${tone}`}>{initials}</span>;
}

/* ------------------------------------------------------------------ form */
export function Field({ label, hint, error, required, children, className = "" }) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label>
          {label} {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", onClear, className = "" }) {
  return (
    <div className={`input-icon ${className}`}>
      <Icon name="search" size={15} />
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          onClick={() => (onClear ? onClear() : onChange(""))}
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: "var(--faint)", display: "grid", placeItems: "center" }}
          aria-label="Clear search"
        >
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? "on" : ""}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    />
  );
}

/* --------------------------------------------------------------- overlays */
function useBodyLock(open) {
  useEffect(() => {
    if (!open) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = "" }) {
  const titleId = useId();
  useBodyLock(open);
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => event.key === "Escape" && onClose?.();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          <button className="icon-btn close" onClick={onClose} aria-label="Close dialog">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width }) {
  useBodyLock(open);
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => event.key === "Escape" && onClose?.();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="overlay" style={{ padding: 0, background: "rgba(11,18,32,0.4)" }} onMouseDown={onClose} />
      <div className="drawer" style={width ? { width: `min(${width}, 100vw)` } : undefined} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 650 }}>{title}</h2>
            {subtitle && <div className="sub small muted" style={{ marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="icon-btn close" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="Close panel">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

/* ----------------------------------------------------------------- toasts */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remove = useCallback((id) => setToasts((current) => current.filter((item) => item.id !== id)), []);

  const push = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    const item = typeof toast === "string" ? { title: toast, tone: "info" } : { tone: "info", ...toast };
    setToasts((current) => [...current, { ...item, id }]);
    setTimeout(() => remove(id), item.tone === "error" ? 7000 : 4200);
  }, [remove]);

  const value = useMemo(() => ({
    push,
    success: (title, message) => push({ title, message, tone: "success" }),
    error: (title, message) => push({ title, message, tone: "error" }),
    info: (title, message) => push({ title, message, tone: "info" }),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.tone}`}>
              <span className="t-icon">
                <Icon name={toast.tone === "success" ? "check" : toast.tone === "error" ? "alert" : "info"} size={17} />
              </span>
              <div className="t-body">
                <div className="t-title">{toast.title}</div>
                {toast.message && <div className="t-msg">{toast.message}</div>}
              </div>
              <button onClick={() => remove(toast.id)} aria-label="Dismiss">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

/* --------------------------------------------------------------- feedback */
export function Spinner({ size = "", dark = false }) {
  return <span className={`spinner ${size} ${dark ? "dark" : ""}`} />;
}

export function Loading({ label = "Loading…" }) {
  return (
    <div className="loading-block">
      <Spinner dark />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, message, action }) {
  return (
    <div className="empty">
      <div className="icon-wrap">
        <Icon name={icon} size={21} />
      </div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function NoAccess({ title = "You do not have access to this page", message, permission, action }) {
  return (
    <div className="empty">
      <div className="icon-wrap"><Icon name="lock" size={20} /></div>
      <h3>{title}</h3>
      <p>
        {message || "Your role does not include this permission. Ask an administrator if you need it — permissions are enforced on the server, not just hidden in the interface."}
      </p>
      {permission && <p className="xs faint mono" style={{ marginTop: 6 }}>{permission}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty">
      <div className="icon-wrap" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
        <Icon name="alert" size={20} />
      </div>
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry && (
        <div className="mt-2">
          <Button size="sm" icon="refresh" onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 5, columns = 5 }) {
  return (
    <div style={{ padding: "10px 14px" }}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 14, padding: "11px 0", borderBottom: "1px solid #f1f3f9" }}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <div key={columnIndex} className="skeleton" style={{ height: 12, width: `${50 + ((rowIndex + columnIndex) % 5) * 9}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- navigation */
export function Tabs({ tabs, value, onChange, className = "" }) {
  return (
    <div className={`tabs ${className}`} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          className={`tab ${value === tab.value ? "active" : ""}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.icon && <Icon name={tab.icon} size={14} />}
          {tab.label}
          {tab.count !== undefined && <span className="count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, total, pageSize, onPage, label = "records" }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const numbers = [];
  const windowStart = Math.max(1, Math.min(page - 1, pages - 2));
  for (let index = windowStart; index <= Math.min(pages, windowStart + 2); index += 1) numbers.push(index);

  return (
    <div className="pagination">
      <span className="small muted">
        {total === 0 ? `No ${label}` : `${start}–${end} of ${total.toLocaleString()} ${label}`}
      </span>
      <div className="pages">
        <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <Icon name="chevronLeft" size={13} />
        </button>
        {numbers.map((number) => (
          <button key={number} className={`page-btn ${number === page ? "active" : ""}`} onClick={() => onPage(number)}>
            {number}
          </button>
        ))}
        <button className="page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <Icon name="chevronRight" size={13} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ misc */
export function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      icon={copied ? "check" : "copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function Tooltip({ text, children }) {
  return (
    <span className="tooltip-host" style={{ display: "inline-flex" }}>
      {children}
      <span className="tooltip-body">{text}</span>
    </span>
  );
}

export function Progress({ value, tone = "", height }) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`progress ${tone}`} style={height ? { height } : undefined}>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", tone = "danger", loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="small" style={{ color: "var(--text-2)", lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ hooks */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useFetch(fetcher, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (mounted.current) setState({ loading: false, data, error: null });
    } catch (error) {
      if (mounted.current) setState({ loading: false, data: null, error: error.message || "Request failed" });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    run();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refresh: run, setData: (data) => setState((current) => ({ ...current, data })) };
}

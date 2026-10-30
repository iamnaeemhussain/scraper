// Thin fetch wrapper. Session cookies are httpOnly; the browser never stores tokens
// and no API key ever reaches this bundle.
const BASE = import.meta.env.VITE_API_BASE_URL || "";

/* ------------------------------------------------------------------ session
 * Primary mechanism: the httpOnly `leadbridge_session` cookie. Nothing in this
 * file can read it, which is the point.
 *
 * Fallback: some hosting contexts refuse to store third-party cookies — embedded
 * preview panes, iframes on another site, browsers with all cookies blocked. There
 * the login succeeds but the cookie never comes back, and every request is a 401.
 * For those contexts the API login response also contains a short-lived bearer
 * token, which we keep for this tab only (sessionStorage) and send as an
 * Authorization header. It is a user session token, never an API key.
 */
const TOKEN_KEY = "leadbridge.session";

let sessionToken = null;

export function setSessionToken(token) {
  sessionToken = token || null;
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / storage disabled — the in-memory copy still works */
  }
}

export function getSessionToken() {
  if (sessionToken) return sessionToken;
  try {
    sessionToken = window.sessionStorage.getItem(TOKEN_KEY) || null;
  } catch {
    sessionToken = null;
  }
  return sessionToken;
}

function authHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      if (value.length) search.append(key, value.join(","));
    } else {
      search.append(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function parseError(response) {
  let detail = `Request failed (${response.status})`;
  try {
    const data = await response.json();
    if (data?.detail) {
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    }
  } catch {
    /* non JSON response */
  }
  return new ApiError(detail, response.status, detail);
}

async function request(path, { method = "GET", body, formData, headers = {}, signal } = {}) {
  const options = {
    method,
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders(), ...headers },
    signal,
  };
  if (formData) {
    options.body = formData;
  } else if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE}${path}`, options);
  if (response.status === 204) return null;
  if (!response.ok) {
    if (response.status === 401) setSessionToken(null); // expired or revoked
    throw await parseError(response);
  }
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json();
  return response.text();
}

export const api = {
  get: (path, params, options) => request(`${path}${buildQuery(params)}`, options),
  post: (path, body, params) => request(`${path}${buildQuery(params)}`, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  patch: (path, body, params) => request(`${path}${buildQuery(params)}`, { method: "PATCH", body }),
  del: (path, params) => request(`${path}${buildQuery(params)}`, { method: "DELETE" }),
  upload: (path, formData) => request(path, { method: "POST", formData }),
  raw: request,
  buildQuery,
  BASE,
  setSessionToken,
  getSessionToken,
};

export async function downloadFile(path, { body, filename, method = "POST" } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: { ...authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw await parseError(response);
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const name = filename || (match ? match[1] : "download");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return {
    rows: Number(response.headers.get("x-export-rows") || 0),
    blocked: Number(response.headers.get("x-export-blocked") || 0),
    filename: name,
  };
}

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US").format(Number(value));
}

export function formatDate(value, { withTime = false } = {}) {
  if (!value) return "—";
  const date = new Date(value.endsWith?.("Z") || value.includes?.("+") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export function timeAgo(value) {
  if (!value) return "—";
  const date = new Date(value.endsWith?.("Z") || value.includes?.("+") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d ago`;
  return formatDate(value);
}

export function duration(value) {
  const ms = Number(value || 0);
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

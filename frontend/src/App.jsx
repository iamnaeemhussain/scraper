import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { ToastProvider, Avatar, Badge, Button, Icon, Spinner } from "./ui";
import Dashboard from "./pages/Dashboard";
import Sources from "./pages/Sources";
import Jobs from "./pages/Jobs";
import Leads from "./pages/Leads";
import Agents from "./pages/Agents";
import Imports from "./pages/Imports";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/Settings";
import Login from "./pages/Login";

const NAV = [
  { section: "Operations", items: [
    { to: "/", label: "Dashboard", icon: "dashboard", end: true },
    { to: "/leads", label: "Lead Database", icon: "leads" },
    { to: "/jobs", label: "Collection Jobs", icon: "jobs", permission: "jobs:manage" },
    { to: "/sources", label: "Data Sources", icon: "sources", permission: "jobs:manage" },
  ]},
  { section: "Team & data", items: [
    { to: "/agents", label: "Agent Management", icon: "agents", permission: "agents:manage" },
    { to: "/imports", label: "Imports & Exports", icon: "transfers", permission: "imports:manage" },
    { to: "/reports", label: "Reports", icon: "reports", permission: "reports:read" },
  ]},
  { section: "Administration", items: [
    { to: "/settings", label: "Settings", icon: "settings" },
  ]},
];

const TITLES = {
  "/": { title: "Dashboard", sub: "Collection, verification and team performance at a glance" },
  "/sources": { title: "Data Sources", sub: "Authorized adapters, extraction limits and attribution" },
  "/jobs": { title: "Collection Jobs", sub: "Run history, live progress and failed requests" },
  "/leads": { title: "Lead Database", sub: "Search, verify, assign and manage business contacts" },
  "/agents": { title: "Agent Management", sub: "Team assignments, quotas and performance" },
  "/imports": { title: "Imports & Exports", sub: "Upload licensed datasets and build compliant calling lists" },
  "/reports": { title: "Reports", sub: "Collection quality, source attribution and compliance evidence" },
  "/settings": { title: "Settings", sub: "Organisation policy, suppression, audit and retention" },
};

function Sidebar({ open, onClose }) {
  const { can, user } = useAuth();
  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
              <path d="M6 18V6h2.6v9.6H18V18H6z" fill="#fff" />
              <circle cx="17.6" cy="7.2" r="2.4" fill="#3ddc97" />
            </svg>
          </div>
          <div>
            <div className="brand-name">LeadBridge</div>
            <div className="brand-sub">Lead operations</div>
          </div>
        </div>

        {NAV.map((group) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission));
          if (!items.length) return null;
          return (
            <div className="sidebar-section" key={group.section}>
              <div className="sidebar-label">{group.section}</div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                  onClick={onClose}
                >
                  <Icon name={item.icon} size={18} className="nav-icon" />
                  <span className="label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}

        <div className="sidebar-footer">
          <div className="sidebar-note">
            <Icon name="shield" size={14} />
            <span>
              Authorized sources only. Robots.txt, rate limits and contact permission checks
              are enforced on every collection and export.
            </span>
          </div>
          <div className="row small" style={{ marginTop: 12, color: "#64748b", gap: 6 }}>
            <Icon name="user" size={13} />
            <span className="truncate">{user?.full_name} · {user?.role}</span>
          </div>
        </div>
      </aside>
    </>
  );
}

function StatusPopover({ onClose }) {
  const { engine, org, demoMode, environment } = useAuth();
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 44 }} onClick={onClose} />
      <div
        className="card"
        style={{ position: "absolute", right: 0, top: 46, width: 320, zIndex: 45, padding: 16, boxShadow: "var(--shadow-lg)", animation: "slide-up .16s ease" }}
      >
        <div className="row between" style={{ marginBottom: 10 }}>
          <strong style={{ fontSize: 13 }}>System status</strong>
          <Badge tone={environment === "production" ? "green" : "amber"} dot>
            {environment}
          </Badge>
        </div>
        <div className="col" style={{ gap: 8, fontSize: 12.5 }}>
          <div className="row between">
            <span className="muted">Extraction engine</span>
            <span className="strong" style={{ textTransform: "capitalize" }}>{engine.active || "httpx"}</span>
          </div>
          <div className="row between">
            <span className="muted">Scrapling available</span>
            <span className="strong">{engine.scrapling_available ? "Yes" : "No (httpx fallback)"}</span>
          </div>
          <div className="row between">
            <span className="muted">robots.txt enforced</span>
            <span className="strong">{engine.robots_enforced ? "Always" : "Disabled"}</span>
          </div>
          <div className="row between">
            <span className="muted">Live domain allowlist</span>
            <span className="strong">{engine.allowlisted_domains?.length || 0} domain(s)</span>
          </div>
          <div className="row between">
            <span className="muted">Collection</span>
            <Badge tone={org.collection_enabled === false ? "red" : "green"} dot>
              {org.collection_enabled === false ? "paused" : "enabled"}
            </Badge>
          </div>
          {demoMode && (
            <div className="alert info" style={{ marginTop: 4 }}>
              <Icon name="info" size={15} />
              <span>Demo dataset mode is on. Sources marked “Demo” stream synthetic records.</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function UserMenu({ onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 44 }} onClick={onClose} />
      <div
        className="card"
        style={{ position: "absolute", right: 0, top: 46, width: 250, zIndex: 45, padding: 8, boxShadow: "var(--shadow-lg)", animation: "slide-up .16s ease" }}
      >
        <div style={{ padding: "10px 10px 12px", borderBottom: "1px solid var(--border)" }}>
          <div className="row" style={{ gap: 10 }}>
            <Avatar name={user?.full_name} size="lg" />
            <div style={{ minWidth: 0 }}>
              <div className="strong small truncate">{user?.full_name}</div>
              <div className="xs muted truncate">{user?.email}</div>
              <Badge tone="indigo" className="mt-1" style={{ marginTop: 4 }}>{user?.role}</Badge>
            </div>
          </div>
        </div>
        <button className="nav-link" style={{ color: "var(--text-2)", width: "100%", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }} onClick={() => { navigate("/settings"); onClose(); }}>
          <Icon name="settings" size={15} /> <span>Settings & security</span>
        </button>
        <button
          className="nav-link"
          style={{ color: "var(--danger)", width: "100%", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}
          onClick={async () => { await logout(); onClose(); }}
        >
          <Icon name="logout" size={15} /> <span>Sign out</span>
        </button>
      </div>
    </>
  );
}

function Topbar({ onMenu }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const meta = TITLES[location.pathname] || { title: "LeadBridge", sub: "" };

  return (
    <header className="topbar">
      <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Open navigation">
        <Icon name="menu" size={17} />
      </button>
      <div className="topbar-titles">
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-sub">{meta.sub}</div>
      </div>
      <div className="topbar-actions">
        <form
          className="global-search desktop-only"
          onSubmit={(event) => {
            event.preventDefault();
            if (search.trim()) navigate(`/leads?q=${encodeURIComponent(search.trim())}`);
            setSearch("");
          }}
        >
          <Icon name="search" size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search businesses, phone, ZIP…"
            aria-label="Search leads"
          />
        </form>
        <div style={{ position: "relative" }}>
          <button className="icon-btn" onClick={() => setStatusOpen((value) => !value)} aria-label="System status">
            <Icon name="activity" size={16} />
            <span className="dot" style={{ background: "#12b76a" }} />
          </button>
          {statusOpen && <StatusPopover onClose={() => setStatusOpen(false)} />}
        </div>
        <div style={{ position: "relative" }}>
          <button className="user-chip" onClick={() => setMenuOpen((value) => !value)}>
            <Avatar name={user?.full_name} />
            <span className="user-chip-meta desktop-only" style={{ textAlign: "left" }}>
              <span className="user-chip-name" style={{ display: "block" }}>{user?.full_name}</span>
              <span className="user-chip-role">{user?.role}</span>
            </span>
            <Icon name="chevronDown" size={14} className="desktop-only" />
          </button>
          {menuOpen && <UserMenu onClose={() => setMenuOpen(false)} />}
        </div>
      </div>
    </header>
  );
}

function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <div className="app">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="main" ref={mainRef}>
        <Topbar onMenu={() => setNavOpen(true)} />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/imports" element={<Imports />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function Gate() {
  const { status, error } = useAuth();

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b1220" }}>
        <div style={{ textAlign: "center", color: "#c3cbdc" }}>
          <div style={{ display: "grid", placeItems: "center", marginBottom: 14 }}>
            <div className="brand-mark" style={{ width: 48, height: 48, borderRadius: 14 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M6 18V6h2.6v9.6H18V18H6z" fill="#fff" />
                <circle cx="17.6" cy="7.2" r="2.4" fill="#3ddc97" />
              </svg>
            </div>
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>LeadBridge</div>
          <div className="row" style={{ gap: 8, justifyContent: "center", color: "#7f8ba8", fontSize: 12.5 }}>
            <Spinner /> Connecting to the API…
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="card pad" style={{ maxWidth: 460, textAlign: "center" }}>
          <div className="empty" style={{ padding: "10px 0" }}>
            <div className="icon-wrap" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              <Icon name="alert" size={20} />
            </div>
            <h3>Cannot reach the API</h3>
            <p>{error || "The backend service is not responding."}</p>
            <div className="mt-2">
              <Button icon="refresh" onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "anonymous") return <Login />;
  return <Shell />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Gate />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

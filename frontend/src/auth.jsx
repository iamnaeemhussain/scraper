import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null, bootstrap: null });

  const loadBootstrap = useCallback(async () => {
    try {
      const data = await api.get("/api/meta/bootstrap");
      setState({ status: "authenticated", user: data.user, bootstrap: data });
      return data;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        setState({ status: "anonymous", user: null, bootstrap: null });
      } else {
        setState({ status: "error", user: null, bootstrap: null, error: error.message });
      }
      return null;
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const login = useCallback(async (email, password) => {
    const result = await api.post("/api/auth/login", { email, password });
    await loadBootstrap();
    return result;
  }, [loadBootstrap]);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setState({ status: "anonymous", user: null, bootstrap: null });
    }
  }, []);

  const refreshBootstrap = useCallback(() => loadBootstrap(), [loadBootstrap]);

  const value = useMemo(() => {
    const permissions = state.user?.permissions || {};
    return {
      ...state,
      login,
      logout,
      refresh: refreshBootstrap,
      can: (permission) => Boolean(permissions[permission]),
      adapters: state.bootstrap?.adapters || [],
      fields: state.bootstrap?.fields || { collectable_fields: [], prohibited_fields: [] },
      statuses: state.bootstrap?.statuses || {},
      filters: state.bootstrap?.filters || { industries: [], states: [], cities: [] },
      engine: state.bootstrap?.engine || {},
      org: state.bootstrap?.app?.org || {},
      environment: state.bootstrap?.app?.environment || "development",
      demoMode: Boolean(state.bootstrap?.app?.demo_mode),
      isAuthenticated: state.status === "authenticated",
    };
  }, [state, login, logout, refreshBootstrap]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function statusTone(status) {
  switch (status) {
    case "new": return "indigo";
    case "assigned": return "blue";
    case "contacted": return "amber";
    case "interested": return "teal";
    case "not_interested": return "neutral";
    case "follow_up": return "amber";
    case "converted": return "green";
    case "do_not_contact": return "red";
    default: return "neutral";
  }
}

export function verificationTone(status) {
  switch (status) {
    case "verified_owner": return "green";
    case "mx_valid": return "green";
    case "format_valid": return "amber";
    case "syntax_valid": return "amber";
    case "invalid":
    case "disconnected":
    case "bounced": return "red";
    default: return "neutral";
  }
}

export function consentTone(status) {
  switch (status) {
    case "granted": return "green";
    case "pending": return "amber";
    case "denied":
    case "withdrawn": return "red";
    default: return "neutral";
  }
}

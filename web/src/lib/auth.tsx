import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, clearStoredTokens, getStoredToken, setStoredTokens } from './api';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  phone?: string | null;
  role: 'USER' | 'ADMIN';
  emailVerified?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (params: {
    email: string;
    password: string;
    name?: string;
    phone?: string;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiFetch<AuthUser>('/api/me');
      setUser(me);
    } catch {
      clearStoredTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshProfile();
  }, []);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await apiFetch<{
      accessToken: string;
      refreshToken: string;
      user: AuthUser;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  };

  const register = async (params: {
    email: string;
    password: string;
    name?: string;
    phone?: string;
  }): Promise<AuthUser> => {
    const res = await apiFetch<{
      accessToken: string;
      refreshToken: string;
      user: AuthUser;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    setStoredTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearStoredTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

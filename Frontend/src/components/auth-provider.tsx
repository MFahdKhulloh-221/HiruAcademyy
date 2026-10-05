"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, apiRequest, AUTH_EXPIRED_EVENT, setApiAuthenticated } from "@/lib/api";

export type AuthUser = {
  id: number | string;
  name: string;
  email: string;
  whatsapp: string;
  role: "student" | "admin";
  country?: string | null;
  target_jlpt?: string | null;
  account_status?: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  whatsapp: string;
  password: string;
  password_confirmation: string;
  country?: string | null;
  target_jlpt?: "N5" | "N4" | "N3" | "N2" | "N1" | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  authenticated: boolean;
  refreshUser: () => Promise<AuthUser | null>;
  login: (identity: string, password: string) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const studentPaths = ["dashboard", "journey", "learn", "practice", "flashcards", "library", "tryout", "schedule", "replay", "mini-checkpoint", "ask-sensei", "community", "progress", "leaderboard", "certificate", "notifications", "profile", "affiliate", "membership", "renewal", "checkout", "invoice"];

export function authDestination(user: AuthUser): string {
  return user.role === "admin" ? "/admin" : "/dashboard?membership=free";
}

function readUser(response: { data: AuthUser }): AuthUser {
  const user = response?.data;
  if (!user || !["student", "admin"].includes(user.role) || !["number", "string"].includes(typeof user.id) || typeof user.name !== "string" || typeof user.email !== "string" || typeof user.whatsapp !== "string" || (user.account_status !== undefined && user.account_status !== "active")) throw new ApiError(403);
  return { id: user.id, name: user.name, email: user.email, whatsapp: user.whatsapp, role: user.role, country: user.country, target_jlpt: user.target_jlpt, account_status: user.account_status };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const version = useRef(0);
  const pending = useRef<Promise<AuthUser | null> | null>(null);
  const mutating = useRef(false);

  const refreshUser = useCallback((): Promise<AuthUser | null> => {
    if (mutating.current) return Promise.resolve(null);
    if (pending.current) return pending.current;
    const current = ++version.current;
    setLoading(true);
    setError(null);
    const task = apiRequest<{ data: AuthUser }>("/api/me").then(response => {
      if (version.current !== current) return null;
      const next = readUser(response);
      setApiAuthenticated(true);
      setUser(next);
      return next;
    }).catch(cause => {
      if (version.current !== current) return null;
      setUser(null);
      setApiAuthenticated(false, false);
      const failure = cause instanceof ApiError ? cause : new ApiError(0);
      if (failure.status === 401 || failure.status === 419) return null;
      setError(failure);
      throw failure;
    }).finally(() => {
      if (version.current === current) setLoading(false);
      if (pending.current === task) pending.current = null;
    });
    pending.current = task;
    return task;
  }, []);

  useEffect(() => {
    function expire() {
      version.current += 1;
      pending.current = null;
      setApiAuthenticated(false);
      setUser(null);
      setError(null);
      setLoading(false);
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, expire);
    void refreshUser().catch(() => undefined);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expire);
  }, [refreshUser]);

  async function authenticate(path: string, payload: RegisterPayload | { identity: string; password: string }): Promise<AuthUser> {
    if (mutating.current) throw new ApiError(409);
    mutating.current = true;
    const current = ++version.current;
    pending.current = null;
    setUser(null);
    setApiAuthenticated(false);
    setError(null);
    setLoading(true);
    try {
      const next = readUser(await apiRequest<{ data: AuthUser }>(path, { method: "POST", body: JSON.stringify(payload) }));
      if (version.current !== current) throw new ApiError(401);
      setUser(next);
      setApiAuthenticated(true);
      return next;
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : new ApiError(0);
      if (version.current === current && (failure.status === 0 || failure.status >= 500)) setError(failure);
      throw failure;
    } finally {
      mutating.current = false;
      if (version.current === current) setLoading(false);
    }
  }

  function login(identity: string, password: string) {
    return authenticate("/api/auth/login", { identity, password });
  }

  function register(payload: RegisterPayload) {
    const { name, email, whatsapp, password, password_confirmation, country, target_jlpt } = payload;
    return authenticate("/api/auth/register", { name, email, whatsapp, password, password_confirmation, country, target_jlpt });
  }

  async function logout(): Promise<void> {
    if (mutating.current) throw new ApiError(409);
    mutating.current = true;
    const current = ++version.current;
    pending.current = null;
    setUser(null);
    setApiAuthenticated(false);
    setLoading(true);
    setError(null);
    try {
      await apiRequest<void>("/api/auth/logout", { method: "POST" });
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : new ApiError(0);
      if (failure.status !== 401 && failure.status !== 419) {
        setError(failure);
        throw failure;
      }
    } finally {
      mutating.current = false;
      if (version.current === current) setLoading(false);
    }
  }

  const matches = (prefix: string) => pathname === `/${prefix}` || pathname.startsWith(`/${prefix}/`);
  const role = matches("admin") ? "admin" : studentPaths.some(matches) ? "student" : null;
  const destination = role && !loading && !error ? !user ? "/login" : user.role !== role ? authDestination(user) : null : null;

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  let content = children;
  if (role && (loading || destination || !user || user.role !== role || error)) {
    content = error && !loading ? (
      <main className="public-main">
        <div role="alert"><p>{error.message}</p><button type="button" className="button button-primary" onClick={() => { void refreshUser().catch(() => undefined); }}>Coba Lagi</button></div>
      </main>
    ) : <main className="public-main" role="status" aria-live="polite">Memuat...</main>;
  }

  return <AuthContext.Provider value={{ user, loading, authenticated: !!user && !loading && !error, refreshUser, login, register, logout }}>{content}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

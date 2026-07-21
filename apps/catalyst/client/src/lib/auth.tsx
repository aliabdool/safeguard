import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiOfflineError, loadRuntimeConfig } from "./api";
import type { AuthMe, RoleCode } from "./types";

interface AuthState {
  loading: boolean;
  /** True when the backend could not be reached at all (network error) — distinct from "not
   * signed in". The client shows a clearly-labelled structural preview in this case, never
   * fabricated numbers — see the "no fake data claims" requirement in the access/dashboard doc. */
  offline: boolean;
  me: AuthMe | null;
  loginUrl: string;
}

const AuthContext = createContext<AuthState>({ loading: true, offline: false, me: null, loginUrl: "/login" });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, offline: false, me: null, loginUrl: "/login" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const config = await loadRuntimeConfig();
      try {
        const me = await api.get<AuthMe>("api-auth", "/me");
        if (!cancelled) setState({ loading: false, offline: false, me, loginUrl: config.loginUrl });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiOfflineError) {
          setState({ loading: false, offline: true, me: null, loginUrl: config.loginUrl });
        } else {
          setState({ loading: false, offline: false, me: null, loginUrl: config.loginUrl });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function isAdminRole(roles: RoleCode[]): boolean {
  return roles.includes("SUPER_ADMIN") || roles.includes("GROUP_HS_ADMIN");
}

export function hasAnyRole(roles: RoleCode[], allowed: RoleCode[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

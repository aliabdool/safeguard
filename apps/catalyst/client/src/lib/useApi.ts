import { useEffect, useState } from "react";
import { api, ApiOfflineError } from "./api";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
}

export function useApi<T>(fn: string, path: string | null): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: true, error: null, offline: false });

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null, offline: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    api
      .get<T>(fn, path)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null, offline: false });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiOfflineError) {
          setState({ data: null, loading: false, error: null, offline: true });
        } else {
          setState({ data: null, loading: false, error: err instanceof Error ? err.message : "Failed to load.", offline: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fn, path]);

  return state;
}

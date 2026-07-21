/**
 * Thin fetch wrapper over the deployed Catalyst Functions. The real function base URL is only
 * known after you deploy Package A to your own Zoho Catalyst project (Catalyst assigns it) — this
 * reads it at runtime from /config.json rather than baking a guessed URL into the build. See
 * README.md "Post-deployment configuration" for exactly what to edit after your first deploy.
 */

export interface RuntimeConfig {
  apiBase: string;
  loginUrl: string;
}

let cachedConfig: RuntimeConfig | null = null;

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch("/config.json");
    if (res.ok) {
      cachedConfig = await res.json();
      return cachedConfig as RuntimeConfig;
    }
  } catch {
    // fall through to the placeholder default below
  }
  cachedConfig = { apiBase: "/server", loginUrl: "/login" };
  return cachedConfig;
}

export class ApiOfflineError extends Error {
  constructor() {
    super("Could not reach the SafeGuard backend.");
    this.name = "ApiOfflineError";
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(functionName: string, path: string, options: RequestInit = {}): Promise<T> {
  const config = await loadRuntimeConfig();
  let res: Response;
  try {
    res = await fetch(`${config.apiBase}/${functionName}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
  } catch {
    throw new ApiOfflineError();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(fn: string, path: string) => request<T>(fn, path),
  post: <T>(fn: string, path: string, body?: unknown) =>
    request<T>(fn, path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
};

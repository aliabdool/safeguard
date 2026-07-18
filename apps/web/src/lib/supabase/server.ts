import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "./env";

/**
 * Session-bound Supabase client for Server Components/Actions/Route Handlers. Uses the
 * `anon` key + the caller's session cookie — RLS applies to every query made through this
 * client, same as it would for a direct client-side call. This is NOT the service-role client;
 * see src/server/auth/service-role.ts for the narrow set of operations that need that.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render (not a Server Action/Route Handler) — the
          // proxy (src/proxy.ts) refreshes the session cookie on every request, so this is safe
          // to ignore here.
        }
      },
    },
  });
}

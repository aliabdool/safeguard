import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely. Confined to this module on purpose —
 * ESLint's `no-restricted-imports` rule (eslint.config.mjs) blocks importing this file from
 * anything under src/components or src/app/**\/page.tsx / **\/*-client.tsx. Only import this
 * from Server Actions / Route Handlers that specifically need one of:
 *   1. Supabase Admin API (invite user, suspend/reactivate via auth, revoke sessions)
 *   2. Signed Storage URL issuance (the bucket policy is the real gate, see security-model.md §4)
 *   3. The scheduled-reminder / kpi-refresh cron routes (system actor, no user session)
 *
 * NEVER reference SUPABASE_SERVICE_ROLE_KEY in a NEXT_PUBLIC_* variable or in any file that
 * could end up in a client bundle.
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not set — service-role operations are unavailable.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

import { type NextRequest } from "next/server";

import { updateSupabaseSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (the `middleware` filename/export are
 * deprecated as of v16 — see node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md).
 * Runs on the `nodejs` runtime (proxy no longer supports `edge`).
 */
export function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif)$).*)",
  ],
};

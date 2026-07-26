import "server-only";

import { isAdmin, type AuthContext } from "@/server/permissions";

/**
 * Builds a Data Store criteria clause equivalent to what Postgres RLS enforced automatically in
 * the Supabase build (see apps/web/src/db/rls.integration.test.ts) — Catalyst's Data Store has no
 * row-level-security equivalent (see apps/catalyst/data-store-schema/README.md), so this
 * application-layer scope is now the ONLY thing standing between "no property filter selected"
 * and a cross-hotel data leak. Group-wide viewers get an unconditional clause (matching
 * hasPropertyAccess()'s own definition of "sees everything" — isAdmin() roles plus
 * EXECUTIVE_READONLY); everyone else is restricted to their own granted property list. Mirrors
 * propertyScopeClause() in apps/catalyst/functions/shared/middleware/require-permission.ts.
 */
export function propertyScopeClause(column: string, ctx: AuthContext): string {
  if (isAdmin(ctx) || ctx.roleCodes.includes("EXECUTIVE_READONLY")) {
    return "1=1";
  }
  if (ctx.propertyIds.length === 0) {
    return "1=0";
  }
  return `${column} in (${ctx.propertyIds.map((id) => `'${id}'`).join(",")})`;
}

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
  // Bare literal tautologies ("1=1"/"1=0") are rejected by ZCQL with a bare "Syntax error in
  // given query" — confirmed live against the deployed project (see chat): every scoped query for
  // an admin/EXECUTIVE_READONLY session (which never supplies an explicit property filter) was
  // silently broken by this. ZCQL requires an actual column reference, so the same always-true /
  // always-false semantics are expressed against `column` itself instead.
  if (isAdmin(ctx) || ctx.roleCodes.includes("EXECUTIVE_READONLY")) {
    return `${column} is not null`;
  }
  if (ctx.propertyIds.length === 0) {
    return `${column} = '0'`;
  }
  return `${column} in (${ctx.propertyIds.map((id) => `'${id}'`).join(",")})`;
}

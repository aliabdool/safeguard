import "server-only";

import type { CatalystApp, CatalystRow } from "@/lib/catalyst/app";
import { isAdmin, requireRole, type AuthContext } from "@/server/permissions";

/**
 * The CEO/Group dashboard's own gate — deliberately its own list rather than reusing
 * ADMIN_ROLES/isAdmin() directly (see chat: "Administrative authority and executive reporting
 * roles are different concepts. Do not make SUPER_ADMIN synonymous with CEO reporting logic.").
 * EXECUTIVE_READONLY is the closest existing role to a dedicated "CEO" role — it already behaves
 * as "sees every property, read-only" everywhere hasPropertyAccess()/propertyScopeClause() are
 * checked. SUPER_ADMIN/GROUP_HS_ADMIN are included because they need to see this page to operate
 * the system, not because admin authority should imply executive-reporting authority — if a
 * dedicated CEO role is added later, add it to this list rather than conflating it with
 * ADMIN_ROLES. See docs note in the final report for the recommended role mapping.
 */
export const DASHBOARD_ROLES = ["SUPER_ADMIN", "GROUP_HS_ADMIN", "EXECUTIVE_READONLY"] as const;

export async function requireDashboardAccess(): Promise<AuthContext> {
  return requireRole([...DASHBOARD_ROLES]);
}

/** Sentinel used in the `?bu=` URL param and the scope selector — never a real Properties ROWID. */
export const GROUP_SCOPE_PARAM = "group";

export interface BusinessUnit {
  id: string;
  name: string;
  code: string;
  incidentPrefix: string | null;
}

export interface DashboardScope {
  /** "group" = the virtual Sunlife Group aggregate; "property" = one specific Business Unit. */
  kind: "group" | "property";
  /** Null for the Group scope — every KPI/data-quality calculation in this app already treats a
   * null propertyId as "unconditional" for admin/EXECUTIVE_READONLY callers (propertyScopeClause,
   * see server/kpi/scope.ts), and this dashboard is gated to exactly those roles, so reusing that
   * existing null-propertyId path for the Group scope is correct here — not a new convention. */
  propertyId: string | null;
  label: string;
}

/**
 * Loads the 6 operating Business Units (Properties.is_active rows) and resolves the requested
 * `?bu=` param to a concrete DashboardScope. Falls back to the Group scope for a missing/unknown
 * param, matching the brief's "the CEO's default dashboard scope must be Sunlife Group" — never a
 * specific property by default, unlike the pre-existing /dashboard page's "first accessible
 * property or all" behaviour.
 */
export async function resolveDashboardScope(
  catalystApp: CatalystApp,
  requestedBusinessUnitId: string | undefined,
): Promise<{ scope: DashboardScope; businessUnits: BusinessUnit[] }> {
  const rows = (await catalystApp.datastore().table("Properties").getRows({
    criteria: "Properties.is_active = true",
    maxRows: 200,
  })) as Array<CatalystRow & { name: string; code: string; incident_prefix: string | null }>;

  const businessUnits: BusinessUnit[] = rows
    .map((r) => ({ id: r.ROWID, name: r.name, code: r.code, incidentPrefix: r.incident_prefix }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (requestedBusinessUnitId && requestedBusinessUnitId !== GROUP_SCOPE_PARAM) {
    const match = businessUnits.find((bu) => bu.id === requestedBusinessUnitId);
    if (match) {
      return { scope: { kind: "property", propertyId: match.id, label: match.name }, businessUnits };
    }
  }

  return {
    scope: { kind: "group", propertyId: null, label: "Sunlife Group" },
    businessUnits,
  };
}

/** True group-wide criteria fragment — only ever reachable from a route gated by
 * requireDashboardAccess() (isAdmin/EXECUTIVE_READONLY), so "everyone in the org" is the correct,
 * intended meaning here, unlike a plain propertyScopeClause() call from a non-executive context. */
export function groupScopeClause(column: string, ctx: AuthContext): string {
  if (!isAdmin(ctx) && !ctx.roleCodes.includes("EXECUTIVE_READONLY")) {
    // Defensive only — requireDashboardAccess() already enforces this before any scope.ts function
    // is reachable; a caller hitting this branch has a bug, not a legitimate restricted view.
    return `${column} = '0'`;
  }
  return `${column} is not null`;
}

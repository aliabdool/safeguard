/**
 * Pure permission-decision logic — no Data Store/network imports, unit-testable in plain Node.
 * Ported from the Supabase build's src/server/permissions/pure.ts, then deliberately extended
 * here (this file is no longer byte-identical to its origin, unlike the other files in this
 * directory) to satisfy Zoho Catalyst Migration Improvement 4: medical-note access is now three
 * distinct explicit permissions (view/edit/export), not one flag — each independently grantable
 * and independently revocable, per the brief's own §Improvement 4 and §14.
 */

/**
 * Role codes and their mapping to management's 9 named access layers (2026-07 access/dashboard
 * brief) are documented in full in
 * docs/2026-07-zoho-catalyst-access-and-dashboard-model.md — read that before adding, removing,
 * or reinterpreting a role here. Short version: HOTEL_GENERAL_MANAGER and STANDARD_VIEWER were
 * added in Phase 5.5 to close two genuine gaps against that 9-role list; DUTY_MANAGER and
 * INCIDENT_REPORTER predate the brief and are kept as additional operational roles, not replaced.
 */
export type RoleCode =
  | "SUPER_ADMIN"
  | "GROUP_HS_ADMIN"
  | "HOTEL_GENERAL_MANAGER"
  | "PROPERTY_HS_OFFICER"
  | "INTERNAL_AUDITOR"
  | "DEPARTMENT_MANAGER"
  | "DUTY_MANAGER"
  | "NURSE_MEDICAL"
  | "INCIDENT_REPORTER"
  | "EXECUTIVE_READONLY"
  | "EXTERNAL_AUDITOR_READONLY"
  | "STANDARD_VIEWER";

export type MedicalPermissionAction = "view" | "edit" | "export";

export interface AuthContext {
  userId: string;
  status: "pending_approval" | "active" | "suspended" | "rejected";
  roleCodes: RoleCode[];
  propertyIds: string[];
  /** propertyId -> departmentIds granted within it */
  departmentAccess: Map<string, Set<string>>;
  /** view_medical_notes / edit_medical_notes / export_medical_notes — explicit UserPermissions
   * grants only. Never derived from role, never bypassed by isAdmin(). A Super Admin or H&S
   * Manager with none of these has none of these — see hasMedicalPermission() below, which
   * deliberately does not call isAdmin() the way hasPropertyAccess() does. */
  medicalPermissions: Set<MedicalPermissionAction>;
}

export const ADMIN_ROLES: RoleCode[] = ["SUPER_ADMIN", "GROUP_HS_ADMIN"];

export function isAdmin(ctx: AuthContext): boolean {
  return ctx.roleCodes.some((code) => ADMIN_ROLES.includes(code));
}

export function hasAnyRole(ctx: AuthContext, codes: RoleCode[]): boolean {
  return ctx.roleCodes.some((code) => codes.includes(code));
}

export function hasPropertyAccess(ctx: AuthContext, propertyId: string): boolean {
  return (
    isAdmin(ctx) ||
    ctx.roleCodes.includes("EXECUTIVE_READONLY") ||
    ctx.propertyIds.includes(propertyId)
  );
}

export function hasDepartmentAccess(
  ctx: AuthContext,
  propertyId: string,
  departmentId: string | null,
): boolean {
  if (departmentId === null) return true;
  if (isAdmin(ctx)) return true;
  return ctx.departmentAccess.get(propertyId)?.has(departmentId) ?? false;
}

/**
 * Medical-note access — deliberately NOT short-circuited by isAdmin() or any role check.
 * Brief requirement #6: "Do not grant medical-note access by role alone, even to admin or H&S
 * manager." A user needs the specific UserPermissions row for the specific action; nothing else
 * substitutes for it, ever.
 */
export function hasMedicalPermission(ctx: AuthContext, action: MedicalPermissionAction): boolean {
  return ctx.medicalPermissions.has(action);
}

export class AuthError extends Error {
  code: "UNAUTHENTICATED" | "NOT_ACTIVE" | "FORBIDDEN";
  constructor(code: "UNAUTHENTICATED" | "NOT_ACTIVE" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

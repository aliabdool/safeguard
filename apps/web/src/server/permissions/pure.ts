/**
 * Pure permission-decision logic — no "server-only", no DB/network imports. Split out from
 * index.ts specifically so it's unit-testable under Vitest (the `server-only` package throws
 * unconditionally unless the bundler declares the `react-server` export condition, which plain
 * Node/Vitest doesn't — see the test file next to this one). Mirrors the RLS predicates in
 * drizzle/0001_auth_helpers_and_rls.sql; keep the two in sync if either changes.
 */

export type RoleCode =
  | "SUPER_ADMIN"
  | "GROUP_HS_ADMIN"
  | "PROPERTY_HS_OFFICER"
  | "INTERNAL_AUDITOR"
  | "DEPARTMENT_MANAGER"
  | "DUTY_MANAGER"
  | "NURSE_MEDICAL"
  | "INCIDENT_REPORTER"
  | "EXECUTIVE_READONLY"
  | "EXTERNAL_AUDITOR_READONLY";

export interface AuthContext {
  userId: string;
  status: "pending_approval" | "active" | "suspended" | "rejected";
  roleCodes: RoleCode[];
  propertyIds: string[];
  /** propertyId -> departmentIds granted within it */
  departmentAccess: Map<string, Set<string>>;
  hasMedicalPermission: boolean;
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

export class AuthError extends Error {
  code: "UNAUTHENTICATED" | "NOT_ACTIVE" | "FORBIDDEN";
  constructor(code: "UNAUTHENTICATED" | "NOT_ACTIVE" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

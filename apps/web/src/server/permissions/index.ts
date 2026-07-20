import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  profiles,
  roles,
  userDepartmentAccess,
  userMedicalPermission,
  userPropertyAccess,
  userRoles,
} from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  AuthError,
  hasAnyRole,
  hasPropertyAccess,
  type AuthContext,
  type RoleCode,
} from "./pure";

export {
  AuthError,
  isAdmin,
  hasAnyRole,
  hasPropertyAccess,
  hasDepartmentAccess,
  type AuthContext,
  type RoleCode,
} from "./pure";

/**
 * Loads everything a server action/route handler needs to make an authorization decision, in
 * one pass. This mirrors exactly what the RLS helper functions in
 * drizzle/0001_auth_helpers_and_rls.sql compute — this is layer 1 (application), RLS is layer 2.
 * Both must independently agree; see docs/system-architecture.md §5.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const db = getDb();

  const [profile] = await db
    .select({ status: profiles.status })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile) {
    return null;
  }

  const [roleRows, propertyRows, departmentRows, medicalRows] = await Promise.all([
    db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, user.id)),
    db
      .select({ propertyId: userPropertyAccess.propertyId })
      .from(userPropertyAccess)
      .where(eq(userPropertyAccess.userId, user.id)),
    db
      .select({
        propertyId: userDepartmentAccess.propertyId,
        departmentId: userDepartmentAccess.departmentId,
      })
      .from(userDepartmentAccess)
      .where(eq(userDepartmentAccess.userId, user.id)),
    db
      .select({ revokedAt: userMedicalPermission.revokedAt })
      .from(userMedicalPermission)
      .where(eq(userMedicalPermission.userId, user.id))
      .limit(1),
  ]);

  const departmentAccess = new Map<string, Set<string>>();
  for (const row of departmentRows) {
    const set = departmentAccess.get(row.propertyId) ?? new Set<string>();
    set.add(row.departmentId);
    departmentAccess.set(row.propertyId, set);
  }

  return {
    userId: user.id,
    status: profile.status,
    roleCodes: roleRows.map((r) => r.code as RoleCode),
    propertyIds: propertyRows.map((r) => r.propertyId),
    departmentAccess,
    hasMedicalPermission: medicalRows.length > 0 && medicalRows[0]?.revokedAt == null,
  };
}

/** Throws (never silently returns null) — callers should let this reject the request. */
export async function requireActiveUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new AuthError("UNAUTHENTICATED", "No active session.");
  }
  if (ctx.status !== "active") {
    throw new AuthError("NOT_ACTIVE", `Account status is '${ctx.status}', not 'active'.`);
  }
  return ctx;
}

export async function requireRole(codes: RoleCode[]): Promise<AuthContext> {
  const ctx = await requireActiveUser();
  if (!hasAnyRole(ctx, codes)) {
    throw new AuthError("FORBIDDEN", `Requires one of roles: ${codes.join(", ")}.`);
  }
  return ctx;
}

export async function requirePropertyAccess(propertyId: string): Promise<AuthContext> {
  const ctx = await requireActiveUser();
  if (!hasPropertyAccess(ctx, propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }
  return ctx;
}

export async function requireMedicalPermission(): Promise<AuthContext> {
  const ctx = await requireActiveUser();
  if (!ctx.hasMedicalPermission) {
    throw new AuthError("FORBIDDEN", "Medical-data permission not granted.");
  }
  return ctx;
}

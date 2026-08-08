import "server-only";

import { headers } from "next/headers";

import { catalystAppFromHeaders, type CatalystApp } from "@/lib/catalyst/app";

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

const MEDICAL_PERMISSION_CODES = [
  "view_medical_notes",
  "edit_medical_notes",
  "export_medical_notes",
];

interface UserRow extends Record<string, string> {
  ROWID: string;
  full_name: string;
  status: "pending_approval" | "active" | "suspended" | "rejected";
}

/**
 * Loads everything a server action/route handler needs to make an authorization decision, in one
 * pass. This is now the only authority on "who is this user and what can they see" — Catalyst's
 * Data Store has no RLS equivalent, so this application-layer check is the sole enforcement layer
 * (see apps/catalyst/data-store-schema/README.md). Mirrors loadAuthContext() in
 * apps/catalyst/functions/shared/middleware/auth-context.ts; keep the two in sync if either
 * changes.
 *
 * Catalyst's three granular medical-permission codes (view/edit/export) collapse to the single
 * `hasMedicalPermission` boolean this app's call sites already expect — "has some medical access"
 * — rather than widening every caller in this same change. Exposing the granular actions can
 * follow later if a call site actually needs to distinguish them.
 */
async function loadAuthContextFromCatalyst(catalystApp: CatalystApp): Promise<AuthContext | null> {
  const zohoUser = await catalystApp.userManagement().getCurrentUser();
  if (!zohoUser) {
    return null;
  }

  const datastore = catalystApp.datastore();
  const zcql = catalystApp.zcql();

  // TEMPORARY: try/catch so the real error — not Next.js's redacted digest — is visible in
  // AppSail logs, kept for one more deploy to confirm the zuid fix below actually works end to
  // end. Remove once confirmed. (The join bug itself is fixed: zohoUser.zuid, not
  // zohoUser.user_id — these are genuinely different values, confirmed live — see
  // CatalystUser's doc comment in lib/catalyst/app.ts.)
  try {
    const userRows = await datastore
      .table("Users")
      .getRows({ criteria: `Users.zuid = '${zohoUser.zuid}'`, maxRows: 1 });
    const userRow = userRows[0] as UserRow | undefined;
    if (!userRow) {
      return null;
    }

    if (userRow.status !== "active") {
      return {
        userId: userRow.ROWID,
        fullName: userRow.full_name ?? "Unknown user",
        status: userRow.status,
        roleCodes: [],
        propertyIds: [],
        departmentAccess: new Map(),
        hasMedicalPermission: false,
      };
    }

    const [roleRows, propertyRows, departmentRows, medicalRows] = await Promise.all([
      zcql.executeZCQLQuery(
        `select Roles.code from UserRoles left join Roles on UserRoles.role_id = Roles.ROWID where UserRoles.user_id = '${userRow.ROWID}'`,
      ),
      datastore
        .table("UserPropertyAccess")
        .getRows({ criteria: `UserPropertyAccess.user_id = '${userRow.ROWID}'` }),
      datastore
        .table("UserDepartmentAccess")
        .getRows({ criteria: `UserDepartmentAccess.user_id = '${userRow.ROWID}'` }),
      zcql.executeZCQLQuery(
        `select UserPermissions.permission_code from UserPermissions where UserPermissions.user_id = '${userRow.ROWID}' and UserPermissions.permission_code in ('${MEDICAL_PERMISSION_CODES.join("', '")}') and UserPermissions.revoked_at is null`,
      ),
    ]);

    const departmentAccess = new Map<string, Set<string>>();
    for (const row of departmentRows as unknown as Array<{
      property_id: string;
      department_id: string;
    }>) {
      const set = departmentAccess.get(row.property_id) ?? new Set<string>();
      set.add(row.department_id);
      departmentAccess.set(row.property_id, set);
    }

    return {
      userId: userRow.ROWID,
      fullName: userRow.full_name ?? "Unknown user",
      status: "active",
      roleCodes: (roleRows as Array<{ Roles: { code: RoleCode } }>).map((r) => r.Roles.code),
      propertyIds: (propertyRows as unknown as Array<{ property_id: string }>).map(
        (r) => r.property_id,
      ),
      departmentAccess,
      hasMedicalPermission: (medicalRows as unknown[]).length > 0,
    };
  } catch (err) {
    console.error("AUTH_DEBUG_REAL_ERROR:", err instanceof Error ? err.stack : err);
    throw err;
  }
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const catalystApp = catalystAppFromHeaders(await headers());
  return loadAuthContextFromCatalyst(catalystApp);
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

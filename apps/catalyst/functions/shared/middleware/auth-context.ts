import type { Request } from "express";

import type { AuthContext, MedicalPermissionAction, RoleCode } from "../pure/permissions";

const MEDICAL_PERMISSION_CODES: Record<MedicalPermissionAction, string> = {
  view: "view_medical_notes",
  edit: "edit_medical_notes",
  export: "export_medical_notes",
};

/**
 * Builds the request's AuthContext from Catalyst's Data Store — the single place that resolves
 * "who is this user and what can they see" for every Function. Nothing downstream should query
 * UserRoles/UserPropertyAccess/UserPermissions directly; they all go through this, the same way
 * every page in the Supabase build went through getAuthContext() rather than re-deriving access
 * per screen.
 *
 * Catalyst's own Authentication gives us the caller's zuid; everything else (roles, property
 * scope, department scope, medical permission) is SafeGuard's own data, loaded here because
 * Data Store has no row-level security to do this for us at query time.
 */
export async function loadAuthContext(catalystApp: CatalystApp): Promise<AuthContext | null> {
  const zohoUser = await catalystApp.userManagement().getCurrentUser();
  if (!zohoUser) return null;

  const datastore = catalystApp.datastore();
  const zcql = catalystApp.zcql();

  const userRow = (await datastore
    .table("Users")
    .getRows({ criteria: `Users.zuid == '${zohoUser.user_id}'`, maxRows: 1 })
    .then((rows) => rows[0])) as UserRow | undefined;
  if (!userRow) return null;
  if (userRow.status !== "active") {
    return {
      userId: userRow.ROWID,
      status: userRow.status,
      roleCodes: [],
      propertyIds: [],
      departmentAccess: new Map(),
      medicalPermissions: new Set(),
    };
  }

  const [roleRows, propertyRows, departmentRows, medicalPermRows] = await Promise.all([
    zcql.executeZCQLQuery(
      `select Roles.code from UserRoles left join Roles on UserRoles.role_id = Roles.ROWID where UserRoles.user_id = '${userRow.ROWID}'`,
    ),
    datastore
      .table("UserPropertyAccess")
      .getRows({ criteria: `UserPropertyAccess.user_id == '${userRow.ROWID}'` }),
    datastore
      .table("UserDepartmentAccess")
      .getRows({ criteria: `UserDepartmentAccess.user_id == '${userRow.ROWID}'` }),
    // All three medical permission codes in one query — each is a fully independent grant, none
    // implied by role, none implied by the others (holding "view" grants nothing toward "export").
    zcql.executeZCQLQuery(
      `select UserPermissions.permission_code from UserPermissions where UserPermissions.user_id = '${userRow.ROWID}' and UserPermissions.permission_code in ('view_medical_notes', 'edit_medical_notes', 'export_medical_notes') and UserPermissions.revoked_at is null`,
    ),
  ]);

  const departmentAccess = new Map<string, Set<string>>();
  for (const row of departmentRows as Array<{ property_id: string; department_id: string }>) {
    const set = departmentAccess.get(row.property_id) ?? new Set<string>();
    set.add(row.department_id);
    departmentAccess.set(row.property_id, set);
  }

  const grantedCodes = new Set(
    (medicalPermRows as Array<{ UserPermissions: { permission_code: string } }>).map(
      (r) => r.UserPermissions.permission_code,
    ),
  );
  const medicalPermissions = new Set<MedicalPermissionAction>(
    (Object.keys(MEDICAL_PERMISSION_CODES) as MedicalPermissionAction[]).filter((action) =>
      grantedCodes.has(MEDICAL_PERMISSION_CODES[action]),
    ),
  );

  return {
    userId: userRow.ROWID,
    status: userRow.status,
    roleCodes: (roleRows as Array<{ Roles: { code: RoleCode } }>).map((r) => r.Roles.code),
    propertyIds: (propertyRows as Array<{ property_id: string }>).map((r) => r.property_id),
    departmentAccess,
    medicalPermissions,
  };
}

interface UserRow extends Record<string, string> {
  ROWID: string;
  status: "pending_approval" | "active" | "suspended" | "rejected";
}

/**
 * Minimal shape of what `catalyst.initialize(req)` returns, scoped to what this module uses —
 * kept narrow deliberately rather than depending on the full zcatalyst-sdk-node type surface,
 * which is large and mostly irrelevant here.
 */
export interface CatalystApp {
  userManagement(): { getCurrentUser(): Promise<{ user_id: string } | null> };
  datastore(): {
    table(name: string): {
      getRows(params: { criteria?: string; maxRows?: number }): Promise<Record<string, string>[]>;
      insertRow(row: Record<string, unknown>): Promise<Record<string, unknown>>;
      updateRow(row: Record<string, unknown> & { ROWID: string }): Promise<Record<string, unknown>>;
    };
  };
  zcql(): { executeZCQLQuery(query: string): Promise<unknown[]> };
}

export function catalystAppFromRequest(
  req: Request,
): CatalystApp {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const catalyst = require("zcatalyst-sdk-node");
  return catalyst.initialize(req) as CatalystApp;
}

import "server-only";

import type { CatalystApp, CatalystRow } from "@/lib/catalyst/app";

export interface ReferenceOption {
  id: string;
  name: string;
}

export interface RoleOption extends ReferenceOption {
  code: string;
}

interface RoleRow extends CatalystRow {
  name: string;
  code: string;
}

interface NamedRow extends CatalystRow {
  name: string;
}

export async function listRoles(catalystApp: CatalystApp): Promise<RoleOption[]> {
  const rows = (await catalystApp.datastore().table("Roles").getRows({})) as RoleRow[];
  return rows.map((r) => ({ id: r.ROWID, name: r.name, code: r.code }));
}

export async function listProperties(catalystApp: CatalystApp): Promise<ReferenceOption[]> {
  const rows = (await catalystApp.datastore().table("Properties").getRows({})) as NamedRow[];
  return rows.map((r) => ({ id: r.ROWID, name: r.name }));
}

export async function listDepartments(catalystApp: CatalystApp): Promise<ReferenceOption[]> {
  const rows = (await catalystApp.datastore().table("Departments").getRows({})) as NamedRow[];
  return rows.map((r) => ({ id: r.ROWID, name: r.name }));
}

export interface PendingRegistration {
  requestId: string;
  userId: string;
  fullName: string;
  email: string;
  justification: string | null;
  createdAt: string;
}

export async function listPendingRegistrations(
  catalystApp: CatalystApp,
): Promise<PendingRegistration[]> {
  const rows = (await catalystApp
    .zcql()
    .executeZCQLQuery(
      `select RegistrationRequests.ROWID, RegistrationRequests.user_id, RegistrationRequests.justification, RegistrationRequests.created_at, Users.full_name, Users.email from RegistrationRequests left join Users on RegistrationRequests.user_id = Users.ROWID where RegistrationRequests.status = 'pending'`,
    )) as Array<{
    RegistrationRequests: {
      ROWID: string;
      user_id: string;
      justification: string | null;
      created_at: string;
    };
    Users: { full_name: string; email: string };
  }>;

  return rows.map((r) => ({
    requestId: r.RegistrationRequests.ROWID,
    userId: r.RegistrationRequests.user_id,
    fullName: r.Users.full_name,
    email: r.Users.email,
    justification: r.RegistrationRequests.justification,
    createdAt: r.RegistrationRequests.created_at,
  }));
}

export interface UserSummary {
  id: string;
  zuid: string;
  fullName: string;
  email: string;
  status: "pending_approval" | "active" | "suspended" | "rejected";
  suspensionReason: string | null;
  roleNames: string[];
}

interface UserRow extends CatalystRow {
  zuid: string;
  full_name: string;
  email: string;
  status: string;
  suspension_reason: string;
}

export async function listUsers(catalystApp: CatalystApp): Promise<UserSummary[]> {
  const datastore = catalystApp.datastore();

  // UserRoles.role_id is a plain Text column, not a real Lookup/FK to Roles — confirmed live via
  // the ZCQL Console ("No relationship between tables Roles and UserRoles" on a `left join`, same
  // root cause fixed in server/permissions/index.ts). Roles are joined in application code instead.
  const [userRows, userRoleRows, roleRows] = await Promise.all([
    datastore.table("Users").getRows({}) as Promise<UserRow[]>,
    datastore.table("UserRoles").getRows({}) as Promise<
      Array<CatalystRow & { user_id: string; role_id: string }>
    >,
    datastore.table("Roles").getRows({}) as Promise<RoleRow[]>,
  ]);

  const roleNameById = new Map(roleRows.map((r) => [r.ROWID, r.name]));
  const rolesByUser = new Map<string, string[]>();
  for (const row of userRoleRows) {
    const roleName = roleNameById.get(row.role_id);
    if (!roleName) continue;
    const list = rolesByUser.get(row.user_id) ?? [];
    list.push(roleName);
    rolesByUser.set(row.user_id, list);
  }

  return userRows.map((row) => ({
    id: row.ROWID,
    zuid: row.zuid,
    fullName: row.full_name,
    email: row.email,
    status: row.status as UserSummary["status"],
    suspensionReason: row.suspension_reason || null,
    roleNames: rolesByUser.get(row.ROWID) ?? [],
  }));
}

import { eq } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db";
import { profiles, roles, userRoles } from "@/db/schema";
import { createSupabaseServiceRoleClient } from "@/server/auth/service-role";

import { UserRowActions } from "./user-row-actions";

export default async function UsersPage() {
  const db = getDb();

  const [profileRows, roleAssignments] = await Promise.all([
    db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        status: profiles.status,
        suspensionReason: profiles.suspensionReason,
      })
      .from(profiles),
    db
      .select({ userId: userRoles.userId, roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId)),
  ]);

  const rolesByUser = new Map<string, string[]>();
  for (const row of roleAssignments) {
    const list = rolesByUser.get(row.userId) ?? [];
    list.push(row.roleName);
    rolesByUser.set(row.userId, list);
  }

  let emailsByUserId = new Map<string, string>();
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    emailsByUserId = new Map(data.users.map((u) => [u.id, u.email ?? "(no email)"]));
  } catch {
    // Degrade gracefully if service-role secret isn't configured in this environment.
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">
          Suspend, reactivate, or revoke sessions. Role/property/department changes happen from
          the registration approval flow or directly against user access records.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profileRows.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.fullName}</TableCell>
              <TableCell>{emailsByUserId.get(user.id) ?? "—"}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    user.status === "active"
                      ? "success"
                      : user.status === "suspended" || user.status === "rejected"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {user.status}
                </Badge>
                {user.suspensionReason ? (
                  <p className="text-muted-foreground mt-1 text-xs">{user.suspensionReason}</p>
                ) : null}
              </TableCell>
              <TableCell>{rolesByUser.get(user.id)?.join(", ") || "—"}</TableCell>
              <TableCell className="text-right">
                <UserRowActions userId={user.id} status={user.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

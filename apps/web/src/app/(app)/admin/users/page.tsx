import { headers } from "next/headers";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import { listUsers } from "@/server/identity/catalyst-identity";

import { UserRowActions } from "./user-row-actions";

export default async function UsersPage() {
  const catalystApp = catalystAppFromHeaders(await headers());
  const users = await listUsers(catalystApp);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">
          Suspend or reactivate accounts. Role/property/department changes happen from the
          registration approval flow or directly against user access records.
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
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.fullName}</TableCell>
              <TableCell>{user.email}</TableCell>
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
              <TableCell>{user.roleNames.join(", ") || "—"}</TableCell>
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

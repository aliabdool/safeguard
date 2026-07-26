import { headers } from "next/headers";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import {
  listDepartments,
  listPendingRegistrations,
  listProperties,
  listRoles,
} from "@/server/identity/catalyst-identity";

import { RegistrationRow } from "./registration-row";

export default async function RegistrationsPage() {
  const catalystApp = catalystAppFromHeaders(await headers());

  const [pending, roleRows, propertyRows, departmentRows] = await Promise.all([
    listPendingRegistrations(catalystApp),
    listRoles(catalystApp),
    listProperties(catalystApp),
    listDepartments(catalystApp),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pending registrations</h1>
        <p className="text-muted-foreground text-sm">
          New accounts cannot see any data until you approve them and assign a role, at least
          one property, and departments.
        </p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing pending</CardTitle>
            <CardDescription>All registration requests have been reviewed.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {pending.map((request) => (
            <RegistrationRow
              key={request.requestId}
              request={request}
              roles={roleRows}
              properties={propertyRows}
              departments={departmentRows}
            />
          ))}
        </div>
      )}
    </div>
  );
}

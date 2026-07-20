import { eq } from "drizzle-orm";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { departments, profiles, properties, registrationRequests, roles } from "@/db/schema";
import { createSupabaseServiceRoleClient } from "@/server/auth/service-role";

import { RegistrationRow } from "./registration-row";

export default async function RegistrationsPage() {
  const db = getDb();

  const [pending, roleRows, propertyRows, departmentRows] = await Promise.all([
    db
      .select({
        requestId: registrationRequests.id,
        userId: registrationRequests.userId,
        justification: registrationRequests.justification,
        createdAt: registrationRequests.createdAt,
        fullName: profiles.fullName,
      })
      .from(registrationRequests)
      .innerJoin(profiles, eq(profiles.id, registrationRequests.userId))
      .where(eq(registrationRequests.status, "pending")),
    db.select({ id: roles.id, name: roles.name, code: roles.code }).from(roles),
    db.select({ id: properties.id, name: properties.name }).from(properties),
    db.select({ id: departments.id, name: departments.name }).from(departments),
  ]);

  // Email lives in auth.users, not our `public.profiles` table — only the service-role client
  // (Admin API) can read it. Used purely for display in this admin-only screen.
  let emailsByUserId = new Map<string, string>();
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    emailsByUserId = new Map(data.users.map((u) => [u.id, u.email ?? "(no email)"]));
  } catch {
    // Service-role key not configured in this environment (e.g. local dev without secrets) —
    // degrade gracefully rather than failing the whole page.
  }

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
              request={{
                requestId: request.requestId,
                userId: request.userId,
                fullName: request.fullName,
                email: emailsByUserId.get(request.userId) ?? "(unknown)",
                justification: request.justification,
                createdAt: request.createdAt.toISOString(),
              }}
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

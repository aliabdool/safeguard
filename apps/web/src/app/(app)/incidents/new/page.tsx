import { getDb } from "@/db";
import { departments, properties } from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

import { IncidentForm } from "./incident-form";

export default async function NewIncidentPage() {
  const ctx = await getAuthContext();
  const db = getDb();

  const [allProperties, allDepartments] = await Promise.all([
    db.select({ id: properties.id, name: properties.name }).from(properties),
    db.select({ id: departments.id, name: departments.name }).from(departments),
  ]);

  const availableProperties = allProperties.filter((p) => ctx && hasPropertyAccess(ctx, p.id));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report an incident</h1>
        <p className="text-muted-foreground text-sm">
          Medical/clinical detail is captured separately once the incident exists — see the
          Medical tab on the incident page (requires medical-data permission).
        </p>
      </div>
      <IncidentForm properties={availableProperties} departments={allDepartments} />
    </div>
  );
}

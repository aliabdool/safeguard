import { headers } from "next/headers";

import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import { listDepartments, listProperties } from "@/server/identity/catalyst-identity";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

import { IncidentWizard } from "./incident-wizard";

export default async function NewIncidentPage() {
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());

  const [allProperties, allDepartments] = await Promise.all([
    listProperties(catalystApp),
    listDepartments(catalystApp),
  ]);

  const availableProperties = allProperties.filter((p) => ctx && hasPropertyAccess(ctx, p.id));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report an incident</h1>
        <p className="text-muted-foreground text-sm">
          Medical/clinical detail is captured separately once the incident exists — see the
          Medical tab on the incident page (requires medical-data permission).
        </p>
      </div>
      <IncidentWizard
        properties={availableProperties}
        departments={allDepartments}
        reporterName={ctx?.fullName ?? "Unknown"}
        reporterRole={ctx?.roleCodes.join(", ") ?? ""}
      />
    </div>
  );
}

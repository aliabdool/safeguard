import { getDb } from "@/db";
import { departments, profiles, properties } from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

import { CapaForm } from "./capa-form";

export default async function NewCapaPage({
  searchParams,
}: {
  searchParams: Promise<{ incidentId?: string; sourceType?: string }>;
}) {
  const { incidentId, sourceType } = await searchParams;
  const ctx = await getAuthContext();
  const db = getDb();

  const [allProperties, allDepartments, allProfiles] = await Promise.all([
    db.select({ id: properties.id, name: properties.name }).from(properties),
    db.select({ id: departments.id, name: departments.name }).from(departments),
    db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles),
  ]);

  const availableProperties = allProperties.filter((p) => ctx && hasPropertyAccess(ctx, p.id));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New corrective action</h1>
        <p className="text-muted-foreground text-sm">
          The owner and the verification owner must be different people — the owner can never
          verify or give final closure approval on their own action.
        </p>
      </div>
      <CapaForm
        properties={availableProperties}
        departments={allDepartments}
        users={allProfiles}
        defaultSourceId={incidentId}
        defaultSourceType={sourceType ?? (incidentId ? "incident" : undefined)}
      />
    </div>
  );
}

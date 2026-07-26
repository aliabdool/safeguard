import { getDb } from "@/db";
import { profiles, properties } from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

import { AuditForm } from "./audit-form";

export default async function NewAuditPage() {
  const ctx = await getAuthContext();
  const db = getDb();
  const [allProperties, allProfiles] = await Promise.all([
    db.select({ id: properties.id, name: properties.name }).from(properties),
    db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles),
  ]);
  const availableProperties = allProperties.filter((p) => ctx && hasPropertyAccess(ctx, p.id));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New audit</h1>
      <AuditForm properties={availableProperties} users={allProfiles} />
    </div>
  );
}

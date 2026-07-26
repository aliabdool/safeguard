import { headers } from "next/headers";

import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";
import { listProperties, listUsers } from "@/server/identity/catalyst-identity";

import { AuditForm } from "./audit-form";

export default async function NewAuditPage() {
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());
  const [allProperties, allUsers] = await Promise.all([
    listProperties(catalystApp),
    listUsers(catalystApp),
  ]);
  const availableProperties = allProperties.filter((p) => ctx && hasPropertyAccess(ctx, p.id));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New audit</h1>
      <AuditForm
        properties={availableProperties}
        users={allUsers.map((u) => ({ id: u.id, fullName: u.fullName }))}
      />
    </div>
  );
}

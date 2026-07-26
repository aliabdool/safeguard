import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { AddTeamMemberForm, AuditStatusActions } from "./audit-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { auditTeamMembers, audits, profiles, properties } from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const ctx = await getAuthContext();
  const db = getDb();

  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  if (!audit || !ctx || !hasPropertyAccess(ctx, audit.propertyId)) {
    notFound();
  }

  const [[property], team, allProfiles] = await Promise.all([
    db
      .select({ name: properties.name })
      .from(properties)
      .where(eq(properties.id, audit.propertyId)),
    db
      .select({
        userId: auditTeamMembers.userId,
        roleOnAudit: auditTeamMembers.roleOnAudit,
        fullName: profiles.fullName,
      })
      .from(auditTeamMembers)
      .innerJoin(profiles, eq(profiles.id, auditTeamMembers.userId))
      .where(eq(auditTeamMembers.auditId, auditId)),
    db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{audit.auditReference}</h1>
          <p className="text-muted-foreground text-sm">
            {audit.type.replace("_", " ")} · {property?.name}
          </p>
        </div>
        <Badge>{audit.status.replace("_", " ")}</Badge>
      </div>

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/audits/${auditId}/checklist`}>Checklist</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/audits/${auditId}/findings`}>Findings</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditStatusActions auditId={auditId} currentStatus={audit.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope &amp; criteria</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <span className="font-medium">Scope:</span> {audit.scope ?? "—"}
          </p>
          <p>
            <span className="font-medium">Criteria:</span> {audit.criteria ?? "—"}
          </p>
          <p>
            <span className="font-medium">Planned:</span> {audit.plannedStart ?? "—"} to{" "}
            {audit.plannedEnd ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit team</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <AddTeamMemberForm auditId={auditId} users={allProfiles} />
          <ul className="text-sm">
            {team.map((t) => (
              <li key={t.userId}>
                {t.fullName} — {t.roleOnAudit}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

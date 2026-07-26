import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddTeamMemberForm, AuditStatusActions } from "./audit-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";
import { listUsers } from "@/server/identity/catalyst-identity";

interface AuditRow extends CatalystRow {
  audit_number: string;
  audit_type: string;
  property_id: string;
  scope: string;
  criteria: string;
  planned_start: string;
  planned_end: string;
  status: string;
}

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const auditRows = (await datastore.table("Audits").getRows({
    criteria: `Audits.ROWID == '${auditId}'`,
    maxRows: 1,
  })) as AuditRow[];
  const audit = auditRows[0];
  if (!audit || !ctx || !hasPropertyAccess(ctx, audit.property_id)) {
    notFound();
  }

  const [propertyRows, teamRows, allUsers] = await Promise.all([
    datastore
      .table("Properties")
      .getRows({ criteria: `Properties.ROWID == '${audit.property_id}'`, maxRows: 1 }),
    catalystApp.zcql().executeZCQLQuery(
      `select AuditTeamMembers.user_id, AuditTeamMembers.role_on_audit, Users.full_name from AuditTeamMembers left join Users on AuditTeamMembers.user_id = Users.ROWID where AuditTeamMembers.audit_id = '${auditId}'`,
    ) as Promise<
      Array<{
        AuditTeamMembers: { user_id: string; role_on_audit: string };
        Users: { full_name: string };
      }>
    >,
    listUsers(catalystApp),
  ]);
  const property = propertyRows[0];
  const team = teamRows.map((r) => ({
    userId: r.AuditTeamMembers.user_id,
    roleOnAudit: r.AuditTeamMembers.role_on_audit,
    fullName: r.Users.full_name,
  }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{audit.audit_number}</h1>
          <p className="text-muted-foreground text-sm">
            {audit.audit_type.replace("_", " ")} · {property?.name}
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
            <span className="font-medium">Scope:</span> {audit.scope || "—"}
          </p>
          <p>
            <span className="font-medium">Criteria:</span> {audit.criteria || "—"}
          </p>
          <p>
            <span className="font-medium">Planned:</span> {audit.planned_start || "—"} to{" "}
            {audit.planned_end || "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit team</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <AddTeamMemberForm
            auditId={auditId}
            users={allUsers.map((u) => ({ id: u.id, fullName: u.fullName }))}
          />
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

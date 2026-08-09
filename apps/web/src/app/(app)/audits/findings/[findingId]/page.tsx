import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FindingStatusActions } from "./status-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

interface FindingRow extends CatalystRow {
  audit_id: string;
  finding_number: string;
  classification: string;
  description: string;
  evidence: string;
  status: string;
}

interface AuditRow extends CatalystRow {
  audit_number: string;
  property_id: string;
}

interface CapaRow extends CatalystRow {
  capa_number: string;
  status: string;
}

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const findingRows = (await datastore.table("AuditFindings").getRows({
    criteria: `AuditFindings.ROWID = '${findingId}'`,
    maxRows: 1,
  })) as FindingRow[];
  const finding = findingRows[0];
  if (!finding) {
    notFound();
  }

  const auditRows = (await datastore.table("Audits").getRows({
    criteria: `Audits.ROWID = '${finding.audit_id}'`,
    maxRows: 1,
  })) as AuditRow[];
  const audit = auditRows[0];
  if (!audit || !ctx || !hasPropertyAccess(ctx, audit.property_id)) {
    notFound();
  }

  const linkedCapas = (await datastore.table("CAPA").getRows({
    criteria: `CAPA.source_type = 'audit_finding' and CAPA.source_id = '${findingId}'`,
  })) as CapaRow[];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{finding.finding_number}</h1>
          <p className="text-muted-foreground text-sm">
            {audit.audit_number} · {finding.classification.replace("_", " ")}
          </p>
        </div>
        <Badge>{finding.status.replace("_", " ")}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>{finding.description}</p>
          {finding.evidence ? (
            <p className="text-muted-foreground">Evidence: {finding.evidence}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <FindingStatusActions findingId={findingId} currentStatus={finding.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Corrective actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link href={`/capa/new?sourceType=audit_finding&incidentId=${findingId}`}>
              Create corrective action
            </Link>
          </Button>
          <ul className="text-sm">
            {linkedCapas.map((c) => (
              <li key={c.ROWID}>
                <Link href={`/capa/${c.ROWID}`} className="underline underline-offset-4">
                  {c.capa_number}
                </Link>{" "}
                — {c.status.replace("_", " ")}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

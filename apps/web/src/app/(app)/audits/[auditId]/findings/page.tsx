import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FindingForm } from "./finding-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

const CLASSIFICATION_VARIANT: Record<
  string,
  "destructive" | "warning" | "secondary" | "default"
> = {
  critical_nc: "destructive",
  major_nc: "destructive",
  minor_nc: "warning",
  observation: "secondary",
  ofi: "default",
};

interface AuditRow extends CatalystRow {
  audit_number: string;
  property_id: string;
}

interface FindingRow extends CatalystRow {
  finding_number: string;
  description: string;
  classification: string;
  status: string;
}

export default async function FindingsPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const auditRows = (await datastore.table("Audits").getRows({
    criteria: `Audits.ROWID = '${auditId}'`,
    maxRows: 1,
  })) as AuditRow[];
  const audit = auditRows[0];
  if (!audit || !ctx || !hasPropertyAccess(ctx, audit.property_id)) {
    notFound();
  }

  const [findings, allControls] = await Promise.all([
    datastore.table("AuditFindings").getRows({
      criteria: `AuditFindings.audit_id = '${auditId}'`,
    }) as Promise<FindingRow[]>,
    datastore.table("Controls").getRows({}) as Promise<
      Array<CatalystRow & { control_code: string }>
    >,
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Findings — {audit.audit_number}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raise a finding</CardTitle>
        </CardHeader>
        <CardContent>
          <FindingForm
            auditId={auditId}
            controls={allControls.map((c) => ({ id: c.ROWID, controlCode: c.control_code }))}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {findings.map((f) => (
          <Link key={f.ROWID} href={`/audits/findings/${f.ROWID}`}>
            <Card className="hover:bg-accent/50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{f.finding_number}</p>
                  <p className="text-muted-foreground text-sm">{f.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={CLASSIFICATION_VARIANT[f.classification] ?? "default"}>
                    {f.classification.replace("_", " ")}
                  </Badge>
                  <Badge variant="outline">{f.status}</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

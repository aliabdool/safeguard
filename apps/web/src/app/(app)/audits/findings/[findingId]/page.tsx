import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { FindingStatusActions } from "./status-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { auditFindings, audits, capaActions } from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  const ctx = await getAuthContext();
  const db = getDb();

  const [finding] = await db
    .select()
    .from(auditFindings)
    .where(eq(auditFindings.id, findingId))
    .limit(1);
  if (!finding) {
    notFound();
  }
  const [audit] = await db
    .select()
    .from(audits)
    .where(eq(audits.id, finding.auditId))
    .limit(1);
  if (!audit || !ctx || !hasPropertyAccess(ctx, audit.propertyId)) {
    notFound();
  }

  const linkedCapas = await db
    .select()
    .from(capaActions)
    .where(
      and(eq(capaActions.sourceType, "audit_finding"), eq(capaActions.sourceId, findingId)),
    );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{finding.findingNumber}</h1>
          <p className="text-muted-foreground text-sm">
            {audit.auditReference} · {finding.classification.replace("_", " ")}
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
              <li key={c.id}>
                <Link href={`/capa/${c.id}`} className="underline underline-offset-4">
                  {c.actionNumber}
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

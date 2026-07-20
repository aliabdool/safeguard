import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { FindingForm } from "./finding-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { auditFindings, audits, controls } from "@/db/schema";
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

export default async function FindingsPage({
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

  const [findings, allControls] = await Promise.all([
    db.select().from(auditFindings).where(eq(auditFindings.auditId, auditId)),
    db.select({ id: controls.id, controlCode: controls.controlCode }).from(controls),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Findings — {audit.auditReference}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raise a finding</CardTitle>
        </CardHeader>
        <CardContent>
          <FindingForm auditId={auditId} controls={allControls} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {findings.map((f) => (
          <Link key={f.id} href={`/audits/findings/${f.id}`}>
            <Card className="hover:bg-accent/50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{f.findingNumber}</p>
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

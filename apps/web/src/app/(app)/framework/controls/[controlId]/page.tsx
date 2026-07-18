import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { AssessmentForm } from "./assessment-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import {
  controlAssessments,
  controlFrameworkMappings,
  controls,
  departments,
  frameworks,
  legalRequirementDetails,
  properties,
} from "@/db/schema";
import { computeControlMaturity, maturityLabel } from "@/server/framework/maturity";

export default async function ControlDetailPage({
  params,
}: {
  params: Promise<{ controlId: string }>;
}) {
  const { controlId } = await params;
  const db = getDb();

  const [control] = await db
    .select()
    .from(controls)
    .where(eq(controls.id, controlId))
    .limit(1);
  if (!control) {
    notFound();
  }

  const [mappings, legal, assessments, allProperties, allDepartments] = await Promise.all([
    db
      .select({
        frameworkCode: frameworks.code,
        frameworkName: frameworks.name,
        clauseReference: controlFrameworkMappings.clauseReference,
      })
      .from(controlFrameworkMappings)
      .innerJoin(frameworks, eq(frameworks.id, controlFrameworkMappings.frameworkId))
      .where(eq(controlFrameworkMappings.controlId, controlId)),
    db
      .select()
      .from(legalRequirementDetails)
      .where(eq(legalRequirementDetails.controlId, controlId)),
    db
      .select()
      .from(controlAssessments)
      .where(eq(controlAssessments.controlId, controlId))
      .orderBy(desc(controlAssessments.assessedAt)),
    db.select({ id: properties.id, name: properties.name }).from(properties),
    db.select({ id: departments.id, name: departments.name }).from(departments),
  ]);

  const isLegal = mappings.some((m) => m.frameworkCode === "MU_LEGAL");

  // Latest score per (property, dimension) for a simple "current maturity" summary per property.
  const latestByPropertyDimension = new Map<string, Map<string, number>>();
  for (const a of assessments) {
    const propMap = latestByPropertyDimension.get(a.propertyId) ?? new Map<string, number>();
    if (!propMap.has(a.dimension)) {
      propMap.set(a.dimension, a.maturityScore);
    }
    latestByPropertyDimension.set(a.propertyId, propMap);
  }
  const propertyName = new Map(allProperties.map((p) => [p.id, p.name]));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{control.title}</h1>
        <p className="text-muted-foreground text-sm">
          {control.controlCode} · {control.category}
          {control.isLifeSafetyCritical ? (
            <>
              {" "}
              · <Badge variant="destructive">Life-safety critical</Badge>
            </>
          ) : null}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Framework mappings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {mappings.map((m) => (
            <div key={m.frameworkCode}>
              <Badge variant="outline">{m.frameworkCode}</Badge> {m.frameworkName}
              {m.clauseReference ? ` — ${m.clauseReference}` : ""}
            </div>
          ))}
          {legal[0] ? (
            <p className="text-muted-foreground">
              Legal citation: {legal[0].citation} ({legal[0].regulator}) —{" "}
              <Badge variant="warning">{legal[0].contentStatus}</Badge>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Current maturity by property (latest period seen)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {[...latestByPropertyDimension.entries()].map(([propertyId, dims]) => {
            const overall = computeControlMaturity({
              policy: dims.get("policy"),
              procedure: dims.get("procedure"),
              implementation: dims.get("implementation"),
              effectiveness: dims.get("effectiveness"),
            });
            return (
              <div key={propertyId} className="flex items-center gap-2">
                <span className="w-40">{propertyName.get(propertyId)}</span>
                <Badge variant={overall != null && overall <= 1 ? "destructive" : "secondary"}>
                  {maturityLabel(overall)}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  P:{dims.get("policy") ?? "–"} Pr:{dims.get("procedure") ?? "–"} I:
                  {dims.get("implementation") ?? "–"} E:{dims.get("effectiveness") ?? "–"}
                </span>
              </div>
            );
          })}
          {latestByPropertyDimension.size === 0 ? (
            <p className="text-muted-foreground">Not assessed yet.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add / update assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <AssessmentForm
            controlId={controlId}
            properties={allProperties}
            departments={allDepartments}
            isLifeSafetyCritical={control.isLifeSafetyCritical}
            isLegal={isLegal}
          />
        </CardContent>
      </Card>
    </div>
  );
}

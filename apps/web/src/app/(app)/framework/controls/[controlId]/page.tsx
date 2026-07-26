import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AssessmentForm } from "./assessment-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { listDepartments, listProperties } from "@/server/identity/catalyst-identity";
import { computeControlMaturity, maturityLabel } from "@/server/framework/maturity";

interface ControlRow extends CatalystRow {
  control_code: string;
  title: string;
  category: string;
  is_life_safety_critical: string;
}

interface MappingQueryRow {
  Frameworks: { code: string; name: string };
  FrameworkRequirements: { clause_reference: string | null };
}

interface LegalRow extends CatalystRow {
  citation: string;
  regulator: string;
  content_status: string;
}

interface AssessmentRow extends CatalystRow {
  property_id: string;
  dimension: string;
  maturity_score: string;
  assessed_at: string;
}

export default async function ControlDetailPage({
  params,
}: {
  params: Promise<{ controlId: string }>;
}) {
  const { controlId } = await params;
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const controlRows = (await datastore.table("Controls").getRows({
    criteria: `Controls.ROWID == '${controlId}'`,
    maxRows: 1,
  })) as ControlRow[];
  const control = controlRows[0];
  if (!control) {
    notFound();
  }

  const [mappingRows, legal, assessmentRows, allProperties, allDepartments] = await Promise.all([
    catalystApp.zcql().executeZCQLQuery(
      `select Frameworks.code, Frameworks.name, FrameworkRequirements.clause_reference ` +
        `from ControlFrameworkMappings ` +
        `left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID ` +
        `left join Frameworks on FrameworkRequirements.framework_id = Frameworks.ROWID ` +
        `where ControlFrameworkMappings.control_id = '${controlId}'`,
    ) as Promise<MappingQueryRow[]>,
    datastore.table("LegalRequirementDetails").getRows({
      criteria: `LegalRequirementDetails.control_id == '${controlId}'`,
      maxRows: 1,
    }) as Promise<LegalRow[]>,
    datastore.table("ControlAssessments").getRows({
      criteria: `ControlAssessments.control_id == '${controlId}'`,
    }) as Promise<AssessmentRow[]>,
    listProperties(catalystApp),
    listDepartments(catalystApp),
  ]);

  const mappings = mappingRows.map((m) => ({
    frameworkCode: m.Frameworks.code,
    frameworkName: m.Frameworks.name,
    clauseReference: m.FrameworkRequirements.clause_reference,
  }));
  const isLegal = mappings.some((m) => m.frameworkCode === "MU_LEGAL");

  // "Latest" per (property, dimension) requires assessed_at descending order — getRows makes no
  // ordering guarantee, so sort client-side before taking the first occurrence per dimension, the
  // same convention used elsewhere in the migration (e.g. api-controls's getLatestDimensionScores).
  const assessments = [...assessmentRows].sort((a, b) =>
    a.assessed_at < b.assessed_at ? 1 : a.assessed_at > b.assessed_at ? -1 : 0,
  );

  const latestByPropertyDimension = new Map<string, Map<string, number>>();
  for (const a of assessments) {
    const propMap = latestByPropertyDimension.get(a.property_id) ?? new Map<string, number>();
    if (!propMap.has(a.dimension)) {
      propMap.set(a.dimension, Number(a.maturity_score));
    }
    latestByPropertyDimension.set(a.property_id, propMap);
  }
  const propertyName = new Map(allProperties.map((p) => [p.id, p.name]));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{control.title}</h1>
        <p className="text-muted-foreground text-sm">
          {control.control_code} · {control.category}
          {control.is_life_safety_critical === "true" ? (
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
              <Badge variant="warning">{legal[0].content_status}</Badge>
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
            isLifeSafetyCritical={control.is_life_safety_critical === "true"}
            isLegal={isLegal}
          />
        </CardContent>
      </Card>
    </div>
  );
}

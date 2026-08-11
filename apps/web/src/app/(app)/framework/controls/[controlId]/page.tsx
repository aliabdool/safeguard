import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AssessmentForm } from "./assessment-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { logDebugError } from "@/lib/debug-log";
import { computeControlMaturity, maturityLabel } from "@/server/framework/maturity";
import {
  buildLatestScoresByPropertyDimension,
  isValidControlId,
  mapControlFrameworkMappings,
  type FrameworkMappingSummary,
  type RawAssessmentRow,
  type RawMappingRow,
} from "@/server/framework/control-detail";
import {
  listDepartments,
  listProperties,
  type ReferenceOption,
} from "@/server/identity/catalyst-identity";

interface ControlRow extends CatalystRow {
  control_code: string;
  title: string;
  category: string;
  is_life_safety_critical: string;
}

interface LegalRow extends CatalystRow {
  citation: string;
  regulator: string;
  content_status: string;
}

export default async function ControlDetailPage({
  params,
}: {
  params: Promise<{ controlId: string }>;
}) {
  const { controlId } = await params;
  if (!isValidControlId(controlId)) {
    notFound();
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const controlRows = (await datastore.table("Controls").getRows({
    criteria: `Controls.ROWID = '${controlId}'`,
    maxRows: 1,
  })) as ControlRow[];
  const control = controlRows[0];
  if (!control) {
    notFound();
  }

  // Secondary data (mappings/legal citation/assessment history/property+department lists for the
  // assessment form) is wrapped separately from the control-existence check above so a genuine
  // 404 (handled by notFound(), which relies on throwing a special Next.js error) is never
  // swallowed by this catch — only failures in the secondary fetches degrade to a friendly notice
  // instead of crashing the whole page (see chat: the release-blocking Server Components crash on
  // this route, previously traced to an unguarded `m.Frameworks.code` against a dangling join).
  let mappings: FrameworkMappingSummary[] = [];
  let legal: LegalRow[] = [];
  let latestByPropertyDimension = new Map<string, Map<string, number>>();
  let allProperties: ReferenceOption[] = [];
  let allDepartments: ReferenceOption[] = [];
  let loadError = false;

  try {
    const [mappingRows, legalRows, assessmentRows, properties, departments] =
      await Promise.all([
        catalystApp
          .zcql()
          .executeZCQLQuery(
            `select Frameworks.code, Frameworks.name, FrameworkRequirements.clause_reference ` +
              `from ControlFrameworkMappings ` +
              `left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID ` +
              `left join Frameworks on FrameworkRequirements.framework_id = Frameworks.ROWID ` +
              `where ControlFrameworkMappings.control_id = '${controlId}'`,
          ) as Promise<RawMappingRow[]>,
        datastore.table("LegalRequirementDetails").getRows({
          criteria: `LegalRequirementDetails.control_id = '${controlId}'`,
          maxRows: 1,
        }) as Promise<LegalRow[]>,
        datastore.table("ControlAssessments").getRows({
          criteria: `ControlAssessments.control_id = '${controlId}'`,
        }) as unknown as Promise<RawAssessmentRow[]>,
        listProperties(catalystApp),
        listDepartments(catalystApp),
      ]);

    mappings = mapControlFrameworkMappings(mappingRows);
    legal = legalRows;
    latestByPropertyDimension = buildLatestScoresByPropertyDimension(assessmentRows);
    allProperties = properties;
    allDepartments = departments;
  } catch (err) {
    logDebugError("CONTROL_DETAIL_DEBUG_ERROR:", err);
    loadError = true;
  }

  const isLegal = mappings.some((m) => m.frameworkCode === "MU_LEGAL");
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

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Some details for this control could not be loaded</AlertTitle>
          <AlertDescription>
            Framework mappings, assessment history, and the assessment form below may be
            incomplete or unavailable. Try refreshing the page; if this persists, it has been
            logged for investigation.
          </AlertDescription>
        </Alert>
      ) : null}

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
            <p className="text-muted-foreground">
              {loadError ? "Assessment history could not be loaded." : "Not assessed yet."}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add / update assessment</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError && allProperties.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              The assessment form is unavailable right now because the property/department list
              could not be loaded. Refresh the page to try again.
            </p>
          ) : (
            <AssessmentForm
              controlId={controlId}
              properties={allProperties}
              departments={allDepartments}
              isLifeSafetyCritical={control.is_life_safety_critical === "true"}
              isLegal={isLegal}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

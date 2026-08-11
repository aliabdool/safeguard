import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ComparisonChart } from "./comparison-chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import { zcqlString } from "@/lib/catalyst/zcql-escape";
import { calculateKpi } from "@/server/kpi/calculate";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

/** Not `extends CatalystRow` — several fields below are genuinely nullable, which conflicts with
 * CatalystRow's `Record<string, string>` index signature. */
interface KpiDefinitionRow {
  ROWID: string;
  kpi_code: string;
  name: string;
  classification: string;
  version: string;
  definition: string;
  formula: string;
  source_tables: string;
  target: string | null;
  warning_threshold: string | null;
  critical_threshold: string | null;
  evidence_requirements: string | null;
  assurance_status: string;
}

interface KpiSnapshotRow {
  current_value: string | null;
  comparison_value: string | null;
  data_quality_status: string;
  calculated_at: string;
}

export default async function KpiDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ kpiCode: string }>;
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { kpiCode } = await params;
  const { propertyId } = await searchParams;
  const ctx = await getAuthContext();
  if (!ctx) {
    notFound();
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();
  const zcql = catalystApp.zcql();

  const definitionRows = (await datastore.table("KPIDefinitions").getRows({
    // kpiCode is a raw URL path segment (no allowlist check before this point) — escaped like
    // every other value interpolated into ZCQL in this app.
    criteria: `KPIDefinitions.kpi_code = ${zcqlString(kpiCode)}`,
    maxRows: 1,
  })) as unknown as KpiDefinitionRow[];
  const definition = definitionRows[0];
  if (!definition) {
    notFound();
  }

  const selectedPropertyId = propertyId && hasPropertyAccess(ctx, propertyId) ? propertyId : null;

  const result = await calculateKpi(catalystApp, ctx, kpiCode, { propertyId: selectedPropertyId });

  // Recent calculation snapshots — mirrors the pre-migration query exactly: keyed only by KPI
  // code, not scoped by property (that was true of the Postgres kpi_calculations query too), so
  // this is preserved as-is rather than having new property scoping introduced here.
  const snapshotRows = (await zcql.executeZCQLQuery(
    `select KPISnapshots.current_value, KPISnapshots.comparison_value,
            KPISnapshots.data_quality_status, KPISnapshots.calculated_at
     from KPISnapshots where KPISnapshots.kpi_code = ${zcqlString(kpiCode)}
     order by KPISnapshots.calculated_at desc limit 5`,
  )) as Array<{ KPISnapshots: KpiSnapshotRow }>;
  const recentSnapshots = snapshotRows.map((r) => r.KPISnapshots);

  const sourceTables: string[] = definition.source_tables ? JSON.parse(definition.source_tables) : [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{definition.name}</h1>
        <p className="text-muted-foreground text-sm">
          {definition.kpi_code} · {definition.classification} · v{definition.version}
        </p>
      </div>

      {result && !result.isImplemented ? (
        <Alert variant="destructive">
          <AlertTitle>Calculation not yet implemented</AlertTitle>
          <AlertDescription>
            This KPI is catalogued (definition/formula/thresholds below) but not yet wired to a
            live calculation function — see docs/implementation-plan.md.
          </AlertDescription>
        </Alert>
      ) : null}

      {result?.isImplemented ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-semibold">
                  {result.currentValue != null ? result.currentValue.toFixed(1) : "—"}
                </span>
                <span className="text-muted-foreground">{result.unit}</span>
                <Badge>{result.ragStatus}</Badge>
              </div>
              {result.isYtdClipped ? (
                <Alert className="mt-3">
                  <AlertTitle>Year-to-date comparison</AlertTitle>
                  <AlertDescription>
                    {result.fyLabel} is not yet complete. The comparison year has been clipped
                    to the same elapsed period for a fair like-for-like comparison, through{" "}
                    {result.dataThroughDate.toLocaleDateString()}.
                  </AlertDescription>
                </Alert>
              ) : null}
              <ComparisonChart
                currentLabel={result.fyLabel}
                currentValue={result.currentValue}
                comparisonLabel="Prior year (same period)"
                comparisonValue={result.comparisonValue}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">View calculation</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>
                <span className="font-medium">Definition:</span> {definition.definition}
              </p>
              <p>
                <span className="font-medium">Formula:</span> {definition.formula}
              </p>
              <p>
                <span className="font-medium">Source tables:</span> {sourceTables.join(", ")}
              </p>
              <p>
                <span className="font-medium">Current value:</span> {result.currentValue} ·{" "}
                <span className="font-medium">Comparison:</span> {result.comparisonValue} ·{" "}
                <span className="font-medium">Variance:</span>{" "}
                {result.varianceAbs != null ? result.varianceAbs.toFixed(2) : "—"} (
                {result.variancePct != null ? `${result.variancePct.toFixed(1)}%` : "—"})
              </p>
              <p>
                <span className="font-medium">Included records:</span>{" "}
                {result.includedRecordIds.length}
              </p>
              <p>
                <span className="font-medium">Data-through date:</span>{" "}
                {result.dataThroughDate.toLocaleDateString()}
              </p>
              <p>
                <span className="font-medium">Data-quality status:</span>{" "}
                {result.dataQualityStatus}
              </p>
              <p>
                <span className="font-medium">Target / warning / critical:</span>{" "}
                {definition.target ?? "—"} / {definition.warning_threshold ?? "—"} /{" "}
                {definition.critical_threshold ?? "—"}
              </p>
              <p>
                <span className="font-medium">Evidence requirements:</span>{" "}
                {definition.evidence_requirements ?? "—"}
              </p>
              <p>
                <span className="font-medium">Assurance status:</span>{" "}
                {definition.assurance_status}
              </p>
            </CardContent>
          </Card>

          {recentSnapshots.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent calculation snapshots</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
                {recentSnapshots.map((s, i) => (
                  <p key={i}>
                    {new Date(s.calculated_at).toLocaleString()}: {s.current_value} vs{" "}
                    {s.comparison_value} ({s.data_quality_status})
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catalogue definition</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>{definition.definition}</p>
            <p>
              <span className="font-medium">Formula:</span> {definition.formula}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

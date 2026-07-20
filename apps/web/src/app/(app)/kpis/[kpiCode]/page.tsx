import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { ComparisonChart } from "./comparison-chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { kpiCalculations, kpiDefinitions } from "@/db/schema";
import { calculateKpi } from "@/server/kpi/calculate";

export default async function KpiDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ kpiCode: string }>;
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { kpiCode } = await params;
  const { propertyId } = await searchParams;
  const db = getDb();

  const [definition] = await db
    .select()
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.kpiCode, kpiCode))
    .limit(1);
  if (!definition) {
    notFound();
  }

  const result = await calculateKpi(kpiCode, { propertyId: propertyId ?? null });
  const recentSnapshots = await db
    .select()
    .from(kpiCalculations)
    .where(eq(kpiCalculations.kpiId, definition.id))
    .orderBy(desc(kpiCalculations.calculatedAt))
    .limit(5);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{definition.name}</h1>
        <p className="text-muted-foreground text-sm">
          {definition.kpiCode} · {definition.classification} · v{definition.version}
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
                <span className="font-medium">Source tables:</span>{" "}
                {definition.sourceTables.join(", ")}
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
                {definition.target ?? "—"} / {definition.warningThreshold ?? "—"} /{" "}
                {definition.criticalThreshold ?? "—"}
              </p>
              <p>
                <span className="font-medium">Evidence requirements:</span>{" "}
                {definition.evidenceRequirements ?? "—"}
              </p>
              <p>
                <span className="font-medium">Assurance status:</span>{" "}
                {definition.assuranceStatus}
              </p>
            </CardContent>
          </Card>

          {recentSnapshots.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent calculation snapshots</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
                {recentSnapshots.map((s) => (
                  <p key={s.id}>
                    {new Date(s.calculatedAt).toLocaleString()}: {s.currentValue} vs{" "}
                    {s.comparisonValue} ({s.dataQualityStatus})
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

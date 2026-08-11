import { headers } from "next/headers";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { computeSdgContribution } from "@/server/framework/sdg-contribution";
import { formatKpiValue } from "@/app/(app)/dashboard/rag";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

interface PropertyRow extends CatalystRow {
  name: string;
}

export default async function SdgContributionPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Not signed in</AlertTitle>
        <AlertDescription>Sign in to view SDG contribution mapping.</AlertDescription>
      </Alert>
    );
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const allProperties = (await datastore
    .table("Properties")
    .getRows({ maxRows: 200 })) as PropertyRow[];
  const availableProperties = allProperties.filter((p) => hasPropertyAccess(ctx, p.ROWID));
  const selectedPropertyId =
    propertyId && availableProperties.some((p) => p.ROWID === propertyId) ? propertyId : null;

  const rows = await computeSdgContribution(catalystApp, ctx, selectedPropertyId, new Date());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">UN SDG Contribution Mapping</h1>
        <p className="text-muted-foreground text-sm">
          How Sunlife&apos;s H&amp;S program contributes evidence toward SDG 3, 8, and 13. This
          is a contribution map, not a certification — there is no &ldquo;SDG compliance
          percentage&rdquo;, and none is shown here.
        </p>
      </div>

      <form className="flex items-end gap-2" action="/framework/sdg" method="get">
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs">Business Unit</label>
          <Select name="propertyId" defaultValue={selectedPropertyId ?? "all"}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="All accessible properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accessible properties</SelectItem>
              {availableProperties.map((p) => (
                <SelectItem key={p.ROWID} value={p.ROWID}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium"
        >
          Apply
        </button>
      </form>

      <div className="flex flex-col gap-6">
        {rows.map((row) => (
          <Card key={row.number}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">SDG {row.number}</Badge>
                <CardTitle className="text-base">{row.title}</CardTitle>
              </div>
              <p className="text-muted-foreground text-sm">{row.description}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground text-xs">Mapped controls</p>
                  <p className="text-lg font-semibold">{row.mappedControlCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Assessed</p>
                  <p className="text-lg font-semibold">
                    {row.mappedControlCount > 0 ? row.assessedControlCount : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Evidence linked</p>
                  <p className="text-lg font-semibold">
                    {row.mappedControlCount > 0 ? row.evidenceLinkedControlCount : "—"}
                  </p>
                </div>
                {row.number === 13 ? (
                  <>
                    <div>
                      <p className="text-muted-foreground text-xs">Climate risks registered</p>
                      <p className="text-lg font-semibold">{row.climateRiskCount ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        Climate/weather incidents (current FY)
                      </p>
                      <p className="text-lg font-semibold">
                        {row.climateIncidentsCurrent ?? "—"}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>

              {row.mappedControlCount === 0 ? (
                <p className="text-muted-foreground text-sm italic">
                  No control-library category currently maps to this goal — evidence above
                  (KPIs, and the climate risk register for SDG 13) is the only available
                  signal.
                </p>
              ) : row.evidenceLinkedControlCount < row.mappedControlCount ? (
                <p className="text-muted-foreground text-sm">
                  {row.mappedControlCount - row.evidenceLinkedControlCount} of{" "}
                  {row.mappedControlCount} mapped control
                  {row.mappedControlCount === 1 ? "" : "s"} still have no linked evidence — an
                  evidence gap, not a failure.
                </p>
              ) : null}

              {row.kpis.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {row.kpis.map((kpi) => (
                    <div key={kpi.kpiCode} className="rounded-md border p-3">
                      <p className="text-muted-foreground text-xs">{kpi.name}</p>
                      <p className="text-lg font-semibold">
                        {formatKpiValue(kpi.currentValue, kpi.unit)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No relevant KPIs are wired to live data yet for this goal.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

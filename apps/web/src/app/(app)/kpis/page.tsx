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
import { mapWithConcurrency } from "@/lib/concurrency";
import { calculateKpi, isKpiImplemented } from "@/server/kpi/calculate";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

import { KpiTile } from "./kpi-tile";

interface PropertyRow extends CatalystRow {
  name: string;
}

interface KpiDefinitionListRow extends CatalystRow {
  kpi_code: string;
}

export default async function KpisPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const allProperties = (await datastore
    .table("Properties")
    .getRows({ maxRows: 200 })) as PropertyRow[];
  const availableProperties = allProperties.filter((p) => ctx && hasPropertyAccess(ctx, p.ROWID));

  const selectedPropertyId =
    propertyId && availableProperties.some((p) => p.ROWID === propertyId) ? propertyId : null;

  const definitions = ((await datastore
    .table("KPIDefinitions")
    .getRows({ maxRows: 200 })) as KpiDefinitionListRow[]).sort((a, b) =>
    a.kpi_code.localeCompare(b.kpi_code),
  );
  const implemented = definitions.filter((d) => isKpiImplemented(d.kpi_code));
  const notYetImplemented = definitions.filter((d) => !isKpiImplemented(d.kpi_code));

  const tiles = ctx
    ? await mapWithConcurrency(implemented, 4, (d) =>
        calculateKpi(catalystApp, ctx, d.kpi_code, { propertyId: selectedPropertyId }),
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">KPI dashboards</h1>
        <p className="text-muted-foreground text-sm">
          Every figure below is computed live from Catalyst Data Store records at page-load time —
          never hard-coded. Click a tile for the full &ldquo;View calculation&rdquo; breakdown.
        </p>
      </div>

      <form className="flex items-end gap-2" action="/kpis" method="get">
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs">Property</label>
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
      </form>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {tiles.map((kpi) => (kpi ? <KpiTile key={kpi.kpiCode} kpi={kpi} /> : null))}
      </div>

      {notYetImplemented.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Catalogued, calculation not yet implemented
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTitle>
                {notYetImplemented.length} KPIs are registered but not wired to live data yet
              </AlertTitle>
              <AlertDescription>
                Their definitions (formula, thresholds, evidence requirements) are in the
                catalogue below — extending the calculation engine to cover them is tracked in
                docs/implementation-plan.md, not silently hidden.
              </AlertDescription>
            </Alert>
            <div className="mt-3 flex flex-wrap gap-2">
              {notYetImplemented.map((d) => (
                <Badge key={d.kpi_code} variant="outline">
                  {d.kpi_code}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

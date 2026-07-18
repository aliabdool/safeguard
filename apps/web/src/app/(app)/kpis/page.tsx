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
import { getDb } from "@/db";
import { kpiDefinitions, properties } from "@/db/schema";
import { calculateKpi, isKpiImplemented } from "@/server/kpi/calculate";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

import { KpiTile } from "./kpi-tile";

export default async function KpisPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  const ctx = await getAuthContext();
  const db = getDb();

  const allProperties = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties);
  const availableProperties = allProperties.filter((p) => ctx && hasPropertyAccess(ctx, p.id));

  const selectedPropertyId =
    propertyId && availableProperties.some((p) => p.id === propertyId) ? propertyId : null;

  const definitions = await db.select().from(kpiDefinitions).orderBy(kpiDefinitions.kpiCode);
  const implemented = definitions.filter((d) => isKpiImplemented(d.kpiCode));
  const notYetImplemented = definitions.filter((d) => !isKpiImplemented(d.kpiCode));

  const tiles = await Promise.all(
    implemented.map((d) => calculateKpi(d.kpiCode, { propertyId: selectedPropertyId })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">KPI dashboards</h1>
        <p className="text-muted-foreground text-sm">
          Every figure below is computed live from Supabase records at page-load time — never
          hard-coded. Click a tile for the full &ldquo;View calculation&rdquo; breakdown.
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
                <SelectItem key={p.id} value={p.id}>
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
                <Badge key={d.kpiCode} variant="outline">
                  {d.kpiCode}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

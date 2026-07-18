import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthContext } from "@/server/permissions";

export default async function DashboardPage() {
  const ctx = await getAuthContext();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Roles: {ctx?.roleCodes.join(", ") || "none assigned yet"} · Properties:{" "}
          {ctx?.propertyIds.length ?? 0}
        </p>
      </div>
      {ctx && ctx.propertyIds.length === 0 && !ctx.roleCodes.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No access assigned yet</CardTitle>
            <CardDescription>
              An administrator needs to grant you a role and at least one property before
              incident, audit, document or KPI data becomes visible.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Live KPI dashboards</CardTitle>
            <CardDescription>
              Every figure is computed from Supabase records at request time, with
              financial-year and same-period year-to-date comparisons.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/kpis">Open KPI dashboards</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

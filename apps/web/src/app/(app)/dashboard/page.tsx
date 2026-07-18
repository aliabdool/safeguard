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
      <Card>
        <CardHeader>
          <CardTitle>Live KPI dashboards land in Phase 4</CardTitle>
          <CardDescription>
            This placeholder confirms the auth + permission pipeline is working end to end:
            session resolved server-side, profile status checked, roles/property/department
            grants loaded from Supabase Postgres via Drizzle under RLS.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {ctx && ctx.propertyIds.length === 0 && !ctx.roleCodes.length ? (
            <p>
              You have no role or property assigned yet. An administrator needs to grant access
              before incident, audit, document or KPI data becomes visible to you.
            </p>
          ) : (
            <p>
              KPI catalogue, dashboards and framework views are implemented in later phases.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

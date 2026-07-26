import { headers } from "next/headers";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";
import { listDepartments, listProperties } from "@/server/identity/catalyst-identity";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "success" | "warning"
> = {
  reported: "warning",
  investigating: "secondary",
  corrective_action: "secondary",
  verifying: "secondary",
  closed: "success",
};

interface IncidentRow extends CatalystRow {
  incident_number: string;
  property_id: string;
  department_id: string;
  occurred_at: string;
  incident_type: string;
  actual_severity: string;
  is_high_potential: string;
  status: string;
}

export default async function IncidentsPage() {
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());

  const [allProperties, allDepartments] = await Promise.all([
    listProperties(catalystApp),
    listDepartments(catalystApp),
  ]);

  const visiblePropertyIds = allProperties
    .filter((p) => ctx && hasPropertyAccess(ctx, p.id))
    .map((p) => p.id);

  const propertyName = new Map(allProperties.map((p) => [p.id, p.name]));
  const departmentName = new Map(allDepartments.map((d) => [d.id, d.name]));

  const rows: IncidentRow[] =
    visiblePropertyIds.length === 0
      ? []
      : ((await catalystApp.datastore().table("Incidents").getRows({
          criteria: `Incidents.property_id in (${visiblePropertyIds.map((id) => `'${id}'`).join(", ")})`,
        })) as IncidentRow[])
          .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
          .slice(0, 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
          <p className="text-muted-foreground text-sm">
            Report → Investigate → Corrective Action → Verify → Close.
          </p>
        </div>
        <Button asChild>
          <Link href="/incidents/new">Report incident</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No incidents visible yet. This is either because none exist for your assigned
          properties, or you have no property assigned — ask an administrator.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Occurred</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((incident) => (
              <TableRow key={incident.ROWID}>
                <TableCell>
                  <Link
                    href={`/incidents/${incident.ROWID}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {incident.incident_number}
                  </Link>
                </TableCell>
                <TableCell>{propertyName.get(incident.property_id) ?? "—"}</TableCell>
                <TableCell>{departmentName.get(incident.department_id) ?? "—"}</TableCell>
                <TableCell>{new Date(incident.occurred_at).toLocaleString()}</TableCell>
                <TableCell>{incident.incident_type}</TableCell>
                <TableCell>
                  {incident.actual_severity}/5{incident.is_high_potential === "true" ? " · HiPo" : ""}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[incident.status] ?? "default"}>
                    {incident.status.replace("_", " ")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

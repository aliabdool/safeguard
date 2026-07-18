import Link from "next/link";
import { desc, inArray } from "drizzle-orm";

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
import { getDb } from "@/db";
import { departments, incidents, properties } from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

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

export default async function IncidentsPage() {
  const ctx = await getAuthContext();
  const db = getDb();

  const [allProperties, allDepartments] = await Promise.all([
    db.select({ id: properties.id, name: properties.name }).from(properties),
    db.select({ id: departments.id, name: departments.name }).from(departments),
  ]);

  const visiblePropertyIds = allProperties
    .filter((p) => ctx && hasPropertyAccess(ctx, p.id))
    .map((p) => p.id);

  const propertyName = new Map(allProperties.map((p) => [p.id, p.name]));
  const departmentName = new Map(allDepartments.map((d) => [d.id, d.name]));

  const rows =
    visiblePropertyIds.length === 0
      ? []
      : await db
          .select()
          .from(incidents)
          .where(inArray(incidents.propertyId, visiblePropertyIds))
          .orderBy(desc(incidents.occurredAt))
          .limit(100);

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
              <TableRow key={incident.id}>
                <TableCell>
                  <Link
                    href={`/incidents/${incident.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {incident.incidentNumber}
                  </Link>
                </TableCell>
                <TableCell>{propertyName.get(incident.propertyId) ?? "—"}</TableCell>
                <TableCell>{departmentName.get(incident.departmentId) ?? "—"}</TableCell>
                <TableCell>{new Date(incident.occurredAt).toLocaleString()}</TableCell>
                <TableCell>{incident.incidentType}</TableCell>
                <TableCell>
                  {incident.actualSeverity}/5{incident.isHighPotential ? " · HiPo" : ""}
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

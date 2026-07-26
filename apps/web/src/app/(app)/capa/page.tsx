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
import { capaActions, properties } from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "success" | "warning"
> = {
  open: "warning",
  in_progress: "secondary",
  pending_verification: "secondary",
  verified: "secondary",
  closed: "success",
  overdue: "destructive",
};

export default async function CapaListPage() {
  const ctx = await getAuthContext();
  const db = getDb();

  const allProperties = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties);
  const visiblePropertyIds = allProperties
    .filter((p) => ctx && hasPropertyAccess(ctx, p.id))
    .map((p) => p.id);
  const propertyName = new Map(allProperties.map((p) => [p.id, p.name]));

  const rows =
    visiblePropertyIds.length === 0
      ? []
      : await db
          .select()
          .from(capaActions)
          .where(inArray(capaActions.propertyId, visiblePropertyIds))
          .orderBy(desc(capaActions.createdAt))
          .limit(100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Corrective &amp; Preventive Actions
          </h1>
          <p className="text-muted-foreground text-sm">
            Shared across incidents, audit findings, legal gaps, inspections and management
            review.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No corrective actions yet. Create one from an incident, audit finding, or directly.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((capa) => (
              <TableRow key={capa.id}>
                <TableCell>
                  <Link
                    href={`/capa/${capa.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {capa.actionNumber}
                  </Link>
                </TableCell>
                <TableCell>{capa.sourceType.replace("_", " ")}</TableCell>
                <TableCell>{propertyName.get(capa.propertyId) ?? "—"}</TableCell>
                <TableCell>{capa.priority}</TableCell>
                <TableCell>{capa.dueDate}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[capa.status] ?? "default"}>
                    {capa.status.replace("_", " ")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Button asChild className="w-fit">
        <Link href="/capa/new">New corrective action</Link>
      </Button>
    </div>
  );
}

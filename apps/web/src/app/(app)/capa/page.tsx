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
import { listProperties } from "@/server/identity/catalyst-identity";
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

interface CapaRow extends CatalystRow {
  capa_number: string;
  property_id: string;
  source_type: string;
  capa_priority: string;
  due_date: string;
  status: string;
  created_at: string;
}

export default async function CapaListPage() {
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());

  const allProperties = await listProperties(catalystApp);
  const visiblePropertyIds = allProperties
    .filter((p) => ctx && hasPropertyAccess(ctx, p.id))
    .map((p) => p.id);
  const propertyName = new Map(allProperties.map((p) => [p.id, p.name]));

  const rows: CapaRow[] =
    visiblePropertyIds.length === 0
      ? []
      : ((await catalystApp.datastore().table("CAPA").getRows({
          criteria: `CAPA.property_id in (${visiblePropertyIds.map((id) => `'${id}'`).join(", ")})`,
        })) as CapaRow[])
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, 100);

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
              <TableRow key={capa.ROWID}>
                <TableCell>
                  <Link
                    href={`/capa/${capa.ROWID}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {capa.capa_number}
                  </Link>
                </TableCell>
                <TableCell>{capa.source_type.replace("_", " ")}</TableCell>
                <TableCell>{propertyName.get(capa.property_id) ?? "—"}</TableCell>
                <TableCell>{capa.capa_priority}</TableCell>
                <TableCell>{capa.due_date}</TableCell>
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

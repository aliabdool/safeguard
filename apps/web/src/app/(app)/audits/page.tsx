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
import { listProperties } from "@/server/identity/catalyst-identity";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning"> = {
  planned: "warning",
  in_progress: "secondary",
  reporting: "secondary",
  closed: "success",
};

interface AuditRow extends CatalystRow {
  audit_number: string;
  audit_type: string;
  property_id: string;
  status: string;
  created_at: string;
}

export default async function AuditsPage() {
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());

  const allProperties = await listProperties(catalystApp);
  const visiblePropertyIds = allProperties
    .filter((p) => ctx && hasPropertyAccess(ctx, p.id))
    .map((p) => p.id);
  const propertyName = new Map(allProperties.map((p) => [p.id, p.name]));

  const rows: AuditRow[] =
    visiblePropertyIds.length === 0
      ? []
      : ((await catalystApp.datastore().table("Audits").getRows({
          criteria: `Audits.property_id in (${visiblePropertyIds.map((id) => `'${id}'`).join(", ")})`,
        })) as AuditRow[])
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audits &amp; assurance</h1>
          <p className="text-muted-foreground text-sm">
            Programme and execution — self-assessments, inspections, internal/legal/ISO 45001/
            external audits.
          </p>
        </div>
        <Button asChild>
          <Link href="/audits/new">New audit</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No audits yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.ROWID}>
                <TableCell>
                  <Link
                    href={`/audits/${a.ROWID}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {a.audit_number}
                  </Link>
                </TableCell>
                <TableCell>{a.audit_type.replace("_", " ")}</TableCell>
                <TableCell>{propertyName.get(a.property_id) ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[a.status] ?? "default"}>
                    {a.status.replace("_", " ")}
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

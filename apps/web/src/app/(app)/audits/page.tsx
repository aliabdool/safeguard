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
import { audits, properties } from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning"> = {
  planned: "warning",
  in_progress: "secondary",
  reporting: "secondary",
  closed: "success",
};

export default async function AuditsPage() {
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
          .from(audits)
          .where(inArray(audits.propertyId, visiblePropertyIds))
          .orderBy(desc(audits.createdAt))
          .limit(100);

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
              <TableRow key={a.id}>
                <TableCell>
                  <Link
                    href={`/audits/${a.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {a.auditReference}
                  </Link>
                </TableCell>
                <TableCell>{a.type.replace("_", " ")}</TableCell>
                <TableCell>{propertyName.get(a.propertyId) ?? "—"}</TableCell>
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

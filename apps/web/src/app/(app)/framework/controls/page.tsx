import Link from "next/link";
import { eq } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db";
import { controlFrameworkMappings, controls, frameworks } from "@/db/schema";

export default async function ControlsPage() {
  const db = getDb();
  const allControls = await db.select().from(controls);
  const mappings = await db
    .select({
      controlId: controlFrameworkMappings.controlId,
      frameworkCode: frameworks.code,
    })
    .from(controlFrameworkMappings)
    .innerJoin(frameworks, eq(frameworks.id, controlFrameworkMappings.frameworkId));

  const frameworksByControl = new Map<string, string[]>();
  for (const m of mappings) {
    const list = frameworksByControl.get(m.controlId) ?? [];
    list.push(m.frameworkCode);
    frameworksByControl.set(m.controlId, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Master control library</h1>
        <p className="text-muted-foreground text-sm">
          One control, assessed once per property/department/period, visible under every
          framework it maps to.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Critical</TableHead>
            <TableHead>Frameworks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allControls.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={`/framework/controls/${c.id}`}
                  className="font-medium underline underline-offset-4"
                >
                  {c.controlCode}
                </Link>
              </TableCell>
              <TableCell>{c.title}</TableCell>
              <TableCell>{c.category}</TableCell>
              <TableCell>
                {c.isLifeSafetyCritical ? (
                  <Badge variant="destructive">Life-safety</Badge>
                ) : null}
              </TableCell>
              <TableCell className="flex flex-wrap gap-1">
                {(frameworksByControl.get(c.id) ?? []).map((code) => (
                  <Badge key={code} variant="outline">
                    {code}
                  </Badge>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

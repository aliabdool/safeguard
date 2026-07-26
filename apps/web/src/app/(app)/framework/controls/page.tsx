import { headers } from "next/headers";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";

interface ControlRow extends CatalystRow {
  control_code: string;
  title: string;
  category: string;
  is_life_safety_critical: string;
}

interface MappingQueryRow {
  ControlFrameworkMappings: { control_id: string };
  Frameworks: { code: string };
}

export default async function ControlsPage() {
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const [allControls, mappings] = await Promise.all([
    datastore.table("Controls").getRows({}) as Promise<ControlRow[]>,
    catalystApp.zcql().executeZCQLQuery(
      `select ControlFrameworkMappings.control_id, Frameworks.code from ControlFrameworkMappings ` +
        `left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID ` +
        `left join Frameworks on FrameworkRequirements.framework_id = Frameworks.ROWID`,
    ) as Promise<MappingQueryRow[]>,
  ]);

  const frameworksByControl = new Map<string, string[]>();
  for (const m of mappings) {
    const controlId = m.ControlFrameworkMappings.control_id;
    const list = frameworksByControl.get(controlId) ?? [];
    list.push(m.Frameworks.code);
    frameworksByControl.set(controlId, list);
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
            <TableRow key={c.ROWID}>
              <TableCell>
                <Link
                  href={`/framework/controls/${c.ROWID}`}
                  className="font-medium underline underline-offset-4"
                >
                  {c.control_code}
                </Link>
              </TableCell>
              <TableCell>{c.title}</TableCell>
              <TableCell>{c.category}</TableCell>
              <TableCell>
                {c.is_life_safety_critical === "true" ? (
                  <Badge variant="destructive">Life-safety</Badge>
                ) : null}
              </TableCell>
              <TableCell className="flex flex-wrap gap-1">
                {(frameworksByControl.get(c.ROWID) ?? []).map((code) => (
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

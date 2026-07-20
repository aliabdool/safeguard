import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  controlAssessments,
  controlFrameworkMappings,
  controls,
  frameworkCodeEnum,
  frameworks,
} from "@/db/schema";
import { computeFrameworkRollup, maturityLabel } from "@/server/framework/maturity";

export default async function FrameworkViewPage({
  params,
}: {
  params: Promise<{ frameworkCode: string }>;
}) {
  const { frameworkCode } = await params;
  if (
    !frameworkCodeEnum.enumValues.includes(
      frameworkCode as (typeof frameworkCodeEnum.enumValues)[number],
    )
  ) {
    notFound();
  }

  const db = getDb();
  const [framework] = await db
    .select()
    .from(frameworks)
    .where(eq(frameworks.code, frameworkCode as (typeof frameworkCodeEnum.enumValues)[number]))
    .limit(1);
  if (!framework) {
    notFound();
  }

  const mappedControls = await db
    .select({
      controlId: controls.id,
      controlCode: controls.controlCode,
      title: controls.title,
      isLifeSafetyCritical: controls.isLifeSafetyCritical,
      clauseReference: controlFrameworkMappings.clauseReference,
    })
    .from(controlFrameworkMappings)
    .innerJoin(controls, eq(controls.id, controlFrameworkMappings.controlId))
    .where(eq(controlFrameworkMappings.frameworkId, framework.id));

  const assessmentsByControl = new Map<string, (typeof controlAssessments.$inferSelect)[]>();
  if (mappedControls.length > 0) {
    const allAssessments = await db.select().from(controlAssessments);
    for (const a of allAssessments) {
      const list = assessmentsByControl.get(a.controlId) ?? [];
      list.push(a);
      assessmentsByControl.set(a.controlId, list);
    }
  }

  const rollupInputs = mappedControls.map((c) => {
    const assessments = assessmentsByControl.get(c.controlId) ?? [];
    const latest = new Map<string, number>();
    for (const a of assessments) {
      if (!latest.has(a.dimension)) latest.set(a.dimension, a.maturityScore);
    }
    return {
      isLifeSafetyCritical: c.isLifeSafetyCritical,
      isLegal: frameworkCode === "MU_LEGAL",
      scores: {
        policy: latest.get("policy"),
        procedure: latest.get("procedure"),
        implementation: latest.get("implementation"),
        effectiveness: latest.get("effectiveness"),
      },
    };
  });
  const rollup = computeFrameworkRollup(rollupInputs);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{framework.name}</h1>
        <p className="text-muted-foreground text-sm">{framework.description}</p>
      </div>

      <Alert variant={rollup.isCapped ? "destructive" : "default"}>
        <AlertTitle>
          Rollup readiness: {maturityLabel(rollup.rollupScore)}
          {rollup.isCapped ? " — capped by a critical gap" : ""}
        </AlertTitle>
        <AlertDescription>
          {rollup.isCapped
            ? "At least one life-safety-critical or legal control has a dimension score of 1 or below. This overrides the average score, per the critical-gap-override rule."
            : "Average of the latest complete assessment per control mapped to this framework."}
        </AlertDescription>
      </Alert>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Control</TableHead>
            <TableHead>Clause</TableHead>
            <TableHead>Critical</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappedControls.map((c) => (
            <TableRow key={c.controlId}>
              <TableCell>
                <Link
                  href={`/framework/controls/${c.controlId}`}
                  className="underline underline-offset-4"
                >
                  {c.controlCode} — {c.title}
                </Link>
              </TableCell>
              <TableCell>{c.clauseReference ?? "—"}</TableCell>
              <TableCell>
                {c.isLifeSafetyCritical ? <Badge variant="destructive">Critical</Badge> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

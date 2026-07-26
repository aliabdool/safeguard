import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

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
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { computeFrameworkRollup, maturityLabel } from "@/server/framework/maturity";

// Mirrors frameworkCodeEnum in apps/web/src/db/schema/_enums.ts.
const FRAMEWORK_CODES = [
  "ISO45001",
  "HOTEL_OPS",
  "MU_LEGAL",
  "GRI403",
  "IFRS_S1",
  "IFRS_S2",
  "SASB_HOTELS",
  "UNGC",
  "ILO_OSH",
] as const;

interface FrameworkRow extends CatalystRow {
  code: string;
  name: string;
  description: string;
}

interface MappedControlQueryRow {
  Controls: {
    ROWID: string;
    control_code: string;
    title: string;
    is_life_safety_critical: string;
  };
  FrameworkRequirements: { clause_reference: string | null };
}

interface AssessmentRow extends CatalystRow {
  control_id: string;
  dimension: string;
  maturity_score: string;
}

export default async function FrameworkViewPage({
  params,
}: {
  params: Promise<{ frameworkCode: string }>;
}) {
  const { frameworkCode } = await params;
  if (!FRAMEWORK_CODES.includes(frameworkCode as (typeof FRAMEWORK_CODES)[number])) {
    notFound();
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const frameworkRows = (await datastore.table("Frameworks").getRows({
    criteria: `Frameworks.code == '${frameworkCode}'`,
    maxRows: 1,
  })) as FrameworkRow[];
  const framework = frameworkRows[0];
  if (!framework) {
    notFound();
  }

  const mappedRows = (await catalystApp.zcql().executeZCQLQuery(
    `select Controls.ROWID, Controls.control_code, Controls.title, Controls.is_life_safety_critical, FrameworkRequirements.clause_reference ` +
      `from ControlFrameworkMappings ` +
      `left join Controls on ControlFrameworkMappings.control_id = Controls.ROWID ` +
      `left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID ` +
      `where FrameworkRequirements.framework_id = '${framework.ROWID}'`,
  )) as MappedControlQueryRow[];

  const mappedControls = mappedRows.map((r) => ({
    controlId: r.Controls.ROWID,
    controlCode: r.Controls.control_code,
    title: r.Controls.title,
    isLifeSafetyCritical: r.Controls.is_life_safety_critical === "true",
    clauseReference: r.FrameworkRequirements.clause_reference,
  }));

  const assessmentsByControl = new Map<string, AssessmentRow[]>();
  if (mappedControls.length > 0) {
    const controlIds = mappedControls.map((c) => c.controlId);
    const allAssessments = (await datastore.table("ControlAssessments").getRows({
      criteria: `ControlAssessments.control_id in (${controlIds.map((id) => `'${id}'`).join(", ")})`,
    })) as AssessmentRow[];
    for (const a of allAssessments) {
      const list = assessmentsByControl.get(a.control_id) ?? [];
      list.push(a);
      assessmentsByControl.set(a.control_id, list);
    }
  }

  const rollupInputs = mappedControls.map((c) => {
    const assessments = assessmentsByControl.get(c.controlId) ?? [];
    const latest = new Map<string, number>();
    for (const a of assessments) {
      if (!latest.has(a.dimension)) latest.set(a.dimension, Number(a.maturity_score));
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

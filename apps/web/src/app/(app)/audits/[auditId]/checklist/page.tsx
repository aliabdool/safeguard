import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AddAssessmentForm, AddChecklistItemForm } from "./checklist-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

interface AuditRow extends CatalystRow {
  audit_number: string;
  property_id: string;
}

interface ChecklistItemRow extends CatalystRow {
  audit_id: string;
  control_id: string;
  question: string;
  criteria_reference: string;
}

interface AssessmentRow extends CatalystRow {
  checklist_item_id: string;
  dimension: string;
  maturity_score: string;
  evidence_reviewed: string;
}

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const auditRows = (await datastore.table("Audits").getRows({
    criteria: `Audits.ROWID = '${auditId}'`,
    maxRows: 1,
  })) as AuditRow[];
  const audit = auditRows[0];
  if (!audit || !ctx || !hasPropertyAccess(ctx, audit.property_id)) {
    notFound();
  }

  const [items, allControls] = await Promise.all([
    datastore.table("AuditChecklistItems").getRows({
      criteria: `AuditChecklistItems.audit_id = '${auditId}'`,
    }) as Promise<ChecklistItemRow[]>,
    datastore.table("Controls").getRows({}) as Promise<
      Array<CatalystRow & { control_code: string }>
    >,
  ]);

  const itemIds = items.map((i) => i.ROWID);
  const assessments: AssessmentRow[] =
    itemIds.length === 0
      ? []
      : ((await datastore.table("AuditAssessments").getRows({
          criteria: `AuditAssessments.checklist_item_id in (${itemIds.map((id) => `'${id}'`).join(", ")})`,
        })) as AssessmentRow[]);
  const assessmentsByItem = new Map<string, AssessmentRow[]>();
  for (const a of assessments) {
    const list = assessmentsByItem.get(a.checklist_item_id) ?? [];
    list.push(a);
    assessmentsByItem.set(a.checklist_item_id, list);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Checklist — {audit.audit_number}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add checklist item</CardTitle>
        </CardHeader>
        <CardContent>
          <AddChecklistItemForm
            auditId={auditId}
            controls={allControls.map((c) => ({ id: c.ROWID, controlCode: c.control_code }))}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <Card key={item.ROWID}>
            <CardHeader>
              <CardTitle className="text-base">{item.question}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <AddAssessmentForm auditId={auditId} checklistItemId={item.ROWID} />
              <ul className="text-muted-foreground text-sm">
                {(assessmentsByItem.get(item.ROWID) ?? []).map((a) => (
                  <li key={a.ROWID}>
                    {a.dimension}: {a.maturity_score}{" "}
                    {a.evidence_reviewed ? `(${a.evidence_reviewed})` : ""}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

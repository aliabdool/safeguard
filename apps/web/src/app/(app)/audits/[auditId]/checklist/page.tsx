import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";

import { AddAssessmentForm, AddChecklistItemForm } from "./checklist-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { auditAssessments, auditChecklistItems, audits, controls } from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const ctx = await getAuthContext();
  const db = getDb();

  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  if (!audit || !ctx || !hasPropertyAccess(ctx, audit.propertyId)) {
    notFound();
  }

  const [items, allControls] = await Promise.all([
    db.select().from(auditChecklistItems).where(eq(auditChecklistItems.auditId, auditId)),
    db.select({ id: controls.id, controlCode: controls.controlCode }).from(controls),
  ]);

  const itemIds = items.map((i) => i.id);
  const assessments =
    itemIds.length === 0
      ? []
      : await db
          .select()
          .from(auditAssessments)
          .where(inArray(auditAssessments.checklistItemId, itemIds));
  const assessmentsByItem = new Map<string, typeof assessments>();
  for (const a of assessments) {
    const list = assessmentsByItem.get(a.checklistItemId) ?? [];
    list.push(a);
    assessmentsByItem.set(a.checklistItemId, list);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Checklist — {audit.auditReference}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add checklist item</CardTitle>
        </CardHeader>
        <CardContent>
          <AddChecklistItemForm auditId={auditId} controls={allControls} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-base">{item.question}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <AddAssessmentForm auditId={auditId} checklistItemId={item.id} />
              <ul className="text-muted-foreground text-sm">
                {(assessmentsByItem.get(item.id) ?? []).map((a) => (
                  <li key={a.id}>
                    {a.dimension}: {a.maturityScore}{" "}
                    {a.evidenceReviewed ? `(${a.evidenceReviewed})` : ""}
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

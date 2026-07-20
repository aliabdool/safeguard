import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import {
  ApproveInvestigationForm,
  AssignInvestigatorForm,
  CauseForm,
  CompleteInvestigationForm,
  FiveWhyForm,
  WitnessForm,
} from "./investigation-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import {
  incidents,
  investigationApprovals,
  investigationCauses,
  investigationFiveWhys,
  investigationWitnesses,
  investigations,
  profiles,
} from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

export default async function InvestigationPage({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const { incidentId } = await params;
  const ctx = await getAuthContext();
  const db = getDb();

  const [incident] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, incidentId))
    .limit(1);
  if (!incident || !ctx || !hasPropertyAccess(ctx, incident.propertyId)) {
    notFound();
  }

  const [investigation] = await db
    .select()
    .from(investigations)
    .where(eq(investigations.incidentId, incidentId))
    .limit(1);

  const candidates = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles);

  if (!investigation) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Investigation</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No investigator assigned yet</CardTitle>
          </CardHeader>
          <CardContent>
            <AssignInvestigatorForm incidentId={incidentId} candidates={candidates} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [causes, fiveWhys, witnesses, approvals] = await Promise.all([
    db
      .select()
      .from(investigationCauses)
      .where(eq(investigationCauses.investigationId, investigation.id)),
    db
      .select()
      .from(investigationFiveWhys)
      .where(eq(investigationFiveWhys.investigationId, investigation.id))
      .orderBy(asc(investigationFiveWhys.sequence)),
    db
      .select()
      .from(investigationWitnesses)
      .where(eq(investigationWitnesses.investigationId, investigation.id)),
    db
      .select()
      .from(investigationApprovals)
      .where(eq(investigationApprovals.investigationId, investigation.id)),
  ]);

  const nextWhySequence = fiveWhys.length + 1;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Investigation — {incident.incidentNumber}
        </h1>
        <Badge>{investigation.status.replace("_", " ")}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event reconstruction</CardTitle>
        </CardHeader>
        <CardContent>
          <CompleteInvestigationForm
            investigationId={investigation.id}
            incidentId={incidentId}
            defaultValue={investigation.eventReconstruction}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Immediate &amp; root causes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <CauseForm investigationId={investigation.id} incidentId={incidentId} />
          <ul className="flex flex-col gap-1 text-sm">
            {causes.map((c) => (
              <li key={c.id}>
                <Badge variant="outline">{c.causeType}</Badge>{" "}
                {c.category ? `${c.category} — ` : ""}
                {c.description}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Five Whys</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {fiveWhys.map((w) => (
            <div key={w.id} className="text-sm">
              <span className="font-medium">Why #{w.sequence}:</span> {w.question} —{" "}
              {w.answer ?? "(no answer)"}
            </div>
          ))}
          {nextWhySequence <= 5 ? (
            <FiveWhyForm
              investigationId={investigation.id}
              incidentId={incidentId}
              sequence={nextWhySequence}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Witnesses</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <WitnessForm investigationId={investigation.id} incidentId={incidentId} />
          <ul className="flex flex-col gap-1 text-sm">
            {witnesses.map((w) => (
              <li key={w.id}>
                {w.name} {w.role ? `(${w.role})` : ""} — {w.statement ?? "no statement"}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Approval</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ApproveInvestigationForm
            investigationId={investigation.id}
            incidentId={incidentId}
          />
          <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
            {approvals.map((a) => (
              <li key={a.id}>
                {a.decision} — {new Date(a.decidedAt).toLocaleString()}{" "}
                {a.comment ? `(${a.comment})` : ""}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

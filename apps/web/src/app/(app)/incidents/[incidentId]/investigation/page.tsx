import { headers } from "next/headers";
import { notFound } from "next/navigation";

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
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { listUsers } from "@/server/identity/catalyst-identity";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

interface IncidentRow extends CatalystRow {
  incident_number: string;
  property_id: string;
}

interface InvestigationRow extends CatalystRow {
  incident_id: string;
  event_reconstruction: string;
  status: string;
}

interface CauseRow extends CatalystRow {
  cause_type: string;
  category: string;
  description: string;
}

interface FiveWhyRow extends CatalystRow {
  sequence: string;
  question: string;
  answer: string;
}

interface WitnessRow extends CatalystRow {
  name: string;
  role: string;
  statement: string;
}

interface ApprovalRow extends CatalystRow {
  decision: string;
  comment: string;
  decided_at: string;
}

export default async function InvestigationPage({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const { incidentId } = await params;
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const incidentRows = (await datastore.table("Incidents").getRows({
    criteria: `Incidents.ROWID = '${incidentId}'`,
    maxRows: 1,
  })) as IncidentRow[];
  const incident = incidentRows[0];
  if (!incident || !ctx || !hasPropertyAccess(ctx, incident.property_id)) {
    notFound();
  }

  const investigationRows = (await datastore.table("IncidentInvestigation").getRows({
    criteria: `IncidentInvestigation.incident_id = '${incidentId}'`,
    maxRows: 1,
  })) as InvestigationRow[];
  const investigation = investigationRows[0];

  const users = await listUsers(catalystApp);
  const candidates = users.map((u) => ({ id: u.id, fullName: u.fullName }));

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
    datastore
      .table("IncidentRootCauses")
      .getRows({ criteria: `IncidentRootCauses.investigation_id = '${investigation.ROWID}'` }) as Promise<
      CauseRow[]
    >,
    datastore
      .table("IncidentFiveWhys")
      .getRows({ criteria: `IncidentFiveWhys.investigation_id = '${investigation.ROWID}'` }) as Promise<
      FiveWhyRow[]
    >,
    datastore
      .table("IncidentWitnesses")
      .getRows({ criteria: `IncidentWitnesses.investigation_id = '${investigation.ROWID}'` }) as Promise<
      WitnessRow[]
    >,
    datastore
      .table("InvestigationApprovals")
      .getRows({ criteria: `InvestigationApprovals.investigation_id = '${investigation.ROWID}'` }) as Promise<
      ApprovalRow[]
    >,
  ]);
  fiveWhys.sort((a, b) => Number(a.sequence) - Number(b.sequence));

  const nextWhySequence = fiveWhys.length + 1;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Investigation — {incident.incident_number}
        </h1>
        <Badge>{investigation.status.replace("_", " ")}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event reconstruction</CardTitle>
        </CardHeader>
        <CardContent>
          <CompleteInvestigationForm
            investigationId={investigation.ROWID}
            incidentId={incidentId}
            defaultValue={investigation.event_reconstruction}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Immediate &amp; root causes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <CauseForm investigationId={investigation.ROWID} incidentId={incidentId} />
          <ul className="flex flex-col gap-1 text-sm">
            {causes.map((c) => (
              <li key={c.ROWID}>
                <Badge variant="outline">{c.cause_type}</Badge>{" "}
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
            <div key={w.ROWID} className="text-sm">
              <span className="font-medium">Why #{w.sequence}:</span> {w.question} —{" "}
              {w.answer || "(no answer)"}
            </div>
          ))}
          {nextWhySequence <= 5 ? (
            <FiveWhyForm
              investigationId={investigation.ROWID}
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
          <WitnessForm investigationId={investigation.ROWID} incidentId={incidentId} />
          <ul className="flex flex-col gap-1 text-sm">
            {witnesses.map((w) => (
              <li key={w.ROWID}>
                {w.name} {w.role ? `(${w.role})` : ""} — {w.statement || "no statement"}
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
          <ApproveInvestigationForm investigationId={investigation.ROWID} incidentId={incidentId} />
          <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
            {approvals.map((a) => (
              <li key={a.ROWID}>
                {a.decision} — {new Date(a.decided_at).toLocaleString()}{" "}
                {a.comment ? `(${a.comment})` : ""}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

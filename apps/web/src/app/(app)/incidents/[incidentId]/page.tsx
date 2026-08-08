import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AttachmentUpload } from "./attachment-upload";
import { StatusActions } from "./status-actions";
import { NotificationForm } from "./notification-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

interface IncidentRow extends CatalystRow {
  incident_number: string;
  property_id: string;
  department_id: string;
  location_detail: string;
  occurred_at: string;
  person_event_type: string;
  incident_type: string;
  injury_type: string;
  body_part: string;
  outcome: string;
  actual_severity: string;
  potential_severity: string;
  is_high_potential: string;
  treatment: string;
  hospital_referral: string;
  lost_workdays: string;
  restricted_duty_days: string;
  incident_cost: string;
  currency: string;
  business_interruption_days: string;
  immediate_actions: string;
  status: string;
}

interface AttachmentRow extends CatalystRow {
  file_id: string;
  is_photo: string;
  caption: string;
}

interface NotificationRow extends CatalystRow {
  notified_party: string;
  method: string;
  notified_at: string;
}

export default async function IncidentDetailPage({
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

  const [propertyRows, departmentRows, attachments, notifications] = await Promise.all([
    datastore
      .table("Properties")
      .getRows({ criteria: `Properties.ROWID = '${incident.property_id}'`, maxRows: 1 }),
    datastore
      .table("Departments")
      .getRows({ criteria: `Departments.ROWID = '${incident.department_id}'`, maxRows: 1 }),
    datastore
      .table("IncidentAttachments")
      .getRows({ criteria: `IncidentAttachments.incident_id = '${incidentId}'` }) as Promise<
      AttachmentRow[]
    >,
    datastore
      .table("IncidentNotifications")
      .getRows({ criteria: `IncidentNotifications.incident_id = '${incidentId}'` }) as Promise<
      NotificationRow[]
    >,
  ]);
  const property = propertyRows[0];
  const department = departmentRows[0];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{incident.incident_number}</h1>
          <p className="text-muted-foreground text-sm">
            {property?.name} · {department?.name} ·{" "}
            {new Date(incident.occurred_at).toLocaleString()}
          </p>
        </div>
        <Badge>{incident.status.replace("_", " ")}</Badge>
      </div>

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/incidents/${incidentId}/investigation`}>Investigation</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/incidents/${incidentId}/medical`}>Medical (restricted)</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/capa/new?incidentId=${incidentId}`}>Create corrective action</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusActions incidentId={incidentId} currentStatus={incident.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Field label="Location" value={incident.location_detail} />
          <Field label="Person type" value={incident.person_event_type} />
          <Field label="Incident type" value={incident.incident_type} />
          <Field label="Injury type" value={incident.injury_type} />
          <Field label="Body part" value={incident.body_part} />
          <Field label="Outcome" value={incident.outcome} />
          <Field label="Actual severity" value={`${incident.actual_severity}/5`} />
          <Field label="Potential severity" value={`${incident.potential_severity}/5`} />
          <Field label="High potential" value={incident.is_high_potential === "true" ? "Yes" : "No"} />
          <Field label="Treatment" value={incident.treatment} />
          <Field
            label="Hospital referral"
            value={incident.hospital_referral === "true" ? "Yes" : "No"}
          />
          <Field label="Lost workdays" value={incident.lost_workdays} />
          <Field label="Restricted-duty days" value={incident.restricted_duty_days} />
          <Field label="Incident cost" value={`${incident.incident_cost} ${incident.currency}`} />
          <Field label="Business-interruption days" value={incident.business_interruption_days} />
          <div className="col-span-2">
            <Field label="Immediate actions" value={incident.immediate_actions} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photos &amp; documents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AttachmentUpload incidentId={incidentId} />
          {attachments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No attachments yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {attachments.map((a) => (
                <li key={a.ROWID}>
                  {a.is_photo === "true" ? "📷" : "📄"} {a.caption || a.file_id}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <NotificationForm incidentId={incidentId} />
          <Separator />
          {notifications.length === 0 ? (
            <p className="text-muted-foreground text-sm">No notifications recorded.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {notifications.map((n) => (
                <li key={n.ROWID}>
                  {n.notified_party} {n.method ? `via ${n.method}` : ""} —{" "}
                  {new Date(n.notified_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}

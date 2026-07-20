import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { AttachmentUpload } from "./attachment-upload";
import { StatusActions } from "./status-actions";
import { NotificationForm } from "./notification-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getDb } from "@/db";
import {
  departments,
  incidentAttachments,
  incidentNotifications,
  incidents,
  properties,
} from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

export default async function IncidentDetailPage({
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

  const [[property], [department], attachments, notifications] = await Promise.all([
    db
      .select({ name: properties.name })
      .from(properties)
      .where(eq(properties.id, incident.propertyId)),
    db
      .select({ name: departments.name })
      .from(departments)
      .where(eq(departments.id, incident.departmentId)),
    db
      .select()
      .from(incidentAttachments)
      .where(eq(incidentAttachments.incidentId, incidentId)),
    db
      .select()
      .from(incidentNotifications)
      .where(eq(incidentNotifications.incidentId, incidentId)),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{incident.incidentNumber}</h1>
          <p className="text-muted-foreground text-sm">
            {property?.name} · {department?.name} ·{" "}
            {new Date(incident.occurredAt).toLocaleString()}
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
          <Field label="Location" value={incident.locationDetail} />
          <Field label="Person type" value={incident.personType} />
          <Field label="Incident type" value={incident.incidentType} />
          <Field label="Injury type" value={incident.injuryType} />
          <Field label="Body part" value={incident.bodyPart} />
          <Field label="Outcome" value={incident.outcome} />
          <Field label="Actual severity" value={`${incident.actualSeverity}/5`} />
          <Field label="Potential severity" value={`${incident.potentialSeverity}/5`} />
          <Field label="High potential" value={incident.isHighPotential ? "Yes" : "No"} />
          <Field label="Treatment" value={incident.treatment} />
          <Field label="Hospital referral" value={incident.hospitalReferral ? "Yes" : "No"} />
          <Field label="Lost workdays" value={String(incident.lostWorkdays)} />
          <Field label="Restricted-duty days" value={String(incident.restrictedDutyDays)} />
          <Field
            label="Incident cost"
            value={`${incident.incidentCost} ${incident.currency}`}
          />
          <Field
            label="Business-interruption days"
            value={String(incident.businessInterruptionDays)}
          />
          <div className="col-span-2">
            <Field label="Immediate actions" value={incident.immediateActions} />
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
                <li key={a.id}>
                  {a.isPhoto ? "📷" : "📄"} {a.caption ?? a.fileId}
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
                <li key={n.id}>
                  {n.notifiedParty} {n.method ? `via ${n.method}` : ""} —{" "}
                  {new Date(n.notifiedAt).toLocaleString()}
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

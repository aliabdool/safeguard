import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { MedicalRecordForm } from "./medical-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { AuthError, requireMedicalPermission } from "@/server/permissions";

interface MedicalNoteRow extends CatalystRow {
  clinical_notes: string;
  treatment_details: string;
  practitioner_name: string;
}

export default async function MedicalRecordsPage({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const { incidentId } = await params;

  try {
    await requireMedicalPermission();
  } catch (err) {
    if (err instanceof AuthError) {
      return (
        <Alert variant="destructive" className="max-w-2xl">
          <AlertTitle>Medical-data access required</AlertTitle>
          <AlertDescription>
            You do not hold the separate medical-data permission required to view this page.
            This is independent of your role — even a Super Administrator needs an explicit
            grant. Ask an administrator to grant it from the admin console if you need clinical
            access to this incident.
          </AlertDescription>
        </Alert>
      );
    }
    throw err;
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const incidentRows = await datastore
    .table("Incidents")
    .getRows({ criteria: `Incidents.ROWID = '${incidentId}'`, maxRows: 1 });
  if (!incidentRows[0]) {
    notFound();
  }

  const records = (await datastore
    .table("MedicalNotes")
    .getRows({ criteria: `MedicalNotes.incident_id = '${incidentId}'` })) as MedicalNoteRow[];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Restricted medical records</h1>
        <p className="text-muted-foreground text-sm">
          Never surfaced in ordinary incident lists or dashboards — visible only here, to
          holders of the medical-data permission.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a record</CardTitle>
        </CardHeader>
        <CardContent>
          <MedicalRecordForm incidentId={incidentId} />
        </CardContent>
      </Card>

      {records.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Existing records</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {records.map((r) => (
              <div key={r.ROWID} className="rounded-md border p-3 text-sm">
                <p>{r.clinical_notes}</p>
                {r.treatment_details ? (
                  <p className="text-muted-foreground">Treatment: {r.treatment_details}</p>
                ) : null}
                {r.practitioner_name ? (
                  <p className="text-muted-foreground">Practitioner: {r.practitioner_name}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

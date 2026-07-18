import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { MedicalRecordForm } from "./medical-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { incidents, medicalRecords } from "@/db/schema";
import { AuthError, requireMedicalPermission } from "@/server/permissions";

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

  const db = getDb();
  const [incident] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(eq(incidents.id, incidentId))
    .limit(1);
  if (!incident) {
    notFound();
  }

  const records = await db
    .select()
    .from(medicalRecords)
    .where(eq(medicalRecords.incidentId, incidentId));

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
              <div key={r.id} className="rounded-md border p-3 text-sm">
                <p>{r.clinicalNotes}</p>
                {r.treatmentDetails ? (
                  <p className="text-muted-foreground">Treatment: {r.treatmentDetails}</p>
                ) : null}
                {r.practitionerName ? (
                  <p className="text-muted-foreground">Practitioner: {r.practitionerName}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

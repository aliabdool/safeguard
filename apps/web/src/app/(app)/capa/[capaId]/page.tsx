import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { CloseForm, VerifyForm } from "./verify-close-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

interface CapaRow extends CatalystRow {
  capa_number: string;
  property_id: string;
  department_id: string;
  description: string;
  source_type: string;
  owner_id: string;
  verifier_id: string;
  due_date: string;
  status: string;
  capa_priority: string;
  root_cause: string;
  corrective_action: string;
  preventive_action: string;
}

interface VerificationRow extends CatalystRow {
  outcome: string;
  notes: string;
  verified_at: string;
}

export default async function CapaDetailPage({
  params,
}: {
  params: Promise<{ capaId: string }>;
}) {
  const { capaId } = await params;
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const capaRows = (await datastore.table("CAPA").getRows({
    criteria: `CAPA.ROWID == '${capaId}'`,
    maxRows: 1,
  })) as CapaRow[];
  const capa = capaRows[0];
  if (!capa || !ctx || !hasPropertyAccess(ctx, capa.property_id)) {
    notFound();
  }

  const [ownerRows, verifierRows, verifications] = await Promise.all([
    datastore.table("Users").getRows({
      criteria: `Users.ROWID == '${capa.owner_id}'`,
      maxRows: 1,
    }) as Promise<Array<CatalystRow & { full_name: string }>>,
    capa.verifier_id
      ? (datastore.table("Users").getRows({
          criteria: `Users.ROWID == '${capa.verifier_id}'`,
          maxRows: 1,
        }) as Promise<Array<CatalystRow & { full_name: string }>>)
      : Promise.resolve([]),
    datastore.table("CAPAVerification").getRows({
      criteria: `CAPAVerification.capa_id == '${capaId}'`,
    }) as Promise<VerificationRow[]>,
  ]);
  const owner = ownerRows[0];
  const verifier = verifierRows[0];

  const canVerify =
    capa.status === "open" ||
    capa.status === "in_progress" ||
    capa.status === "pending_verification";
  const canClose = capa.status === "verified";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{capa.capa_number}</h1>
          <p className="text-muted-foreground text-sm">
            Source: {capa.source_type.replace("_", " ")} · Owner: {owner?.full_name ?? "—"} ·
            Verifier: {verifier?.full_name ?? "—"}
          </p>
        </div>
        <Badge>{capa.status.replace("_", " ")}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>{capa.description}</p>
          {capa.root_cause ? (
            <p>
              <span className="font-medium">Root cause:</span> {capa.root_cause}
            </p>
          ) : null}
          {capa.corrective_action ? (
            <p>
              <span className="font-medium">Corrective action:</span> {capa.corrective_action}
            </p>
          ) : null}
          {capa.preventive_action ? (
            <p>
              <span className="font-medium">Preventive action:</span> {capa.preventive_action}
            </p>
          ) : null}
          <p>
            <span className="font-medium">Priority:</span> {capa.capa_priority} ·{" "}
            <span className="font-medium">Due:</span> {capa.due_date}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verification</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {canVerify ? <VerifyForm capaId={capaId} /> : null}
          <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
            {verifications.map((v) => (
              <li key={v.ROWID}>
                {v.outcome} — {new Date(v.verified_at).toLocaleString()}{" "}
                {v.notes ? `(${v.notes})` : ""}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canClose ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Closure</CardTitle>
          </CardHeader>
          <CardContent>
            <CloseForm capaId={capaId} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { CloseForm, VerifyForm } from "./verify-close-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { capaActions, capaVerifications, profiles } from "@/db/schema";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

export default async function CapaDetailPage({
  params,
}: {
  params: Promise<{ capaId: string }>;
}) {
  const { capaId } = await params;
  const ctx = await getAuthContext();
  const db = getDb();

  const [capa] = await db
    .select()
    .from(capaActions)
    .where(eq(capaActions.id, capaId))
    .limit(1);
  if (!capa || !ctx || !hasPropertyAccess(ctx, capa.propertyId)) {
    notFound();
  }

  const [[owner], [verifier], verifications] = await Promise.all([
    db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, capa.ownerId)),
    capa.verificationOwnerId
      ? db
          .select({ fullName: profiles.fullName })
          .from(profiles)
          .where(eq(profiles.id, capa.verificationOwnerId))
      : Promise.resolve([{ fullName: null }]),
    db.select().from(capaVerifications).where(eq(capaVerifications.capaId, capaId)),
  ]);

  const canVerify =
    capa.status === "open" ||
    capa.status === "in_progress" ||
    capa.status === "pending_verification";
  const canClose = capa.status === "verified";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{capa.actionNumber}</h1>
          <p className="text-muted-foreground text-sm">
            Source: {capa.sourceType.replace("_", " ")} · Owner: {owner?.fullName} · Verifier:{" "}
            {verifier?.fullName ?? "—"}
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
          {capa.rootCause ? (
            <p>
              <span className="font-medium">Root cause:</span> {capa.rootCause}
            </p>
          ) : null}
          {capa.correctiveAction ? (
            <p>
              <span className="font-medium">Corrective action:</span> {capa.correctiveAction}
            </p>
          ) : null}
          {capa.preventiveAction ? (
            <p>
              <span className="font-medium">Preventive action:</span> {capa.preventiveAction}
            </p>
          ) : null}
          <p>
            <span className="font-medium">Priority:</span> {capa.priority} ·{" "}
            <span className="font-medium">Due:</span> {capa.dueDate}
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
              <li key={v.id}>
                {v.outcome} — {new Date(v.verifiedAt).toLocaleString()}{" "}
                {v.comment ? `(${v.comment})` : ""}
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

import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";

import { ApproveVersionForm, EvidenceLinkForm } from "./approve-and-evidence-forms";
import { VersionUpload } from "./version-upload";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import {
  controlAssessments,
  controlFrameworkMappings,
  documentVersions,
  documents,
  evidenceLinks,
} from "@/db/schema";
import { computeEvidenceReuseSummary } from "@/server/documents/evidence-reuse";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const db = getDb();

  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!document) {
    notFound();
  }

  const versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.versionNo));

  const currentVersion = versions.find((v) => v.id === document.currentVersionId);
  const evidence = currentVersion
    ? await db
        .select()
        .from(evidenceLinks)
        .where(eq(evidenceLinks.documentVersionId, currentVersion.id))
    : [];

  const controlAssessmentIds = evidence
    .filter((e) => e.linkedEntityType === "control_assessment")
    .map((e) => e.linkedEntityId);

  const assessmentRows = controlAssessmentIds.length
    ? await db
        .select({ id: controlAssessments.id, controlId: controlAssessments.controlId })
        .from(controlAssessments)
        .where(inArray(controlAssessments.id, controlAssessmentIds))
    : [];
  const controlAssessmentControlIds = new Map(assessmentRows.map((a) => [a.id, a.controlId]));

  const controlIds = [...new Set(assessmentRows.map((a) => a.controlId))];
  const mappingRows = controlIds.length
    ? await db
        .select({
          controlId: controlFrameworkMappings.controlId,
          frameworkId: controlFrameworkMappings.frameworkId,
        })
        .from(controlFrameworkMappings)
        .where(inArray(controlFrameworkMappings.controlId, controlIds))
    : [];
  const controlFrameworkIds = new Map<string, string[]>();
  for (const row of mappingRows) {
    const list = controlFrameworkIds.get(row.controlId) ?? [];
    list.push(row.frameworkId);
    controlFrameworkIds.set(row.controlId, list);
  }

  const reuseSummary = computeEvidenceReuseSummary({
    links: evidence,
    controlAssessmentControlIds,
    controlFrameworkIds,
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
          <p className="text-muted-foreground text-sm">
            {document.documentNumber} · {document.category} · {document.confidentialityLevel}
          </p>
        </div>
        <Badge>{document.status.replace("_", " ")}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <VersionUpload documentId={documentId} />
          <ul className="flex flex-col gap-3">
            {versions.map((v) => (
              <li key={v.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    v{v.versionNo} — <Badge variant="outline">{v.status}</Badge>
                    {v.id === document.currentVersionId ? " · current" : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Uploaded {new Date(v.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
                {v.changeSummary ? (
                  <p className="text-muted-foreground mt-1">{v.changeSummary}</p>
                ) : null}
                <p className="text-muted-foreground mt-1 text-xs">
                  Effective: {v.effectiveDate ?? "—"} · Review: {v.reviewDate ?? "—"} · Expiry:{" "}
                  {v.expiryDate ?? "—"}
                </p>
                {v.status === "under_review" ? (
                  <div className="mt-2">
                    <ApproveVersionForm documentId={documentId} versionId={v.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {currentVersion ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Evidence links (reusing v{currentVersion.versionNo} as evidence)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {reuseSummary.totalLinks > 0 ? (
              <p className="bg-accent rounded-md p-3 text-sm">
                This document version supports{" "}
                <span className="font-semibold">{reuseSummary.totalLinks}</span> record
                {reuseSummary.totalLinks === 1 ? "" : "s"} across{" "}
                <span className="font-semibold">{reuseSummary.distinctEntityTypes}</span>{" "}
                evidence type{reuseSummary.distinctEntityTypes === 1 ? "" : "s"}
                {reuseSummary.distinctControls > 0 ? (
                  <>
                    , including{" "}
                    <span className="font-semibold">{reuseSummary.distinctControls}</span>{" "}
                    control{reuseSummary.distinctControls === 1 ? "" : "s"} across{" "}
                    <span className="font-semibold">{reuseSummary.distinctFrameworks}</span>{" "}
                    framework{reuseSummary.distinctFrameworks === 1 ? "" : "s"}
                  </>
                ) : null}
                . One approved document, reused as evidence everywhere it genuinely applies —
                no re-uploading the same policy for each framework.
              </p>
            ) : null}
            <EvidenceLinkForm documentId={documentId} documentVersionId={currentVersion.id} />
            <ul className="flex flex-col gap-1 text-sm">
              {evidence.map((e) => (
                <li key={e.id}>
                  <Badge variant="outline">{e.evidenceLevel}</Badge> {e.linkedEntityType} —{" "}
                  {e.linkedEntityId} {e.purpose ? `(${e.purpose})` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">
          Evidence links become available once a version is approved and set as current.
        </p>
      )}
    </div>
  );
}

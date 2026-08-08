import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ApproveVersionForm, EvidenceLinkForm } from "./approve-and-evidence-forms";
import { VersionUpload } from "./version-upload";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { computeEvidenceReuseSummary } from "@/server/documents/evidence-reuse";

interface DocumentRow extends CatalystRow {
  title: string;
  document_number: string;
  category: string;
  confidentiality_level: string;
  status: string;
  current_version_id: string;
}

interface DocumentVersionRow extends CatalystRow {
  document_id: string;
  version_number: string;
  status: string;
  effective_date: string;
  review_date: string;
  expiry_date: string;
  uploaded_at: string;
  change_summary: string;
}

interface EvidenceLinkRow extends CatalystRow {
  document_version_id: string;
  linked_entity_type: string;
  linked_entity_id: string;
  evidence_level: string;
  purpose: string;
}

interface ControlAssessmentRow extends CatalystRow {
  control_id: string;
}

interface ControlFrameworkMappingRow extends CatalystRow {
  control_id: string;
  framework_id: string;
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const documentRows = (await datastore.table("Documents").getRows({
    criteria: `Documents.ROWID = '${documentId}'`,
    maxRows: 1,
  })) as DocumentRow[];
  const document = documentRows[0];
  if (!document) {
    notFound();
  }

  const versions = (
    (await datastore.table("DocumentVersions").getRows({
      criteria: `DocumentVersions.document_id = '${documentId}'`,
    })) as DocumentVersionRow[]
  ).sort((a, b) => Number(b.version_number) - Number(a.version_number));

  const currentVersion = versions.find((v) => v.ROWID === document.current_version_id);
  const evidence = currentVersion
    ? ((await datastore.table("DocumentEvidenceLinks").getRows({
        criteria: `DocumentEvidenceLinks.document_version_id = '${currentVersion.ROWID}'`,
      })) as EvidenceLinkRow[])
    : [];

  const controlAssessmentIds = evidence
    .filter((e) => e.linked_entity_type === "control_assessment")
    .map((e) => e.linked_entity_id);

  const assessmentRows = controlAssessmentIds.length
    ? ((await datastore.table("ControlAssessments").getRows({
        criteria: `ControlAssessments.ROWID in (${controlAssessmentIds.map((id) => `'${id}'`).join(", ")})`,
      })) as ControlAssessmentRow[])
    : [];
  const controlAssessmentControlIds = new Map(assessmentRows.map((a) => [a.ROWID, a.control_id]));

  const controlIds = [...new Set(assessmentRows.map((a) => a.control_id))];
  const mappingRows = controlIds.length
    ? ((await datastore.table("ControlFrameworkMappings").getRows({
        criteria: `ControlFrameworkMappings.control_id in (${controlIds.map((id) => `'${id}'`).join(", ")})`,
      })) as ControlFrameworkMappingRow[])
    : [];
  const controlFrameworkIds = new Map<string, string[]>();
  for (const row of mappingRows) {
    const list = controlFrameworkIds.get(row.control_id) ?? [];
    list.push(row.framework_id);
    controlFrameworkIds.set(row.control_id, list);
  }

  const reuseSummary = computeEvidenceReuseSummary({
    links: evidence.map((e) => ({
      linkedEntityType: e.linked_entity_type,
      linkedEntityId: e.linked_entity_id,
    })),
    controlAssessmentControlIds,
    controlFrameworkIds,
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
          <p className="text-muted-foreground text-sm">
            {document.document_number} · {document.category} · {document.confidentiality_level}
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
              <li key={v.ROWID} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    v{v.version_number} — <Badge variant="outline">{v.status}</Badge>
                    {v.ROWID === document.current_version_id ? " · current" : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Uploaded {new Date(v.uploaded_at).toLocaleDateString()}
                  </span>
                </div>
                {v.change_summary ? (
                  <p className="text-muted-foreground mt-1">{v.change_summary}</p>
                ) : null}
                <p className="text-muted-foreground mt-1 text-xs">
                  Effective: {v.effective_date || "—"} · Review: {v.review_date || "—"} · Expiry:{" "}
                  {v.expiry_date || "—"}
                </p>
                {v.status === "under_review" ? (
                  <div className="mt-2">
                    <ApproveVersionForm documentId={documentId} versionId={v.ROWID} />
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
              Evidence links (reusing v{currentVersion.version_number} as evidence)
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
            <EvidenceLinkForm documentId={documentId} documentVersionId={currentVersion.ROWID} />
            <ul className="flex flex-col gap-1 text-sm">
              {evidence.map((e) => (
                <li key={e.ROWID}>
                  <Badge variant="outline">{e.evidence_level}</Badge> {e.linked_entity_type} —{" "}
                  {e.linked_entity_id} {e.purpose ? `(${e.purpose})` : ""}
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

import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { ApproveVersionForm, EvidenceLinkForm } from "./approve-and-evidence-forms";
import { VersionUpload } from "./version-upload";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { documentVersions, documents, evidenceLinks } from "@/db/schema";

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

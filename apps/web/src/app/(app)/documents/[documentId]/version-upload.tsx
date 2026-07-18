"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createDocumentVersionAction, requestDocumentVersionUploadAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function VersionUpload({ documentId }: { documentId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { fileId, storagePath, token } = await requestDocumentVersionUploadAction({
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("controlled-documents")
        .uploadToSignedUrl(storagePath, token, file);
      if (uploadError) throw new Error(uploadError.message);

      await createDocumentVersionAction({
        documentId,
        fileId,
        effectiveDate: effectiveDate || undefined,
        reviewDate: reviewDate || undefined,
        expiryDate: expiryDate || undefined,
        changeSummary: changeSummary || undefined,
      });

      if (fileRef.current) fileRef.current.value = "";
      setChangeSummary("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <p className="text-sm font-medium">Upload new version</p>
      <Input ref={fileRef} type="file" accept="application/pdf,.doc,.docx,.xls,.xlsx" />
      <div className="grid grid-cols-3 gap-2">
        <div className="grid gap-1">
          <Label className="text-xs">Effective date</Label>
          <Input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Review date</Label>
          <Input
            type="date"
            value={reviewDate}
            onChange={(e) => setReviewDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Expiry date</Label>
          <Input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </div>
      </div>
      <Textarea
        placeholder="Change summary"
        rows={2}
        value={changeSummary}
        onChange={(e) => setChangeSummary(e.target.value)}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="button" size="sm" onClick={handleUpload} disabled={busy} className="w-fit">
        {busy ? "Uploading..." : "Upload version"}
      </Button>
    </div>
  );
}

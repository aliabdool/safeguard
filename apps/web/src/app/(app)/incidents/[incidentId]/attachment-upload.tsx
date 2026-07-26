"use client";

import { useRef, useState } from "react";

import {
  confirmIncidentAttachmentAction,
  requestIncidentAttachmentUploadAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Upload flow: server mints a signed URL against a validated (size/MIME/extension) `files` row
 * -> browser PUTs the bytes straight to Supabase Storage (bytes never pass through our server) ->
 * server confirms the object exists, computes the checksum itself, and registers the attachment.
 * See docs/security-model.md §4.
 */
export function AttachmentUpload({ incidentId }: { incidentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPhoto, setIsPhoto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const { fileId, storagePath, token } = await requestIncidentAttachmentUploadAction({
        incidentId,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        isPhoto,
      });

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("incident-evidence")
        .uploadToSignedUrl(storagePath, token, file);
      if (uploadError) {
        throw new Error(uploadError.message);
      }

      await confirmIncidentAttachmentAction({ incidentId, fileId, isPhoto });

      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="max-w-xs"
        />
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={isPhoto}
            onChange={(e) => setIsPhoto(e.target.checked)}
          />
          Photo
        </label>
        <Button type="button" size="sm" onClick={handleUpload} disabled={busy}>
          {busy ? "Uploading..." : "Upload"}
        </Button>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}

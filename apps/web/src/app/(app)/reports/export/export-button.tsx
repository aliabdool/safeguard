"use client";

import { useState } from "react";

import { exportIncidentsCsvAction } from "./actions";
import { Button } from "@/components/ui/button";

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportIncidentsButton() {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const csv = await exportIncidentsCsvAction();
      downloadTextFile(
        csv,
        `incidents-export-${new Date().toISOString().slice(0, 10)}.csv`,
        "text/csv;charset=utf-8;",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={handleExport} disabled={busy}>
      {busy ? "Exporting..." : "Export incidents (CSV)"}
    </Button>
  );
}

export function GenerateMarkdownButton({
  label,
  busyLabel,
  filenamePrefix,
  action,
}: {
  label: string;
  busyLabel: string;
  filenamePrefix: string;
  action: () => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleGenerate() {
    setBusy(true);
    try {
      const markdown = await action();
      downloadTextFile(
        markdown,
        `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.md`,
        "text/markdown;charset=utf-8;",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={handleGenerate} disabled={busy}>
      {busy ? busyLabel : label}
    </Button>
  );
}

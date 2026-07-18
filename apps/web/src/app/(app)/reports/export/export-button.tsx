"use client";

import { useState } from "react";

import { exportIncidentsCsvAction } from "./actions";
import { Button } from "@/components/ui/button";

export function ExportIncidentsButton() {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const csv = await exportIncidentsCsvAction();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `incidents-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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

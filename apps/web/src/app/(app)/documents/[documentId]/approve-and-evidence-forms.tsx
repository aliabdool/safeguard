"use client";

import { useActionState } from "react";

import { addEvidenceLinkAction, approveDocumentVersionAction } from "../actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: ActionResult = {};

export function ApproveVersionForm({
  documentId,
  versionId,
}: {
  documentId: string;
  versionId: string;
}) {
  const [state, formAction, pending] = useActionState(
    approveDocumentVersionAction,
    initialState,
  );
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="versionId" value={versionId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Approving..." : "Approve this version"}
      </Button>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
    </form>
  );
}

const ENTITY_TYPES = [
  ["control_assessment", "Control assessment"],
  ["kpi_definition", "KPI definition"],
  ["audit", "Audit"],
  ["audit_finding", "Audit finding"],
  ["capa_action", "CAPA action"],
  ["disclosure", "Disclosure"],
] as const;

const EVIDENCE_LEVELS = [
  ["policy", "Policy"],
  ["procedure", "Procedure"],
  ["implementation", "Implementation"],
  ["effectiveness", "Effectiveness"],
] as const;

export function EvidenceLinkForm({
  documentId,
  documentVersionId,
}: {
  documentId: string;
  documentVersionId: string;
}) {
  const [state, formAction, pending] = useActionState(addEvidenceLinkAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border p-3">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="documentVersionId" value={documentVersionId} />
      <div className="grid grid-cols-2 gap-2">
        <Select name="linkedEntityType" required>
          <SelectTrigger>
            <SelectValue placeholder="Linked entity type" />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input name="linkedEntityId" placeholder="Entity ID" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select name="evidenceLevel" required>
          <SelectTrigger>
            <SelectValue placeholder="Evidence level" />
          </SelectTrigger>
          <SelectContent>
            {EVIDENCE_LEVELS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input name="reportingPeriod" placeholder="Reporting period (e.g. FY2026-Q2)" />
      </div>
      <Input name="purpose" placeholder="Purpose" />
      <Input name="pageOrSection" placeholder="Page/section reference" />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        Add evidence link
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { addChecklistAssessmentAction, addChecklistItemAction } from "./actions";
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

export function AddChecklistItemForm({
  auditId,
  controls,
}: {
  auditId: string;
  controls: Array<{ id: string; controlCode: string }>;
}) {
  const [state, formAction, pending] = useActionState(addChecklistItemAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border p-3">
      <input type="hidden" name="auditId" value={auditId} />
      <Input name="question" placeholder="Checklist question" required />
      <div className="grid grid-cols-2 gap-2">
        <Input name="criteriaReference" placeholder="Criteria reference" />
        <Select name="controlId">
          <SelectTrigger>
            <SelectValue placeholder="Link to control (optional)" />
          </SelectTrigger>
          <SelectContent>
            {controls.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.controlCode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        Add checklist item
      </Button>
    </form>
  );
}

export function AddAssessmentForm({
  auditId,
  checklistItemId,
}: {
  auditId: string;
  checklistItemId: string;
}) {
  const [state, formAction, pending] = useActionState(
    addChecklistAssessmentAction,
    initialState,
  );
  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="auditId" value={auditId} />
      <input type="hidden" name="checklistItemId" value={checklistItemId} />
      <Select name="dimension" required>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Dimension" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="policy">Policy</SelectItem>
          <SelectItem value="procedure">Procedure</SelectItem>
          <SelectItem value="implementation">Implementation</SelectItem>
          <SelectItem value="effectiveness">Effectiveness</SelectItem>
        </SelectContent>
      </Select>
      <Select name="maturityScore" required>
        <SelectTrigger className="w-28">
          <SelectValue placeholder="Score" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">0</SelectItem>
          <SelectItem value="1">1</SelectItem>
          <SelectItem value="2">2</SelectItem>
          <SelectItem value="3">3</SelectItem>
          <SelectItem value="4">4</SelectItem>
        </SelectContent>
      </Select>
      <Input name="evidenceReviewed" placeholder="Evidence reviewed" className="w-48" />
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
    </form>
  );
}

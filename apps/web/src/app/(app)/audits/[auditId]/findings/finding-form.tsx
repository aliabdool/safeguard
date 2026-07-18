"use client";

import { useActionState } from "react";

import { createFindingAction } from "./actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CLASSIFICATIONS = [
  ["critical_nc", "Critical nonconformity"],
  ["major_nc", "Major nonconformity"],
  ["minor_nc", "Minor nonconformity"],
  ["observation", "Observation"],
  ["ofi", "Opportunity for improvement"],
] as const;

const initialState: ActionResult = {};

export function FindingForm({
  auditId,
  controls,
}: {
  auditId: string;
  controls: Array<{ id: string; controlCode: string }>;
}) {
  const [state, formAction, pending] = useActionState(createFindingAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border p-3">
      <input type="hidden" name="auditId" value={auditId} />
      <div className="grid grid-cols-2 gap-2">
        <Select name="classification" required>
          <SelectTrigger>
            <SelectValue placeholder="Classification" />
          </SelectTrigger>
          <SelectContent>
            {CLASSIFICATIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select name="controlId">
          <SelectTrigger>
            <SelectValue placeholder="Related control (optional)" />
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
      <Textarea name="description" placeholder="Description" rows={3} required />
      <Textarea name="evidence" placeholder="Evidence" rows={2} />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Raise finding"}
      </Button>
    </form>
  );
}

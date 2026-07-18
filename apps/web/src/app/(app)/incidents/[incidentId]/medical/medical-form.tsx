"use client";

import { useActionState } from "react";

import { createMedicalRecordAction } from "./actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionResult = {};

export function MedicalRecordForm({ incidentId }: { incidentId: string }) {
  const [state, formAction, pending] = useActionState(createMedicalRecordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="incidentId" value={incidentId} />
      <Textarea name="clinicalNotes" placeholder="Clinical notes" rows={4} required />
      <Input name="treatmentDetails" placeholder="Treatment details" />
      <Input name="practitionerName" placeholder="Practitioner name" />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : "Save medical record"}
      </Button>
    </form>
  );
}

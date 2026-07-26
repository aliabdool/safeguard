"use client";

import { useActionState } from "react";

import {
  addCauseAction,
  addFiveWhyAction,
  addWitnessAction,
  approveInvestigationAction,
  assignInvestigatorAction,
  completeInvestigationAction,
} from "./actions";
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
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionResult = {};

export function AssignInvestigatorForm({
  incidentId,
  candidates,
}: {
  incidentId: string;
  candidates: Array<{ id: string; fullName: string }>;
}) {
  const [state, formAction, pending] = useActionState(assignInvestigatorAction, initialState);
  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="incidentId" value={incidentId} />
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs">Investigator</label>
        <Select name="investigatorId" required>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select investigator" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Assigning..." : "Assign"}
      </Button>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
    </form>
  );
}

export function CauseForm({
  investigationId,
  incidentId,
}: {
  investigationId: string;
  incidentId: string;
}) {
  const [state, formAction, pending] = useActionState(addCauseAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border p-3">
      <input type="hidden" name="investigationId" value={investigationId} />
      <input type="hidden" name="incidentId" value={incidentId} />
      <div className="flex gap-2">
        <Select name="causeType" required>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="immediate">Immediate</SelectItem>
            <SelectItem value="root">Root</SelectItem>
          </SelectContent>
        </Select>
        <Input name="category" placeholder="Category" className="w-40" />
      </div>
      <Textarea name="description" placeholder="Cause description" rows={2} required />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        Add cause
      </Button>
    </form>
  );
}

export function FiveWhyForm({
  investigationId,
  incidentId,
  sequence,
}: {
  investigationId: string;
  incidentId: string;
  sequence: number;
}) {
  const [state, formAction, pending] = useActionState(addFiveWhyAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border p-3">
      <input type="hidden" name="investigationId" value={investigationId} />
      <input type="hidden" name="incidentId" value={incidentId} />
      <input type="hidden" name="sequence" value={sequence} />
      <p className="text-muted-foreground text-xs font-medium">Why #{sequence}</p>
      <Input name="question" placeholder="Why...?" required />
      <Textarea name="answer" placeholder="Answer" rows={2} />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        Save
      </Button>
    </form>
  );
}

export function WitnessForm({
  investigationId,
  incidentId,
}: {
  investigationId: string;
  incidentId: string;
}) {
  const [state, formAction, pending] = useActionState(addWitnessAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border p-3">
      <input type="hidden" name="investigationId" value={investigationId} />
      <input type="hidden" name="incidentId" value={incidentId} />
      <div className="flex gap-2">
        <Input name="name" placeholder="Name" required className="w-40" />
        <Input name="role" placeholder="Role" className="w-40" />
        <Input name="contact" placeholder="Contact" className="w-40" />
      </div>
      <Textarea name="statement" placeholder="Statement" rows={2} />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        Add witness
      </Button>
    </form>
  );
}

export function CompleteInvestigationForm({
  investigationId,
  incidentId,
  defaultValue,
}: {
  investigationId: string;
  incidentId: string;
  defaultValue?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    completeInvestigationAction,
    initialState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="investigationId" value={investigationId} />
      <input type="hidden" name="incidentId" value={incidentId} />
      <Textarea
        name="eventReconstruction"
        placeholder="Event reconstruction"
        rows={4}
        defaultValue={defaultValue ?? ""}
        required
      />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Completing..." : "Complete investigation"}
      </Button>
    </form>
  );
}

export function ApproveInvestigationForm({
  investigationId,
  incidentId,
}: {
  investigationId: string;
  incidentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    approveInvestigationAction,
    initialState,
  );
  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="investigationId" value={investigationId} />
      <input type="hidden" name="incidentId" value={incidentId} />
      <Input name="comment" placeholder="Comment (optional)" className="w-64" />
      <Button type="submit" name="decision" value="approved" size="sm" disabled={pending}>
        Approve
      </Button>
      <Button
        type="submit"
        name="decision"
        value="rejected"
        size="sm"
        variant="destructive"
        disabled={pending}
      >
        Reject
      </Button>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
    </form>
  );
}

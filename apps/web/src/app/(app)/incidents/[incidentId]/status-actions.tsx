"use client";

import { useActionState } from "react";

import { advanceIncidentStatusAction } from "../actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const NEXT_STATUS: Record<string, { status: string; label: string } | undefined> = {
  reported: { status: "investigating", label: "Start investigation" },
  investigating: { status: "corrective_action", label: "Move to corrective action" },
  corrective_action: { status: "verifying", label: "Move to verifying" },
  verifying: { status: "closed", label: "Close incident" },
  closed: undefined,
};

const initialState: ActionResult = {};

export function StatusActions({
  incidentId,
  currentStatus,
}: {
  incidentId: string;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState(
    advanceIncidentStatusAction,
    initialState,
  );
  const next = NEXT_STATUS[currentStatus];

  if (!next) {
    return <p className="text-muted-foreground text-sm">This incident is closed.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="incidentId" value={incidentId} />
      <input type="hidden" name="targetStatus" value={next.status} />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Updating..." : next.label}
      </Button>
    </form>
  );
}

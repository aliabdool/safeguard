"use client";

import { useActionState } from "react";

import { advanceFindingStatusAction } from "./actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const NEXT_STATUS: Record<string, { status: string; label: string } | undefined> = {
  open: { status: "action_assigned", label: "Mark action assigned" },
  action_assigned: { status: "verified", label: "Mark verified" },
  verified: { status: "closed", label: "Close finding" },
  closed: undefined,
};

const initialState: ActionResult = {};

export function FindingStatusActions({
  findingId,
  currentStatus,
}: {
  findingId: string;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState(
    advanceFindingStatusAction,
    initialState,
  );
  const next = NEXT_STATUS[currentStatus];
  if (!next) return <p className="text-muted-foreground text-sm">This finding is closed.</p>;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="findingId" value={findingId} />
      <input type="hidden" name="targetStatus" value={next.status} />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Updating..." : next.label}
      </Button>
    </form>
  );
}

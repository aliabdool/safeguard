"use client";

import { useActionState } from "react";

import { recordIncidentNotificationAction } from "../actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionResult = {};

export function NotificationForm({ incidentId }: { incidentId: string }) {
  const [state, formAction, pending] = useActionState(
    recordIncidentNotificationAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="incidentId" value={incidentId} />
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs" htmlFor="notifiedParty">
          Notified party
        </label>
        <Input
          id="notifiedParty"
          name="notifiedParty"
          placeholder="e.g. Regulator, GM, Insurer"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs" htmlFor="method">
          Method
        </label>
        <Input id="method" name="method" placeholder="Phone, email..." />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Recording..." : "Record"}
      </Button>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
    </form>
  );
}

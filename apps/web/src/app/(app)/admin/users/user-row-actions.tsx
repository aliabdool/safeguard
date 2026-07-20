"use client";

import { useActionState, useState } from "react";

import { reactivateUserAction, revokeSessionsAction, suspendUserAction } from "./actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionResult = {};

export function UserRowActions({
  userId,
  status,
}: {
  userId: string;
  status: "pending_approval" | "active" | "suspended" | "rejected";
}) {
  const [suspendState, suspendAction, suspendPending] = useActionState(
    suspendUserAction,
    initialState,
  );
  const [, reactivateAction, reactivatePending] = useActionState(
    reactivateUserAction,
    initialState,
  );
  const [, revokeAction, revokePending] = useActionState(revokeSessionsAction, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex justify-end gap-2">
      <form action={revokeAction}>
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" size="sm" variant="outline" disabled={revokePending}>
          Revoke sessions
        </Button>
      </form>

      {status === "active" ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="destructive">
              Suspend
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form action={suspendAction} className="flex flex-col gap-4">
              <input type="hidden" name="userId" value={userId} />
              <DialogHeader>
                <DialogTitle>Suspend user</DialogTitle>
              </DialogHeader>
              <Textarea name="reason" placeholder="Reason (required)" rows={3} required />
              {suspendState.error ? (
                <p className="text-destructive text-sm">{suspendState.error}</p>
              ) : null}
              <DialogFooter>
                <Button type="submit" variant="destructive" disabled={suspendPending}>
                  {suspendPending ? "Suspending..." : "Suspend"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : status === "suspended" ? (
        <form action={reactivateAction}>
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" size="sm" disabled={reactivatePending}>
            Reactivate
          </Button>
        </form>
      ) : null}
    </div>
  );
}

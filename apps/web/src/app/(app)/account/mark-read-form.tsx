"use client";

import { useActionState } from "react";

import { markNotificationReadAction } from "./actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionResult = {};

export function MarkReadForm({ notificationId }: { notificationId: string }) {
  const [, formAction, pending] = useActionState(markNotificationReadAction, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="notificationId" value={notificationId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Mark read
      </Button>
    </form>
  );
}

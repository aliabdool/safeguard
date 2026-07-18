"use client";

import { useActionState } from "react";

import { closeCapaAction, verifyCapaAction } from "../actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionResult = {};

export function VerifyForm({ capaId }: { capaId: string }) {
  const [state, formAction, pending] = useActionState(verifyCapaAction, initialState);
  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="capaId" value={capaId} />
      <Input name="comment" placeholder="Verification comment" className="w-64" />
      <Button type="submit" name="outcome" value="effective" size="sm" disabled={pending}>
        Mark effective
      </Button>
      <Button
        type="submit"
        name="outcome"
        value="not_effective"
        size="sm"
        variant="destructive"
        disabled={pending}
      >
        Not effective
      </Button>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
    </form>
  );
}

export function CloseForm({ capaId }: { capaId: string }) {
  const [state, formAction, pending] = useActionState(closeCapaAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="capaId" value={capaId} />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Closing..." : "Give final closure approval"}
      </Button>
    </form>
  );
}

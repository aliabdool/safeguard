"use client";

import { useActionState } from "react";

import { addAuditTeamMemberAction, advanceAuditStatusAction } from "../actions";
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

const NEXT_STATUS: Record<string, { status: string; label: string } | undefined> = {
  planned: { status: "in_progress", label: "Start audit" },
  in_progress: { status: "reporting", label: "Move to reporting" },
  reporting: { status: "closed", label: "Close audit" },
  closed: undefined,
};

export function AuditStatusActions({
  auditId,
  currentStatus,
}: {
  auditId: string;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState(advanceAuditStatusAction, initialState);
  const next = NEXT_STATUS[currentStatus];
  if (!next) return <p className="text-muted-foreground text-sm">This audit is closed.</p>;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="auditId" value={auditId} />
      <input type="hidden" name="targetStatus" value={next.status} />
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Updating..." : next.label}
      </Button>
    </form>
  );
}

export function AddTeamMemberForm({
  auditId,
  users,
}: {
  auditId: string;
  users: Array<{ id: string; fullName: string }>;
}) {
  const [state, formAction, pending] = useActionState(addAuditTeamMemberAction, initialState);
  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="auditId" value={auditId} />
      <Select name="userId" required>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Select user" />
        </SelectTrigger>
        <SelectContent>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        name="roleOnAudit"
        placeholder="Role on audit"
        defaultValue="team_member"
        className="w-40"
      />
      <Button type="submit" size="sm" disabled={pending}>
        Add
      </Button>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { createAuditAction } from "../actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TYPES = [
  ["self_assessment", "Property self-assessment"],
  ["department_inspection", "Department inspection"],
  ["internal_audit", "Internal audit"],
  ["legal_compliance_audit", "Legal-compliance audit"],
  ["iso45001_readiness", "ISO 45001 readiness audit"],
  ["external_assurance", "External assurance review"],
] as const;

const initialState: ActionResult = {};

export function AuditForm({
  properties,
  users,
}: {
  properties: Array<{ id: string; name: string }>;
  users: Array<{ id: string; fullName: string }>;
}) {
  const [state, formAction, pending] = useActionState(createAuditAction, initialState);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="type">Type</Label>
            <Select name="type" required>
              <SelectTrigger id="type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="propertyId">Property</Label>
              <Select name="propertyId" required>
                <SelectTrigger id="propertyId">
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="leadAuditorId">Lead auditor</Label>
              <Select name="leadAuditorId" required>
                <SelectTrigger id="leadAuditorId">
                  <SelectValue placeholder="Select lead auditor" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="scope">Scope</Label>
            <Textarea id="scope" name="scope" rows={2} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="criteria">Criteria</Label>
            <Textarea id="criteria" name="criteria" rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="plannedStart">Planned start</Label>
              <Input id="plannedStart" name="plannedStart" type="date" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plannedEnd">Planned end</Label>
              <Input id="plannedEnd" name="plannedEnd" type="date" />
            </div>
          </div>

          {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating..." : "Create audit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

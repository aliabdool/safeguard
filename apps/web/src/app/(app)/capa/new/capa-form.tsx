"use client";

import { useActionState } from "react";

import { createCapaAction } from "../actions";
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

const SOURCE_TYPES = [
  ["incident", "Incident"],
  ["audit_finding", "Audit finding"],
  ["legal_gap", "Legal-compliance gap"],
  ["inspection", "Inspection"],
  ["management_review", "Management review"],
] as const;

const HIERARCHY = [
  ["elimination", "Elimination"],
  ["substitution", "Substitution"],
  ["engineering", "Engineering"],
  ["administrative", "Administrative"],
  ["ppe", "PPE"],
] as const;

const initialState: ActionResult = {};

export function CapaForm({
  properties,
  departments,
  users,
  defaultSourceId,
  defaultSourceType,
}: {
  properties: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  users: Array<{ id: string; fullName: string }>;
  defaultSourceId?: string;
  defaultSourceType?: string;
}) {
  const [state, formAction, pending] = useActionState(createCapaAction, initialState);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sourceType">Source</Label>
              <Select name="sourceType" defaultValue={defaultSourceType} required>
                <SelectTrigger id="sourceType">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sourceId">Source ID</Label>
              <Input id="sourceId" name="sourceId" defaultValue={defaultSourceId} required />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={3} required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="rootCause">Root cause</Label>
            <Textarea id="rootCause" name="rootCause" rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="correctiveAction">Corrective action</Label>
              <Textarea id="correctiveAction" name="correctiveAction" rows={2} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="preventiveAction">Preventive action</Label>
              <Textarea id="preventiveAction" name="preventiveAction" rows={2} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="hierarchyOfControl">Hierarchy of control</Label>
            <Select name="hierarchyOfControl">
              <SelectTrigger id="hierarchyOfControl">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {HIERARCHY.map(([value, label]) => (
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
              <Label htmlFor="departmentId">Department</Label>
              <Select name="departmentId">
                <SelectTrigger id="departmentId">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="ownerId">Owner</Label>
              <Select name="ownerId" required>
                <SelectTrigger id="ownerId">
                  <SelectValue placeholder="Select owner" />
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
            <div className="grid gap-2">
              <Label htmlFor="verificationOwnerId">
                Verification owner (must differ from owner)
              </Label>
              <Select name="verificationOwnerId" required>
                <SelectTrigger id="verificationOwnerId">
                  <SelectValue placeholder="Select verifier" />
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

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Select name="priority" defaultValue="medium" required>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cost">Estimated cost (MUR)</Label>
              <Input id="cost" name="cost" type="number" min={0} step="0.01" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="requiredEvidence">Required evidence</Label>
            <Textarea id="requiredEvidence" name="requiredEvidence" rows={2} />
          </div>

          {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}

          <Button type="submit" disabled={pending}>
            {pending ? "Creating..." : "Create corrective action"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

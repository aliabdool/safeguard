"use client";

import { useActionState } from "react";

import { createIncidentAction } from "../actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

const PERSON_TYPES = [
  ["employee", "Employee"],
  ["contractor", "Contractor"],
  ["guest", "Guest"],
  ["visitor", "Visitor"],
  ["supplier", "Supplier"],
  ["public", "Member of the public"],
  ["none", "No person affected"],
  ["near_miss", "Near miss"],
  ["unsafe_condition", "Unsafe condition"],
] as const;

const initialState: ActionResult = {};

export function IncidentForm({
  properties,
  departments,
}: {
  properties: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(createIncidentAction, initialState);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
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
              <Select name="departmentId" required>
                <SelectTrigger id="departmentId">
                  <SelectValue placeholder="Select department" />
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

          <div className="grid gap-2">
            <Label htmlFor="locationDetail">Location</Label>
            <Input
              id="locationDetail"
              name="locationDetail"
              placeholder="e.g. Pool deck, north side"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="occurredAt">Date &amp; time occurred</Label>
            <Input id="occurredAt" name="occurredAt" type="datetime-local" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="personType">Person type</Label>
              <Select name="personType" required>
                <SelectTrigger id="personType">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {PERSON_TYPES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="personName">Person name (optional)</Label>
              <Input id="personName" name="personName" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="incidentType">Incident type</Label>
              <Input
                id="incidentType"
                name="incidentType"
                placeholder="e.g. slip_trip_fall"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="injuryType">Injury type</Label>
              <Input id="injuryType" name="injuryType" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bodyPart">Body part</Label>
              <Input id="bodyPart" name="bodyPart" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="outcome">Outcome</Label>
              <Input id="outcome" name="outcome" placeholder="e.g. first_aid" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="actualSeverity">Actual severity (1-5)</Label>
              <Input
                id="actualSeverity"
                name="actualSeverity"
                type="number"
                min={1}
                max={5}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="potentialSeverity">Potential severity (1-5)</Label>
              <Input
                id="potentialSeverity"
                name="potentialSeverity"
                type="number"
                min={1}
                max={5}
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="isHighPotential" />
            High-potential classification
          </label>

          <div className="grid gap-2">
            <Label htmlFor="treatment">Treatment</Label>
            <Input id="treatment" name="treatment" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="hospitalReferral" />
            Hospital referral
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="lostWorkdays">Lost workdays</Label>
              <Input
                id="lostWorkdays"
                name="lostWorkdays"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="restrictedDutyDays">Restricted-duty days</Label>
              <Input
                id="restrictedDutyDays"
                name="restrictedDutyDays"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="incidentCost">Incident cost (MUR)</Label>
              <Input
                id="incidentCost"
                name="incidentCost"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="businessInterruptionDays">Business-interruption days</Label>
              <Input
                id="businessInterruptionDays"
                name="businessInterruptionDays"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="immediateActions">Immediate actions taken</Label>
            <Textarea id="immediateActions" name="immediateActions" rows={3} />
          </div>

          {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}

          <Button type="submit" disabled={pending}>
            {pending ? "Submitting..." : "Submit incident report"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

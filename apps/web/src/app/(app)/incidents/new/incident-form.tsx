"use client";

import { useActionState, useState } from "react";

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
  ["trainee", "Trainee"],
  ["contractor", "Contractor"],
  ["guest", "Guest"],
  ["visitor", "Visitor"],
  ["supplier", "Supplier"],
  ["public", "Member of the public"],
  ["none", "No person affected"],
  ["near_miss", "Near miss"],
  ["unsafe_condition", "Unsafe condition"],
] as const;

const INJURY_MECHANISMS = [
  ["slip_trip_fall_same_level", "Slip, trip or fall on the same level"],
  ["fall_from_height", "Fall from height"],
  ["cut_laceration", "Cut or laceration"],
  ["burn_scald", "Burn or scald"],
  ["manual_handling", "Manual handling"],
  ["struck_by_object", "Struck by an object"],
  ["struck_against_object", "Struck against an object"],
  ["falling_object", "Falling object"],
  ["chemical_exposure", "Chemical exposure"],
  ["electrical_contact", "Electrical contact"],
  ["vehicle_related", "Vehicle-related"],
  ["ergonomic_repetitive_strain", "Ergonomic or repetitive strain"],
  ["food_allergen_exposure", "Food allergen exposure"],
  ["marine_swimming", "Marine or swimming"],
  ["other", "Other"],
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
  const [personType, setPersonType] = useState<string>("");

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
              <Select
                name="personType"
                required
                value={personType}
                onValueChange={setPersonType}
              >
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

          {personType === "employee" ? (
            <div className="bg-muted/40 grid grid-cols-2 gap-4 rounded-lg border p-4">
              <div className="grid gap-2">
                <Label htmlFor="employeeNumber">Employee number</Label>
                <Input id="employeeNumber" name="employeeNumber" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employeeDepartment">Department</Label>
                <Input id="employeeDepartment" name="employeeDepartment" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employeeJobTitle">Job title</Label>
                <Input id="employeeJobTitle" name="employeeJobTitle" />
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <Checkbox name="employeeHrConfirmed" />
                HR confirmation received
              </label>
            </div>
          ) : null}

          {personType === "trainee" ? (
            <div className="bg-muted/40 grid grid-cols-2 gap-4 rounded-lg border p-4">
              <div className="grid gap-2">
                <Label htmlFor="traineeInstitution">Training institution</Label>
                <Input id="traineeInstitution" name="traineeInstitution" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="traineeSupervisor">Placement supervisor</Label>
                <Input id="traineeSupervisor" name="traineeSupervisor" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="traineeDepartment">Training department</Label>
                <Input id="traineeDepartment" name="traineeDepartment" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="traineeInductionStatus">Induction status</Label>
                <Select name="traineeInductionStatus">
                  <SelectTrigger id="traineeInductionStatus">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="not_started">Not started</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {personType === "contractor" ? (
            <div className="bg-muted/40 grid grid-cols-2 gap-4 rounded-lg border p-4">
              <div className="grid gap-2">
                <Label htmlFor="contractorCompany">Contractor company</Label>
                <Input id="contractorCompany" name="contractorCompany" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contractorOwner">Contract owner</Label>
                <Input id="contractorOwner" name="contractorOwner" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contractorPermitStatus">Permit-to-work status</Label>
                <Select name="contractorPermitStatus">
                  <SelectTrigger id="contractorPermitStatus">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="valid">Valid</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="not_required">Not required</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <Checkbox name="contractorInductionCompleted" />
                Contractor induction completed
              </label>
            </div>
          ) : null}

          {personType === "guest" ? (
            <div className="bg-muted/40 grid grid-cols-2 gap-4 rounded-lg border p-4">
              <div className="grid gap-2">
                <Label htmlFor="guestRoomNumber">Room number</Label>
                <Input id="guestRoomNumber" name="guestRoomNumber" />
              </div>
              <div className="flex flex-col justify-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="guestRelationsFollowUp" />
                  Guest Relations follow-up required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="guestMedicalReferral" />
                  Medical referral
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="guestInsuranceNotified" />
                  Insurance notified
                </label>
              </div>
            </div>
          ) : null}

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
              <Label htmlFor="injuryMechanism">Injury mechanism</Label>
              <Select name="injuryMechanism">
                <SelectTrigger id="injuryMechanism">
                  <SelectValue placeholder="Select (if applicable)" />
                </SelectTrigger>
                <SelectContent>
                  {INJURY_MECHANISMS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="injuryType">Nature of injury</Label>
              <Input id="injuryType" name="injuryType" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bodyPart">Body part</Label>
              <Input id="bodyPart" name="bodyPart" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="outcome">Outcome</Label>
              <Input id="outcome" name="outcome" placeholder="e.g. first_aid" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reportableStatus">OSH reportable</Label>
              <Select name="reportableStatus" defaultValue="pending_determination">
                <SelectTrigger id="reportableStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_determination">Pending determination</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
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

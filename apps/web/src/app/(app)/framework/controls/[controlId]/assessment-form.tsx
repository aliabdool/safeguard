"use client";

import { useActionState } from "react";

import { createControlAssessmentAction } from "../actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
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

const initialState: ActionResult = {};

export function AssessmentForm({
  controlId,
  properties,
  departments,
  isLifeSafetyCritical,
  isLegal,
}: {
  controlId: string;
  properties: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  isLifeSafetyCritical: boolean;
  isLegal: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createControlAssessmentAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="controlId" value={controlId} />
      <input
        type="hidden"
        name="isLifeSafetyCritical"
        value={isLifeSafetyCritical ? "on" : ""}
      />
      <input type="hidden" name="isLegal" value={isLegal ? "on" : ""} />

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label className="text-xs">Property</Label>
          <Select name="propertyId" required>
            <SelectTrigger>
              <SelectValue placeholder="Property" />
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
        <div className="grid gap-1">
          <Label className="text-xs">Department (optional)</Label>
          <Select name="departmentId">
            <SelectTrigger>
              <SelectValue placeholder="Property-wide" />
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

      <div className="grid grid-cols-3 gap-2">
        <Input name="periodLabel" placeholder="Period, e.g. FY2026-Q2" required />
        <Select name="dimension" required>
          <SelectTrigger>
            <SelectValue placeholder="Dimension" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="policy">Policy</SelectItem>
            <SelectItem value="procedure">Procedure</SelectItem>
            <SelectItem value="implementation">Implementation</SelectItem>
            <SelectItem value="effectiveness">Effectiveness</SelectItem>
          </SelectContent>
        </Select>
        <Select name="maturityScore" required>
          <SelectTrigger>
            <SelectValue placeholder="Score 0-4" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0 — Absent</SelectItem>
            <SelectItem value="1">1 — Initial</SelectItem>
            <SelectItem value="2">2 — Documented</SelectItem>
            <SelectItem value="3">3 — Implemented</SelectItem>
            <SelectItem value="4">4 — Effective</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Textarea name="notes" placeholder="Notes" rows={2} />

      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Saving..." : "Save assessment"}
      </Button>
    </form>
  );
}

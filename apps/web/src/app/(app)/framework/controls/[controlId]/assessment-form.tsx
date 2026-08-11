"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";

import { createControlAssessmentAction } from "../actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { MATURITY_SCALE_LABELS } from "@/server/dashboard/data-states";
import {
  getAssessmentGuidance,
  type AssessmentDimension,
} from "@/server/framework/assessment-content";

const initialState: ActionResult = {};

const DIMENSIONS: { value: AssessmentDimension; label: string }[] = [
  { value: "policy", label: "Policy" },
  { value: "procedure", label: "Procedure" },
  { value: "implementation", label: "Implementation" },
  { value: "effectiveness", label: "Effectiveness" },
];

export function AssessmentForm({
  controlId,
  control,
  properties,
  departments,
  isLifeSafetyCritical,
  isLegal,
  existingScoresByProperty,
}: {
  controlId: string;
  control: { title: string; category: string | null };
  properties: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  isLifeSafetyCritical: boolean;
  isLegal: boolean;
  /** propertyId -> dimension -> latest known score, so the guided form can show real progress
   * instead of a generic "0 of 4" every time (see chat §D-F: "assessment progress tracking"). */
  existingScoresByProperty: Record<string, Record<string, number>>;
}) {
  const [state, formAction, pending] = useActionState(
    createControlAssessmentAction,
    initialState,
  );

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(
    properties[0]?.id ?? "",
  );
  const [selectedDimension, setSelectedDimension] = useState<AssessmentDimension>("policy");
  const [draftScore, setDraftScore] = useState<number | null>(null);
  const [applicability, setApplicability] = useState<"applicable" | "not_applicable">(
    "applicable",
  );

  const existingForProperty = existingScoresByProperty[selectedPropertyId] ?? {};
  const completedCount = DIMENSIONS.filter((d) => existingForProperty[d.value] != null).length;
  const guidance = useMemo(
    () => getAssessmentGuidance(control, selectedDimension),
    [control, selectedDimension],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-1">
        <Label className="text-xs">Property</Label>
        <Select value={selectedPropertyId || undefined} onValueChange={setSelectedPropertyId}>
          <SelectTrigger className="w-64">
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

      {selectedPropertyId ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            Assessment progress for this property: {completedCount} of {DIMENSIONS.length}{" "}
            dimensions assessed
          </span>
          <div className="flex gap-1">
            {DIMENSIONS.map((d) => {
              const score = existingForProperty[d.value];
              return (
                <Badge
                  key={d.value}
                  variant={score != null ? "secondary" : "outline"}
                  className="text-[10px]"
                >
                  {d.label}: {score != null ? score : "—"}
                </Badge>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {DIMENSIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => {
              setSelectedDimension(d.value);
              setDraftScore(null);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              selectedDimension === d.value
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-accent",
            )}
          >
            {d.label}
            {existingForProperty[d.value] != null ? ` (${existingForProperty[d.value]})` : ""}
          </button>
        ))}
      </div>

      <div className="bg-muted/30 flex flex-col gap-2 rounded-md border p-3 text-sm">
        <p className="font-medium">{guidance.question}</p>
        <p className="text-muted-foreground text-xs">
          <span className="font-medium">Why this matters:</span> {guidance.whyItMatters}
        </p>
        <p className="text-muted-foreground text-xs">
          <span className="font-medium">What good looks like:</span>{" "}
          {guidance.whatGoodLooksLike}
        </p>
        <div className="text-muted-foreground text-xs">
          <span className="font-medium">Evidence examples:</span>
          <ul className="mt-1 list-inside list-disc">
            {guidance.evidenceExamples.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium">Applicability</legend>
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="applicability_display"
              checked={applicability === "applicable"}
              onChange={() => setApplicability("applicable")}
            />
            Applicable — assess below
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="applicability_display"
              checked={applicability === "not_applicable"}
              onChange={() => setApplicability("not_applicable")}
            />
            Not applicable
          </label>
        </div>
      </fieldset>

      {applicability === "not_applicable" ? (
        <div className="bg-warning/10 rounded-md border p-3 text-xs">
          <p className="font-medium">Not applicable — reason required (coming soon)</p>
          <p className="text-muted-foreground mt-1">
            Recording a control as &ldquo;Not applicable&rdquo; (distinct from &ldquo;Not
            assessed&rdquo;) with a required reason, assessor, and date needs a small
            data-model addition that hasn&apos;t been applied to the live Catalyst project yet.
            This option is shown to preview the intended experience — selecting it does not
            currently save anything. Choose &ldquo;Applicable&rdquo; to record a real
            assessment today.
          </p>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="controlId" value={controlId} />
          <input type="hidden" name="propertyId" value={selectedPropertyId} />
          <input type="hidden" name="dimension" value={selectedDimension} />
          <input
            type="hidden"
            name="isLifeSafetyCritical"
            value={isLifeSafetyCritical ? "on" : ""}
          />
          <input type="hidden" name="isLegal" value={isLegal ? "on" : ""} />

          <div className="grid grid-cols-2 gap-2">
            <Select name="departmentId">
              <SelectTrigger>
                <SelectValue placeholder="Department (property-wide if blank)" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input name="periodLabel" placeholder="Period, e.g. FY2026-Q2" required />
          </div>

          <fieldset className="grid grid-cols-5 gap-1.5">
            <legend className="sr-only">Maturity score</legend>
            {[0, 1, 2, 3, 4].map((score) => (
              <label
                key={score}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-center text-[11px]",
                  draftScore === score ? "border-primary bg-primary/5" : "hover:bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="maturityScore"
                  value={score}
                  required
                  checked={draftScore === score}
                  onChange={() => setDraftScore(score)}
                  className="sr-only"
                />
                <span className="font-semibold">{score}</span>
                <span className="text-muted-foreground leading-tight">
                  {MATURITY_SCALE_LABELS[score]}
                </span>
              </label>
            ))}
          </fieldset>

          <Textarea
            name="notes"
            placeholder="Notes — e.g. what evidence supports this score, or what's missing"
            rows={2}
          />

          <fieldset className="rounded-md border border-dashed p-2 text-xs opacity-70">
            <legend className="px-1 text-[11px] font-medium">
              Action required / Owner / Reviewer (coming soon)
            </legend>
            <p className="text-muted-foreground">
              Tracking a required action, an accountable owner, and a reviewer against each
              assessment needs the same data-model addition noted above — not yet saved. Use
              the Notes field above to record this information for now.
            </p>
          </fieldset>

          {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
          <Button
            type="submit"
            size="sm"
            disabled={pending || !selectedPropertyId || draftScore == null}
            className="w-fit"
          >
            {pending ? "Saving..." : "Save assessment"}
          </Button>
          <p className="text-muted-foreground text-[11px]">
            Evidence can be linked to this assessment from a document&apos;s page after saving.
          </p>
        </form>
      )}
    </div>
  );
}

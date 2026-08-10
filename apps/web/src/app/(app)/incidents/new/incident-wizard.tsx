"use client";

import { useEffect, useMemo, useState } from "react";

import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

import { validatePersonInjuryConsistency } from "@/server/incidents/wizard-rules";

import { clearIncidentDraft, loadIncidentDraft, saveIncidentDraft } from "./draft-storage";
import {
  AGE_BAND_OPTIONS,
  AREA_ISOLATED_OPTIONS,
  HAZARD_PRESENT_OPTIONS,
  IMMEDIATE_CONTROL_OPTIONS,
  INCIDENT_TYPE_OPTIONS,
  INJURY_MECHANISM_OPTIONS,
  OUTCOME_OPTIONS,
  PERSON_TYPE_OPTIONS,
  REFERRAL_OPTIONS,
  SEVERITY_LEVELS,
  SEX_OPTIONS,
} from "./wizard-constants";
import { submitIncidentReportAction, type SubmitIncidentReportInput } from "./wizard-actions";

interface PersonEntry {
  personType:
    | "employee"
    | "trainee"
    | "contractor"
    | "guest"
    | "visitor"
    | "supplier"
    | "public"
    | "other"
    | "";
  fullName: string;
  employeeOrReferenceNo: string;
  details: Record<string, string>;
}

interface WitnessEntry {
  fullName: string;
  contact: string;
  statementSummary: string;
}

interface WizardData {
  propertyId: string;
  departmentId: string;
  incidentDate: string;
  incidentTime: string;
  locationDetail: string;
  hazardPresent: "yes" | "no" | "unsure" | "";
  areaIsolated: "yes" | "no" | "not_required" | "";
  emergencyServicesRequired: boolean;

  typeCodes: string[];
  primaryType: string;
  title: string;
  description: string;
  activity: string;
  equipmentInvolved: string;
  workStopped: boolean;
  similarPrevious: boolean;

  personAffected: "yes" | "no" | "";
  persons: PersonEntry[];

  outcome: string;
  injuryMechanism: string;
  injuryType: string;
  bodyPart: string;
  referral: "none" | "hotel_doctor" | "clinic" | "hospital" | "declined" | "";
  lostWorkdays: number;
  restrictedDutyDays: number;

  actualSeverity: number;
  potentialSeverity: number;

  immediateControls: Record<string, boolean>;
  additionalAssistance: string;

  witnesses: WitnessEntry[];

  reporterDeclaration: boolean;
}

const EMPTY_PERSON: PersonEntry = {
  personType: "",
  fullName: "",
  employeeOrReferenceNo: "",
  details: {},
};

const EMPTY_WITNESS: WitnessEntry = { fullName: "", contact: "", statementSummary: "" };

function initialData(): WizardData {
  return {
    propertyId: "",
    departmentId: "",
    incidentDate: "",
    incidentTime: "",
    locationDetail: "",
    hazardPresent: "",
    areaIsolated: "",
    emergencyServicesRequired: false,
    typeCodes: [],
    primaryType: "",
    title: "",
    description: "",
    activity: "",
    equipmentInvolved: "",
    workStopped: false,
    similarPrevious: false,
    personAffected: "",
    persons: [],
    outcome: "",
    injuryMechanism: "",
    injuryType: "",
    bodyPart: "",
    referral: "none",
    lostWorkdays: 0,
    restrictedDutyDays: 0,
    actualSeverity: 0,
    potentialSeverity: 0,
    immediateControls: {},
    additionalAssistance: "",
    witnesses: [],
    reporterDeclaration: false,
  };
}

const STEP_TITLES = [
  "Immediate safety",
  "What happened",
  "Person(s) affected",
  "Injury / outcome",
  "Actual & potential severity",
  "Immediate controls",
  "Witnesses & attachments",
  "Review & submit",
];

export function IncidentWizard({
  properties,
  departments,
  reporterName,
  reporterRole,
}: {
  properties: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  reporterName: string;
  reporterRole: string;
}) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);

  // Deliberately not a lazy useState initializer: sessionStorage is unavailable during SSR, so
  // reading it there would make the server-rendered HTML (empty form) diverge from what a lazy
  // initializer would produce on the client's first render (restored draft), causing a hydration
  // mismatch. Restoring after mount, once, is the correct pattern here.
  useEffect(() => {
    const draft = loadIncidentDraft<WizardData>();
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(draft);
      setRestoredDraft(true);
    }
  }, []);

  function update<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function saveDraft() {
    saveIncidentDraft(data);
  }

  const isHighPotential = data.actualSeverity >= 4 || data.potentialSeverity >= 4;

  function toggleType(code: string) {
    setData((prev) => {
      const has = prev.typeCodes.includes(code);
      const typeCodes = has
        ? prev.typeCodes.filter((c) => c !== code)
        : [...prev.typeCodes, code];
      const primaryType =
        !has && prev.primaryType === ""
          ? code
          : prev.typeCodes.includes(prev.primaryType) || has
            ? prev.primaryType
            : "";
      return {
        ...prev,
        typeCodes,
        primaryType: typeCodes.includes(primaryType) ? primaryType : (typeCodes[0] ?? ""),
      };
    });
  }

  function addPerson() {
    setData((prev) => ({ ...prev, persons: [...prev.persons, { ...EMPTY_PERSON }] }));
  }
  function removePerson(index: number) {
    setData((prev) => ({ ...prev, persons: prev.persons.filter((_, i) => i !== index) }));
  }
  function updatePerson(index: number, patch: Partial<PersonEntry>) {
    setData((prev) => ({
      ...prev,
      persons: prev.persons.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }

  function addWitness() {
    setData((prev) => ({ ...prev, witnesses: [...prev.witnesses, { ...EMPTY_WITNESS }] }));
  }
  function removeWitness(index: number) {
    setData((prev) => ({ ...prev, witnesses: prev.witnesses.filter((_, i) => i !== index) }));
  }
  function updateWitness(index: number, patch: Partial<WitnessEntry>) {
    setData((prev) => ({
      ...prev,
      witnesses: prev.witnesses.map((w, i) => (i === index ? { ...w, ...patch } : w)),
    }));
  }

  function validateStep(current: number): string | null {
    switch (current) {
      case 0:
        if (!data.propertyId) return "Property is required.";
        if (!data.departmentId) return "Department is required.";
        if (!data.incidentDate) return "Incident date is required.";
        if (!data.incidentTime) return "Incident time is required.";
        if (!data.locationDetail) return "Exact location is required.";
        if (!data.hazardPresent) return "Please state whether the hazard is still present.";
        if (!data.areaIsolated) return "Please state whether the area is isolated.";
        return null;
      case 1:
        if (data.typeCodes.length === 0) return "Select at least one incident type.";
        if (!data.primaryType) return "Choose a primary incident type.";
        if (!data.title) return "A short incident title is required.";
        if (!data.description) return "A factual description is required.";
        return null;
      case 2:
        if (!data.personAffected) return "State whether anyone was affected.";
        if (data.personAffected === "yes") {
          if (data.persons.length === 0) return "Add at least one affected person.";
          for (const p of data.persons) {
            if (!p.personType) return "Select a person type for every affected person.";
            if (!p.fullName) return "Full name is required for every affected person.";
          }
        }
        return null;
      case 3: {
        if (!data.outcome) return "Outcome is required.";
        const consistency = validatePersonInjuryConsistency(
          data.personAffected === "yes" ? "yes" : "no",
          data.personAffected === "yes" ? data.persons.length : 0,
          data.outcome,
        );
        return consistency.ok ? null : consistency.error;
      }
      case 4:
        if (!data.actualSeverity) return "Select the actual severity.";
        if (!data.potentialSeverity) return "Select the potential severity.";
        return null;
      case 7:
        if (!data.reporterDeclaration) return "The reporter declaration must be confirmed.";
        return null;
      default:
        return null;
    }
  }

  function goNext() {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    saveDraft();
    setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1));
  }
  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    const validationError = validateStep(7);
    if (validationError) {
      setError(validationError);
      return;
    }
    setPending(true);
    setError(null);

    const payload: SubmitIncidentReportInput = {
      propertyId: data.propertyId,
      departmentId: data.departmentId,
      incidentDate: data.incidentDate,
      incidentTime: data.incidentTime,
      locationDetail: data.locationDetail,
      hazardPresent: data.hazardPresent as "yes" | "no" | "unsure",
      areaIsolated: data.areaIsolated as "yes" | "no" | "not_required",
      emergencyServicesRequired: data.emergencyServicesRequired,
      types: data.typeCodes.map((code) => ({ code, isPrimary: code === data.primaryType })),
      title: data.title,
      description: data.description,
      activity: data.activity || undefined,
      equipmentInvolved: data.equipmentInvolved || undefined,
      workStopped: data.workStopped,
      similarPrevious: data.similarPrevious,
      personsAffected: data.personAffected === "yes" ? "yes" : "no",
      persons:
        data.personAffected === "yes"
          ? data.persons.map((p) => ({
              personType: p.personType as
                | "employee"
                | "trainee"
                | "contractor"
                | "guest"
                | "visitor"
                | "supplier"
                | "public"
                | "other",
              fullName: p.fullName,
              employeeOrReferenceNo: p.employeeOrReferenceNo || undefined,
              details: p.details,
            }))
          : [],
      outcome: data.outcome,
      injuryMechanism: data.injuryMechanism || undefined,
      injuryType: data.injuryType || undefined,
      bodyPart: data.bodyPart || undefined,
      referral: data.referral as "none" | "hotel_doctor" | "clinic" | "hospital" | "declined",
      lostWorkdays: data.lostWorkdays,
      restrictedDutyDays: data.restrictedDutyDays,
      actualSeverity: data.actualSeverity,
      potentialSeverity: data.potentialSeverity,
      immediateControls: data.immediateControls,
      additionalAssistance: data.additionalAssistance || undefined,
      witnesses: data.witnesses.map((w) => ({
        fullName: w.fullName,
        contact: w.contact || undefined,
        statementSummary: w.statementSummary || undefined,
      })),
      reporterDeclaration: true,
    };

    try {
      const result = await submitIncidentReportAction(payload);
      if (result?.error) {
        setError(result.error);
        setPending(false);
        return;
      }
      clearIncidentDraft();
      // On success the action redirects server-side; this line only runs if it somehow returns.
    } catch (err) {
      // Next.js redirect() throws a special control-flow error — rethrow it, only real errors
      // should surface here.
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        String(err.digest).startsWith("NEXT_REDIRECT")
      ) {
        clearIncidentDraft();
        throw err;
      }
      setError(err instanceof Error ? err.message : "Could not submit the incident report.");
      setPending(false);
    }
  }

  const progressPct = Math.round(((step + 1) / STEP_TITLES.length) * 100);

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>
          If anyone is in immediate danger, contact the emergency team first.
        </AlertTitle>
      </Alert>

      {restoredDraft ? (
        <Alert>
          <AlertTitle>Draft restored</AlertTitle>
          <AlertDescription>
            We picked up where you left off. This draft is only stored in this browser and
            expires automatically.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>
            Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{STEP_TITLES[step]}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 0 ? (
            <StepSafety
              data={data}
              update={update}
              properties={properties}
              departments={departments}
              reporterName={reporterName}
              reporterRole={reporterRole}
            />
          ) : null}
          {step === 1 ? (
            <StepWhatHappened data={data} update={update} toggleType={toggleType} />
          ) : null}
          {step === 2 ? (
            <StepPersons
              data={data}
              update={update}
              addPerson={addPerson}
              removePerson={removePerson}
              updatePerson={updatePerson}
            />
          ) : null}
          {step === 3 ? (
            <StepInjury
              data={data}
              update={update}
              hasPersons={data.personAffected === "yes"}
            />
          ) : null}
          {step === 4 ? (
            <StepSeverity data={data} update={update} isHighPotential={isHighPotential} />
          ) : null}
          {step === 5 ? <StepImmediateControls data={data} update={update} /> : null}
          {step === 6 ? (
            <StepWitnesses
              data={data}
              addWitness={addWitness}
              removeWitness={removeWitness}
              updateWitness={updateWitness}
            />
          ) : null}
          {step === 7 ? (
            <StepReview
              data={data}
              update={update}
              properties={properties}
              departments={departments}
              isHighPotential={isHighPotential}
            />
          ) : null}

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              {step > 0 ? (
                <Button type="button" variant="outline" onClick={goBack} disabled={pending}>
                  Back
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={saveDraft} disabled={pending}>
                Save draft
              </Button>
            </div>
            {step < STEP_TITLES.length - 1 ? (
              <Button type="button" onClick={goNext}>
                Continue
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={pending}>
                {pending ? "Submitting..." : "Submit incident report"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepSafety({
  data,
  update,
  properties,
  departments,
  reporterName,
  reporterRole,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  properties: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  reporterName: string;
  reporterRole: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Reporter</Label>
          <Input value={reporterName} readOnly disabled />
        </div>
        <div className="grid gap-2">
          <Label>Reporter role</Label>
          <Input value={reporterRole} readOnly disabled />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="propertyId">Property</Label>
          <Select value={data.propertyId} onValueChange={(v) => update("propertyId", v)}>
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
          <Select value={data.departmentId} onValueChange={(v) => update("departmentId", v)}>
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

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="incidentDate">Incident date</Label>
          <Input
            id="incidentDate"
            type="date"
            value={data.incidentDate}
            onChange={(e) => update("incidentDate", e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="incidentTime">Incident time</Label>
          <Input
            id="incidentTime"
            type="time"
            value={data.incidentTime}
            onChange={(e) => update("incidentTime", e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="locationDetail">Exact location</Label>
        <Input
          id="locationDetail"
          placeholder="e.g. Pool deck, north side"
          value={data.locationDetail}
          onChange={(e) => update("locationDetail", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="hazardPresent">Hazard still present?</Label>
          <Select
            value={data.hazardPresent}
            onValueChange={(v) => update("hazardPresent", v as WizardData["hazardPresent"])}
          >
            <SelectTrigger id="hazardPresent">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {HAZARD_PRESENT_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="areaIsolated">Area isolated?</Label>
          <Select
            value={data.areaIsolated}
            onValueChange={(v) => update("areaIsolated", v as WizardData["areaIsolated"])}
          >
            <SelectTrigger id="areaIsolated">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {AREA_ISOLATED_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={data.emergencyServicesRequired}
          onCheckedChange={(checked) => update("emergencyServicesRequired", checked === true)}
        />
        Emergency services required
      </label>
    </div>
  );
}

function StepWhatHappened({
  data,
  update,
  toggleType,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  toggleType: (code: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label>Incident types (select all that apply)</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INCIDENT_TYPE_OPTIONS.map(([code, label]) => (
            <label key={code} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={data.typeCodes.includes(code)}
                onCheckedChange={() => toggleType(code)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {data.typeCodes.length > 0 ? (
        <div className="grid gap-2">
          <Label htmlFor="primaryType">Primary incident type</Label>
          <Select value={data.primaryType} onValueChange={(v) => update("primaryType", v)}>
            <SelectTrigger id="primaryType">
              <SelectValue placeholder="Select primary type" />
            </SelectTrigger>
            <SelectContent>
              {data.typeCodes.map((code) => {
                const label = INCIDENT_TYPE_OPTIONS.find(([c]) => c === code)?.[1] ?? code;
                return (
                  <SelectItem key={code} value={code}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="title">Short incident title</Label>
        <Input
          id="title"
          value={data.title}
          onChange={(e) => update("title", e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Factual description</Label>
        <Textarea
          id="description"
          rows={4}
          value={data.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="activity">Activity being performed</Label>
          <Input
            id="activity"
            value={data.activity}
            onChange={(e) => update("activity", e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="equipmentInvolved">Equipment/material/chemical involved</Label>
          <Input
            id="equipmentInvolved"
            value={data.equipmentInvolved}
            onChange={(e) => update("equipmentInvolved", e.target.value)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={data.workStopped}
          onCheckedChange={(checked) => update("workStopped", checked === true)}
        />
        Work/activity stopped
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={data.similarPrevious}
          onCheckedChange={(checked) => update("similarPrevious", checked === true)}
        />
        Similar previous incident
      </label>

      <Alert>
        <AlertDescription>
          Photo/video attachments will be available once file storage is connected — this step
          does not upload files yet.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function personDetailFields(
  person: PersonEntry,
  updatePerson: (patch: Partial<PersonEntry>) => void,
) {
  const setDetail = (key: string, value: string) =>
    updatePerson({ details: { ...person.details, [key]: value } });

  if (person.personType === "employee" || person.personType === "trainee") {
    return (
      <div className="bg-muted/40 grid grid-cols-2 gap-3 rounded-lg border p-3">
        <div className="grid gap-1">
          <Label>Department</Label>
          <Input
            value={person.details.department ?? ""}
            onChange={(e) => setDetail("department", e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label>Job title</Label>
          <Input
            value={person.details.jobTitle ?? ""}
            onChange={(e) => setDetail("jobTitle", e.target.value)}
          />
        </div>
      </div>
    );
  }
  if (person.personType === "contractor") {
    return (
      <div className="bg-muted/40 grid grid-cols-2 gap-3 rounded-lg border p-3">
        <div className="grid gap-1">
          <Label>Contractor company</Label>
          <Input
            value={person.details.contractorCompany ?? ""}
            onChange={(e) => setDetail("contractorCompany", e.target.value)}
          />
        </div>
      </div>
    );
  }
  if (person.personType === "guest") {
    return (
      <div className="bg-muted/40 grid grid-cols-2 gap-3 rounded-lg border p-3">
        <div className="grid gap-1">
          <Label>Guest room number</Label>
          <Input
            value={person.details.roomNumber ?? ""}
            onChange={(e) => setDetail("roomNumber", e.target.value)}
          />
        </div>
      </div>
    );
  }
  return null;
}

function StepPersons({
  data,
  update,
  addPerson,
  removePerson,
  updatePerson,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  addPerson: () => void;
  removePerson: (index: number) => void;
  updatePerson: (index: number, patch: Partial<PersonEntry>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label>Was anyone affected?</Label>
        <Select
          value={data.personAffected}
          onValueChange={(v) => {
            update("personAffected", v as WizardData["personAffected"]);
            if (v === "no") {
              update("persons", []);
              // Forces the outcome back to "no injury" whenever there's no affected person —
              // this is the exact invalid state the live browser test surfaced ("Persons
              // affected: None" + "Outcome: First aid only", see chat) and it must not be
              // reachable by leaving a stale injury outcome selected from a prior answer.
              update("outcome", "no_injury");
            } else if (v === "yes") {
              if (data.persons.length === 0) update("persons", [{ ...EMPTY_PERSON }]);
              if (data.outcome === "no_injury") update("outcome", "");
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes, one or more people were affected</SelectItem>
            <SelectItem value="no">No person affected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.personAffected === "yes"
        ? data.persons.map((person, index) => (
            <div key={index} className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Person {index + 1}</span>
                {data.persons.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePerson(index)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label>Person type</Label>
                  <Select
                    value={person.personType}
                    onValueChange={(v) =>
                      updatePerson(index, { personType: v as PersonEntry["personType"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {PERSON_TYPE_OPTIONS.filter(([v]) => v !== "none").map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label>Full name</Label>
                  <Input
                    value={person.fullName}
                    onChange={(e) => updatePerson(index, { fullName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <Label>Employee number / person reference</Label>
                <Input
                  value={person.employeeOrReferenceNo}
                  onChange={(e) =>
                    updatePerson(index, { employeeOrReferenceNo: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label>Age band</Label>
                  <Select
                    value={person.details.ageBand ?? ""}
                    onValueChange={(v) =>
                      updatePerson(index, { details: { ...person.details, ageBand: v } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_BAND_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label>Sex</Label>
                  <Select
                    value={person.details.sex ?? ""}
                    onValueChange={(v) =>
                      updatePerson(index, { details: { ...person.details, sex: v } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEX_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {personDetailFields(person, (patch) => updatePerson(index, patch))}
            </div>
          ))
        : null}

      {data.personAffected === "yes" ? (
        <Button type="button" variant="outline" onClick={addPerson}>
          Add another person
        </Button>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Person names are never shown on executive dashboards or board reports.
      </p>
    </div>
  );
}

function StepInjury({
  data,
  update,
  hasPersons,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  hasPersons: boolean;
}) {
  if (!hasPersons) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label>Persons affected</Label>
          <p className="text-sm font-medium">None</p>
        </div>
        <div className="grid gap-2">
          <Label>Injury outcome</Label>
          <p className="text-sm font-medium">No injury / Not applicable</p>
        </div>
        <Alert>
          <AlertDescription>
            No affected person was recorded in the previous step, so no injury/medical outcome
            can be selected here. Go back to &ldquo;Person(s) affected&rdquo; if that&rsquo;s
            not correct.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="outcome">Outcome</Label>
        <Select value={data.outcome} onValueChange={(v) => update("outcome", v)}>
          <SelectTrigger id="outcome">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="injuryMechanism">Injury mechanism</Label>
            <Select
              value={data.injuryMechanism}
              onValueChange={(v) => update("injuryMechanism", v)}
            >
              <SelectTrigger id="injuryMechanism">
                <SelectValue placeholder="Select (if applicable)" />
              </SelectTrigger>
              <SelectContent>
                {INJURY_MECHANISM_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bodyPart">Body part</Label>
            <Input
              id="bodyPart"
              value={data.bodyPart}
              onChange={(e) => update("bodyPart", e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="injuryType">Nature of injury</Label>
          <Input
            id="injuryType"
            value={data.injuryType}
            onChange={(e) => update("injuryType", e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="referral">Referral</Label>
          <Select
            value={data.referral}
            onValueChange={(v) => update("referral", v as WizardData["referral"])}
          >
            <SelectTrigger id="referral">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFERRAL_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="lostWorkdays">Lost workdays</Label>
            <Input
              id="lostWorkdays"
              type="number"
              min={0}
              value={data.lostWorkdays}
              onChange={(e) => update("lostWorkdays", Number(e.target.value) || 0)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="restrictedDutyDays">Restricted-duty days</Label>
            <Input
              id="restrictedDutyDays"
              type="number"
              min={0}
              value={data.restrictedDutyDays}
              onChange={(e) => update("restrictedDutyDays", Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="grid gap-1">
          <Label>OSH reportable status</Label>
          <p className="text-muted-foreground text-sm">
            Pending determination — an H&amp;S officer assesses OSH reportability after the
            incident is created.
          </p>
        </div>

        <Alert>
          <AlertDescription>
            Detailed clinical notes are not captured here — record those on the restricted
            Medical tab after the incident is created.
          </AlertDescription>
        </Alert>
      </>
    </div>
  );
}

function StepSeverity({
  data,
  update,
  isHighPotential,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  isHighPotential: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <SeverityPicker
        label="Actual severity"
        prefix="S"
        value={data.actualSeverity}
        onChange={(v) => update("actualSeverity", v)}
      />
      <SeverityPicker
        label="Potential severity"
        prefix="P"
        value={data.potentialSeverity}
        onChange={(v) => update("potentialSeverity", v)}
      />

      {data.actualSeverity > 0 && data.potentialSeverity > 0 ? (
        <div className="flex flex-col gap-2">
          <Label>Actual vs potential</Label>
          <div className="grid grid-cols-5 gap-1">
            {SEVERITY_LEVELS.map((potentialRow) => (
              <div key={potentialRow.level} className="contents">
                {SEVERITY_LEVELS.map((actualCol) => {
                  const isCell =
                    potentialRow.level === data.potentialSeverity &&
                    actualCol.level === data.actualSeverity;
                  const severityScore = potentialRow.level + actualCol.level;
                  const bg =
                    severityScore >= 8
                      ? "bg-destructive/20"
                      : severityScore >= 5
                        ? "bg-warning/20"
                        : "bg-success/10";
                  return (
                    <div
                      key={actualCol.level}
                      className={`flex h-8 items-center justify-center rounded text-xs ${bg} ${isCell ? "ring-primary ring-2" : ""}`}
                    >
                      {isCell ? "●" : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Rows = potential severity (P1 top → P5 bottom), columns = actual severity (S1 left
            → S5 right).
          </p>
        </div>
      ) : null}

      {isHighPotential ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>High-potential classification (system-calculated)</AlertTitle>
          <AlertDescription>
            Actual or potential severity is 4 or higher, so this incident is automatically
            flagged high-potential. This cannot be manually overridden.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function SeverityPicker({
  label,
  prefix,
  value,
  onChange,
}: {
  label: string;
  prefix: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        {SEVERITY_LEVELS.map((level) => (
          <button
            key={level.level}
            type="button"
            onClick={() => onChange(level.level)}
            className={`flex-1 rounded-lg border px-2 py-3 text-center text-sm transition-colors ${
              value === level.level
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            <div className="font-semibold">
              {prefix}
              {level.level}
            </div>
            <div className="text-xs opacity-80">{level.label}</div>
          </button>
        ))}
      </div>
      {value > 0 ? (
        <p className="text-muted-foreground text-xs">
          {prefix}
          {value}: {SEVERITY_LEVELS.find((l) => l.level === value)?.description}
        </p>
      ) : null}
    </div>
  );
}

function StepImmediateControls({
  data,
  update,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {IMMEDIATE_CONTROL_OPTIONS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={data.immediateControls[key] ?? false}
              onCheckedChange={(checked) =>
                update("immediateControls", {
                  ...data.immediateControls,
                  [key]: checked === true,
                })
              }
            />
            {label}
          </label>
        ))}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="additionalAssistance">Additional assistance required</Label>
        <Textarea
          id="additionalAssistance"
          rows={2}
          value={data.additionalAssistance}
          onChange={(e) => update("additionalAssistance", e.target.value)}
        />
      </div>
      <Alert>
        <AlertDescription>
          Photograph/evidence of immediate control will be available once file storage is
          connected.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function StepWitnesses({
  data,
  addWitness,
  removeWitness,
  updateWitness,
}: {
  data: WizardData;
  addWitness: () => void;
  removeWitness: (index: number) => void;
  updateWitness: (index: number, patch: Partial<WitnessEntry>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Witnesses are optional — only add them if someone actually witnessed the event.
      </p>
      {data.witnesses.map((witness, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Witness {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeWitness(index)}
            >
              Remove
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Full name</Label>
              <Input
                value={witness.fullName}
                onChange={(e) => updateWitness(index, { fullName: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label>Contact / reference</Label>
              <Input
                value={witness.contact}
                onChange={(e) => updateWitness(index, { contact: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Statement summary</Label>
            <Textarea
              rows={2}
              value={witness.statementSummary}
              onChange={(e) => updateWitness(index, { statementSummary: e.target.value })}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={addWitness}>
        Add witness
      </Button>
      <Alert>
        <AlertDescription>
          File attachments will be available once Catalyst File Store is connected — not yet
          functional in this build.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function StepReview({
  data,
  update,
  properties,
  departments,
  isHighPotential,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  properties: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  isHighPotential: boolean;
}) {
  const propertyName = useMemo(
    () => properties.find((p) => p.id === data.propertyId)?.name ?? "—",
    [properties, data.propertyId],
  );
  const departmentName = useMemo(
    () => departments.find((d) => d.id === data.departmentId)?.name ?? "—",
    [departments, data.departmentId],
  );

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Property</dt>
        <dd>{propertyName}</dd>
        <dt className="text-muted-foreground">Department</dt>
        <dd>{departmentName}</dd>
        <dt className="text-muted-foreground">Occurred</dt>
        <dd>
          {data.incidentDate} {data.incidentTime}
        </dd>
        <dt className="text-muted-foreground">Location</dt>
        <dd>{data.locationDetail}</dd>
        <dt className="text-muted-foreground">Types</dt>
        <dd>
          {data.typeCodes
            .map((code) => INCIDENT_TYPE_OPTIONS.find(([c]) => c === code)?.[1] ?? code)
            .join(", ")}
        </dd>
        <dt className="text-muted-foreground">Title</dt>
        <dd>{data.title}</dd>
        <dt className="text-muted-foreground">Persons affected</dt>
        <dd>
          {data.personAffected === "yes"
            ? data.persons
                .map(
                  (p) =>
                    `${p.fullName} (${PERSON_TYPE_OPTIONS.find(([c]) => c === p.personType)?.[1] ?? p.personType})`,
                )
                .join(", ")
            : "None"}
        </dd>
        <dt className="text-muted-foreground">Injury outcome</dt>
        <dd>{OUTCOME_OPTIONS.find(([c]) => c === data.outcome)?.[1] ?? data.outcome}</dd>
        <dt className="text-muted-foreground">Severity</dt>
        <dd>
          S{data.actualSeverity} / P{data.potentialSeverity}{" "}
          {isHighPotential ? <Badge variant="destructive">High potential</Badge> : null}
        </dd>
        <dt className="text-muted-foreground">Witnesses</dt>
        <dd>{data.witnesses.length}</dd>
      </dl>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={data.reporterDeclaration}
          onCheckedChange={(checked) => update("reporterDeclaration", checked === true)}
        />
        I confirm the information above is accurate to the best of my knowledge.
      </label>
    </div>
  );
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { financialYearFor } from "@/server/kpi/period";
import { writeAuditLog } from "@/server/audit-log";
import { allocateIncidentNumber } from "@/server/incidents/number";
import { personDetailsSchema } from "@/server/incidents/person-details";
import { computeHighPotential, validateTypeSelections } from "@/server/incidents/wizard-rules";
import { hasDepartmentAccess, hasPropertyAccess, requireRole } from "@/server/permissions";

const REPORTER_ROLES = [
  "INCIDENT_REPORTER",
  "DUTY_MANAGER",
  "DEPARTMENT_MANAGER",
  "PROPERTY_HS_OFFICER",
  "GROUP_HS_ADMIN",
  "SUPER_ADMIN",
] as const;

const personEntrySchema = z.object({
  personType: z.enum(["employee", "trainee", "contractor", "guest", "visitor", "supplier", "public"]),
  fullName: z.string().min(1, "Full name is required for every affected person."),
  employeeOrReferenceNo: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const witnessEntrySchema = z.object({
  fullName: z.string().min(1),
  contact: z.string().optional(),
  statementSummary: z.string().optional(),
});

const typeSelectionSchema = z.object({
  code: z.string().min(1),
  isPrimary: z.boolean(),
});

export const submitIncidentReportSchema = z.object({
  // Step 1
  propertyId: z.string().min(1, "Property is required."),
  departmentId: z.string().min(1, "Department is required."),
  incidentDate: z.string().min(1, "Incident date is required."),
  incidentTime: z.string().min(1, "Incident time is required."),
  locationDetail: z.string().min(1, "Exact location is required."),
  hazardPresent: z.enum(["yes", "no", "unsure"]),
  areaIsolated: z.enum(["yes", "no", "not_required"]),
  emergencyServicesRequired: z.boolean(),

  // Step 2
  types: z.array(typeSelectionSchema).min(1, "Select at least one incident type."),
  title: z.string().min(1, "A short incident title is required."),
  description: z.string().min(1, "A factual description is required."),
  activity: z.string().optional(),
  equipmentInvolved: z.string().optional(),
  workStopped: z.boolean(),
  similarPrevious: z.boolean(),

  // Step 3
  persons: z.array(personEntrySchema),

  // Step 4
  outcome: z.string().min(1, "Outcome is required."),
  injuryMechanism: z.string().optional(),
  injuryType: z.string().optional(),
  bodyPart: z.string().optional(),
  referral: z.enum(["none", "hotel_doctor", "clinic", "hospital", "declined"]),
  lostWorkdays: z.coerce.number().int().min(0),
  restrictedDutyDays: z.coerce.number().int().min(0),

  // Step 5
  actualSeverity: z.coerce.number().int().min(1).max(5),
  potentialSeverity: z.coerce.number().int().min(1).max(5),

  // Step 6
  immediateControls: z.record(z.string(), z.boolean()),
  additionalAssistance: z.string().optional(),

  // Step 7
  witnesses: z.array(witnessEntrySchema),

  // Step 8
  reporterDeclaration: z.literal(true, {
    message: "The reporter declaration must be confirmed before submitting.",
  }),
});

export type SubmitIncidentReportInput = z.infer<typeof submitIncidentReportSchema>;

export interface SubmitIncidentReportResult {
  error?: string;
  incidentId?: string;
  incidentNumber?: string;
}

/**
 * Full incident-wizard submission (Phase 1 + 2 of the SafeGuard product upgrade brief — see chat).
 * Every write below happens against tables/columns that must exist in the deployed Catalyst schema
 * first (business_unit_code, incident_sequence, reference_year, financial_year on Incidents;
 * IncidentSequence; IncidentTypeSelections; IncidentWitnesses.incident_id) — this action will fail
 * at runtime until that migration is applied. See the migration spec in chat for exact DDL.
 */
export async function submitIncidentReportAction(
  input: SubmitIncidentReportInput,
): Promise<SubmitIncidentReportResult> {
  const ctx = await requireRole([...REPORTER_ROLES]);

  const parsed = submitIncidentReportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid incident report." };
  }
  const data = parsed.data;

  if (!hasPropertyAccess(ctx, data.propertyId)) {
    return { error: "No access to this property." };
  }
  if (!hasDepartmentAccess(ctx, data.propertyId, data.departmentId)) {
    return { error: "No access to this department." };
  }

  const typeResult = validateTypeSelections(data.types);
  if (!typeResult.ok) {
    return { error: typeResult.error };
  }

  // Validate every person's type-specific details against the same schema the single-person form
  // already used, per person — never partially accepted.
  const validatedPersons: Array<{
    personType: string;
    fullName: string;
    employeeOrReferenceNo: string | null;
    detailsJson: string | null;
  }> = [];
  for (const person of data.persons) {
    let details: unknown = null;
    if (person.details && Object.keys(person.details).length > 0) {
      const detailsResult = personDetailsSchema.safeParse({
        ...person.details,
        personType: person.personType,
      });
      if (!detailsResult.success) {
        return {
          error:
            `Please complete the ${person.personType} details section — ` +
            (detailsResult.error.issues[0]?.message ?? "some fields are missing."),
        };
      }
      details = detailsResult.data;
    }
    validatedPersons.push({
      personType: person.personType,
      fullName: person.fullName,
      employeeOrReferenceNo: person.employeeOrReferenceNo || null,
      detailsJson: details != null ? JSON.stringify(details) : null,
    });
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const propertyRows = (await datastore.table("Properties").getRows({
    criteria: `Properties.ROWID = '${data.propertyId}'`,
    maxRows: 1,
  })) as Array<CatalystRow & { code: string }>;
  const property = propertyRows[0];
  if (!property) {
    return { error: "Unknown property." };
  }

  let injuryMechanismId: string | null = null;
  if (data.injuryMechanism) {
    const mechanismRows = (await datastore.table("InjuryMechanisms").getRows({
      criteria: `InjuryMechanisms.code = '${data.injuryMechanism}'`,
      maxRows: 1,
    })) as CatalystRow[];
    injuryMechanismId = mechanismRows[0]?.ROWID ?? null;
  }

  const occurredAt = new Date(`${data.incidentDate}T${data.incidentTime}:00`);
  const createdAt = new Date();
  const referenceYear = String(createdAt.getUTCFullYear());
  const { fyLabel } = financialYearFor(occurredAt);
  const isHighPotential = computeHighPotential(data.actualSeverity, data.potentialSeverity);

  const immediateActionsText = Object.entries(data.immediateControls)
    .filter(([, checked]) => checked)
    .map(([key]) => key)
    .concat(data.additionalAssistance ? [`Additional assistance: ${data.additionalAssistance}`] : [])
    .join("; ");

  let incidentId: string;
  let allocatedIncidentNumber = "";
  try {
    incidentId = await allocateIncidentNumber(
      catalystApp,
      property.code,
      referenceYear,
      async (allocation) => {
        allocatedIncidentNumber = allocation.incidentNumber;
        const created = await datastore.table("Incidents").insertRow({
          incident_number: allocation.incidentNumber,
          incident_sequence: allocation.incidentSequence,
          reference_year: allocation.referenceYear,
          business_unit_code: allocation.businessUnitCode,
          financial_year: fyLabel,
          property_id: data.propertyId,
          department_id: data.departmentId,
          location_detail: data.locationDetail,
          occurred_at: occurredAt.toISOString(),
          reported_by: ctx.userId,
          person_event_type: data.persons[0]?.personType ?? "none",
          incident_type: typeResult.primaryCode,
          injury_mechanism_id: injuryMechanismId,
          injury_type: data.injuryType || null,
          body_part: data.bodyPart || null,
          outcome: data.outcome,
          actual_severity: data.actualSeverity,
          potential_severity: data.potentialSeverity,
          is_high_potential: isHighPotential,
          hospital_referral: data.referral === "hospital",
          lost_workdays: data.lostWorkdays,
          restricted_duty_days: data.restrictedDutyDays,
          immediate_actions: immediateActionsText || null,
          created_at: createdAt.toISOString(),
          updated_at: createdAt.toISOString(),
        });
        return String(created.ROWID);
      },
    );
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Could not allocate an incident number: ${err.message}`
          : "Could not allocate an incident number.",
    };
  }

  await Promise.all([
    ...typeResult.codes.map((code) =>
      datastore.table("IncidentTypeSelections").insertRow({
        incident_id: incidentId,
        type_code: code,
        is_primary: code === typeResult.primaryCode,
      }),
    ),
    ...validatedPersons.map((person) =>
      datastore.table("IncidentPersons").insertRow({
        incident_id: incidentId,
        person_event_type: person.personType,
        full_name: person.fullName,
        employee_or_reference_no: person.employeeOrReferenceNo,
        is_primary: validatedPersons[0] === person,
        details_json: person.detailsJson,
      }),
    ),
    ...data.witnesses.map((witness) =>
      datastore.table("IncidentWitnesses").insertRow({
        incident_id: incidentId,
        name: witness.fullName,
        contact: witness.contact || null,
        statement: witness.statementSummary || null,
      }),
    ),
    datastore.table("IncidentOSHReportability").insertRow({
      incident_id: incidentId,
      reportable_status: "pending_determination",
    }),
  ]);

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "Incidents",
    entityId: incidentId,
    propertyId: data.propertyId,
    departmentId: data.departmentId,
    newValue: { status: "reported", incidentNumber: allocatedIncidentNumber },
  });

  redirect(`/incidents/${incidentId}`);
}

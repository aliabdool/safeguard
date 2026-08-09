"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { writeAuditLog } from "@/server/audit-log";
import { nextIncidentNumber } from "@/server/incidents/number";
import { personDetailsSchema } from "@/server/incidents/person-details";
import {
  hasDepartmentAccess,
  hasPropertyAccess,
  requireActiveUser,
  requireRole,
} from "@/server/permissions";

const INJURY_MECHANISMS = [
  "slip_trip_fall_same_level",
  "fall_from_height",
  "cut_laceration",
  "burn_scald",
  "manual_handling",
  "struck_by_object",
  "struck_against_object",
  "falling_object",
  "chemical_exposure",
  "electrical_contact",
  "vehicle_related",
  "ergonomic_repetitive_strain",
  "food_allergen_exposure",
  "marine_swimming",
  "other",
] as const;

const REPORTER_ROLES = [
  "INCIDENT_REPORTER",
  "DUTY_MANAGER",
  "DEPARTMENT_MANAGER",
  "PROPERTY_HS_OFFICER",
  "GROUP_HS_ADMIN",
  "SUPER_ADMIN",
] as const;

const createIncidentSchema = z.object({
  propertyId: z.string(),
  departmentId: z.string(),
  locationDetail: z.string().optional(),
  occurredAt: z.string().min(1, "Date/time of occurrence is required."),
  personType: z.enum([
    "employee",
    "trainee",
    "contractor",
    "guest",
    "visitor",
    "supplier",
    "public",
    "none",
    "near_miss",
    "unsafe_condition",
  ]),
  personName: z.string().optional(),
  employeeNumber: z.string().optional(),
  employeeDepartment: z.string().optional(),
  employeeJobTitle: z.string().optional(),
  employeeHrConfirmed: z.boolean().optional(),
  traineeInstitution: z.string().optional(),
  traineeSupervisor: z.string().optional(),
  traineeDepartment: z.string().optional(),
  traineeInductionStatus: z.enum(["completed", "in_progress", "not_started"]).optional(),
  contractorCompany: z.string().optional(),
  contractorOwner: z.string().optional(),
  contractorPermitStatus: z.enum(["valid", "expired", "not_required", "pending"]).optional(),
  contractorInductionCompleted: z.boolean().optional(),
  guestRoomNumber: z.string().optional(),
  guestRelationsFollowUp: z.boolean().optional(),
  guestMedicalReferral: z.boolean().optional(),
  guestInsuranceNotified: z.boolean().optional(),
  incidentType: z.string().min(1, "Incident type is required."),
  injuryMechanism: z.enum(INJURY_MECHANISMS).optional().or(z.literal("")),
  injuryType: z.string().optional(),
  bodyPart: z.string().optional(),
  outcome: z.string().min(1, "Outcome is required."),
  actualSeverity: z.coerce.number().int().min(1).max(5),
  potentialSeverity: z.coerce.number().int().min(1).max(5),
  isHighPotential: z.boolean(),
  treatment: z.string().optional(),
  hospitalReferral: z.boolean(),
  reportableStatus: z.enum(["yes", "no", "pending_determination"]),
  lostWorkdays: z.coerce.number().int().min(0),
  restrictedDutyDays: z.coerce.number().int().min(0),
  incidentCost: z.coerce.number().min(0),
  businessInterruptionDays: z.coerce.number().int().min(0),
  immediateActions: z.string().optional(),
});

export async function createIncidentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole([...REPORTER_ROLES]);

  const parsed = createIncidentSchema.safeParse({
    propertyId: formData.get("propertyId"),
    departmentId: formData.get("departmentId"),
    locationDetail: formData.get("locationDetail") ?? undefined,
    occurredAt: formData.get("occurredAt"),
    personType: formData.get("personType"),
    personName: formData.get("personName") ?? undefined,
    employeeNumber: formData.get("employeeNumber") ?? undefined,
    employeeDepartment: formData.get("employeeDepartment") ?? undefined,
    employeeJobTitle: formData.get("employeeJobTitle") ?? undefined,
    employeeHrConfirmed: formData.get("employeeHrConfirmed") === "on",
    traineeInstitution: formData.get("traineeInstitution") ?? undefined,
    traineeSupervisor: formData.get("traineeSupervisor") ?? undefined,
    traineeDepartment: formData.get("traineeDepartment") ?? undefined,
    traineeInductionStatus: formData.get("traineeInductionStatus") || undefined,
    contractorCompany: formData.get("contractorCompany") ?? undefined,
    contractorOwner: formData.get("contractorOwner") ?? undefined,
    contractorPermitStatus: formData.get("contractorPermitStatus") || undefined,
    contractorInductionCompleted: formData.get("contractorInductionCompleted") === "on",
    guestRoomNumber: formData.get("guestRoomNumber") ?? undefined,
    guestRelationsFollowUp: formData.get("guestRelationsFollowUp") === "on",
    guestMedicalReferral: formData.get("guestMedicalReferral") === "on",
    guestInsuranceNotified: formData.get("guestInsuranceNotified") === "on",
    incidentType: formData.get("incidentType"),
    injuryMechanism: formData.get("injuryMechanism") ?? undefined,
    injuryType: formData.get("injuryType") ?? undefined,
    bodyPart: formData.get("bodyPart") ?? undefined,
    outcome: formData.get("outcome"),
    actualSeverity: formData.get("actualSeverity"),
    potentialSeverity: formData.get("potentialSeverity"),
    isHighPotential: formData.get("isHighPotential") === "on",
    treatment: formData.get("treatment") ?? undefined,
    hospitalReferral: formData.get("hospitalReferral") === "on",
    reportableStatus: formData.get("reportableStatus") || "pending_determination",
    lostWorkdays: formData.get("lostWorkdays") || 0,
    restrictedDutyDays: formData.get("restrictedDutyDays") || 0,
    incidentCost: formData.get("incidentCost") || 0,
    businessInterruptionDays: formData.get("businessInterruptionDays") || 0,
    immediateActions: formData.get("immediateActions") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid incident details." };
  }
  const data = parsed.data;

  // Person-type-specific structured fields are optional (a reporter can submit without filling
  // that section in), but if any field in the section was touched, the whole section must
  // validate against person-details.ts's shape for the selected person type — never partially
  // accepted.
  let rawPersonDetails: Record<string, unknown> | null = null;
  if (data.personType === "employee") {
    const touched = data.employeeNumber || data.employeeDepartment || data.employeeJobTitle;
    if (touched) {
      rawPersonDetails = {
        employeeNumber: data.employeeNumber,
        department: data.employeeDepartment,
        jobTitle: data.employeeJobTitle,
        hrConfirmed: data.employeeHrConfirmed ?? false,
      };
    }
  } else if (data.personType === "trainee") {
    const touched = data.traineeInstitution || data.traineeSupervisor || data.traineeDepartment;
    if (touched) {
      rawPersonDetails = {
        trainingInstitution: data.traineeInstitution,
        placementSupervisor: data.traineeSupervisor,
        trainingDepartment: data.traineeDepartment,
        inductionStatus: data.traineeInductionStatus,
      };
    }
  } else if (data.personType === "contractor") {
    const touched = data.contractorCompany || data.contractorOwner;
    if (touched) {
      rawPersonDetails = {
        contractorCompany: data.contractorCompany,
        contractOwner: data.contractorOwner,
        permitToWorkStatus: data.contractorPermitStatus,
        contractorInductionCompleted: data.contractorInductionCompleted ?? false,
      };
    }
  } else if (data.personType === "guest") {
    rawPersonDetails = {
      roomNumber: data.guestRoomNumber || undefined,
      guestRelationsFollowUp: data.guestRelationsFollowUp ?? false,
      medicalReferral: data.guestMedicalReferral ?? false,
      insuranceNotified: data.guestInsuranceNotified ?? false,
    };
  }

  let personDetails: unknown = null;
  if (rawPersonDetails) {
    const detailsResult = personDetailsSchema.safeParse({
      ...rawPersonDetails,
      personType: data.personType,
    });
    if (!detailsResult.success) {
      return {
        error:
          `Please complete the ${data.personType} details section — ` +
          (detailsResult.error.issues[0]?.message ?? "some fields are missing."),
      };
    }
    personDetails = detailsResult.data;
  }

  if (!hasPropertyAccess(ctx, data.propertyId)) {
    return { error: "No access to this property." };
  }
  if (!hasDepartmentAccess(ctx, data.propertyId, data.departmentId)) {
    return { error: "No access to this department." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const propertyRows = (await datastore
    .table("Properties")
    .getRows({ criteria: `Properties.ROWID = '${data.propertyId}'`, maxRows: 1 })) as Array<
    CatalystRow & { code: string }
  >;
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

  let incidentId: string | undefined;
  for (let attempt = 0; attempt < 3 && !incidentId; attempt++) {
    const incidentNumber = await nextIncidentNumber(catalystApp, property.code, data.propertyId);
    try {
      const created = await datastore.table("Incidents").insertRow({
        incident_number: incidentNumber,
        property_id: data.propertyId,
        department_id: data.departmentId,
        location_detail: data.locationDetail ?? null,
        occurred_at: new Date(data.occurredAt).toISOString(),
        reported_by: ctx.userId,
        person_event_type: data.personType,
        incident_type: data.incidentType,
        injury_mechanism_id: injuryMechanismId,
        injury_type: data.injuryType ?? null,
        body_part: data.bodyPart ?? null,
        outcome: data.outcome,
        actual_severity: data.actualSeverity,
        potential_severity: data.potentialSeverity,
        is_high_potential: data.isHighPotential,
        treatment: data.treatment ?? null,
        hospital_referral: data.hospitalReferral,
        lost_workdays: data.lostWorkdays,
        restricted_duty_days: data.restrictedDutyDays,
        incident_cost: data.incidentCost,
        business_interruption_days: data.businessInterruptionDays,
        immediate_actions: data.immediateActions ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      incidentId = String(created.ROWID);
    } catch (err) {
      // Unique-violation race on incident_number under concurrent creation — retry with a
      // freshly computed number. Any other error propagates.
      if (attempt === 2) throw err;
    }
  }
  if (!incidentId) {
    return { error: "Could not allocate an incident number. Try again." };
  }

  await datastore.table("IncidentPersons").insertRow({
    incident_id: incidentId,
    person_event_type: data.personType,
    full_name: data.personName ?? null,
    is_primary: true,
    details_json: personDetails != null ? JSON.stringify(personDetails) : null,
  });

  // The statutory-notification determination is its own table in Catalyst (deliberately separate
  // from hospital_referral — see 03-incidents.json) — the reporter's initial call is recorded here
  // rather than as a column on Incidents.
  await datastore.table("IncidentOSHReportability").insertRow({
    incident_id: incidentId,
    reportable_status: data.reportableStatus,
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "Incidents",
    entityId: incidentId,
    propertyId: data.propertyId,
    departmentId: data.departmentId,
    newValue: { status: "reported" },
  });

  revalidatePath("/incidents");
  redirect(`/incidents/${incidentId}`);
}

/**
 * TODO(Phase D): file upload still targeted Supabase Storage and a Postgres files.id — that ID
 * can't be stored in Catalyst's IncidentAttachments.file_id (which references Catalyst's own Files
 * table, 13-files.json), and the Postgres incident_attachments table's FK to incidents.id no
 * longer resolves now that incidents are created in Catalyst, not Postgres. Wiring this up
 * correctly requires the storage migration to Catalyst File Store first; until then this action
 * intentionally errors rather than silently writing a dangling/wrong reference. Signature kept
 * identical to the pre-migration version so attachment-upload.tsx still typechecks unchanged.
 */
export async function requestIncidentAttachmentUploadAction(_input: {
  incidentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isPhoto: boolean;
}): Promise<{ fileId: string; storagePath: string; token: string }> {
  throw new Error(
    "Photo/document upload is temporarily unavailable during the migration to Zoho Catalyst — file storage has not moved over yet.",
  );
}

export async function confirmIncidentAttachmentAction(_input: {
  incidentId: string;
  fileId: string;
  isPhoto: boolean;
  caption?: string;
}): Promise<void> {
  throw new Error(
    "Photo/document upload is temporarily unavailable during the migration to Zoho Catalyst — file storage has not moved over yet.",
  );
}

const notifySchema = z.object({
  incidentId: z.string(),
  notifiedParty: z.string().min(1),
  method: z.string().optional(),
});

export async function recordIncidentNotificationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = notifySchema.safeParse({
    incidentId: formData.get("incidentId"),
    notifiedParty: formData.get("notifiedParty"),
    method: formData.get("method") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Notified party is required." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const incidentRows = (await datastore.table("Incidents").getRows({
    criteria: `Incidents.ROWID = '${parsed.data.incidentId}'`,
    maxRows: 1,
  })) as Array<CatalystRow & { property_id: string }>;
  const incident = incidentRows[0];
  if (!incident || !hasPropertyAccess(ctx, incident.property_id)) {
    return { error: "No access to this incident." };
  }

  await datastore.table("IncidentNotifications").insertRow({
    incident_id: parsed.data.incidentId,
    notified_party: parsed.data.notifiedParty,
    method: parsed.data.method ?? null,
    notified_by: ctx.userId,
    notified_at: new Date().toISOString(),
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}`);
  return {};
}

/** Status machine: reported -> investigating -> corrective_action -> verifying -> closed. */
const STATUS_ORDER = [
  "reported",
  "investigating",
  "corrective_action",
  "verifying",
  "closed",
] as const;
type IncidentStatus = (typeof STATUS_ORDER)[number];

export async function advanceIncidentStatusAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const incidentId = formData.get("incidentId")?.toString();
  const targetStatus = formData.get("targetStatus")?.toString() as IncidentStatus | undefined;
  if (!incidentId || !targetStatus || !STATUS_ORDER.includes(targetStatus)) {
    return { error: "Invalid request." };
  }

  const ctx = await requireRole([
    "PROPERTY_HS_OFFICER",
    "GROUP_HS_ADMIN",
    "SUPER_ADMIN",
    "DUTY_MANAGER",
    "DEPARTMENT_MANAGER",
  ]);

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const incidentRows = (await datastore.table("Incidents").getRows({
    criteria: `Incidents.ROWID = '${incidentId}'`,
    maxRows: 1,
  })) as Array<CatalystRow & { property_id: string; department_id: string; status: string }>;
  const incident = incidentRows[0];
  if (!incident) {
    return { error: "Unknown incident." };
  }
  if (!hasPropertyAccess(ctx, incident.property_id)) {
    return { error: "No access to this incident." };
  }

  const currentIndex = STATUS_ORDER.indexOf(incident.status as IncidentStatus);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);
  if (targetIndex !== currentIndex + 1) {
    return {
      error: `Cannot move from '${incident.status}' to '${targetStatus}' — the workflow only advances one step at a time (Report → Investigate → Corrective Action → Verify → Close).`,
    };
  }

  if (targetStatus === "closed" || targetStatus === "verifying") {
    const linkedCapaRows = (await datastore.table("CAPA").getRows({
      criteria: `CAPA.source_type = 'incident' and CAPA.source_id = '${incidentId}'`,
    })) as Array<CatalystRow & { status: string }>;
    const openCapas = linkedCapaRows.filter(
      (c) => c.status !== "closed" && c.status !== "verified",
    );
    if (targetStatus === "closed" && openCapas.length > 0) {
      return {
        error: "All linked corrective actions must be verified/closed before closing the incident.",
      };
    }
  }

  await datastore.table("Incidents").updateRow({
    ROWID: incidentId,
    status: targetStatus,
    updated_at: new Date().toISOString(),
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "status_changed",
    entityType: "Incidents",
    entityId: incidentId,
    propertyId: incident.property_id,
    departmentId: incident.department_id,
    previousValue: { status: incident.status },
    newValue: { status: targetStatus },
  });

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/incidents");
  return {};
}

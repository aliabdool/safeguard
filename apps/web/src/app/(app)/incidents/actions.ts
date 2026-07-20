"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import {
  capaActions,
  incidentAttachments,
  incidentNotifications,
  incidentPersons,
  incidents,
  properties,
} from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { nextIncidentNumber } from "@/server/incidents/number";
import { personDetailsSchema } from "@/server/incidents/person-details";
import {
  hasDepartmentAccess,
  hasPropertyAccess,
  requireActiveUser,
  requireRole,
} from "@/server/permissions";
import { confirmUpload, createUploadUrl, FileValidationError } from "@/server/storage";

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
  propertyId: z.string().uuid(),
  departmentId: z.string().uuid(),
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
    const touched =
      data.traineeInstitution || data.traineeSupervisor || data.traineeDepartment;
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

  const db = getDb();
  const [property] = await db
    .select({ code: properties.code })
    .from(properties)
    .where(eq(properties.id, data.propertyId))
    .limit(1);
  if (!property) {
    return { error: "Unknown property." };
  }

  let incidentId: string | undefined;
  for (let attempt = 0; attempt < 3 && !incidentId; attempt++) {
    const incidentNumber = await nextIncidentNumber(property.code, data.propertyId);
    try {
      const [created] = await db
        .insert(incidents)
        .values({
          incidentNumber,
          propertyId: data.propertyId,
          departmentId: data.departmentId,
          locationDetail: data.locationDetail ?? null,
          occurredAt: new Date(data.occurredAt),
          reportedBy: ctx.userId,
          personType: data.personType,
          incidentType: data.incidentType,
          injuryMechanism: data.injuryMechanism || null,
          injuryType: data.injuryType ?? null,
          bodyPart: data.bodyPart ?? null,
          outcome: data.outcome,
          actualSeverity: data.actualSeverity,
          potentialSeverity: data.potentialSeverity,
          isHighPotential: data.isHighPotential,
          treatment: data.treatment ?? null,
          hospitalReferral: data.hospitalReferral,
          reportableStatus: data.reportableStatus,
          lostWorkdays: data.lostWorkdays,
          restrictedDutyDays: data.restrictedDutyDays,
          incidentCost: String(data.incidentCost),
          businessInterruptionDays: data.businessInterruptionDays,
          immediateActions: data.immediateActions ?? null,
        })
        .returning({ id: incidents.id });
      incidentId = created!.id;
    } catch (err) {
      // Unique-violation race on incident_number under concurrent creation — retry with a
      // freshly computed number. Any other error propagates.
      if (attempt === 2) throw err;
    }
  }
  if (!incidentId) {
    return { error: "Could not allocate an incident number. Try again." };
  }

  await db.insert(incidentPersons).values({
    incidentId,
    personType: data.personType,
    fullName: data.personName ?? null,
    isPrimary: true,
    details: personDetails,
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "incidents",
    entityId: incidentId,
    propertyId: data.propertyId,
    departmentId: data.departmentId,
    newValue: { status: "reported" },
  });

  revalidatePath("/incidents");
  redirect(`/incidents/${incidentId}`);
}

const attachmentSchema = z.object({
  incidentId: z.string().uuid(),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.coerce.number().int().positive(),
  isPhoto: z.boolean(),
});

export async function requestIncidentAttachmentUploadAction(input: {
  incidentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isPhoto: boolean;
}) {
  const ctx = await requireActiveUser();
  const parsed = attachmentSchema.parse(input);

  const db = getDb();
  const [incident] = await db
    .select({ propertyId: incidents.propertyId, departmentId: incidents.departmentId })
    .from(incidents)
    .where(eq(incidents.id, parsed.incidentId))
    .limit(1);
  if (!incident) {
    throw new Error("Unknown incident.");
  }
  if (!hasPropertyAccess(ctx, incident.propertyId)) {
    throw new Error("No access to this incident.");
  }

  try {
    const upload = await createUploadUrl({
      bucket: "incident-evidence",
      filename: parsed.filename,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      uploadedBy: ctx.userId,
    });
    return upload;
  } catch (err) {
    if (err instanceof FileValidationError) {
      throw new Error(err.message);
    }
    throw err;
  }
}

const confirmAttachmentSchema = z.object({
  incidentId: z.string().uuid(),
  fileId: z.string().uuid(),
  isPhoto: z.boolean(),
  caption: z.string().optional(),
});

export async function confirmIncidentAttachmentAction(input: {
  incidentId: string;
  fileId: string;
  isPhoto: boolean;
  caption?: string;
}) {
  const ctx = await requireActiveUser();
  const parsed = confirmAttachmentSchema.parse(input);

  await confirmUpload(parsed.fileId);

  const db = getDb();
  await db.insert(incidentAttachments).values({
    incidentId: parsed.incidentId,
    fileId: parsed.fileId,
    isPhoto: parsed.isPhoto,
    caption: parsed.caption ?? null,
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "document_uploaded",
    entityType: "incident_attachments",
    entityId: parsed.fileId,
  });

  revalidatePath(`/incidents/${parsed.incidentId}`);
}

const notifySchema = z.object({
  incidentId: z.string().uuid(),
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

  const db = getDb();
  const [incident] = await db
    .select({ propertyId: incidents.propertyId })
    .from(incidents)
    .where(eq(incidents.id, parsed.data.incidentId))
    .limit(1);
  if (!incident || !hasPropertyAccess(ctx, incident.propertyId)) {
    return { error: "No access to this incident." };
  }

  await db.insert(incidentNotifications).values({
    incidentId: parsed.data.incidentId,
    notifiedParty: parsed.data.notifiedParty,
    method: parsed.data.method ?? null,
    notifiedBy: ctx.userId,
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

  const db = getDb();
  const [incident] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, incidentId))
    .limit(1);
  if (!incident) {
    return { error: "Unknown incident." };
  }
  if (!hasPropertyAccess(ctx, incident.propertyId)) {
    return { error: "No access to this incident." };
  }

  const currentIndex = STATUS_ORDER.indexOf(incident.status);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);
  if (targetIndex !== currentIndex + 1) {
    return {
      error: `Cannot move from '${incident.status}' to '${targetStatus}' — the workflow only advances one step at a time (Report → Investigate → Corrective Action → Verify → Close).`,
    };
  }

  if (targetStatus === "closed" || targetStatus === "verifying") {
    const linkedCapas = await db
      .select({ status: capaActions.status })
      .from(capaActions)
      .where(
        and(eq(capaActions.sourceType, "incident"), eq(capaActions.sourceId, incidentId)),
      );
    const openCapas = linkedCapas.filter(
      (c) => c.status !== "closed" && c.status !== "verified",
    );
    if (targetStatus === "closed" && openCapas.length > 0) {
      return {
        error:
          "All linked corrective actions must be verified/closed before closing the incident.",
      };
    }
  }

  await db
    .update(incidents)
    .set({ status: targetStatus, updatedAt: new Date() })
    .where(eq(incidents.id, incidentId));

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "status_changed",
    entityType: "incidents",
    entityId: incidentId,
    propertyId: incident.propertyId,
    departmentId: incident.departmentId,
    previousValue: { status: incident.status },
    newValue: { status: targetStatus },
  });

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/incidents");
  return {};
}

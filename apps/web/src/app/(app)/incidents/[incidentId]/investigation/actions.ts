"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { writeAuditLog } from "@/server/audit-log";
import { hasPropertyAccess, requireActiveUser, requireRole } from "@/server/permissions";

const assignSchema = z.object({
  incidentId: z.string(),
  investigatorId: z.string(),
});

export async function assignInvestigatorAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole(["PROPERTY_HS_OFFICER", "GROUP_HS_ADMIN", "SUPER_ADMIN"]);
  const parsed = assignSchema.safeParse({
    incidentId: formData.get("incidentId"),
    investigatorId: formData.get("investigatorId"),
  });
  if (!parsed.success) {
    return { error: "Invalid investigator selection." };
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

  // Data Store has no upsert/onConflictDoUpdate — IncidentInvestigation.incident_id is unique per
  // the schema, so check for an existing row first rather than risk a duplicate-key failure.
  const existingRows = (await datastore.table("IncidentInvestigation").getRows({
    criteria: `IncidentInvestigation.incident_id = '${parsed.data.incidentId}'`,
    maxRows: 1,
  })) as CatalystRow[];
  const existing = existingRows[0];

  if (existing) {
    await datastore.table("IncidentInvestigation").updateRow({
      ROWID: existing.ROWID,
      investigator_id: parsed.data.investigatorId,
      status: "assigned",
    });
  } else {
    await datastore.table("IncidentInvestigation").insertRow({
      incident_id: parsed.data.incidentId,
      investigator_id: parsed.data.investigatorId,
      status: "assigned",
      assigned_at: new Date().toISOString(),
    });
  }

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "IncidentInvestigation",
    entityId: parsed.data.incidentId,
    newValue: { investigatorId: parsed.data.investigatorId },
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

const causeSchema = z.object({
  investigationId: z.string(),
  incidentId: z.string(),
  causeType: z.enum(["immediate", "root"]),
  category: z.string().optional(),
  description: z.string().min(1, "Description is required."),
});

export async function addCauseAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireActiveUser();
  const parsed = causeSchema.safeParse({
    investigationId: formData.get("investigationId"),
    incidentId: formData.get("incidentId"),
    causeType: formData.get("causeType"),
    category: formData.get("category") ?? undefined,
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid cause." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  await catalystApp.datastore().table("IncidentRootCauses").insertRow({
    investigation_id: parsed.data.investigationId,
    cause_type: parsed.data.causeType,
    category: parsed.data.category ?? null,
    description: parsed.data.description,
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

const fiveWhySchema = z.object({
  investigationId: z.string(),
  incidentId: z.string(),
  sequence: z.coerce.number().int().min(1).max(5),
  question: z.string().min(1),
  answer: z.string().optional(),
});

export async function addFiveWhyAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireActiveUser();
  const parsed = fiveWhySchema.safeParse({
    investigationId: formData.get("investigationId"),
    incidentId: formData.get("incidentId"),
    sequence: formData.get("sequence"),
    question: formData.get("question"),
    answer: formData.get("answer") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid entry." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  await catalystApp.datastore().table("IncidentFiveWhys").insertRow({
    investigation_id: parsed.data.investigationId,
    sequence: parsed.data.sequence,
    question: parsed.data.question,
    answer: parsed.data.answer ?? null,
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

const witnessSchema = z.object({
  investigationId: z.string(),
  incidentId: z.string(),
  name: z.string().min(1),
  role: z.string().optional(),
  statement: z.string().optional(),
  contact: z.string().optional(),
});

export async function addWitnessAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireActiveUser();
  const parsed = witnessSchema.safeParse({
    investigationId: formData.get("investigationId"),
    incidentId: formData.get("incidentId"),
    name: formData.get("name"),
    role: formData.get("role") ?? undefined,
    statement: formData.get("statement") ?? undefined,
    contact: formData.get("contact") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid witness." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  await catalystApp.datastore().table("IncidentWitnesses").insertRow({
    investigation_id: parsed.data.investigationId,
    name: parsed.data.name,
    role: parsed.data.role ?? null,
    statement: parsed.data.statement ?? null,
    contact: parsed.data.contact ?? null,
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

const reconstructionSchema = z.object({
  investigationId: z.string(),
  incidentId: z.string(),
  eventReconstruction: z
    .string()
    .min(1, "Event reconstruction is required to complete the investigation."),
});

export async function completeInvestigationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = reconstructionSchema.safeParse({
    investigationId: formData.get("investigationId"),
    incidentId: formData.get("incidentId"),
    eventReconstruction: formData.get("eventReconstruction"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Event reconstruction is required." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const investigationRows = (await datastore.table("IncidentInvestigation").getRows({
    criteria: `IncidentInvestigation.ROWID = '${parsed.data.investigationId}'`,
    maxRows: 1,
  })) as Array<CatalystRow & { investigator_id: string }>;
  const investigation = investigationRows[0];
  if (!investigation) {
    return { error: "Unknown investigation." };
  }
  if (investigation.investigator_id !== ctx.userId) {
    const isElevated = ["PROPERTY_HS_OFFICER", "GROUP_HS_ADMIN", "SUPER_ADMIN"].some((r) =>
      ctx.roleCodes.includes(r as (typeof ctx.roleCodes)[number]),
    );
    if (!isElevated) {
      return {
        error: "Only the assigned investigator (or an H&S officer/admin) can complete this.",
      };
    }
  }

  await datastore.table("IncidentInvestigation").updateRow({
    ROWID: parsed.data.investigationId,
    event_reconstruction: parsed.data.eventReconstruction,
    status: "completed",
    completed_at: new Date().toISOString(),
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "status_changed",
    entityType: "IncidentInvestigation",
    entityId: parsed.data.investigationId,
    newValue: { status: "completed" },
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

const approveSchema = z.object({
  investigationId: z.string(),
  incidentId: z.string(),
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().optional(),
});

export async function approveInvestigationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole(["PROPERTY_HS_OFFICER", "GROUP_HS_ADMIN", "SUPER_ADMIN"]);
  const parsed = approveSchema.safeParse({
    investigationId: formData.get("investigationId"),
    incidentId: formData.get("incidentId"),
    decision: formData.get("decision"),
    comment: formData.get("comment") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid approval." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  await datastore.table("InvestigationApprovals").insertRow({
    investigation_id: parsed.data.investigationId,
    approver_id: ctx.userId,
    decision: parsed.data.decision,
    comment: parsed.data.comment ?? null,
    decided_at: new Date().toISOString(),
  });

  await datastore.table("IncidentInvestigation").updateRow({
    ROWID: parsed.data.investigationId,
    status: parsed.data.decision === "approved" ? "approved" : "in_progress",
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: parsed.data.decision === "approved" ? "approval" : "rejection",
    entityType: "IncidentInvestigation",
    entityId: parsed.data.investigationId,
    reason: parsed.data.comment ?? null,
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

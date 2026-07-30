"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { writeAuditLog } from "@/server/audit-log";
import { nextCapaActionNumber } from "@/server/capa/number";
import { hasPropertyAccess, requireActiveUser, requireRole } from "@/server/permissions";

const ELEVATED_ROLES = ["PROPERTY_HS_OFFICER", "GROUP_HS_ADMIN", "SUPER_ADMIN"] as const;

interface CapaRow extends CatalystRow {
  property_id: string;
  department_id: string;
  owner_id: string;
  verifier_id: string;
  status: string;
}

// Note: userId/capaId/propertyId/departmentId etc. are Catalyst ROWID strings now, not Postgres
// UUIDs — the `.uuid()` refinements that used to guard these fields have been dropped throughout
// this file (matching the incidents-module rewrite).
const createSchema = z.object({
  sourceType: z.enum([
    "incident",
    "audit_finding",
    "legal_gap",
    "inspection",
    "management_review",
  ]),
  sourceId: z.string(),
  description: z.string().min(1, "Description is required."),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  preventiveAction: z.string().optional(),
  hierarchyOfControl: z
    .enum(["elimination", "substitution", "engineering", "administrative", "ppe"])
    .optional()
    .or(z.literal("")),
  ownerId: z.string(),
  propertyId: z.string(),
  departmentId: z.string().optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high", "critical"]),
  dueDate: z.string().min(1, "Due date is required."),
  cost: z.coerce.number().min(0).optional(),
  requiredEvidence: z.string().optional(),
  verificationOwnerId: z.string(),
});

export async function createCapaAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();

  const parsed = createSchema.safeParse({
    sourceType: formData.get("sourceType"),
    sourceId: formData.get("sourceId"),
    description: formData.get("description"),
    rootCause: formData.get("rootCause") ?? undefined,
    correctiveAction: formData.get("correctiveAction") ?? undefined,
    preventiveAction: formData.get("preventiveAction") ?? undefined,
    hierarchyOfControl: formData.get("hierarchyOfControl") ?? "",
    ownerId: formData.get("ownerId"),
    propertyId: formData.get("propertyId"),
    departmentId: formData.get("departmentId") ?? "",
    priority: formData.get("priority"),
    dueDate: formData.get("dueDate"),
    cost: formData.get("cost") || undefined,
    requiredEvidence: formData.get("requiredEvidence") ?? undefined,
    verificationOwnerId: formData.get("verificationOwnerId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid corrective action." };
  }
  const data = parsed.data;

  // The rule management named explicitly, by name: "CAPA owner and verifier must always be
  // different people." Mirrors isValidOwnerVerifierPair() in
  // apps/catalyst/functions/shared/pure/capa-workflow.ts.
  if (data.ownerId === data.verificationOwnerId) {
    return {
      error: "The action owner cannot also be the verifier — pick a different verifier.",
    };
  }
  if (!hasPropertyAccess(ctx, data.propertyId)) {
    return { error: "No access to this property." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  let capaId: string | undefined;
  for (let attempt = 0; attempt < 3 && !capaId; attempt++) {
    const actionNumber = await nextCapaActionNumber(catalystApp);
    try {
      const created = await datastore.table("CAPA").insertRow({
        capa_number: actionNumber,
        property_id: data.propertyId,
        department_id: data.departmentId || null,
        // No dedicated "title" field exists in the Postgres schema or the CAPA form — Catalyst's
        // CAPA.title is notNull, so it's populated from the description rather than adding a new
        // form field (which would be a feature the company never asked for).
        title: data.description,
        description: data.description,
        source_type: data.sourceType,
        source_id: data.sourceId,
        owner_id: data.ownerId,
        verifier_id: data.verificationOwnerId,
        due_date: data.dueDate,
        status: "open",
        capa_priority: data.priority,
        root_cause: data.rootCause ?? null,
        corrective_action: data.correctiveAction ?? null,
        preventive_action: data.preventiveAction ?? null,
        hierarchy_of_control: data.hierarchyOfControl || null,
        cost: data.cost != null ? data.cost : null,
        required_evidence: data.requiredEvidence ?? null,
        created_by: ctx.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      capaId = String(created.ROWID);
    } catch (err) {
      // Unique-violation race on capa_number under concurrent creation — retry with a freshly
      // computed number. Any other error propagates.
      if (attempt === 2) throw err;
    }
  }
  if (!capaId) {
    return { error: "Could not allocate a corrective-action number. Try again." };
  }

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "CAPA",
    entityId: capaId,
    propertyId: data.propertyId,
    departmentId: data.departmentId || null,
    newValue: { sourceType: data.sourceType, sourceId: data.sourceId, status: "open" },
  });

  // TODO(notifications phase): the pre-migration version scheduled a "capa_due_soon" reminder
  // (3 days before due date) via Postgres's scheduled_reminders table, processed by
  // /api/cron/reminders. Catalyst has no equivalent table yet (that's the notifications module's
  // own migration slice, 12-notifications.json / apps/web/src/server/cron — out of scope here and
  // actively being worked on in a parallel worktree), so this intentionally does not write a
  // dangling reminder into a table that doesn't exist. Wire this back up once that table lands.

  revalidatePath("/capa");
  redirect(`/capa/${capaId}`);
}

const verifySchema = z.object({
  capaId: z.string(),
  outcome: z.enum(["effective", "not_effective"]),
  comment: z.string().optional(),
});

export async function verifyCapaAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = verifySchema.safeParse({
    capaId: formData.get("capaId"),
    outcome: formData.get("outcome"),
    comment: formData.get("comment") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid verification." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const capaRows = (await datastore.table("CAPA").getRows({
    criteria: `CAPA.ROWID == '${parsed.data.capaId}'`,
    maxRows: 1,
  })) as CapaRow[];
  const capa = capaRows[0];
  if (!capa || !hasPropertyAccess(ctx, capa.property_id)) {
    return { error: "No access to this corrective action." };
  }
  if (capa.owner_id === ctx.userId) {
    return { error: "The action owner cannot verify their own corrective action." };
  }
  if (capa.verifier_id !== ctx.userId) {
    const isElevated = ELEVATED_ROLES.some((r) =>
      ctx.roleCodes.includes(r as (typeof ctx.roleCodes)[number]),
    );
    if (!isElevated) {
      return {
        error:
          "Only the designated verification owner (or an H&S officer/admin) can verify this.",
      };
    }
  }

  await datastore.table("CAPAVerification").insertRow({
    capa_id: parsed.data.capaId,
    verifier_id: ctx.userId,
    // Stored verbatim as "effective" | "not_effective" — the Postgres capa_verification_outcome
    // enum's actual vocabulary (matches the VerifyForm button values in verify-close-forms.tsx),
    // not the "verified" | "rejected" vocabulary apps/catalyst/functions' own capa-workflow.ts
    // uses for its unrelated (and not-yet-live) Catalyst Function workflow.
    outcome: parsed.data.outcome,
    notes: parsed.data.comment ?? null,
    verified_at: new Date().toISOString(),
  });

  await datastore.table("CAPA").updateRow({
    ROWID: parsed.data.capaId,
    status: parsed.data.outcome === "effective" ? "verified" : "in_progress",
    updated_at: new Date().toISOString(),
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "evidence_verified",
    entityType: "CAPA",
    entityId: parsed.data.capaId,
    newValue: { outcome: parsed.data.outcome },
  });

  revalidatePath(`/capa/${parsed.data.capaId}`);
  return {};
}

const closeSchema = z.object({ capaId: z.string() });

/** Requires status = verified and final_approved_by != owner_id — mirrors the RLS check constraint. */
export async function closeCapaAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole([...ELEVATED_ROLES]);
  const parsed = closeSchema.safeParse({ capaId: formData.get("capaId") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const capaRows = (await datastore.table("CAPA").getRows({
    criteria: `CAPA.ROWID == '${parsed.data.capaId}'`,
    maxRows: 1,
  })) as CapaRow[];
  const capa = capaRows[0];
  if (!capa || !hasPropertyAccess(ctx, capa.property_id)) {
    return { error: "No access to this corrective action." };
  }
  if (capa.status !== "verified") {
    return {
      error: "A corrective action must be verified as effective before it can be closed.",
    };
  }
  if (capa.owner_id === ctx.userId) {
    return { error: "The action owner cannot be the one who gives final closure approval." };
  }

  await datastore.table("CAPA").updateRow({
    ROWID: parsed.data.capaId,
    status: "closed",
    final_approved_by: ctx.userId,
    final_approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "finding_closed",
    entityType: "CAPA",
    entityId: parsed.data.capaId,
    previousValue: { status: capa.status },
    newValue: { status: "closed" },
  });

  revalidatePath(`/capa/${parsed.data.capaId}`);
  revalidatePath("/capa");
  return {};
}

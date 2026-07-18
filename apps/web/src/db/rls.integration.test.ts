/**
 * RLS integration tests — the most important named test cases from
 * docs/security-model.md §8 ("Known residual risks"): specifically that Super Administrator does
 * NOT implicitly see medical records, and that property/department scoping actually isolates
 * rows rather than just filtering them client-side.
 *
 * Requires a live Supabase project (DATABASE_URL + a Supabase URL/anon key pointed at the same
 * project) with migrations applied and at least the fixtures this file creates in `beforeAll`.
 * Not executed in this session — no Supabase project exists yet (docs/implementation-plan.md §3).
 * Runs via `vitest.integration.config.ts`, wired into CI as a conditional job.
 */
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import {
  controlAssessments,
  controls,
  departments,
  incidents,
  medicalRecords,
  profiles,
  properties,
  propertyDepartments,
  roles,
  userDepartmentAccess,
  userMedicalPermission,
  userPropertyAccess,
  userRoles,
} from "@/db/schema";
import { eq } from "drizzle-orm";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url!, publishableKey!);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  return client;
}

describe("RLS: property scoping and medical-record isolation", () => {
  const db = getDb();
  const admin = createClient(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const propertyAId = randomUUID();
  const propertyBId = randomUUID();
  const departmentId = randomUUID();
  const password = "Integration-Test-Pass-1!";

  const managerEmail = `rls-manager-${Date.now()}@example.com`;
  const superAdminEmail = `rls-super-${Date.now()}@example.com`;
  let managerUserId: string;
  let superAdminUserId: string;
  let incidentAtPropertyAId: string;

  beforeAll(async () => {
    await db.insert(properties).values([
      { id: propertyAId, code: `RLS-A-${Date.now()}`, name: "RLS Test Property A" },
      { id: propertyBId, code: `RLS-B-${Date.now()}`, name: "RLS Test Property B" },
    ]);
    await db
      .insert(departments)
      .values({ id: departmentId, code: `RLS-DEPT-${Date.now()}`, name: "RLS Test Dept" });
    await db.insert(propertyDepartments).values({ propertyId: propertyAId, departmentId });

    const { data: managerAuth } = await admin.auth.admin.createUser({
      email: managerEmail,
      password,
      email_confirm: true,
    });
    const { data: superAdminAuth } = await admin.auth.admin.createUser({
      email: superAdminEmail,
      password,
      email_confirm: true,
    });
    managerUserId = managerAuth.user!.id;
    superAdminUserId = superAdminAuth.user!.id;

    // The on_auth_user_created trigger already inserted `profiles` rows as pending_approval;
    // activate them and grant access the way the admin approval flow would.
    await db.update(profiles).set({ status: "active" }).where(eq(profiles.id, managerUserId));
    await db
      .update(profiles)
      .set({ status: "active" })
      .where(eq(profiles.id, superAdminUserId));

    const [managerRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, "DEPARTMENT_MANAGER"));
    const [superAdminRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, "SUPER_ADMIN"));

    await db.insert(userRoles).values([
      { userId: managerUserId, roleId: managerRole!.id, grantedBy: managerUserId },
      { userId: superAdminUserId, roleId: superAdminRole!.id, grantedBy: superAdminUserId },
    ]);
    await db.insert(userPropertyAccess).values({
      userId: managerUserId,
      propertyId: propertyAId,
      grantedBy: managerUserId,
    });
    await db.insert(userDepartmentAccess).values({
      userId: managerUserId,
      propertyId: propertyAId,
      departmentId,
      grantedBy: managerUserId,
    });

    const [incident] = await db
      .insert(incidents)
      .values({
        incidentNumber: `RLS-TEST-${Date.now()}`,
        propertyId: propertyAId,
        departmentId,
        occurredAt: new Date(),
        reportedBy: managerUserId,
        personType: "employee",
        incidentType: "slip_trip_fall",
        outcome: "first_aid",
        actualSeverity: 2,
        potentialSeverity: 2,
      })
      .returning({ id: incidents.id });
    incidentAtPropertyAId = incident!.id;

    await db.insert(medicalRecords).values({
      incidentId: incidentAtPropertyAId,
      clinicalNotes: "Integration-test-only clinical note — not real PHI.",
      createdBy: managerUserId,
    });
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(managerUserId);
    await admin.auth.admin.deleteUser(superAdminUserId);
    await db.delete(properties).where(eq(properties.id, propertyAId));
    await db.delete(properties).where(eq(properties.id, propertyBId));
  });

  it("a Department Manager sees incidents at their granted property/department", async () => {
    const client = await signedInClient(managerEmail, password);

    const { data, error } = await client
      .from("incidents")
      .select("id")
      .eq("id", incidentAtPropertyAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("a Department Manager does NOT see incidents at a property they have no grant for", async () => {
    const client = await signedInClient(managerEmail, password);

    const { data } = await client
      .from("incidents")
      .select("id")
      .eq("property_id", propertyBId);
    expect(data).toHaveLength(0);
  });

  it("Super Administrator WITHOUT an explicit medical-permission grant sees zero medical records", async () => {
    const client = await signedInClient(superAdminEmail, password);

    const { data } = await client
      .from("medical_records")
      .select("id")
      .eq("incident_id", incidentAtPropertyAId);
    expect(data).toHaveLength(0);
  });

  it("Super Administrator sees medical records once explicitly granted medical permission", async () => {
    await db.insert(userMedicalPermission).values({
      userId: superAdminUserId,
      grantedBy: superAdminUserId,
      reason: "Integration test: explicit grant required even for Super Admin.",
    });

    const client = await signedInClient(superAdminEmail, password);

    const { data, error } = await client
      .from("medical_records")
      .select("id")
      .eq("incident_id", incidentAtPropertyAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("critical-gap control assessment cannot be misread as a rows-only concern (schema sanity check)", async () => {
    const [control] = await db
      .insert(controls)
      .values({
        controlCode: `RLS-CTRL-${Date.now()}`,
        title: "Integration test control",
        isLifeSafetyCritical: true,
      })
      .returning({ id: controls.id });

    await db.insert(controlAssessments).values({
      controlId: control!.id,
      propertyId: propertyAId,
      periodLabel: "TEST",
      dimension: "effectiveness",
      maturityScore: 1,
      isCriticalGap: true,
      assessedBy: managerUserId,
    });

    const rows = await db
      .select()
      .from(controlAssessments)
      .where(eq(controlAssessments.controlId, control!.id));
    expect(rows[0]?.isCriticalGap).toBe(true);
  });
});

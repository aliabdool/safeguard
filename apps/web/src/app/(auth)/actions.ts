"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { catalystAdminApp, catalystAppFromHeaders } from "@/lib/catalyst/app";
import { getCatalystLogoutUrl } from "@/lib/catalyst/env";
import { writeAuditLog } from "@/server/audit-log";
import { isRateLimited } from "@/server/security/rate-limit";

async function requestMeta() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for") ?? h.get("cf-connecting-ip") ?? null,
    userAgent: h.get("user-agent"),
  };
}

export interface ActionResult {
  error?: string;
}

const signUpSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1, "Full name is required."),
  requestedRoleId: z.string().optional().or(z.literal("")),
  requestedPropertyId: z.string().optional().or(z.literal("")),
  justification: z.string().optional(),
});

/**
 * Sign-in itself is not a Server Action any more — the /login page links straight to Zoho
 * Catalyst's Hosted Login (see src/lib/catalyst/env.ts), which also covers "Forgot password?"
 * natively. Registration keeps its own custom form (with the justification field, which Catalyst
 * has no equivalent for) but creates the account via Catalyst's registerUser API — Catalyst emails
 * the new user a link to set their own password, so no password is collected or transits this
 * server.
 */
export async function signUpAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    requestedRoleId: formData.get("requestedRoleId") ?? "",
    requestedPropertyId: formData.get("requestedPropertyId") ?? "",
    justification: formData.get("justification") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid registration details." };
  }

  const { ipAddress } = await requestMeta();
  if (
    await isRateLimited({
      ipAddress,
      eventType: "registration",
      maxAttempts: 5,
      windowMinutes: 60,
    })
  ) {
    return { error: "Too many registration attempts from this location. Try again later." };
  }

  const nameParts = parsed.data.fullName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? parsed.data.fullName.trim();
  const lastName = nameParts.slice(1).join(" ") || firstName;

  const catalystApp = catalystAdminApp();
  let registered;
  try {
    registered = await catalystApp
      .userManagement()
      .registerUser(
        { platform_type: "web" },
        { first_name: firstName, last_name: lastName, email_id: parsed.data.email },
      );
  } catch {
    return { error: "Could not create account. This email may already be registered." };
  }

  const zuid = registered.user_details.user_id;

  // Catalyst's own Authentication record exists now, but nothing auto-creates the matching Users
  // Data Store row the way Supabase's on_auth_user_created trigger did — insert it explicitly,
  // starting pending_approval same as before.
  const userRow = await catalystApp.datastore().table("Users").insertRow({
    zuid,
    full_name: parsed.data.fullName,
    email: parsed.data.email,
    status: "pending_approval",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const userId = userRow.ROWID as string;

  await catalystApp.datastore().table("RegistrationRequests").insertRow({
    user_id: userId,
    requested_role_id: parsed.data.requestedRoleId || null,
    requested_property_id: parsed.data.requestedPropertyId || null,
    justification: parsed.data.justification ?? null,
    created_at: new Date().toISOString(),
  });

  await writeAuditLog({
    actorId: null,
    eventType: "registration",
    entityType: "Users",
    entityId: userId,
    ipAddress,
  });

  redirect("/register/pending");
}

export async function signOutAction() {
  const catalystApp = catalystAppFromHeaders(await headers());
  const zohoUser = await catalystApp
    .userManagement()
    .getCurrentUser()
    .catch(() => null);

  if (zohoUser) {
    const userRows = await catalystApp
      .datastore()
      .table("Users")
      .getRows({ criteria: `Users.zuid = '${zohoUser.user_id}'`, maxRows: 1 });
    const userId = userRows[0]?.ROWID;
    if (userId) {
      await writeAuditLog({
        actorId: userId,
        eventType: "logout",
        entityType: "Users",
        entityId: userId,
      });
    }
  }

  redirect(getCatalystLogoutUrl());
}

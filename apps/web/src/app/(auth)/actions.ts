"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { registrationRequests } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/server/audit-log";

async function requestMeta() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for") ?? h.get("cf-connecting-ip") ?? null,
    userAgent: h.get("user-agent"),
  };
}

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export interface ActionResult {
  error?: string;
}

export async function signInAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { ipAddress, userAgent } = await requestMeta();

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    await writeAuditLog({
      actorId: null,
      eventType: "failed_login",
      entityType: "auth",
      reason: error?.message ?? "unknown",
      ipAddress,
      userAgent,
    });
    return { error: "Invalid email or password." };
  }

  await writeAuditLog({
    actorId: data.user.id,
    eventType: "login",
    entityType: "auth",
    entityId: data.user.id,
    ipAddress,
    userAgent,
  });

  redirect("/dashboard");
}

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  fullName: z.string().min(1, "Full name is required."),
  requestedRoleId: z.string().uuid().optional().or(z.literal("")),
  requestedPropertyId: z.string().uuid().optional().or(z.literal("")),
  justification: z.string().optional(),
});

export async function signUpAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
    requestedRoleId: formData.get("requestedRoleId") ?? "",
    requestedPropertyId: formData.get("requestedPropertyId") ?? "",
    justification: formData.get("justification") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid registration details." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Could not create account." };
  }

  // The `on_auth_user_created` trigger (drizzle/0001_auth_helpers_and_rls.sql) already inserted
  // the `profiles` row with status = pending_approval. We only record the registration request
  // (what the user is asking for) — approval/role/property assignment is an admin-only action.
  const db = getDb();
  await db.insert(registrationRequests).values({
    userId: data.user.id,
    requestedRoleId: parsed.data.requestedRoleId || null,
    requestedPropertyId: parsed.data.requestedPropertyId || null,
    justification: parsed.data.justification ?? null,
  });

  await writeAuditLog({
    actorId: data.user.id,
    eventType: "registration",
    entityType: "profiles",
    entityId: data.user.id,
  });

  redirect("/register/pending");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  if (user) {
    await writeAuditLog({
      actorId: user.id,
      eventType: "logout",
      entityType: "auth",
      entityId: user.id,
    });
  }

  redirect("/login");
}

const forgotPasswordSchema = z.object({ email: z.string().email() });

export async function forgotPasswordAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // Deliberately do not branch on whether the email exists — avoids user enumeration.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/reset-password`,
  });

  return {};
}

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function resetPasswordAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { error: error.message };
  }

  if (data.user) {
    await writeAuditLog({
      actorId: data.user.id,
      eventType: "status_changed",
      entityType: "auth",
      entityId: data.user.id,
      reason: "password_reset",
    });
  }

  redirect("/login");
}

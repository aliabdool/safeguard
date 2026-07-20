import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { getAuthContext } from "@/server/permissions";

import { AppNav } from "./app-nav";

/**
 * The application-wide guard. This is UX/layout convenience, not the security boundary — RLS
 * (docs/security-model.md §3) and per-action `requireActiveUser()`/`requireRole()` checks
 * (docs/system-architecture.md §5) both independently enforce the same rule and would still
 * block a request even if this layout were somehow bypassed.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();

  if (!ctx) {
    redirect("/login");
  }
  if (ctx.status === "pending_approval") {
    redirect("/register/pending");
  }
  if (ctx.status === "suspended" || ctx.status === "rejected") {
    redirect("/login?blocked=1");
  }

  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.userId));

  return (
    <div className="grid min-h-svh md:grid-cols-[236px_1fr]">
      <AppNav roleCodes={ctx.roleCodes} fullName={profile?.fullName ?? "Unknown user"} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}

import { redirect } from "next/navigation";
import type { ReactNode } from "react";

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

  return (
    <div className="flex min-h-svh flex-col">
      <AppNav roleCodes={ctx.roleCodes} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

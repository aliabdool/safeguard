import type { ReactNode } from "react";

import { requireRole } from "@/server/permissions";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Throws AuthError (caught by the nearest error boundary) if the caller isn't an admin — this
  // is the same requireRole() used inside every admin server action, so the page and the actions
  // it renders agree on who's allowed in even before a mutation is attempted.
  await requireRole(["SUPER_ADMIN", "GROUP_HS_ADMIN"]);

  return <div className="flex flex-col gap-6">{children}</div>;
}

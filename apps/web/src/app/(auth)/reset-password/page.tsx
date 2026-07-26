import { redirect } from "next/navigation";

import { getCatalystHostedLoginUrl } from "@/lib/catalyst/env";

/**
 * Password reset now happens entirely on Zoho Catalyst's Hosted Login page — no custom form
 * needed here any more.
 */
export default function ResetPasswordPage() {
  redirect(getCatalystHostedLoginUrl());
}

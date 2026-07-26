import { redirect } from "next/navigation";

import { getCatalystHostedLoginUrl } from "@/lib/catalyst/env";

/**
 * Zoho Catalyst's Hosted Login page has its own native "Forgot password?" link — no custom form
 * needed here any more.
 */
export default function ForgotPasswordPage() {
  redirect(getCatalystHostedLoginUrl());
}

/**
 * Zoho Catalyst's native Hosted Authentication login page — branded via the Console's
 * Authentication Setup wizard (company name/logo/colors), configured with Public Signup off.
 * Handles sign-in and "Forgot password?" natively; apps/web never sees a raw password.
 *
 * Deliberately a *relative* path, not an absolute URL built from a project domain. Confirmed live
 * against the deployed project (see chat) that AppSail exposes `/__catalyst/auth/login` and
 * `/__catalyst/auth/logout` directly on the AppSail app's OWN origin once `catalyst_auth: true` is
 * set in `app-config.json` (see that file) — matching Zoho's official AppSail Hosted Authentication
 * example, which browses to `${window.origin}/__catalyst/auth/login`, not the separate
 * `*.catalystserverless.com` project domain. An earlier attempt to build an absolute URL from
 * `CATALYST_PROJECT_DOMAIN` (with or without a `redirect_url` query param) was rejected outright by
 * Catalyst (`PATTERN_NOT_MATCHED`) — that env var and helper have been removed as dead code.
 */
export function getCatalystHostedLoginUrl(): string {
  return "/__catalyst/auth/login";
}

export function getCatalystLogoutUrl(): string {
  return "/__catalyst/auth/logout";
}

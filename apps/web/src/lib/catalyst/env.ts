function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Only the project domain is needed client-visible-side (it's embedded as a plain URL string in
 * server-rendered HTML, e.g. the hosted-login link) — everything else Catalyst needs is read from
 * the incoming request itself (see src/lib/catalyst/app.ts) since apps/web runs same-origin on
 * Catalyst AppSail.
 */
export function getCatalystProjectDomain(): string {
  return required("CATALYST_PROJECT_DOMAIN", process.env.CATALYST_PROJECT_DOMAIN);
}

/**
 * Zoho Catalyst's native Hosted/Embedded Login page — branded via the Console's Authentication
 * Setup wizard (company name/logo/colors), configured with Public Signup off. Handles sign-in and
 * "Forgot password?" natively; apps/web never sees a raw password.
 *
 * `redirect_url` tells Catalyst where to send the browser after a successful sign-in — without it,
 * Catalyst falls back to its own default Web Client Hosting landing spot (`/app/`), which has
 * nothing deployed there since apps/web runs on AppSail under a separate domain. Confirmed live
 * against the deployed project (see chat) after the console's Authentication Setup screens turned
 * out to have no static redirect-URL field to configure this any other way.
 */
export function getCatalystHostedLoginUrl(returnTo = "/dashboard"): string {
  const target = `${getAppOrigin()}${returnTo}`;
  return `https://${getCatalystProjectDomain()}/__catalyst/auth/login?redirect_url=${encodeURIComponent(target)}`;
}

/** apps/web's own deployed origin — see NEXT_PUBLIC_SITE_URL, set to the real AppSail URL post-deploy. */
function getAppOrigin(): string {
  return required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL);
}

/**
 * NOTE: this exact path is not yet verified against the live Catalyst project (docs.catalyst.zoho.com
 * blocked automated fetches while this was written) — confirm it once deployed, alongside the
 * hosted-login redirect-back behaviour.
 */
export function getCatalystLogoutUrl(): string {
  return `https://${getCatalystProjectDomain()}/__catalyst/auth/logout`;
}

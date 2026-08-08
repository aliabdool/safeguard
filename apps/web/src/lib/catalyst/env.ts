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
 * REVERTED an earlier `?redirect_url=<absolute-url>` query param attempt — confirmed live against
 * the deployed project that Catalyst's Hosted Login rejects it outright (`PATTERN_NOT_MATCHED`).
 * Zoho's documented redirect mechanism (`login_redirect` in `client-package.json`) is a Web Client
 * Hosting concept — same-domain static hosting — not something documented for AppSail, which gets
 * its own separate `.catalystappsail.com` domain. Post-login landing is an open problem, being
 * investigated via Domain Mappings (see chat) rather than guessed at further here.
 */
export function getCatalystHostedLoginUrl(): string {
  return `https://${getCatalystProjectDomain()}/__catalyst/auth/login`;
}

/**
 * NOTE: this exact path is not yet verified against the live Catalyst project (docs.catalyst.zoho.com
 * blocked automated fetches while this was written) — confirm it once deployed, alongside the
 * hosted-login redirect-back behaviour.
 */
export function getCatalystLogoutUrl(): string {
  return `https://${getCatalystProjectDomain()}/__catalyst/auth/logout`;
}

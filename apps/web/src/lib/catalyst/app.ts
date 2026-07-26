import "server-only";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface CatalystUser {
  /** The join key against our own Users.zuid column — matches the field name already used this
   * way in apps/catalyst/functions/shared/middleware/auth-context.ts, despite the SDK's own
   * `ICatalystUser` also exposing a separate top-level `zuid` field for the Zoho account itself. */
  user_id: string;
  email_id: string;
  first_name: string;
  last_name: string;
}

export interface CatalystRow extends Record<string, string> {
  ROWID: string;
}

/**
 * Narrow, hand-typed slice of the zcatalyst-sdk-node surface this app actually uses — kept
 * deliberately small rather than depending on the SDK's full type surface, matching the same
 * convention as apps/catalyst/functions/shared/middleware/auth-context.ts's `CatalystApp`.
 */
export interface CatalystApp {
  userManagement(): {
    getCurrentUser(): Promise<CatalystUser | null>;
    updateUserStatus(zuid: string, status: "enable" | "disable"): Promise<boolean>;
    registerUser(
      signupConfig: { platform_type: string },
      userDetails: { first_name: string; last_name: string; email_id: string },
    ): Promise<{ user_details: CatalystUser }>;
  };
  datastore(): {
    table(name: string): {
      getRows(params: { criteria?: string; maxRows?: number }): Promise<CatalystRow[]>;
      insertRow(row: Record<string, unknown>): Promise<Record<string, unknown>>;
      updateRow(row: Record<string, unknown> & { ROWID: string }): Promise<Record<string, unknown>>;
    };
  };
  zcql(): { executeZCQLQuery(query: string): Promise<unknown[]> };
}

function headersToPlainObject(headersList: Headers): Record<string, string> {
  return Object.fromEntries(headersList.entries());
}

/**
 * Request-scoped Catalyst app — resolves the caller's own Catalyst Authentication session from
 * the incoming request's cookies. This only works because apps/web is deployed same-origin on
 * Catalyst AppSail (see docs/2026-07-catalyst-migration-plan.md); the SDK reads the `Cookie`
 * header and, for state-changing calls, an `X-ZCSRF-TOKEN` header the browser must attach itself.
 * Mirrors `catalystAppFromRequest()` in apps/catalyst/functions/shared/middleware/auth-context.ts,
 * adapted for Next.js's Web-standard `Headers` (which isn't a plain object the SDK can
 * `Object.assign` from directly).
 */
export function catalystAppFromHeaders(headersList: Headers): CatalystApp {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const catalyst = require("zcatalyst-sdk-node");
  return catalyst.initialize({ headers: headersToPlainObject(headersList) }) as CatalystApp;
}

/**
 * Admin/server-to-server scoped Catalyst app — no end-user session attached. Confined to flows
 * that run before any session exists (self-registration) or as a system actor (cron/scheduled
 * jobs). NEVER use this for a request that already has a logged-in user — use
 * catalystAppFromHeaders so writes are attributable to the right session.
 *
 * NOTE: the exact credential field names below are inferred from zcatalyst-sdk-node's `initialize`
 * type signature (`{[x: string]: string | number | Credential}`) and have not been exercised
 * against a live Catalyst project yet — confirm against Zoho's admin-initialization example before
 * first deploy.
 */
export function catalystAdminApp(): CatalystApp {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const catalyst = require("zcatalyst-sdk-node");
  return catalyst.initialize(
    {
      PROJECT_ID: required("CATALYST_PROJECT_ID", process.env.CATALYST_PROJECT_ID),
      PROJECT_KEY: required("CATALYST_PROJECT_KEY", process.env.CATALYST_PROJECT_KEY),
      PROJECT_SECRET_KEY: required(
        "CATALYST_PROJECT_SECRET_KEY",
        process.env.CATALYST_PROJECT_SECRET_KEY,
      ),
    },
    { scope: "admin" },
  ) as CatalystApp;
}

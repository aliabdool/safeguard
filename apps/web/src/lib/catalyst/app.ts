import "server-only";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface CatalystUser {
  /** The real join key against our own Users.zuid column — confirmed live against the deployed
   * project (see chat): a real logged-in session's `zuid` ("10130281250") and `user_id`
   * ("18206000000042019") are genuinely different values, and Users.zuid stores the former. The
   * previous code used `user_id` here — mirroring a comment in
   * apps/catalyst/functions/shared/middleware/auth-context.ts that turned out to describe an
   * equally unverified assumption, not a confirmed fact — which silently matched zero rows (no
   * error, just an empty result) and sent every successful login straight back to /login. */
  zuid: string;
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

/** The real zcatalyst-sdk-node surface actually invoked below — deliberately untyped/minimal since
 * the package ships no usable public types for these; see wrapCatalystApp() for why this differs
 * from our own hand-typed `CatalystApp` above. */
interface RawCatalystApp {
  userManagement(): CatalystApp["userManagement"] extends () => infer R ? R : never;
  datastore(): { table(name: string): RawTable };
  zcql(): { executeZCQLQuery(query: string): Promise<Array<Record<string, Record<string, unknown>>>> };
}
interface RawTable {
  insertRow(row: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateRow(row: Record<string, unknown> & { ROWID: string }): Promise<Record<string, unknown>>;
}

/**
 * The real SDK's `Table` class has no `getRows()`/criteria-filtering method at all (only
 * `getRow(id)`, `getAllRows()`, `getPagedRows()`, `getIterableRows()`, none of which accept a WHERE
 * -style filter) — confirmed by reading node_modules/zcatalyst-sdk-node/lib/datastore/table.d.ts
 * after every scoped read in this app (built against a `getRows({criteria, maxRows})` shape that
 * doesn't exist) started throwing `c.table(...).getRows is not a function` on first live deploy.
 * Rather than rewrite the ~90 call sites across the app, `getRows()` is reimplemented here as a
 * thin shim over `zcql().executeZCQLQuery()`, which does exist and does support a WHERE clause —
 * verified live against the deployed project's ZCQL Console (see chat) that `select
 * TableName.* from TableName [where ...] [limit N]` returns `[{ TableName: { ROWID, ...columns } }]`,
 * exactly the shape unwrapped below. Every existing `criteria` string in this codebase was already
 * written in this same `Table.column op value` ZCQL syntax (they were modelled on the raw
 * `executeZCQLQuery()` calls already used for joins elsewhere, e.g. src/server/cron/process-reminders.ts),
 * so no call site needs to change.
 */
function wrapCatalystApp(rawApp: RawCatalystApp): CatalystApp {
  return {
    userManagement: () => rawApp.userManagement(),
    datastore: () => ({
      table: (name: string) => {
        const rawTable = rawApp.datastore().table(name);
        return {
          getRows: async ({ criteria, maxRows }: { criteria?: string; maxRows?: number } = {}) => {
            let sql = `select ${name}.* from ${name}`;
            if (criteria) sql += ` where ${criteria}`;
            if (maxRows) sql += ` limit ${maxRows}`;
            const rows = await rawApp.zcql().executeZCQLQuery(sql);
            return rows.map((row) => row[name] as CatalystRow);
          },
          insertRow: (row) => rawTable.insertRow(row),
          updateRow: (row) => rawTable.updateRow(row),
        };
      },
    }),
    zcql: () => rawApp.zcql(),
  };
}

/**
 * Request-scoped Catalyst app — resolves the caller's own Catalyst Authentication session from
 * the incoming request's cookies. This only works because `catalyst_auth: true` in app-config.json
 * makes AppSail serve /__catalyst/auth/* on the app's own origin and attach the session there —
 * confirmed live against the deployed project (see chat) after an app-config.json-less deployment
 * left the login flow unable to land back on this app at all. The SDK reads the `Cookie` header
 * and, for state-changing calls, an `X-ZCSRF-TOKEN` header the browser must attach itself. Mirrors
 * `catalystAppFromRequest()` in apps/catalyst/functions/shared/middleware/auth-context.ts, adapted
 * for Next.js's Web-standard `Headers` (which isn't a plain object the SDK can `Object.assign`
 * from directly).
 */
export function catalystAppFromHeaders(headersList: Headers): CatalystApp {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const catalyst = require("zcatalyst-sdk-node");
  const rawApp = catalyst.initialize({
    headers: headersToPlainObject(headersList),
  }) as RawCatalystApp;
  return wrapCatalystApp(rawApp);
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
  const rawApp = catalyst.initialize(
    {
      PROJECT_ID: required("CATALYST_PROJECT_ID", process.env.CATALYST_PROJECT_ID),
      PROJECT_KEY: required("CATALYST_PROJECT_KEY", process.env.CATALYST_PROJECT_KEY),
      PROJECT_SECRET_KEY: required(
        "CATALYST_PROJECT_SECRET_KEY",
        process.env.CATALYST_PROJECT_SECRET_KEY,
      ),
    },
    { scope: "admin" },
  ) as RawCatalystApp;
  return wrapCatalystApp(rawApp);
}

import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Pooled connection through Supabase's Supavisor pooler (transaction mode) or Cloudflare
 * Hyperdrive in front of it — see docs/system-architecture.md §2. This client runs under a
 * Postgres role that RLS applies to; it is NOT the service-role/superuser connection. Never
 * import this module from a client component (the `server-only` import above makes that a
 * build error, not just a convention).
 */
function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. This app cannot start without a Supabase Postgres connection string. " +
        "See docs/implementation-plan.md for environment setup.",
    );
  }

  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

let cached: ReturnType<typeof createDb> | undefined;

export function getDb() {
  cached ??= createDb();
  return cached;
}

export type Database = ReturnType<typeof getDb>;

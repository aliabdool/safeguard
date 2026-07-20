import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
  // `auth` (Supabase-managed) and `app_auth` (our RLS helper functions, see drizzle/0002_auth_rls.sql)
  // are intentionally excluded — Drizzle only owns the `public` schema.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * RLS/Drizzle integration tests — require a real Postgres connection (DATABASE_URL), typically a
 * disposable Supabase test project or a local `supabase start` stack. See
 * docs/system-architecture.md §8. Not run in this session; wired into CI as a conditional job
 * (.github/workflows/ci.yml) that only fires once SUPABASE_TEST_DB_URL exists as a repo secret.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 30_000,
  },
});

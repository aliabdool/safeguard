import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Integration tests that require a live Postgres connection are named *.integration.test.ts
    // and excluded here — see docs/system-architecture.md §8. They run in CI only when
    // SUPABASE_TEST_DB_URL is configured.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});

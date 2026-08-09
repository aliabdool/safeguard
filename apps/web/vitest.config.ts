import { fileURLToPath } from "url";

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // The real "server-only" package throws unconditionally unless the bundler declares the
      // "react-server" export condition, which Vitest's Node environment doesn't — see
      // src/lib/testing/server-only-stub.ts for why this alias exists instead of a broader
      // resolve.conditions change (which would also affect how React itself resolves).
      "server-only": fileURLToPath(
        new URL("./src/lib/testing/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Integration tests that require a live Postgres connection are named *.integration.test.ts
    // and excluded here — see docs/system-architecture.md §8. They run in CI only when
    // SUPABASE_TEST_DB_URL is configured.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});

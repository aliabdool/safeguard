import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // src/components/** is where "use client" UI primitives and interactive components live —
    // the service-role client must never end up in a client bundle. Server Components under
    // src/app (page.tsx/layout.tsx without "use client") are legitimately allowed to import it
    // for server-side reads (e.g. admin pages resolving emails via the Admin API); the
    // `import "server-only"` guard inside service-role.ts itself is the authoritative
    // enforcement for the actual dangerous case (a client component pulling it in would fail
    // the Next.js build), this lint rule is a narrower, editor-visible fail-fast for the most
    // common mistake. See src/server/auth/service-role.ts and docs/security-model.md §6.
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/server/auth/service-role", "**/service-role"],
              message:
                "Do not import the service-role Supabase client from reusable components. Confine it to Server Actions/Route Handlers/Server Components that specifically need it.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
  ]),
]);

export default eslintConfig;

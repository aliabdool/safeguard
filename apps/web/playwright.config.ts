import { defineConfig, devices } from "@playwright/test";

/**
 * Golden-path E2E tests — see docs/system-architecture.md §8. Requires a running app pointed at
 * a real Supabase project (register -> admin approves -> login -> incident workflow ->
 * document/evidence flow). Not executed in this session: no Supabase project exists yet (see
 * docs/implementation-plan.md §3). `webServer` starts the Next.js dev server automatically when
 * PLAYWRIGHT_BASE_URL is not set to a remote target.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

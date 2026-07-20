import { expect, test } from "@playwright/test";

/**
 * Golden path: register -> pending approval screen -> (admin approves out of band) -> login ->
 * dashboard. Requires a real Supabase project with email confirmation disabled or auto-confirmed
 * for test users, and a seeded admin account — see docs/implementation-plan.md §3 for what's
 * blocked pending real infrastructure. Skipped until SAFEGUARD_E2E_BASE_URL / a live test
 * Supabase project is configured (tracked in CI as a conditional job, see
 * docs/system-architecture.md §9).
 */
test.skip(
  !process.env.PLAYWRIGHT_BASE_URL,
  "Requires a deployed environment backed by a real Supabase project.",
);

test("an unauthenticated visitor is redirected to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("registration form submits and lands on the pending-approval screen", async ({
  page,
}) => {
  await page.goto("/register");

  const email = `e2e-${Date.now()}@example.com`;
  await page.getByLabel("Full name").fill("E2E Test User");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Sup3rSecret!Pass");
  await page.getByRole("button", { name: "Request access" }).click();

  await expect(page).toHaveURL(/\/register\/pending/);
  await expect(page.getByText("awaiting administrator approval")).toBeVisible();
});

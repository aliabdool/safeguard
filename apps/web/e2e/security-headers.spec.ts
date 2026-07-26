import { expect, test } from "@playwright/test";

/**
 * Runs against local `next start`/`next dev` too (doesn't require a live Supabase project) — the
 * static /login page is enough to assert the security headers from next.config.ts are present.
 * Unlike auth-and-approval.spec.ts, this one is NOT gated behind PLAYWRIGHT_BASE_URL.
 */
test("security headers are present on every response", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response).not.toBeNull();
  const headers = response!.headers();

  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("an unauthenticated visitor cannot reach /dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

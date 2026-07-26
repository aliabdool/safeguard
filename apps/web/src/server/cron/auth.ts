import "server-only";

/**
 * Cloudflare Cron Triggers call these routes with no user session — authenticate via a shared
 * secret header instead (set as a Cloudflare encrypted secret per environment, see
 * docs/implementation-plan.md and .env.example CRON_SECRET). Never accept these routes without
 * this check: they run with system/service-role-level effect.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return false;
  }
  const provided = request.headers.get("x-cron-secret");
  return provided === expected;
}

import type { NextConfig } from "next";

// Derived at build time so the CSP's connect-src/img-src allow exactly the configured Supabase
// project and nothing else — see docs/security-model.md §6. Falls back to an empty string (CSP
// directive simply omits it) if the env var isn't set yet, so `next build` never hard-fails for
// missing config; the app itself will fail loudly elsewhere (src/lib/supabase/env.ts) if it's
// genuinely missing at runtime.
function supabaseOrigin(): string {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "";
  } catch {
    return "";
  }
}

const SUPABASE_ORIGIN = supabaseOrigin();

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Next.js needs 'unsafe-inline' for its own bootstrap/hydration scripts in the current App
  // Router output; nonce-based CSP is a documented follow-up (docs/security-model.md §6) once the
  // app is deployed and the exact script-injection points can be verified end-to-end.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${SUPABASE_ORIGIN}`.trim(),
  `connect-src 'self' ${SUPABASE_ORIGIN}`.trim(),
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained .next/standalone/ output (server.js + only the node_modules
  // subset actually required at runtime) instead of needing the full node_modules tree deployed
  // alongside the app. This is what makes a manual-upload target like Zoho Catalyst AppSail
  // practical — see docs/2026-07-zoho-catalyst-migration-plan.md Batch 15. Orthogonal to the
  // Cloudflare (`cf:*` npm scripts / @opennextjs/cloudflare) deployment path, which ignores this
  // setting entirely.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

import { NextResponse, type NextRequest } from "next/server";

import { catalystAppFromHeaders } from "./app";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/register/pending",
  "/forgot-password",
  "/reset-password",
  "/api/health",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Runs on every request (see src/proxy.ts). Redirects unauthenticated users away from protected
 * routes by checking the Catalyst Authentication session on the incoming request. This is UX
 * convenience only — the real gate is server-side permission checks (getAuthContext/requireRole in
 * src/server/permissions), which apply even if this redirect were ever bypassed. Data Store has no
 * RLS equivalent (see apps/catalyst/data-store-schema/README.md), so those checks are the only
 * enforcement layer.
 */
export async function updateCatalystSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request });
  }

  const catalystApp = catalystAppFromHeaders(request.headers);
  const user = await catalystApp
    .userManagement()
    .getCurrentUser()
    .catch(() => null);

  if (!user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next({ request });
}

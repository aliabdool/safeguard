import type { NextFunction, Request, Response } from "express";

import { AuthError, hasPropertyAccess, isAdmin, type AuthContext, type RoleCode } from "../pure/permissions";
import { catalystAppFromRequest, loadAuthContext, type CatalystApp } from "./auth-context";
import { writeAuditLog } from "./audit-log";

export interface SafeGuardRequest extends Request {
  authContext: AuthContext;
  catalystApp: CatalystApp;
}

/**
 * Loads the auth context onto every request. Mount this first, before any route. A user who
 * isn't active gets a 403 immediately — nothing downstream needs to re-check `status`.
 */
export async function withAuthContext(req: Request, res: Response, next: NextFunction) {
  try {
    const catalystApp = catalystAppFromRequest(req);
    const authContext = await loadAuthContext(catalystApp);
    if (!authContext) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    if (authContext.status !== "active") {
      res.status(403).json({ error: "Account is not active." });
      return;
    }
    (req as SafeGuardRequest).authContext = authContext;
    (req as SafeGuardRequest).catalystApp = catalystApp;
    next();
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve auth context." });
  }
}

/** Route-level role gate — use for coarse checks (e.g. "must be some kind of H&S role"). */
export function requireRole(allowed: RoleCode[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = (req as SafeGuardRequest).authContext;
    if (isAdmin(ctx) || ctx.roleCodes.some((r) => allowed.includes(r))) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden." });
  };
}

/**
 * Route-level explicit-permission gate — for the sensitive actions in brief §14
 * (view/export medical notes, generate assurance pack, approve documents group-wide, verify
 * CAPA, close critical findings, edit framework scoring, change permissions). Every use of this
 * ALSO writes an AuditTrail row — sensitive access is never silent, per Improvement 4 and §14.
 */
export function requireExplicitPermission(permissionCode: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const safeReq = req as SafeGuardRequest;
    const ctx = safeReq.authContext;

    const granted =
      permissionCode === "view_medical_notes" || permissionCode === "export_medical_notes"
        ? ctx.hasMedicalPermission
        : await hasExplicitPermission(safeReq.catalystApp, ctx.userId, permissionCode);

    if (!granted) {
      res.status(403).json({ error: `Missing required permission: ${permissionCode}` });
      return;
    }

    await writeAuditLog(safeReq.catalystApp, {
      actorUserId: ctx.userId,
      eventType: "sensitive_permission_used",
      entityType: permissionCode,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });

    next();
  };
}

async function hasExplicitPermission(
  catalystApp: CatalystApp,
  userId: string,
  permissionCode: string,
): Promise<boolean> {
  const rows = await catalystApp.zcql().executeZCQLQuery(
    `select UserPermissions.ROWID from UserPermissions where UserPermissions.user_id = '${userId}' and UserPermissions.permission_code = '${permissionCode}' and UserPermissions.revoked_at is null`,
  );
  return rows.length > 0;
}

/**
 * Property-scope guard for a single-property route (e.g. GET /incidents/:id) — call this INSIDE
 * the handler once the record's property_id is known, not just at the route level, since the
 * route path alone doesn't carry the property. This is the enforcement point that stands in for
 * what Postgres RLS did automatically in the Supabase build — skipping this check on any new
 * endpoint is a real data leak across hotels, not a cosmetic bug.
 */
export function assertPropertyAccess(ctx: AuthContext, propertyId: string): void {
  if (!hasPropertyAccess(ctx, propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }
}

/** Builds a ZCQL-safe "IN (...)" clause restricted to the properties this user may see. Use this
 * for every LIST endpoint (incidents, CAPA, documents, audits, …) instead of filtering after the
 * fact — filtering after the fact still fetched the other hotels' rows into memory first. */
export function propertyScopeClause(ctx: AuthContext, column = "property_id"): string {
  if (isAdmin(ctx) || ctx.roleCodes.includes("EXECUTIVE_READONLY")) {
    return "1=1";
  }
  if (ctx.propertyIds.length === 0) {
    return "1=0";
  }
  const list = ctx.propertyIds.map((id) => `'${id}'`).join(",");
  return `${column} in (${list})`;
}

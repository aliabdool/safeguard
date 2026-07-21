import express from "express";

import { withAuthContext, type SafeGuardRequest } from "../shared/middleware/require-permission";

const app = express();
app.use(express.json());
app.use(withAuthContext);

/**
 * GET /me — the resolved AuthContext for the signed-in user, serialised for the web client. This
 * is what the client's role-aware navigation and dashboard routing are built on (which of the 8
 * dashboards to show, which nav items are visible) — the client never guesses a role from a JWT
 * claim itself, it asks this endpoint, which goes through the exact same loadAuthContext() every
 * other Function uses.
 */
app.get("/me", (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  const ctx = safeReq.authContext;
  res.json({
    userId: ctx.userId,
    status: ctx.status,
    roleCodes: ctx.roleCodes,
    propertyIds: ctx.propertyIds,
    departmentAccess: Object.fromEntries(
      [...ctx.departmentAccess.entries()].map(([propertyId, depts]) => [propertyId, [...depts]]),
    ),
    medicalPermissions: [...ctx.medicalPermissions],
  });
});

module.exports = app;

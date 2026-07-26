import express from "express";

import { withAuthContext, type SafeGuardRequest } from "../shared/middleware/require-permission";
import { AuthError, isAdmin } from "../shared/pure/permissions";
import { financialYearFor, previousFinancialYear, sameperiodYtdComparison } from "../shared/pure/period";
import { calculateKpi, type KpiPeriodParams } from "../shared/services/kpi-service";
import { makeKpiDatastoreRepo } from "../shared/adapters/kpi-datastore-repo";

const app = express();
app.use(express.json());
app.use(withAuthContext);

/** GET /kpi/:code?propertyId=&departmentId=&asOf= — the "View calculation" drill-down endpoint:
 * formula/source records/current+comparison values/RAG for exactly one KPI, lazy-loaded only when
 * a user opens it (never called in a loop from the dashboard batch endpoints). */
app.get("/kpi/:code", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  const ctx = safeReq.authContext;
  const requestedPropertyId = typeof req.query.propertyId === "string" ? req.query.propertyId : null;
  const departmentId = typeof req.query.departmentId === "string" ? req.query.departmentId : null;

  if (requestedPropertyId && !isAdmin(ctx) && !ctx.propertyIds.includes(requestedPropertyId)) {
    res.status(403).json({ error: "No access to this property." });
    return;
  }

  const asOf = typeof req.query.asOf === "string" ? new Date(req.query.asOf) : new Date();
  const { period: currentPeriod } = financialYearFor(asOf);
  const comparisonPeriodFull = previousFinancialYear(currentPeriod);
  const { comparisonEnd } = sameperiodYtdComparison(currentPeriod, comparisonPeriodFull, asOf);
  const periodEnd = asOf < currentPeriod.end ? asOf : currentPeriod.end;

  const params: KpiPeriodParams = {
    propertyId: requestedPropertyId,
    departmentId,
    periodStart: currentPeriod.start.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    comparisonPeriodStart: comparisonPeriodFull.start.toISOString().slice(0, 10),
    comparisonPeriodEnd: comparisonEnd.toISOString().slice(0, 10),
  };

  try {
    const repo = makeKpiDatastoreRepo(safeReq.catalystApp, ctx.propertyIds, isAdmin(ctx) || ctx.roleCodes.includes("EXECUTIVE_READONLY"));
    const result = await calculateKpi(repo, req.params.code, params);
    if (!result) {
      res.status(404).json({ error: "Unknown KPI code." });
      return;
    }
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error." });
  }
});

module.exports = app;

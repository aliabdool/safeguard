import "server-only";

import { and, between, eq, isNull, lt, ne, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { capaActions, incidents, investigationCauses, investigations } from "@/db/schema";

export interface DataQualityRow {
  label: string;
  count: number;
}

/**
 * Real checks against this period/property's own records — the same reconciliation a board pack
 * should pass before publication. Shared by the dashboard tile and the board-narrative/assurance
 * exports so the two never drift out of sync with each other.
 */
export async function computeDataQuality(params: {
  propertyId: string | null;
  periodStart: Date;
  periodEnd: Date;
}): Promise<DataQualityRow[]> {
  const { propertyId, periodStart, periodEnd } = params;
  const db = getDb();

  const scopePredicate = propertyId ? eq(incidents.propertyId, propertyId) : undefined;
  const periodPredicate = between(incidents.occurredAt, periodStart, periodEnd);

  const inScopeIncidents = await db
    .select({ id: incidents.id, status: incidents.status })
    .from(incidents)
    .where(and(periodPredicate, scopePredicate));
  const needingInvestigation = inScopeIncidents.filter((i) => i.status !== "reported");

  const rootCauseIncidentIds =
    needingInvestigation.length === 0
      ? new Set<string>()
      : new Set(
          (
            await db
              .select({ incidentId: investigations.incidentId })
              .from(investigationCauses)
              .innerJoin(
                investigations,
                eq(investigations.id, investigationCauses.investigationId),
              )
              .where(eq(investigationCauses.causeType, "root"))
          ).map((r) => r.incidentId),
        );
  const missingRootCause = needingInvestigation.filter(
    (i) => !rootCauseIncidentIds.has(i.id),
  ).length;

  const [missingInjuryMechanism] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(incidents)
    .where(
      and(
        periodPredicate,
        scopePredicate,
        isNull(incidents.injuryMechanism),
        ne(incidents.outcome, "no_injury"),
      ),
    );

  const [pendingReportableDetermination] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(incidents)
    .where(
      and(
        periodPredicate,
        scopePredicate,
        eq(incidents.reportableStatus, "pending_determination"),
      ),
    );

  const capaScopePredicate = propertyId ? eq(capaActions.propertyId, propertyId) : undefined;
  const [overdueCapa] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(capaActions)
    .where(
      and(
        capaScopePredicate,
        lt(capaActions.dueDate, new Date().toISOString().slice(0, 10)),
        notInArray(capaActions.status, ["closed", "verified"]),
      ),
    );

  return [
    { label: "Missing root cause (investigated incidents)", count: missingRootCause },
    {
      label: "Missing injury mechanism (injury outcomes)",
      count: missingInjuryMechanism?.n ?? 0,
    },
    {
      label: "OSH-reportable status not yet determined",
      count: pendingReportableDetermination?.n ?? 0,
    },
    { label: "Corrective actions overdue", count: overdueCapa?.n ?? 0 },
  ];
}

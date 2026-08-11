import "server-only";

import type { CatalystApp, CatalystRow } from "@/lib/catalyst/app";
import { zcqlString } from "@/lib/catalyst/zcql-escape";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";
import type { AuthContext } from "@/server/permissions";

import { groupScopeClause, type DashboardScope } from "./scope";

export type AttentionSeverity = "critical" | "high";

export interface ManagementAttentionItem {
  severity: AttentionSeverity;
  businessUnitName: string;
  message: string;
}

const OVERDUE_INVESTIGATION_DAYS = 7;
const CRITICAL_CAPA_OVERDUE_ANY_DAYS = 0;

interface IncidentRow extends CatalystRow {
  property_id: string;
  occurred_at: string;
  status: string;
  potential_severity: string;
  actual_severity: string;
  outcome: string;
}

interface CapaRow extends CatalystRow {
  property_id: string;
  due_date: string;
  capa_priority: string;
  status: string;
}

interface FindingRow extends CatalystRow {
  classification: string;
  status: string;
  description: string;
}

/**
 * Real, deterministic exception detection — every item here traces to an actual live record, never
 * a fabricated example (see chat: the sample banner text in the brief is illustrative only). Two
 * exception types the brief also names (expired critical evidence, repeated serious root cause)
 * are deliberately NOT implemented here — there is no live "evidence expiry" field on Documents/
 * DocumentVersions and no populated root-cause-category data to detect repetition against yet, and
 * fabricating either would violate the same "never invent a value" rule the rest of this dashboard
 * follows. Documented as a known gap rather than faked.
 */
export async function computeManagementAttention(
  catalystApp: CatalystApp,
  ctx: AuthContext,
  scope: DashboardScope,
  propertyNameById: Map<string, string>,
): Promise<ManagementAttentionItem[]> {
  const datastore = catalystApp.datastore();
  const propClause =
    scope.kind === "property"
      ? `Incidents.property_id = ${zcqlString(scope.propertyId)}`
      : groupScopeClause("Incidents.property_id", ctx);

  const items: ManagementAttentionItem[] = [];

  // Fatalities and any incident with a serious actual severity (S4/S5), regardless of status.
  const seriousIncidents = (await datastore.table("Incidents").getRows({
    criteria: `${propClause} and (Incidents.outcome = 'fatality' or Incidents.actual_severity >= 4)`,
  })) as IncidentRow[];
  for (const inc of seriousIncidents) {
    const buName = propertyNameById.get(inc.property_id) ?? "Unknown Business Unit";
    items.push({
      severity: "critical",
      businessUnitName: buName,
      message:
        inc.outcome === "fatality"
          ? "Fatality recorded — requires executive review."
          : `Serious actual-severity event (S${inc.actual_severity}) recorded.`,
    });
  }

  // Unresolved P4/P5 high-potential incidents, overdue past OVERDUE_INVESTIGATION_DAYS.
  const highPotentialRows = (await datastore.table("Incidents").getRows({
    criteria: `${propClause} and Incidents.is_high_potential = true and Incidents.status = 'reported'`,
  })) as IncidentRow[];
  const now = Date.now();
  for (const inc of highPotentialRows) {
    const occurredMs = new Date(inc.occurred_at).getTime();
    const daysOpen = Math.floor((now - occurredMs) / (1000 * 60 * 60 * 24));
    if (daysOpen >= OVERDUE_INVESTIGATION_DAYS) {
      const buName = propertyNameById.get(inc.property_id) ?? "Unknown Business Unit";
      items.push({
        severity: "critical",
        businessUnitName: buName,
        message: `P${Math.max(Number(inc.potential_severity), Number(inc.actual_severity))} high-potential investigation overdue by ${daysOpen - OVERDUE_INVESTIGATION_DAYS} day${daysOpen - OVERDUE_INVESTIGATION_DAYS === 1 ? "" : "s"}.`,
      });
    }
  }

  // Overdue critical-priority CAPA actions.
  const capaPropClause =
    scope.kind === "property"
      ? `CAPA.property_id = ${zcqlString(scope.propertyId)}`
      : groupScopeClause("CAPA.property_id", ctx);
  const today = toZcqlDateTime(new Date()).slice(0, 10);
  const criticalCapaRows = (await datastore.table("CAPA").getRows({
    criteria: `${capaPropClause} and CAPA.capa_priority = 'critical' and CAPA.status not in ('closed','verified') and CAPA.due_date < '${today}'`,
  })) as CapaRow[];
  for (const capa of criticalCapaRows) {
    const buName = propertyNameById.get(capa.property_id) ?? "Unknown Business Unit";
    const daysOverdue = Math.floor(
      (Date.now() - new Date(capa.due_date).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysOverdue > CRITICAL_CAPA_OVERDUE_ANY_DAYS) {
      items.push({
        severity: "critical",
        businessUnitName: buName,
        message: `Critical corrective action overdue by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}.`,
      });
    }
  }

  // Open critical/major findings — resolved via the parent Audit's property_id (AuditFindings has
  // no property_id of its own), matching the same pattern as OPEN_CRIT_MAJOR_FINDINGS's own KPI.
  const auditPropClause =
    scope.kind === "property"
      ? `Audits.property_id = ${zcqlString(scope.propertyId)}`
      : groupScopeClause("Audits.property_id", ctx);
  const scopedAudits = (await datastore.table("Audits").getRows({
    criteria: auditPropClause,
  })) as unknown as Array<{ ROWID: string; property_id: string }>;
  if (scopedAudits.length > 0) {
    const auditIds = scopedAudits.map((a) => a.ROWID);
    const auditPropertyByAuditId = new Map(scopedAudits.map((a) => [a.ROWID, a.property_id]));
    const findingRows = (await datastore.table("AuditFindings").getRows({
      criteria: `AuditFindings.audit_id in (${auditIds.map((id) => zcqlString(id)).join(",")}) and AuditFindings.classification = 'critical_nc' and AuditFindings.status != 'closed'`,
    })) as unknown as Array<FindingRow & { audit_id: string }>;
    for (const f of findingRows) {
      const buId = auditPropertyByAuditId.get(f.audit_id);
      const buName = (buId && propertyNameById.get(buId)) ?? "Unknown Business Unit";
      items.push({
        severity: "critical",
        businessUnitName: buName,
        message: "Critical non-conformance finding remains open.",
      });
    }
    const majorFindingRows = (await datastore.table("AuditFindings").getRows({
      criteria: `AuditFindings.audit_id in (${auditIds.map((id) => zcqlString(id)).join(",")}) and AuditFindings.classification = 'major_nc' and AuditFindings.status != 'closed'`,
    })) as unknown as Array<FindingRow & { audit_id: string }>;
    for (const f of majorFindingRows) {
      const buId = auditPropertyByAuditId.get(f.audit_id);
      const buName = (buId && propertyNameById.get(buId)) ?? "Unknown Business Unit";
      items.push({
        severity: "high",
        businessUnitName: buName,
        message: "Major non-conformance finding remains open.",
      });
    }
  }

  // Deduplicate and sort: critical first.
  return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

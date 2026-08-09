import "server-only";

import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";

import { propertyScopeClause } from "../scope";
import type { KpiCalculationParams, KpiCalculationResult } from "../types";

/** Not `extends CatalystRow` — final_approved_at is genuinely nullable, which conflicts with
 * CatalystRow's `Record<string, string>` index signature. */
interface CapaRow {
  ROWID: string;
  due_date: string;
  final_approved_at: string | null;
}

function capaScopeClause(params: KpiCalculationParams, table = "CAPA"): string {
  const propClause = params.propertyId
    ? `${table}.property_id = '${params.propertyId}'`
    : propertyScopeClause(`${table}.property_id`, params.ctx);
  const deptClause = params.departmentId ? ` and ${table}.department_id = '${params.departmentId}'` : "";
  return `${propClause}${deptClause}`;
}

/** Proportion of CAPA actions closed in the period that were closed by their due date. */
export async function capaClosedOnTimeRate(
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  const datastore = params.catalystApp.datastore();
  const scope = capaScopeClause(params);

  async function rate(start: Date, end: Date) {
    const closed = (await datastore.table("CAPA").getRows({
      criteria: `${scope} and CAPA.status = 'closed' and CAPA.final_approved_at >= '${toZcqlDateTime(start)}' and CAPA.final_approved_at <= '${toZcqlDateTime(end)}'`,
    })) as unknown as CapaRow[];
    if (closed.length === 0) {
      return { value: null as number | null, ids: [] as string[] };
    }
    const onTime = closed.filter(
      (c) => c.final_approved_at != null && c.final_approved_at <= `${c.due_date}T23:59:59Z`,
    );
    return { value: (onTime.length / closed.length) * 100, ids: closed.map((c) => c.ROWID) };
  }

  const current = await rate(params.periodStart, params.periodEnd);
  const comparison = await rate(params.comparisonPeriodStart, params.comparisonPeriodEnd);

  return {
    currentValue: current.value,
    comparisonValue: comparison.value,
    includedRecordIds: current.ids,
    excludedRecordIds: [],
    dataQualityStatus: current.value == null ? "incomplete" : "ok",
  };
}

/**
 * Proportion of CAPA verifications recorded in the period with outcome = effective. Verifier is
 * always a different person from the action owner (enforced at the application layer now —
 * isValidOwnerVerifierPair() in the CAPA module, not RLS, since Catalyst has no RLS equivalent) —
 * this KPI is measuring whether that verification found the action actually worked, not just that
 * it was closed on time.
 */
export async function capaEffectivenessRate(
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  const datastore = params.catalystApp.datastore();
  const scope = capaScopeClause(params, "CAPA");

  // CAPAVerification.capa_id is a plain Text column, not a real Lookup/FK to CAPA — same class of
  // bug as the UserRoles/Roles join fixed in server/permissions/index.ts, so the CAPA scope is
  // resolved to a ROWID list first and CAPAVerification is filtered by capa_id in application code
  // rather than joined in ZCQL.
  const scopedCapaRows = (await datastore.table("CAPA").getRows({
    criteria: scope,
  })) as unknown as Array<{ ROWID: string }>;
  const capaIds = scopedCapaRows.map((c) => c.ROWID);

  async function rate(start: Date, end: Date) {
    if (capaIds.length === 0) {
      return { value: null as number | null, ids: [] as string[] };
    }
    const verifications = (await datastore.table("CAPAVerification").getRows({
      criteria: `CAPAVerification.capa_id in (${capaIds.map((id) => `'${id}'`).join(",")}) and CAPAVerification.verified_at >= '${toZcqlDateTime(start)}' and CAPAVerification.verified_at <= '${toZcqlDateTime(end)}'`,
    })) as unknown as Array<{ ROWID: string; outcome: string }>;
    if (verifications.length === 0) {
      return { value: null as number | null, ids: [] as string[] };
    }
    const effective = verifications.filter((v) => v.outcome === "effective");
    return {
      value: (effective.length / verifications.length) * 100,
      ids: verifications.map((v) => v.ROWID),
    };
  }

  const current = await rate(params.periodStart, params.periodEnd);
  const comparison = await rate(params.comparisonPeriodStart, params.comparisonPeriodEnd);

  return {
    currentValue: current.value,
    comparisonValue: comparison.value,
    includedRecordIds: current.ids,
    excludedRecordIds: [],
    dataQualityStatus: current.value == null ? "incomplete" : "ok",
  };
}

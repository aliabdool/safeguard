import "server-only";

import { propertyScopeClause } from "../scope";
import type { KpiCalculationParams, KpiCalculationResult } from "../types";

/** Not `extends CatalystRow` — final_approved_at is genuinely nullable, which conflicts with
 * CatalystRow's `Record<string, string>` index signature. */
interface CapaRow {
  ROWID: string;
  due_date: string;
  final_approved_at: string | null;
}

interface VerificationJoinRow {
  CAPAVerification: { ROWID: string; outcome: string };
}

function capaScopeClause(params: KpiCalculationParams, table = "CAPA"): string {
  const propClause = params.propertyId
    ? `${table}.property_id = '${params.propertyId}'`
    : propertyScopeClause(`${table}.property_id`, params.ctx);
  const deptClause = params.departmentId ? ` && ${table}.department_id = '${params.departmentId}'` : "";
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
      criteria: `${scope} && CAPA.status = 'closed' && CAPA.final_approved_at >= '${start.toISOString()}' and CAPA.final_approved_at <= '${end.toISOString()}'`,
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
  const zcql = params.catalystApp.zcql();
  const scope = capaScopeClause(params, "CAPA");

  async function rate(start: Date, end: Date) {
    const verifications = (await zcql.executeZCQLQuery(
      `select CAPAVerification.ROWID, CAPAVerification.outcome
       from CAPAVerification left join CAPA on CAPAVerification.capa_id = CAPA.ROWID
       where ${scope} && CAPAVerification.verified_at >= '${start.toISOString()}' and CAPAVerification.verified_at <= '${end.toISOString()}'`,
    )) as VerificationJoinRow[];
    if (verifications.length === 0) {
      return { value: null as number | null, ids: [] as string[] };
    }
    const effective = verifications.filter((v) => v.CAPAVerification.outcome === "effective");
    return {
      value: (effective.length / verifications.length) * 100,
      ids: verifications.map((v) => v.CAPAVerification.ROWID),
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

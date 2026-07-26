import type { KpiDirection, RagStatus } from "./rag";

export interface KpiCalculationParams {
  propertyId?: string | null;
  departmentId?: string | null;
  periodStart: Date;
  periodEnd: Date;
  comparisonPeriodStart: Date;
  comparisonPeriodEnd: Date;
}

export interface KpiCalculationResult {
  currentValue: number | null;
  comparisonValue: number | null;
  includedRecordIds: string[];
  excludedRecordIds: string[];
  dataQualityStatus: "ok" | "unverified" | "incomplete";
}

/** Ported from the Supabase build's src/server/kpi/calculate.ts — same shape, same field names,
 * so the pure report generators (board-narrative.ts, assurance-pack.ts) need no changes. */
export interface KpiTileResult {
  kpiCode: string;
  name: string;
  unit: string;
  classification: string;
  direction: KpiDirection;
  currentValue: number | null;
  comparisonValue: number | null;
  varianceAbs: number | null;
  variancePct: number | null;
  target: number | null;
  ragStatus: RagStatus;
  dataThroughDate: Date;
  dataQualityStatus: string;
  isYtdClipped: boolean;
  includedRecordIds: string[];
  fyLabel: string;
  isImplemented: boolean;
}

/** Ported from src/server/dashboard/data-quality.ts. */
export interface DataQualityRow {
  label: string;
  count: number;
}

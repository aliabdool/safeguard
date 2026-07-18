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

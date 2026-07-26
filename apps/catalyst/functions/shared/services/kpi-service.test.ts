import { describe, expect, it } from "vitest";

import {
  calculateKpi,
  isKpiImplemented,
  REGISTERED_KPI_CODES,
  type KpiDefinitionRow,
  type KpiPeriodParams,
  type KpiRawResult,
  type KpiRepo,
} from "./kpi-service";

const PARAMS: KpiPeriodParams = {
  propertyId: "prop-la-pirogue",
  departmentId: null,
  periodStart: "2026-07-01",
  periodEnd: "2026-07-21",
  comparisonPeriodStart: "2025-07-01",
  comparisonPeriodEnd: "2025-07-21",
};

function emptyResult(dataQualityStatus: KpiRawResult["dataQualityStatus"] = "ok"): KpiRawResult {
  return { currentValue: null, comparisonValue: null, includedRecordIds: [], dataQualityStatus };
}

class FakeKpiRepo implements KpiRepo {
  definitions = new Map<string, KpiDefinitionRow>();
  snapshots: unknown[] = [];
  fatalityCount: KpiRawResult = emptyResult();
  capaOnTime: KpiRawResult = emptyResult();
  frameworkSnapshot: { rollupScore: number | null; isCapped: boolean; controlIds: string[] } | undefined;

  async getKpiDefinition(kpiCode: string) {
    return this.definitions.get(kpiCode);
  }
  async countIncidentsByPersonType(_p: KpiPeriodParams, _personType: string | null) {
    return { currentValue: 3, comparisonValue: 5, includedRecordIds: ["inc-1", "inc-2", "inc-3"], dataQualityStatus: "ok" as const };
  }
  async countIncidentsByOutcome(_p: KpiPeriodParams, outcomes: string[]) {
    if (outcomes.includes("fatality")) return this.fatalityCount;
    return emptyResult();
  }
  async countIncidentsByFlag() {
    return emptyResult();
  }
  async countLtiIncidents() {
    return emptyResult();
  }
  async countReportableOshCases() {
    return emptyResult();
  }
  async sumIncidentField() {
    return emptyResult();
  }
  async countOpenCriticalMajorFindings() {
    return { currentValue: 2, comparisonValue: null, includedRecordIds: ["finding-1", "finding-2"], dataQualityStatus: "ok" as const };
  }
  async capaOnTimeRate() {
    return this.capaOnTime;
  }
  async capaEffectivenessRate() {
    return emptyResult();
  }
  async getFrameworkReadinessSnapshot() {
    return this.frameworkSnapshot;
  }
  async insertSnapshot(row: unknown) {
    this.snapshots.push(row);
  }
}

function def(overrides: Partial<KpiDefinitionRow> = {}): KpiDefinitionRow {
  return {
    kpiCode: "FATALITIES",
    name: "Fatalities",
    unit: "count",
    classification: "lagging",
    direction: "lower_better",
    target: 0,
    warningThreshold: null,
    criticalThreshold: 0,
    ...overrides,
  };
}

describe("the 22-KPI registry matches the Supabase build's wired set", () => {
  it("has exactly 22 implemented KPI codes", () => {
    expect(REGISTERED_KPI_CODES).toHaveLength(22);
  });
  it("FATALITIES, CAPA_ON_TIME, and ISO45001_READINESS are implemented", () => {
    expect(isKpiImplemented("FATALITIES")).toBe(true);
    expect(isKpiImplemented("CAPA_ON_TIME")).toBe(true);
    expect(isKpiImplemented("ISO45001_READINESS")).toBe(true);
  });
  it("a KPI outside the 22 is not implemented", () => {
    expect(isKpiImplemented("LTIFR")).toBe(false);
  });
});

describe("never show a fake zero — 'not yet calculable' instead", () => {
  it("a KPI with no definition row returns null (unknown KPI code)", async () => {
    const repo = new FakeKpiRepo();
    const result = await calculateKpi(repo, "NOT_A_REAL_CODE", PARAMS);
    expect(result).toBeNull();
  });

  it("a defined-but-unimplemented KPI (e.g. LTIFR) returns isImplemented:false and null, not 0", async () => {
    const repo = new FakeKpiRepo();
    repo.definitions.set("LTIFR", def({ kpiCode: "LTIFR", name: "Lost-Time Injury Frequency Rate" }));
    const result = await calculateKpi(repo, "LTIFR", PARAMS);
    expect(result?.isImplemented).toBe(false);
    expect(result?.currentValue).toBeNull();
    expect(result?.ragStatus).toBe("unknown");
  });

  it("CAPA_ON_TIME with zero verifications in period returns null, not a fabricated 0%", async () => {
    const repo = new FakeKpiRepo();
    repo.definitions.set(
      "CAPA_ON_TIME",
      def({ kpiCode: "CAPA_ON_TIME", name: "CAPA closed on time", direction: "higher_better", target: 90 }),
    );
    repo.capaOnTime = emptyResult("incomplete");
    const result = await calculateKpi(repo, "CAPA_ON_TIME", PARAMS);
    expect(result?.currentValue).toBeNull();
    expect(result?.ragStatus).toBe("unknown");
  });

  it("a genuinely-zero incident count IS shown as 0, not suppressed — real data, not a fake zero", async () => {
    const repo = new FakeKpiRepo();
    repo.definitions.set("FATALITIES", def());
    repo.fatalityCount = { currentValue: 0, comparisonValue: 0, includedRecordIds: [], dataQualityStatus: "ok" };
    const result = await calculateKpi(repo, "FATALITIES", PARAMS);
    expect(result?.currentValue).toBe(0);
    expect(result?.isImplemented).toBe(true);
  });
});

describe("Fatalities must always be prominent — the number is real and calculated", () => {
  it("a fatality count of 1 is returned as an actual number, RAG-flagged red", async () => {
    const repo = new FakeKpiRepo();
    repo.definitions.set("FATALITIES", def());
    repo.fatalityCount = { currentValue: 1, comparisonValue: 0, includedRecordIds: ["inc-fatal-1"], dataQualityStatus: "ok" };
    const result = await calculateKpi(repo, "FATALITIES", PARAMS);
    expect(result?.currentValue).toBe(1);
    expect(result?.ragStatus).toBe("red");
    expect(result?.includedRecordIds).toContain("inc-fatal-1");
  });
});

describe("framework readiness KPIs read the Phase 8 snapshot, never recompute live", () => {
  it("ISO45001_READINESS reflects a capped rollup as data-quality 'unverified', not silently ok", async () => {
    const repo = new FakeKpiRepo();
    repo.definitions.set(
      "ISO45001_READINESS",
      def({ kpiCode: "ISO45001_READINESS", name: "ISO 45001 readiness", direction: "higher_better", target: 80 }),
    );
    repo.frameworkSnapshot = { rollupScore: 1, isCapped: true, controlIds: ["control-fire-cert"] };
    const result = await calculateKpi(repo, "ISO45001_READINESS", PARAMS);
    expect(result?.currentValue).toBe(25); // rollupScore 1 * 25
    expect(result?.dataQualityStatus).toBe("unverified");
  });

  it("returns not-yet-calculable when no snapshot has been computed yet", async () => {
    const repo = new FakeKpiRepo();
    repo.definitions.set("LEGAL_COMPLIANCE", def({ kpiCode: "LEGAL_COMPLIANCE", direction: "higher_better" }));
    repo.frameworkSnapshot = undefined;
    const result = await calculateKpi(repo, "LEGAL_COMPLIANCE", PARAMS);
    expect(result?.currentValue).toBeNull();
    expect(result?.dataQualityStatus).toBe("incomplete");
  });
});

describe("every calculation writes a snapshot for reconciliation", () => {
  it("records one snapshot row per calculateKpi call", async () => {
    const repo = new FakeKpiRepo();
    repo.definitions.set("FATALITIES", def());
    repo.fatalityCount = { currentValue: 0, comparisonValue: 0, includedRecordIds: [], dataQualityStatus: "ok" };
    await calculateKpi(repo, "FATALITIES", PARAMS);
    expect(repo.snapshots).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";

import {
  planFinancialYearBackfill,
  planIncidentPrefixBackfill,
  summarizeBackfillPlan,
  type IncidentFinancialYearInput,
  type IncidentPrefixInput,
} from "./backfill";

describe("planFinancialYearBackfill", () => {
  it("plans an update for a row with a null financial_year", () => {
    const incidents: IncidentFinancialYearInput[] = [
      { id: "inc-1", occurredAt: new Date(Date.UTC(2026, 6, 15)), financialYear: null },
    ];
    expect(planFinancialYearBackfill(incidents)).toEqual([
      { incidentId: "inc-1", before: null, after: "FY2027" },
    ]);
  });

  it("plans an update for a row with a wrong financial_year", () => {
    const incidents: IncidentFinancialYearInput[] = [
      { id: "inc-1", occurredAt: new Date(Date.UTC(2026, 6, 15)), financialYear: "FY2025" },
    ];
    const plan = planFinancialYearBackfill(incidents);
    expect(plan).toEqual([{ incidentId: "inc-1", before: "FY2025", after: "FY2027" }]);
  });

  it("is idempotent: a row whose financial_year already matches produces no plan entry", () => {
    const incidents: IncidentFinancialYearInput[] = [
      { id: "inc-1", occurredAt: new Date(Date.UTC(2026, 6, 15)), financialYear: "FY2027" },
    ];
    expect(planFinancialYearBackfill(incidents)).toEqual([]);
  });

  it("derives the FY correctly across the Jul-Jun boundary", () => {
    const incidents: IncidentFinancialYearInput[] = [
      { id: "inc-1", occurredAt: new Date(Date.UTC(2026, 5, 30)), financialYear: null }, // 30 Jun 2026 -> FY2026
      { id: "inc-2", occurredAt: new Date(Date.UTC(2026, 6, 1)), financialYear: null }, // 1 Jul 2026 -> FY2027
    ];
    const plan = planFinancialYearBackfill(incidents);
    expect(plan.find((e) => e.incidentId === "inc-1")?.after).toBe("FY2026");
    expect(plan.find((e) => e.incidentId === "inc-2")?.after).toBe("FY2027");
  });

  it("returns an empty plan for no incidents", () => {
    expect(planFinancialYearBackfill([])).toEqual([]);
  });
});

describe("planIncidentPrefixBackfill", () => {
  const propertyPrefixById = new Map<string, string | null>([
    ["prop-1", "LP"],
    ["prop-2", null], // property exists but has no prefix configured
  ]);

  it("plans an update for an incident whose incident_prefix doesn't match its property's prefix", () => {
    const incidents: IncidentPrefixInput[] = [
      { id: "inc-1", propertyId: "prop-1", incidentPrefix: null },
    ];
    const plan = planIncidentPrefixBackfill(incidents, propertyPrefixById);
    expect(plan.entries).toEqual([{ incidentId: "inc-1", before: null, after: "LP" }]);
    expect(plan.skipped).toEqual([]);
  });

  it("is idempotent: an incident whose incident_prefix already matches produces no plan entry", () => {
    const incidents: IncidentPrefixInput[] = [
      { id: "inc-1", propertyId: "prop-1", incidentPrefix: "LP" },
    ];
    const plan = planIncidentPrefixBackfill(incidents, propertyPrefixById);
    expect(plan.entries).toEqual([]);
  });

  it("skips (never fabricates) when the property has no incident_prefix configured", () => {
    const incidents: IncidentPrefixInput[] = [
      { id: "inc-1", propertyId: "prop-2", incidentPrefix: null },
    ];
    const plan = planIncidentPrefixBackfill(incidents, propertyPrefixById);
    expect(plan.entries).toEqual([]);
    expect(plan.skipped).toEqual([
      { incidentId: "inc-1", reason: "Property prop-2 has no incident_prefix configured." },
    ]);
  });

  it("skips an incident with no property_id", () => {
    const incidents: IncidentPrefixInput[] = [
      { id: "inc-1", propertyId: null, incidentPrefix: null },
    ];
    const plan = planIncidentPrefixBackfill(incidents, propertyPrefixById);
    expect(plan.skipped).toEqual([
      { incidentId: "inc-1", reason: "Incident has no property_id." },
    ]);
  });

  it("skips an incident whose property_id doesn't resolve to a known property", () => {
    const incidents: IncidentPrefixInput[] = [
      { id: "inc-1", propertyId: "prop-unknown", incidentPrefix: null },
    ];
    const plan = planIncidentPrefixBackfill(incidents, propertyPrefixById);
    expect(plan.skipped).toEqual([
      { incidentId: "inc-1", reason: "Referenced property prop-unknown could not be found." },
    ]);
  });
});

describe("summarizeBackfillPlan", () => {
  it("summarizes counts from both plans", () => {
    const summary = summarizeBackfillPlan(
      10,
      [{ incidentId: "inc-1", before: null, after: "FY2027" }],
      {
        entries: [{ incidentId: "inc-1", before: null, after: "LP" }],
        skipped: [{ incidentId: "inc-2", reason: "no prefix" }],
      },
    );
    expect(summary).toEqual({
      totalScanned: 10,
      financialYearChanges: 1,
      incidentPrefixChanges: 1,
      incidentPrefixSkipped: 1,
    });
  });
});

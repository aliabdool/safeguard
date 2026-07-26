import { beforeEach, describe, expect, it } from "vitest";

import { scanForExceptions, type DataQualityCandidates, type DataQualityExceptionRecord, type DataQualityRepo } from "./data-quality-service";
import type { DataQualityException } from "../pure/data-quality-rules";

const ASOF = new Date("2026-07-21T00:00:00Z");

class FakeDataQualityRepo implements DataQualityRepo {
  records = new Map<string, DataQualityExceptionRecord>();
  private counter = 0;
  async listOpenExceptions() {
    return [...this.records.values()].filter((r) => r.status === "open");
  }
  async insertException(exc: DataQualityException) {
    this.counter += 1;
    const rec: DataQualityExceptionRecord = { ...exc, id: `dq-${this.counter}`, status: "open" };
    this.records.set(rec.id, rec);
    return rec;
  }
  async resolveException(id: string) {
    const rec = this.records.get(id);
    if (rec) rec.status = "resolved";
  }
}

function emptyCandidates(): DataQualityCandidates {
  return {
    kpis: [],
    investigations: [],
    capas: [],
    expiredEvidenceLinks: [],
    hospitalReferralIncidents: [],
    closedFindings: [],
    scoredControls: [],
    materialTopics: [],
    climateRisks: [],
  };
}

let repo: FakeDataQualityRepo;
beforeEach(() => {
  repo = new FakeDataQualityRepo();
});

describe("scanning opens new exceptions for newly-detected problems", () => {
  it("opens an exception for a control scored without evidence", async () => {
    const candidates = emptyCandidates();
    candidates.scoredControls = [{ id: "assess-1", propertyId: "prop-a", maturityScore: 3, hasApprovedEvidence: false }];
    const { opened } = await scanForExceptions(repo, candidates, ASOF);
    expect(opened).toHaveLength(1);
    expect(opened[0]?.module).toBe("Controls");
  });

  it("does not open a duplicate exception for the same record on a second scan", async () => {
    const candidates = emptyCandidates();
    candidates.scoredControls = [{ id: "assess-1", propertyId: "prop-a", maturityScore: 3, hasApprovedEvidence: false }];
    await scanForExceptions(repo, candidates, ASOF);
    const second = await scanForExceptions(repo, candidates, ASOF);
    expect(second.opened).toHaveLength(0);
    expect((await repo.listOpenExceptions())).toHaveLength(1);
  });
});

describe("scanning resolves exceptions that are no longer detected", () => {
  it("resolves a critical gap once evidence is linked, rather than leaving it open forever", async () => {
    const candidates = emptyCandidates();
    candidates.scoredControls = [{ id: "assess-1", propertyId: "prop-a", maturityScore: 3, hasApprovedEvidence: false }];
    await scanForExceptions(repo, candidates, ASOF);
    expect((await repo.listOpenExceptions())).toHaveLength(1);

    candidates.scoredControls = [{ id: "assess-1", propertyId: "prop-a", maturityScore: 3, hasApprovedEvidence: true }];
    const { resolvedIds } = await scanForExceptions(repo, candidates, ASOF);
    expect(resolvedIds).toHaveLength(1);
    expect((await repo.listOpenExceptions())).toHaveLength(0);
  });
});

describe("all nine rule types can be scanned together in one pass", () => {
  it("detects one exception per candidate module when every module has a violation", async () => {
    const candidates: DataQualityCandidates = {
      kpis: [{ kpiCode: "LTIFR", propertyId: "prop-a", dataQualityStatus: "incomplete", currentValue: null }],
      investigations: [{ id: "inv-1", propertyId: "prop-a", status: "completed", completedAt: null }],
      capas: [{ id: "capa-1", propertyId: "prop-a", dueDate: "2026-01-01", status: "in_progress", hasVerification: false }],
      expiredEvidenceLinks: [{ id: "link-1", propertyId: "prop-a", isExpired: true, linkedEntityType: "control_assessment", linkedEntityId: "a-1" }],
      hospitalReferralIncidents: [{ id: "inc-1", propertyId: "prop-a", hospitalReferral: true, reportableStatus: "pending_determination", occurredAt: "2026-06-01T00:00:00Z" }],
      closedFindings: [{ id: "finding-1", propertyId: "prop-a", status: "closed", hasEvidence: false }],
      scoredControls: [{ id: "assess-1", propertyId: "prop-a", maturityScore: 3, hasApprovedEvidence: false }],
      materialTopics: [{ id: "topic-1", propertyId: null, ifrsFinancialMaterialityScore: null }],
      climateRisks: [{ id: "risk-1", propertyId: "prop-a", residualRiskScore: null }],
    };
    const { opened } = await scanForExceptions(repo, candidates, ASOF);
    expect(opened).toHaveLength(9);
    const modules = opened.map((o) => o.module).sort();
    expect(modules).toEqual(["Audits", "CAPA", "Climate", "Controls", "Documents", "Incidents", "Incidents", "KPI", "Materiality"].sort());
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import type { AuthContext } from "../pure/permissions";
import type { DimensionScores } from "../pure/maturity";
import {
  computeFrameworkReadiness,
  recordControlAssessment,
  type AuditEntry,
  type AuditLogger,
  type ControlAssessmentRecord,
  type ControlRepo,
  type CriticalGapRecord,
  type FrameworkReadinessSnapshotRecord,
} from "./control-service";

const PROPERTY_A = "prop-la-pirogue";
const FIRE_CONTROL = "control-fire-cert";
const HOUSEKEEPING_CONTROL = "control-housekeeping-training";
const ISO45001 = "framework-iso45001";

class FakeControlRepo implements ControlRepo {
  assessments: ControlAssessmentRecord[] = [];
  criticalGaps = new Map<string, CriticalGapRecord>();
  snapshots: FrameworkReadinessSnapshotRecord[] = [];
  mappedControls: Array<{ controlId: string; isLifeSafetyCritical: boolean; isLegal: boolean }> = [];
  private counter = 0;
  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  async insertAssessment(row: Omit<ControlAssessmentRecord, "id">) {
    const rec = { ...row, id: this.nextId("assessment") };
    this.assessments.push(rec);
    return rec;
  }
  async getLatestDimensionScores(controlId: string, propertyId: string): Promise<DimensionScores> {
    const scores: DimensionScores = {};
    for (const a of this.assessments) {
      if (a.controlId !== controlId || a.propertyId !== propertyId) continue;
      scores[a.dimension] = a.maturityScore;
    }
    return scores;
  }
  async getOpenCriticalGap(controlId: string, propertyId: string) {
    return [...this.criticalGaps.values()].find(
      (g) => g.controlId === controlId && g.propertyId === propertyId && g.resolvedAt === null,
    );
  }
  async insertCriticalGap(row: Omit<CriticalGapRecord, "id" | "resolvedAt">) {
    const rec: CriticalGapRecord = { ...row, id: this.nextId("gap"), resolvedAt: null };
    this.criticalGaps.set(rec.id, rec);
    return rec;
  }
  async resolveCriticalGap(id: string) {
    const gap = this.criticalGaps.get(id);
    if (gap) gap.resolvedAt = new Date().toISOString();
  }
  async listMappedControls(_frameworkId: string) {
    return this.mappedControls;
  }
  async getLatestDimensionScoresForControls(controlIds: string[], propertyId: string | null) {
    const map = new Map<string, DimensionScores>();
    for (const controlId of controlIds) {
      const scores: DimensionScores = {};
      for (const a of this.assessments) {
        if (a.controlId !== controlId) continue;
        if (propertyId !== null && a.propertyId !== propertyId) continue;
        scores[a.dimension] = a.maturityScore;
      }
      map.set(controlId, scores);
    }
    return map;
  }
  async insertFrameworkReadinessSnapshot(row: Omit<FrameworkReadinessSnapshotRecord, "id">) {
    const rec = { ...row, id: this.nextId("snapshot") };
    this.snapshots.push(rec);
    return rec;
  }
}

class FakeAuditLogger implements AuditLogger {
  entries: AuditEntry[] = [];
  async log(entry: AuditEntry) {
    this.entries.push(entry);
  }
}

function makeCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "user-1",
    status: "active",
    roleCodes: [],
    propertyIds: [],
    departmentAccess: new Map(),
    medicalPermissions: new Set(),
    ...overrides,
  };
}

let repo: FakeControlRepo;
let audit: FakeAuditLogger;
beforeEach(() => {
  repo = new FakeControlRepo();
  audit = new FakeAuditLogger();
});

describe("an expired fire certificate creates a critical gap", () => {
  it("scoring a life-safety-critical control's effectiveness at 1 opens a CriticalGaps row", async () => {
    const officer = makeCtx({ propertyIds: [PROPERTY_A] });
    // Assessor first scores policy/procedure/implementation reasonably...
    for (const dimension of ["policy", "procedure", "implementation"] as const) {
      await recordControlAssessment(repo, audit, officer, {
        controlId: FIRE_CONTROL,
        propertyId: PROPERTY_A,
        dimension,
        maturityScore: 3,
        notes: null,
        isLifeSafetyCritical: true,
        isLegal: true,
      });
    }
    // ...but effectiveness scores 1 because the fire certificate expired.
    const { criticalGap } = await recordControlAssessment(repo, audit, officer, {
      controlId: FIRE_CONTROL,
      propertyId: PROPERTY_A,
      dimension: "effectiveness",
      maturityScore: 1,
      notes: "Fire safety certificate expired 2026-06-01 — not yet renewed.",
      isLifeSafetyCritical: true,
      isLegal: true,
    });

    expect(criticalGap).not.toBeNull();
    expect(criticalGap?.reason).toContain("Fire safety certificate expired");
  });

  it("a later assessment that clears the gap resolves it rather than deleting the record", async () => {
    const officer = makeCtx({ propertyIds: [PROPERTY_A] });
    await recordControlAssessment(repo, audit, officer, {
      controlId: FIRE_CONTROL,
      propertyId: PROPERTY_A,
      dimension: "effectiveness",
      maturityScore: 1,
      notes: "Certificate expired.",
      isLifeSafetyCritical: true,
      isLegal: true,
    });
    expect(repo.criticalGaps.size).toBe(1);

    const { criticalGap } = await recordControlAssessment(repo, audit, officer, {
      controlId: FIRE_CONTROL,
      propertyId: PROPERTY_A,
      dimension: "effectiveness",
      maturityScore: 4,
      notes: "Certificate renewed and verified.",
      isLifeSafetyCritical: true,
      isLegal: true,
    });
    expect(criticalGap).toBeNull();
    const [gap] = [...repo.criticalGaps.values()];
    expect(gap?.resolvedAt).not.toBeNull();
  });

  it("cannot record an assessment for a property the user has no access to", async () => {
    const officer = makeCtx({ propertyIds: [PROPERTY_A] });
    await expect(
      recordControlAssessment(repo, audit, officer, {
        controlId: FIRE_CONTROL,
        propertyId: "prop-sugar-beach",
        dimension: "effectiveness",
        maturityScore: 4,
        notes: null,
        isLifeSafetyCritical: true,
        isLegal: true,
      }),
    ).rejects.toThrow();
  });
});

describe("a critical gap caps the framework readiness score — never averaged away", () => {
  it("one critical control among several well-scored controls still caps the rollup at 1", async () => {
    repo.mappedControls = [
      { controlId: FIRE_CONTROL, isLifeSafetyCritical: true, isLegal: true },
      { controlId: HOUSEKEEPING_CONTROL, isLifeSafetyCritical: false, isLegal: false },
    ];
    const officer = makeCtx({ propertyIds: [PROPERTY_A] });

    // Three other dimensions score well on the fire control...
    for (const dimension of ["policy", "procedure", "implementation"] as const) {
      await recordControlAssessment(repo, audit, officer, {
        controlId: FIRE_CONTROL,
        propertyId: PROPERTY_A,
        dimension,
        maturityScore: 4,
        notes: null,
        isLifeSafetyCritical: true,
        isLegal: true,
      });
    }
    // ...but effectiveness is 1 because the certificate expired.
    await recordControlAssessment(repo, audit, officer, {
      controlId: FIRE_CONTROL,
      propertyId: PROPERTY_A,
      dimension: "effectiveness",
      maturityScore: 1,
      notes: "Certificate expired.",
      isLifeSafetyCritical: true,
      isLegal: true,
    });

    // The unrelated housekeeping-training control scores perfectly across all four dimensions.
    for (const dimension of ["policy", "procedure", "implementation", "effectiveness"] as const) {
      await recordControlAssessment(repo, audit, officer, {
        controlId: HOUSEKEEPING_CONTROL,
        propertyId: PROPERTY_A,
        dimension,
        maturityScore: 4,
        notes: null,
        isLifeSafetyCritical: false,
        isLegal: false,
      });
    }

    const readiness = await computeFrameworkReadiness(repo, ISO45001, PROPERTY_A);

    // Averaging (4+4)/2 = 4 would be wrong — the critical gap must cap the rollup at 1.
    expect(readiness.isCapped).toBe(true);
    expect(readiness.rollupScore).toBe(1);
    expect(readiness.averageScore).not.toBe(1);
  });
});

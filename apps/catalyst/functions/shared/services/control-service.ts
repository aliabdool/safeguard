/**
 * Control-maturity, critical-gap, and framework-readiness service functions. Phase 8. Uses the
 * already-ported pure critical-gap override math in pure/maturity.ts verbatim — this layer's job
 * is only to persist assessments, keep the CriticalGaps table in sync with what the math says,
 * and snapshot framework readiness. It never re-implements the MIN-of-dimension / capped-rollup
 * rule itself.
 */
import { AuthError, hasPropertyAccess, type AuthContext } from "../pure/permissions";
import {
  computeFrameworkRollup,
  isCriticalGap,
  type DimensionScores,
  type MaturityDimension,
} from "../pure/maturity";

export interface ControlAssessmentRecord {
  id: string;
  controlId: string;
  propertyId: string;
  dimension: MaturityDimension;
  maturityScore: number;
  notes: string | null;
  assessedBy: string;
}

export interface CriticalGapRecord {
  id: string;
  controlId: string;
  propertyId: string;
  reason: string;
  resolvedAt: string | null;
}

export interface FrameworkReadinessSnapshotRecord {
  id: string;
  frameworkId: string;
  propertyId: string | null;
  averageScore: number | null;
  rollupScore: number | null;
  isCapped: boolean;
  mappedControlCount: number;
}

export interface ControlRepo {
  insertAssessment(row: Omit<ControlAssessmentRecord, "id">): Promise<ControlAssessmentRecord>;
  /** Latest score per dimension for one control at one property. */
  getLatestDimensionScores(controlId: string, propertyId: string): Promise<DimensionScores>;

  getOpenCriticalGap(controlId: string, propertyId: string): Promise<CriticalGapRecord | undefined>;
  insertCriticalGap(row: Omit<CriticalGapRecord, "id" | "resolvedAt">): Promise<CriticalGapRecord>;
  resolveCriticalGap(id: string): Promise<void>;

  listMappedControls(
    frameworkId: string,
  ): Promise<Array<{ controlId: string; isLifeSafetyCritical: boolean; isLegal: boolean }>>;
  /** Latest dimension scores per control, scoped to a property (or across all properties when
   * propertyId is null — the group-wide rollup case). */
  getLatestDimensionScoresForControls(
    controlIds: string[],
    propertyId: string | null,
  ): Promise<Map<string, DimensionScores>>;

  insertFrameworkReadinessSnapshot(
    row: Omit<FrameworkReadinessSnapshotRecord, "id">,
  ): Promise<FrameworkReadinessSnapshotRecord>;
}

export interface AuditEntry {
  actorUserId: string;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  propertyId?: string | null;
  reason?: string | null;
}
export interface AuditLogger {
  log(entry: AuditEntry): Promise<void>;
}

export interface RecordAssessmentInput {
  controlId: string;
  propertyId: string;
  dimension: MaturityDimension;
  maturityScore: number;
  notes: string | null;
  isLifeSafetyCritical: boolean;
  isLegal: boolean;
}

/** Test case management named by name: "Expired fire certificate creates critical gap." Scoring
 * a life-safety-critical or legal control's effectiveness (or any dimension) at <=1 opens a
 * CriticalGaps row; a later assessment that clears the gap resolves it — the row is never deleted,
 * only closed, so the gap's history stays auditable. */
export async function recordControlAssessment(
  repo: ControlRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  input: RecordAssessmentInput,
): Promise<{ assessment: ControlAssessmentRecord; criticalGap: CriticalGapRecord | null }> {
  if (!hasPropertyAccess(ctx, input.propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }

  const assessment = await repo.insertAssessment({
    controlId: input.controlId,
    propertyId: input.propertyId,
    dimension: input.dimension,
    maturityScore: input.maturityScore,
    notes: input.notes,
    assessedBy: ctx.userId,
  });

  await audit.log({
    actorUserId: ctx.userId,
    eventType: "control_assessed",
    entityType: "ControlAssessments",
    entityId: assessment.id,
    propertyId: input.propertyId,
    reason: `${input.dimension}=${input.maturityScore}`,
  });

  const latestScores = await repo.getLatestDimensionScores(input.controlId, input.propertyId);
  const nowCritical = isCriticalGap({
    isLifeSafetyCritical: input.isLifeSafetyCritical,
    isLegal: input.isLegal,
    scores: latestScores,
  });

  const existingGap = await repo.getOpenCriticalGap(input.controlId, input.propertyId);

  if (nowCritical && !existingGap) {
    const gap = await repo.insertCriticalGap({
      controlId: input.controlId,
      propertyId: input.propertyId,
      reason: input.notes ?? `${input.dimension} scored ${input.maturityScore} on a critical control.`,
    });
    await audit.log({
      actorUserId: ctx.userId,
      eventType: "critical_gap_identified",
      entityType: "CriticalGaps",
      entityId: gap.id,
      propertyId: input.propertyId,
      reason: gap.reason,
    });
    return { assessment, criticalGap: gap };
  }

  if (!nowCritical && existingGap) {
    await repo.resolveCriticalGap(existingGap.id);
    await audit.log({
      actorUserId: ctx.userId,
      eventType: "critical_gap_resolved",
      entityType: "CriticalGaps",
      entityId: existingGap.id,
      propertyId: input.propertyId,
    });
    return { assessment, criticalGap: null };
  }

  return { assessment, criticalGap: existingGap ?? null };
}

/** Test case: "Critical gap caps readiness score" — the rollup returned here can never be pulled
 * up by averaging in other well-scored controls once any mapped control is a critical gap; see
 * computeFrameworkRollup() in pure/maturity.ts, used here unchanged. */
export async function computeFrameworkReadiness(
  repo: ControlRepo,
  frameworkId: string,
  propertyId: string | null,
): Promise<FrameworkReadinessSnapshotRecord> {
  const mapped = await repo.listMappedControls(frameworkId);
  const controlIds = mapped.map((m) => m.controlId);
  const scoresByControl = await repo.getLatestDimensionScoresForControls(controlIds, propertyId);

  const rollup = computeFrameworkRollup(
    mapped.map((m) => ({
      scores: scoresByControl.get(m.controlId) ?? {},
      isLifeSafetyCritical: m.isLifeSafetyCritical,
      isLegal: m.isLegal,
    })),
  );

  return repo.insertFrameworkReadinessSnapshot({
    frameworkId,
    propertyId,
    averageScore: rollup.averageScore,
    rollupScore: rollup.rollupScore,
    isCapped: rollup.isCapped,
    mappedControlCount: mapped.length,
  });
}

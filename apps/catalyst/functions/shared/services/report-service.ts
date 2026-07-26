/**
 * Report/export audit logging — shared by every export type (board narrative, assurance pack,
 * and the six raw data exports). Test case management named by name: "Export is audit logged."
 * Every export, regardless of type, goes through this single function so there's exactly one
 * place that can get the audit shape wrong, not eight.
 */
import type { AuthContext } from "../pure/permissions";

export type ReportType =
  | "board_narrative"
  | "assurance_pack"
  | "kpi_export"
  | "incident_export"
  | "capa_export"
  | "audit_export"
  | "evidence_map_export"
  | "framework_readiness_export";

export interface ReportExportRecord {
  id: string;
  reportType: ReportType;
  exportedBy: string;
  filters: Record<string, unknown>;
  recordCount: number;
}

export interface ReportRepo {
  insertReportExport(entry: Omit<ReportExportRecord, "id">): Promise<ReportExportRecord>;
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

export async function recordExport(
  repo: ReportRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  reportType: ReportType,
  filters: Record<string, unknown>,
  recordCount: number,
): Promise<ReportExportRecord> {
  const rec = await repo.insertReportExport({
    reportType,
    exportedBy: ctx.userId,
    filters,
    recordCount,
  });

  await audit.log({
    actorUserId: ctx.userId,
    eventType: "report_exported",
    entityType: "ReportExports",
    entityId: rec.id,
    reason: reportType,
  });

  return rec;
}

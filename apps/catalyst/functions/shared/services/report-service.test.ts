import { beforeEach, describe, expect, it } from "vitest";

import type { AuthContext } from "../pure/permissions";
import { recordExport, type AuditEntry, type AuditLogger, type ReportExportRecord, type ReportRepo } from "./report-service";

class FakeReportRepo implements ReportRepo {
  exports: ReportExportRecord[] = [];
  private counter = 0;
  async insertReportExport(entry: Omit<ReportExportRecord, "id">) {
    this.counter += 1;
    const rec = { ...entry, id: `export-${this.counter}` };
    this.exports.push(rec);
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

let repo: FakeReportRepo;
let audit: FakeAuditLogger;
beforeEach(() => {
  repo = new FakeReportRepo();
  audit = new FakeAuditLogger();
});

describe("every export is audit logged, linked to the exporting user and the filters used", () => {
  it("records a ReportExports row and an audit entry for a board narrative export", async () => {
    const ctx = makeCtx({ userId: "hs-admin-1" });
    const rec = await recordExport(repo, audit, ctx, "board_narrative", { propertyId: "prop-a", financialYear: "FY2027" }, 22);

    expect(rec.exportedBy).toBe("hs-admin-1");
    expect(rec.filters).toEqual({ propertyId: "prop-a", financialYear: "FY2027" });
    expect(rec.recordCount).toBe(22);

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      actorUserId: "hs-admin-1",
      eventType: "report_exported",
      entityType: "ReportExports",
      reason: "board_narrative",
    });
  });

  it("each export type is recorded distinctly", async () => {
    const ctx = makeCtx({ userId: "auditor-1" });
    await recordExport(repo, audit, ctx, "assurance_pack", {}, 1);
    await recordExport(repo, audit, ctx, "evidence_map_export", { framework: "ISO45001" }, 40);
    expect(repo.exports.map((e) => e.reportType)).toEqual(["assurance_pack", "evidence_map_export"]);
    expect(audit.entries.map((e) => e.reason)).toEqual(["assurance_pack", "evidence_map_export"]);
  });
});

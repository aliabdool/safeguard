/**
 * Real Data Store implementation of KpiRepo (functions/shared/services/kpi-service.ts), shared
 * between api-kpi (single KPI drill-down) and api-reports (board narrative / assurance pack,
 * which need many KPI tiles at once). Extracted here rather than duplicated so the two Functions
 * can never quietly drift on how a KPI is actually computed.
 */
import type { CatalystApp } from "../middleware/auth-context";
import type { KpiDefinitionRow, KpiPeriodParams, KpiRawResult, KpiRepo } from "../services/kpi-service";

export function makeKpiDatastoreRepo(
  catalystApp: CatalystApp,
  allowedPropertyIds: string[],
  isGroupWide: boolean,
): KpiRepo {
  const zcql = catalystApp.zcql();
  const datastore = catalystApp.datastore();

  function scope(column: string): string {
    if (isGroupWide) return "1=1";
    if (allowedPropertyIds.length === 0) return "1=0";
    return `${column} in (${allowedPropertyIds.map((id) => `'${id}'`).join(",")})`;
  }

  async function countIncidents(params: KpiPeriodParams, extraClause: string | null): Promise<KpiRawResult> {
    const propClause = params.propertyId ? `Incidents.property_id == '${params.propertyId}'` : scope("Incidents.property_id");
    const deptClause = params.departmentId ? ` && Incidents.department_id == '${params.departmentId}'` : "";
    const extra = extraClause ? ` && ${extraClause}` : "";

    const currentRows = (await datastore.table("Incidents").getRows({
      criteria: `${propClause}${deptClause}${extra} && Incidents.occurred_at between '${params.periodStart}' and '${params.periodEnd}'`,
    })) as Array<{ ROWID: string }>;
    const comparisonRows = (await datastore.table("Incidents").getRows({
      criteria: `${propClause}${deptClause}${extra} && Incidents.occurred_at between '${params.comparisonPeriodStart}' and '${params.comparisonPeriodEnd}'`,
    })) as Array<{ ROWID: string }>;

    return {
      currentValue: currentRows.length,
      comparisonValue: comparisonRows.length,
      includedRecordIds: currentRows.map((r) => r.ROWID),
      dataQualityStatus: "ok",
    };
  }

  return {
    async getKpiDefinition(kpiCode) {
      const rows = (await zcql.executeZCQLQuery(
        `select KPIDefinitions.kpi_code, KPIDefinitions.name, KPIDefinitions.unit, KPIDefinitions.classification,
                KPIDefinitions.direction, KPIDefinitions.target, KPIDefinitions.warning_threshold, KPIDefinitions.critical_threshold
         from KPIDefinitions where KPIDefinitions.kpi_code == '${kpiCode}'`,
      )) as Array<{ KPIDefinitions: Record<string, string> }>;
      const row = rows[0]?.KPIDefinitions;
      if (!row) return undefined;
      const def: KpiDefinitionRow = {
        kpiCode: row.kpi_code ?? "",
        name: row.name ?? "",
        unit: row.unit ?? "",
        classification: row.classification ?? "",
        direction: (row.direction as KpiDefinitionRow["direction"]) ?? "lower_better",
        target: row.target ? Number(row.target) : null,
        warningThreshold: row.warning_threshold ? Number(row.warning_threshold) : null,
        criticalThreshold: row.critical_threshold ? Number(row.critical_threshold) : null,
      };
      return def;
    },

    countIncidentsByPersonType: (params, personType) =>
      countIncidents(params, personType ? `Incidents.person_event_type == '${personType}'` : null),
    countIncidentsByOutcome: (params, outcomes) =>
      countIncidents(params, `Incidents.outcome in (${outcomes.map((o) => `'${o}'`).join(",")})`),
    countIncidentsByFlag: (params, column) => countIncidents(params, `Incidents.${column} == true`),
    countLtiIncidents: (params) => countIncidents(params, `Incidents.lost_workdays > 0`),

    async countReportableOshCases(params) {
      const propClause = params.propertyId ? `Incidents.property_id == '${params.propertyId}'` : scope("Incidents.property_id");
      const rows = (await zcql.executeZCQLQuery(
        `select Incidents.ROWID from Incidents
         left join IncidentOSHReportability on Incidents.ROWID = IncidentOSHReportability.incident_id
         where ${propClause} && IncidentOSHReportability.reportable_status == 'yes'
           && Incidents.occurred_at between '${params.periodStart}' and '${params.periodEnd}'`,
      )) as Array<{ Incidents: { ROWID: string } }>;
      const comparisonRows = (await zcql.executeZCQLQuery(
        `select Incidents.ROWID from Incidents
         left join IncidentOSHReportability on Incidents.ROWID = IncidentOSHReportability.incident_id
         where ${propClause} && IncidentOSHReportability.reportable_status == 'yes'
           && Incidents.occurred_at between '${params.comparisonPeriodStart}' and '${params.comparisonPeriodEnd}'`,
      )) as Array<{ Incidents: { ROWID: string } }>;
      return {
        currentValue: rows.length,
        comparisonValue: comparisonRows.length,
        includedRecordIds: rows.map((r) => r.Incidents.ROWID),
        dataQualityStatus: "ok",
      };
    },

    async sumIncidentField(params, field) {
      const propClause = params.propertyId ? `Incidents.property_id == '${params.propertyId}'` : scope("Incidents.property_id");
      const currentRows = (await datastore.table("Incidents").getRows({
        criteria: `${propClause} && Incidents.occurred_at between '${params.periodStart}' and '${params.periodEnd}'`,
      })) as Array<Record<string, string> & { ROWID: string }>;
      const comparisonRows = (await datastore.table("Incidents").getRows({
        criteria: `${propClause} && Incidents.occurred_at between '${params.comparisonPeriodStart}' and '${params.comparisonPeriodEnd}'`,
      })) as Array<Record<string, string>>;
      return {
        currentValue: currentRows.reduce((sum, r) => sum + Number(r[field] ?? 0), 0),
        comparisonValue: comparisonRows.reduce((sum, r) => sum + Number(r[field] ?? 0), 0),
        includedRecordIds: currentRows.map((r) => r.ROWID),
        dataQualityStatus: "ok",
      };
    },

    async countOpenCriticalMajorFindings(params) {
      const propClause = params.propertyId ? `Audits.property_id == '${params.propertyId}'` : scope("Audits.property_id");
      const rows = (await zcql.executeZCQLQuery(
        `select AuditFindings.ROWID from AuditFindings
         left join Audits on AuditFindings.audit_id = Audits.ROWID
         where ${propClause} && AuditFindings.classification in ('critical_nc','major_nc') && AuditFindings.status != 'closed'`,
      )) as Array<{ AuditFindings: { ROWID: string } }>;
      return {
        currentValue: rows.length,
        comparisonValue: null,
        includedRecordIds: rows.map((r) => r.AuditFindings.ROWID),
        dataQualityStatus: "ok",
      };
    },

    async capaOnTimeRate(params) {
      const propClause = params.propertyId ? `CAPA.property_id == '${params.propertyId}'` : scope("CAPA.property_id");
      const rows = (await zcql.executeZCQLQuery(
        `select CAPAVerification.ROWID, CAPAVerification.outcome, CAPAVerification.verified_at, CAPA.due_date
         from CAPAVerification left join CAPA on CAPAVerification.capa_id = CAPA.ROWID
         where ${propClause} && CAPAVerification.verified_at between '${params.periodStart}' and '${params.periodEnd}'`,
      )) as Array<{ CAPAVerification: { ROWID: string; outcome: string; verified_at: string }; CAPA: { due_date: string } }>;
      if (rows.length === 0) {
        return { currentValue: null, comparisonValue: null, includedRecordIds: [], dataQualityStatus: "incomplete" };
      }
      const onTime = rows.filter(
        (r) => r.CAPAVerification.outcome === "verified" && r.CAPAVerification.verified_at <= `${r.CAPA.due_date}T23:59:59Z`,
      );
      return {
        currentValue: (onTime.length / rows.length) * 100,
        comparisonValue: null,
        includedRecordIds: rows.map((r) => r.CAPAVerification.ROWID),
        dataQualityStatus: "ok",
      };
    },

    async capaEffectivenessRate(params) {
      const propClause = params.propertyId ? `CAPA.property_id == '${params.propertyId}'` : scope("CAPA.property_id");
      const rows = (await zcql.executeZCQLQuery(
        `select CAPAVerification.ROWID, CAPAVerification.outcome
         from CAPAVerification left join CAPA on CAPAVerification.capa_id = CAPA.ROWID
         where ${propClause} && CAPAVerification.verified_at between '${params.periodStart}' and '${params.periodEnd}'`,
      )) as Array<{ CAPAVerification: { ROWID: string; outcome: string } }>;
      if (rows.length === 0) {
        return { currentValue: null, comparisonValue: null, includedRecordIds: [], dataQualityStatus: "incomplete" };
      }
      const effective = rows.filter((r) => r.CAPAVerification.outcome === "verified");
      return {
        currentValue: (effective.length / rows.length) * 100,
        comparisonValue: null,
        includedRecordIds: rows.map((r) => r.CAPAVerification.ROWID),
        dataQualityStatus: "ok",
      };
    },

    async getFrameworkReadinessSnapshot(frameworkCode, propertyId) {
      const fwRows = (await zcql.executeZCQLQuery(
        `select Frameworks.ROWID from Frameworks where Frameworks.code == '${frameworkCode}'`,
      )) as Array<{ Frameworks: { ROWID: string } }>;
      const frameworkId = fwRows[0]?.Frameworks.ROWID;
      if (!frameworkId) return undefined;

      const propClause = propertyId
        ? `FrameworkReadinessSnapshots.property_id == '${propertyId}'`
        : `FrameworkReadinessSnapshots.property_id is null`;
      const rows = (await datastore.table("FrameworkReadinessSnapshots").getRows({
        criteria: `FrameworkReadinessSnapshots.framework_id == '${frameworkId}' && ${propClause}`,
      })) as Array<Record<string, string> & { ROWID: string }>;
      if (rows.length === 0) return undefined;
      const latest = rows.sort((a, b) => Number(a.ROWID) - Number(b.ROWID))[rows.length - 1];
      if (!latest) return undefined;

      const mappingRows = (await zcql.executeZCQLQuery(
        `select Controls.ROWID from ControlFrameworkMappings
         left join Controls on ControlFrameworkMappings.control_id = Controls.ROWID
         left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID
         where FrameworkRequirements.framework_id == '${frameworkId}'`,
      )) as Array<{ Controls: { ROWID: string } }>;

      return {
        rollupScore: latest.rollup_score ? Number(latest.rollup_score) : null,
        isCapped: latest.is_capped === "true",
        controlIds: mappingRows.map((r) => r.Controls.ROWID),
      };
    },

    async insertSnapshot(row) {
      await datastore.table("KPISnapshots").insertRow({
        kpi_code: row.kpiCode,
        property_id: row.propertyId,
        department_id: row.departmentId,
        current_value: row.currentValue,
        comparison_value: row.comparisonValue,
        data_quality_status: row.dataQualityStatus,
        included_record_ids: JSON.stringify(row.includedRecordIds),
      });
    },
  };
}

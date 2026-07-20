import { boolean, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  assessmentStatusEnum,
  consultationTypeEnum,
  griImpactTypeEnum,
  griImpactValenceEnum,
  ifrsRiskOrOpportunityEnum,
  timeHorizonEnum,
} from "./_enums";
import { profiles } from "./identity";
import { properties } from "./reference";

/**
 * One row per topic per property per reporting period. GRI (impact/double materiality) and
 * IFRS S1 (financial/single materiality) are scored independently in the same row — see
 * src/server/materiality/scoring.ts for `classifyMateriality()`, which is the only place the two
 * scores are combined, and only into a label ("material under GRI only", etc.), never a single
 * blended number. `griMaterial`/`ifrsMaterial` are human decisions recorded here, not
 * auto-derived and silently trusted — a scoring function can suggest, a person approves.
 */
export const materialTopics = pgTable("material_topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  topicName: text("topic_name").notNull(),
  topicDescription: text("topic_description"),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "restrict" }),
  reportingPeriod: text("reporting_period").notNull(),

  // GRI 3 impact materiality (double materiality: actual/potential impact on people & environment)
  griImpactType: griImpactTypeEnum("gri_impact_type"),
  griImpactValence: griImpactValenceEnum("gri_impact_valence"),
  griSeverity: integer("gri_severity"),
  griScale: integer("gri_scale"),
  griScope: integer("gri_scope"),
  griIrremediable: boolean("gri_irremediable"),
  griLikelihood: integer("gri_likelihood"),
  griImpactScore: integer("gri_impact_score"),
  griMaterial: boolean("gri_material"),

  // IFRS S1 financial materiality (single materiality: relevance to investors)
  ifrsRiskOrOpportunity: ifrsRiskOrOpportunityEnum("ifrs_risk_or_opportunity"),
  ifrsTimeHorizon: timeHorizonEnum("ifrs_time_horizon"),
  ifrsLikelihood: integer("ifrs_likelihood"),
  ifrsFinancialMagnitude: integer("ifrs_financial_magnitude"),
  ifrsEffectCashFlows: boolean("ifrs_effect_cash_flows").notNull().default(false),
  ifrsEffectAccessToFinance: boolean("ifrs_effect_access_to_finance").notNull().default(false),
  ifrsEffectCostOfCapital: boolean("ifrs_effect_cost_of_capital").notNull().default(false),
  ifrsEffectBusinessModelStrategy: boolean("ifrs_effect_business_model_strategy")
    .notNull()
    .default(false),
  ifrsInvestorRelevance: boolean("ifrs_investor_relevance").notNull().default(false),
  ifrsFinancialScore: integer("ifrs_financial_score"),
  ifrsMaterial: boolean("ifrs_material"),

  status: assessmentStatusEnum("status").notNull().default("draft"),
  assessedBy: uuid("assessed_by")
    .notNull()
    .references(() => profiles.id),
  assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy: uuid("approved_by").references(() => profiles.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Repeatable stakeholder/expert consultation records — GRI 3 requires these be documented, not just a checkbox. */
export const materialityConsultations = pgTable("materiality_consultations", {
  id: uuid("id").primaryKey().defaultRandom(),
  materialTopicId: uuid("material_topic_id")
    .notNull()
    .references(() => materialTopics.id, { onDelete: "cascade" }),
  consultationType: consultationTypeEnum("consultation_type").notNull(),
  participantNameOrGroup: text("participant_name_or_group").notNull(),
  method: text("method"),
  consultationDate: date("consultation_date"),
  summary: text("summary"),
  recordedBy: uuid("recorded_by")
    .notNull()
    .references(() => profiles.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

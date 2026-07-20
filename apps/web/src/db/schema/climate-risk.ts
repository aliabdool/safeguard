import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  assessmentStatusEnum,
  climateHazardEnum,
  climateRiskCategoryEnum,
  timeHorizonEnum,
} from "./_enums";
import { profiles } from "./identity";
import { properties } from "./reference";

/**
 * IFRS S2 climate-risk register — deliberately not a boolean "was this incident climate-related"
 * flag. Each row is one hazard assessed for one property (or group-wide), covering exposure,
 * vulnerability, existing controls, residual risk, and the adaptation action taken — the actual
 * shape IFRS S2 scenario-based physical/transition risk disclosure expects. `category` is exactly
 * one of acute physical / chronic physical / transition (docs/framework-model.md), matched by the
 * hazard picked from `climate_hazard` (validated at the application layer to belong to the
 * declared category — see src/server/climate-risk/pure.ts).
 */
export const climateRisks = pgTable("climate_risks", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "restrict" }),
  category: climateRiskCategoryEnum("category").notNull(),
  hazard: climateHazardEnum("hazard").notNull(),
  description: text("description").notNull(),
  exposure: text("exposure"),
  vulnerability: text("vulnerability"),
  existingControls: text("existing_controls"),
  residualRiskLevel: integer("residual_risk_level"), // 1 (low) - 5 (severe), post-control
  timeHorizon: timeHorizonEnum("time_horizon").notNull(),
  financialEffect: numeric("financial_effect", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("MUR"),
  adaptationAction: text("adaptation_action"),
  responsibleOwner: uuid("responsible_owner").references(() => profiles.id),
  scenarioAssumptions: text("scenario_assumptions"),
  resilienceConclusion: text("resilience_conclusion"),
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

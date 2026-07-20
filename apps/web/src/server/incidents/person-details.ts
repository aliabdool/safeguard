import { z } from "zod";

/**
 * Person-type-specific structured fields, per docs/framework-model.md — validated here before
 * every write to `incident_persons.details` (JSONB), never trusted just because it round-trips
 * through the DB. Pure module (no DB/server-only imports) so it's directly unit-testable.
 */
export const employeeDetailsSchema = z.object({
  personType: z.literal("employee"),
  employeeNumber: z.string().min(1),
  department: z.string().min(1),
  jobTitle: z.string().min(1),
  lostWorkdays: z.number().int().min(0).default(0),
  restrictedDutyDays: z.number().int().min(0).default(0),
  hrConfirmed: z.boolean().default(false),
});

export const traineeDetailsSchema = z.object({
  personType: z.literal("trainee"),
  trainingInstitution: z.string().min(1),
  placementSupervisor: z.string().min(1),
  trainingDepartment: z.string().min(1),
  inductionStatus: z.enum(["completed", "in_progress", "not_started"]),
});

export const contractorDetailsSchema = z.object({
  personType: z.literal("contractor"),
  contractorCompany: z.string().min(1),
  contractOwner: z.string().min(1),
  permitToWorkStatus: z.enum(["valid", "expired", "not_required", "pending"]),
  contractorInductionCompleted: z.boolean().default(false),
});

export const guestDetailsSchema = z.object({
  personType: z.literal("guest"),
  roomNumber: z.string().optional(),
  guestRelationsFollowUp: z.boolean().default(false),
  medicalReferral: z.boolean().default(false),
  insuranceNotified: z.boolean().default(false),
});

/** No structured sub-fields defined for these person types (v1) — an empty details object. */
export const genericDetailsSchema = z.object({
  personType: z.enum([
    "visitor",
    "supplier",
    "public",
    "none",
    "near_miss",
    "unsafe_condition",
  ]),
});

export const personDetailsSchema = z.discriminatedUnion("personType", [
  employeeDetailsSchema,
  traineeDetailsSchema,
  contractorDetailsSchema,
  guestDetailsSchema,
  genericDetailsSchema,
]);

export type PersonDetails = z.infer<typeof personDetailsSchema>;

import { describe, expect, it } from "vitest";

import { personDetailsSchema } from "./person-details";

describe("personDetailsSchema", () => {
  it("accepts a valid employee record", () => {
    const result = personDetailsSchema.safeParse({
      personType: "employee",
      employeeNumber: "E-4021",
      department: "Housekeeping",
      jobTitle: "Room Attendant",
      lostWorkdays: 6,
      restrictedDutyDays: 5,
      hrConfirmed: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an employee record missing the employee number", () => {
    const result = personDetailsSchema.safeParse({
      personType: "employee",
      department: "Housekeeping",
      jobTitle: "Room Attendant",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid trainee record and rejects it if fields from another type leak in", () => {
    const valid = personDetailsSchema.safeParse({
      personType: "trainee",
      trainingInstitution: "Mauritius Hotel School",
      placementSupervisor: "K. Ramsamy",
      trainingDepartment: "Food & Beverage",
      inductionStatus: "completed",
    });
    expect(valid.success).toBe(true);

    const wrongShape = personDetailsSchema.safeParse({
      personType: "trainee",
      employeeNumber: "E-4021", // employee-only field, not valid for a trainee
    });
    expect(wrongShape.success).toBe(false);
  });

  it("accepts a valid contractor record with a permit-to-work status", () => {
    const result = personDetailsSchema.safeParse({
      personType: "contractor",
      contractorCompany: "Beach Scaffolding Ltd",
      contractOwner: "Chief Engineer",
      permitToWorkStatus: "valid",
      contractorInductionCompleted: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid permit-to-work status value", () => {
    const result = personDetailsSchema.safeParse({
      personType: "contractor",
      contractorCompany: "Beach Scaffolding Ltd",
      contractOwner: "Chief Engineer",
      permitToWorkStatus: "sort-of-valid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid guest record with optional fields defaulted", () => {
    const result = personDetailsSchema.safeParse({
      personType: "guest",
      roomNumber: "412",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.personType === "guest") {
      expect(result.data.guestRelationsFollowUp).toBe(false);
      expect(result.data.insuranceNotified).toBe(false);
    }
  });

  it("accepts a generic details object for person types without structured sub-fields", () => {
    const result = personDetailsSchema.safeParse({ personType: "visitor" });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognised personType", () => {
    const result = personDetailsSchema.safeParse({ personType: "robot" });
    expect(result.success).toBe(false);
  });
});

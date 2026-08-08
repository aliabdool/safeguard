import { describe, expect, it } from "vitest";

import {
  hasAnyRole,
  hasDepartmentAccess,
  hasPropertyAccess,
  isAdmin,
  type AuthContext,
} from "./pure";

const PROPERTY_A = "11111111-1111-1111-1111-111111111111";
const PROPERTY_B = "22222222-2222-2222-2222-222222222222";
const DEPT_HOUSEKEEPING = "33333333-3333-3333-3333-333333333333";
const DEPT_FRONT_OFFICE = "44444444-4444-4444-4444-444444444444";

function makeCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "user-1",
    fullName: "Test User",
    status: "active",
    roleCodes: [],
    propertyIds: [],
    departmentAccess: new Map(),
    hasMedicalPermission: false,
    ...overrides,
  };
}

describe("isAdmin", () => {
  it("is true for SUPER_ADMIN", () => {
    expect(isAdmin(makeCtx({ roleCodes: ["SUPER_ADMIN"] }))).toBe(true);
  });
  it("is true for GROUP_HS_ADMIN", () => {
    expect(isAdmin(makeCtx({ roleCodes: ["GROUP_HS_ADMIN"] }))).toBe(true);
  });
  it("is false for every other role, including Property H&S Officer", () => {
    expect(isAdmin(makeCtx({ roleCodes: ["PROPERTY_HS_OFFICER"] }))).toBe(false);
    expect(isAdmin(makeCtx({ roleCodes: [] }))).toBe(false);
  });
});

describe("hasAnyRole", () => {
  it("matches when the user holds one of the listed roles", () => {
    const ctx = makeCtx({ roleCodes: ["DUTY_MANAGER", "INCIDENT_REPORTER"] });
    expect(hasAnyRole(ctx, ["DUTY_MANAGER"])).toBe(true);
    expect(hasAnyRole(ctx, ["SUPER_ADMIN", "DUTY_MANAGER"])).toBe(true);
  });
  it("does not match when the user holds none of the listed roles", () => {
    const ctx = makeCtx({ roleCodes: ["INCIDENT_REPORTER"] });
    expect(hasAnyRole(ctx, ["SUPER_ADMIN", "GROUP_HS_ADMIN"])).toBe(false);
  });
});

describe("hasPropertyAccess", () => {
  it("admins can access any property with no explicit grant", () => {
    const ctx = makeCtx({ roleCodes: ["SUPER_ADMIN"], propertyIds: [] });
    expect(hasPropertyAccess(ctx, PROPERTY_A)).toBe(true);
  });
  it("Executive Read-Only can access any property (group-wide by definition)", () => {
    const ctx = makeCtx({ roleCodes: ["EXECUTIVE_READONLY"], propertyIds: [] });
    expect(hasPropertyAccess(ctx, PROPERTY_A)).toBe(true);
  });
  it("a non-admin, non-executive user needs an explicit grant", () => {
    const ctx = makeCtx({ roleCodes: ["DUTY_MANAGER"], propertyIds: [PROPERTY_A] });
    expect(hasPropertyAccess(ctx, PROPERTY_A)).toBe(true);
    expect(hasPropertyAccess(ctx, PROPERTY_B)).toBe(false);
  });
  it("a user with zero property grants and zero elevated roles sees nothing", () => {
    const ctx = makeCtx({ roleCodes: ["INCIDENT_REPORTER"], propertyIds: [] });
    expect(hasPropertyAccess(ctx, PROPERTY_A)).toBe(false);
  });
});

describe("hasDepartmentAccess", () => {
  it("a null departmentId (property-wide record) is always accessible once property access holds", () => {
    const ctx = makeCtx({ roleCodes: ["PROPERTY_HS_OFFICER"] });
    expect(hasDepartmentAccess(ctx, PROPERTY_A, null)).toBe(true);
  });
  it("admins bypass department scoping entirely", () => {
    const ctx = makeCtx({ roleCodes: ["SUPER_ADMIN"] });
    expect(hasDepartmentAccess(ctx, PROPERTY_A, DEPT_HOUSEKEEPING)).toBe(true);
  });
  it("a Department Manager only sees their granted department at their granted property", () => {
    const departmentAccess = new Map([[PROPERTY_A, new Set([DEPT_HOUSEKEEPING])]]);
    const ctx = makeCtx({ roleCodes: ["DEPARTMENT_MANAGER"], departmentAccess });
    expect(hasDepartmentAccess(ctx, PROPERTY_A, DEPT_HOUSEKEEPING)).toBe(true);
    expect(hasDepartmentAccess(ctx, PROPERTY_A, DEPT_FRONT_OFFICE)).toBe(false);
  });
  it("a department grant at one property does not leak to the same department code at another property", () => {
    const departmentAccess = new Map([[PROPERTY_A, new Set([DEPT_HOUSEKEEPING])]]);
    const ctx = makeCtx({ roleCodes: ["DEPARTMENT_MANAGER"], departmentAccess });
    expect(hasDepartmentAccess(ctx, PROPERTY_B, DEPT_HOUSEKEEPING)).toBe(false);
  });
});

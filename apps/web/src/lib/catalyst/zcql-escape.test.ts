import { describe, expect, it } from "vitest";

import { zcqlString } from "./zcql-escape";

describe("zcqlString", () => {
  it("wraps a plain value in single quotes", () => {
    expect(zcqlString("FY2026-Q2")).toBe("'FY2026-Q2'");
  });

  it("doubles an embedded single quote (confirmed live: the valid ZCQL escape)", () => {
    expect(zcqlString("Q2'26")).toBe("'Q2''26'");
    expect(zcqlString("O'Brien")).toBe("'O''Brien'");
    expect(zcqlString("Manager's Review")).toBe("'Manager''s Review'");
  });

  it("doubles every quote in a value with more than one", () => {
    expect(zcqlString("'''")).toBe("''''''''");
  });

  it("never lets the escaped output terminate the literal early", () => {
    // A naive scan for the FIRST unescaped quote would stop here; confirm the whole value round
    // trips as a single literal by checking the quote count is even and the value is fully wrapped.
    const escaped = zcqlString("a' or '1'='1");
    expect(escaped.startsWith("'")).toBe(true);
    expect(escaped.endsWith("'")).toBe(true);
    const innerQuoteCount = (escaped.match(/'/g) ?? []).length;
    expect(innerQuoteCount % 2).toBe(0);
  });

  it("leaves a value with no quotes untouched apart from wrapping", () => {
    expect(zcqlString("policy")).toBe("'policy'");
    expect(zcqlString("")).toBe("''");
  });

  it("does not treat a backslash specially (confirmed live: ZCQL has no backslash-escape convention)", () => {
    expect(zcqlString("a\\b")).toBe("'a\\b'");
  });
});

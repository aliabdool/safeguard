import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

/**
 * Static, repository-wide contract test guarding against the exact bug that broke incident
 * submission (see chat): Catalyst's Data Store rejects `Date.toISOString()`'s
 * "2026-07-01T00:00:00.000Z" for ANY datetime column — both ZCQL query literals AND
 * `insertRow`/`updateRow` REST payloads — with "Invalid input value for <col>. datetime value
 * expected". Every full-timestamp value written to Catalyst must go through
 * `toZcqlDateTime()` (lib/catalyst/zcql-datetime.ts) instead. A bare `.toISOString()` (not
 * chained with `.slice(0, 10)` to produce a date-only "YYYY-MM-DD" string, which Catalyst's
 * `date`-type columns do accept) is always the bug.
 *
 * Two files are legitimately exempt and hand-verified instead of scanned:
 * - lib/catalyst/zcql-datetime.ts itself — its doc comment quotes the broken pattern as an
 *   example, which would otherwise false-positive.
 * - app/api/health/route.ts — returns `.toISOString()` directly in a JSON health-check response,
 *   never written to Catalyst.
 */

const SRC_ROOT = join(__dirname, "..");
const EXEMPT_FILES = new Set([
  join(SRC_ROOT, "lib/catalyst/zcql-datetime.ts"),
  join(SRC_ROOT, "app/api/health/route.ts"),
]);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

// Matches a bare `.toISOString()` NOT immediately chained with `.slice(` — the date-only
// "YYYY-MM-DD" form Catalyst's `date`-type columns accept. A bare call always produces the
// full "...T...Z" form Catalyst's `datetime` columns reject.
const BARE_ISO_STRING_RE = /\.toISOString\(\)(?!\s*\.slice\()/;

const files = walk(SRC_ROOT).filter((f) => !EXEMPT_FILES.has(f));
let scannedCount = 0;

describe("no raw .toISOString() reaches a Catalyst datetime write or query", () => {
  for (const file of files) {
    const relative = file.replace(`${SRC_ROOT}/`, "src/");
    const source = readFileSync(file, "utf8");
    scannedCount += 1;

    const lines = source.split("\n");
    lines.forEach((lineText, idx) => {
      if (BARE_ISO_STRING_RE.test(lineText)) {
        it(`${relative}:${idx + 1} does not pass a bare .toISOString() to Catalyst`, () => {
          expect.fail(
            `Found bare .toISOString() (use toZcqlDateTime() instead) in ${relative}:${idx + 1}\n  ${lineText.trim()}`,
          );
        });
      }
    });
  }

  it("scanned at least one source file", () => {
    expect(scannedCount).toBeGreaterThan(0);
  });
});

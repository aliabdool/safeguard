import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

import {
  BANNED_PATTERNS,
  findClauseOrderViolations,
} from "@/lib/testing/zcql-assertions";

/**
 * Static, repository-wide contract test over every ZCQL query string this app builds — not just
 * the dashboard. Confirmed live against the deployed project (see chat) that ZCQL rejects both
 * "==" (must be "=") and bare literal tautologies like "1=1"/"1=0" (must reference a real column)
 * with an opaque "Syntax error in given query" that gives no indication which query or which
 * character is wrong. "&&"/"||" were also converted to "and"/"or" for the same reason, even though
 * "&&" was separately confirmed to work when tested directly against the live ZCQL Console — AND/OR
 * is what Zoho's own documentation examples use, and there is no reason to keep a second, riskier
 * spelling alive in this codebase. This test scans the actual .ts/.tsx source (not the runtime
 * value of dynamically-composed strings, which can't be enumerated statically) so a future
 * developer reintroducing any of these patterns fails the build immediately instead of discovering
 * it three redeploys later through a fragmented AppSail log.
 */

const SRC_ROOT = join(__dirname, "..");

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

// A literal is treated as a ZCQL fragment if it either contains a SQL-ish keyword, or references
// a `TableName.column_name` pair — Catalyst's own PascalCase-table / snake_case-column convention,
// which essentially never occurs in non-query strings. The keyword-only check alone is not enough:
// scope-builder helpers like propertyScopeClause() never call executeZCQLQuery()/getRows()
// themselves (they just return a WHERE fragment consumed elsewhere), so gating file selection on
// those call names — this test's first draft — missed exactly the function that caused the real
// production bug (propertyScopeClause's bare "1=1"). Every .ts/.tsx source file is scanned instead
// of only ones that call the Catalyst SDK directly, specifically to keep that class of helper in
// scope.
const SQL_KEYWORD_RE =
  /\b(select|from|where|group by|order by|having|limit|is null|is not null|left join|in\s*\()\b/i;
const TABLE_COLUMN_RE = /\b[A-Z][A-Za-z0-9]*\.[a-z_][a-zA-Z0-9_]*\b/;

function looksLikeZcql(text: string): boolean {
  return SQL_KEYWORD_RE.test(text) || TABLE_COLUMN_RE.test(text);
}

function extractZcqlLiterals(source: string): Array<{ text: string; line: number }> {
  const literalRe = /`([^`]*)`/g;
  const out: Array<{ text: string; line: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(source))) {
    const text = m[1] ?? "";
    if (looksLikeZcql(text)) {
      out.push({ text, line: source.slice(0, m.index).split("\n").length });
    }
  }
  return out;
}

const zcqlFiles = walk(SRC_ROOT);
let totalLiteralsFound = 0;

describe("ZCQL query strings pass a static Catalyst-compatibility contract", () => {
  for (const file of zcqlFiles) {
    const relative = file.replace(`${SRC_ROOT}/`, "src/");
    const source = readFileSync(file, "utf8");
    const literals = extractZcqlLiterals(source);
    totalLiteralsFound += literals.length;

    for (const { text, line } of literals) {
      for (const { name, re } of BANNED_PATTERNS) {
        if (re.test(text)) {
          it(`${relative}:${line} does not contain: ${name}`, () => {
            expect.fail(
              `Found banned ZCQL pattern "${name}" in ${relative}:${line}\n  ${text.trim()}`,
            );
          });
        }
      }

      // Clause order only applies to literals that actually form a full SELECT statement —
      // criteria fragments (no SELECT keyword) are exempt, since they're WHERE-only by design.
      for (const violation of findClauseOrderViolations(text)) {
        it(`${relative}:${line} keeps clauses in order`, () => {
          expect.fail(`Clause order violation in ${relative}:${line} — ${violation}\n  ${text.trim()}`);
        });
      }
    }
  }

  // If the loops above never registered any `it()` (e.g. the walk or the heuristic silently
  // stopped matching anything), keep the suite non-empty so a broken scan doesn't read as "all
  // clear" — this is the same class of silent-false-negative bug that let propertyScopeClause's
  // bare "1=1" through the first draft of this test (see comment on looksLikeZcql above).
  it("found at least one ZCQL query fragment to audit", () => {
    expect(totalLiteralsFound).toBeGreaterThan(0);
  });
});

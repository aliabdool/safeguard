/**
 * Shared ZCQL-safety assertions used by both the static source-scanning contract test
 * (src/server/zcql-contract.test.ts) and the runtime generated-query tests
 * (src/server/kpi/calculations/generated-queries.test.ts) — kept in one place so the two never
 * drift into checking different rules.
 */

export interface BannedPattern {
  name: string;
  re: RegExp;
}

export const BANNED_PATTERNS: BannedPattern[] = [
  { name: 'JavaScript && (use "and")', re: /&&/ },
  { name: 'JavaScript || (use "or")', re: /\|\|/ },
  { name: 'JavaScript == (use "=")', re: /[^=!<>]==(?!=)/ },
  { name: "bare literal tautology 1=1 (reference a real column instead)", re: /(?<![\w=!<>])1\s*=\s*1\b/ },
  { name: "bare literal tautology 1=0 (reference a real column instead)", re: /(?<![\w=!<>])1\s*=\s*0\b/ },
  {
    name: 'aggregate function with an "as" alias — ZCQL never honors it (confirmed live: the result is always keyed by the column name INSIDE the function, e.g. count(Incidents.ROWID) as n comes back as { Incidents: { ROWID: <count> } }, never { n: <count> })',
    re: /\b(count|sum|avg|max|min)\s*\([^)]*\)\s+as\s+\w+/i,
  },
];

export function findBannedPatterns(text: string): string[] {
  return BANNED_PATTERNS.filter(({ re }) => re.test(text)).map(({ name }) => name);
}

export const CLAUSE_ORDER = [
  { name: "SELECT", re: /\bselect\b/i },
  { name: "FROM", re: /\bfrom\b/i },
  { name: "WHERE", re: /\bwhere\b/i },
  { name: "GROUP BY", re: /\bgroup\s+by\b/i },
  { name: "HAVING", re: /\bhaving\b/i },
  { name: "ORDER BY", re: /\border\s+by\b/i },
  { name: "LIMIT", re: /\blimit\b/i },
];

export function findClauseOrderViolations(text: string): string[] {
  if (!/\bselect\b/i.test(text)) return [];
  const positions = CLAUSE_ORDER.map(({ name, re }) => ({ name, index: text.search(re) })).filter(
    (c) => c.index !== -1,
  );
  const violations: string[] = [];
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1]!;
    const curr = positions[i]!;
    if (curr.index < prev.index) {
      violations.push(`"${curr.name}" appears before "${prev.name}"`);
    }
  }
  return violations;
}

/** Throws with a descriptive message if `text` contains any banned pattern or clause-order bug. */
export function assertZcqlSafe(text: string, context: string): void {
  const banned = findBannedPatterns(text);
  const orderViolations = findClauseOrderViolations(text);
  if (banned.length > 0 || orderViolations.length > 0) {
    const problems = [...banned, ...orderViolations].join("; ");
    throw new Error(`ZCQL-unsafe query in ${context}: ${problems}\n  ${text.trim()}`);
  }
}

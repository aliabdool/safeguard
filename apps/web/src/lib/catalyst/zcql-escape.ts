/**
 * Central helper for safely interpolating a user-controlled string into a ZCQL literal.
 *
 * ZCQL has no parameterized/bind-variable query API — confirmed against zcatalyst-sdk-node's own
 * type definitions (lib/zcql/zcql.d.ts): `executeZCQLQuery(sql: string)` takes only a raw string,
 * nothing else. Every criteria fragment in this app is therefore built by string interpolation,
 * and a single quote inside an interpolated value breaks out of the ZCQL string literal it's meant
 * to sit inside — producing `ZCQL QUERY ERROR: Syntax error in given query` with no further detail
 * (Catalyst's own error never says which query or character was wrong; see runZcql()'s comment in
 * lib/catalyst/app.ts). Reproduced live against ControlAssessments.period_label (see chat).
 *
 * Doubling an embedded single quote is confirmed live to be a valid ZCQL escape —
 * `ControlAssessments.period_label = 'O''Brien'` parses and matches the literal value `O'Brien`,
 * the same convention as standard SQL. A literal backslash needs no escaping (confirmed live: ZCQL
 * does not treat `\` as an escape character), so only the quote itself is doubled.
 *
 * Every user-controlled string value interpolated into a ZCQL literal in this app must go through
 * this function — never raw `'${value}'` template interpolation.
 */
export function zcqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

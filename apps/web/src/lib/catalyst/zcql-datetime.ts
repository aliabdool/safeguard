/**
 * Formats a Date as the literal ZCQL expects for a DateTime column comparison:
 * "YYYY-MM-DD HH:MM:SS" (UTC, no "T"/"Z", no milliseconds) — confirmed live against the deployed
 * project's Data Store (see chat): `Date.toISOString()`'s "2026-07-01T00:00:00.000Z" is rejected
 * outright with "Invalid input value for occurred_at. datetime value expected", and this is the
 * exact shape ZCQL itself returns for stored DateTime values (e.g. "2026-07-09 20:31:00"). Every
 * ZCQL WHERE-clause datetime comparison in this app must go through this rather than
 * `.toISOString()` directly; `insertRow`/`updateRow` payloads are a separate REST API and are not
 * known to have this restriction, so they are left as `.toISOString()`.
 */
export function toZcqlDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

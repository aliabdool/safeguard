/**
 * Formats a Date as the literal Catalyst's Data Store expects for any DateTime column value:
 * "YYYY-MM-DD HH:MM:SS" (UTC, no "T"/"Z", no milliseconds) — confirmed live against the deployed
 * project's Data Store (see chat): `Date.toISOString()`'s "2026-07-01T00:00:00.000Z" is rejected
 * outright with "Invalid input value for occurred_at. datetime value expected", and this is the
 * exact shape ZCQL itself returns for stored DateTime values (e.g. "2026-07-09 20:31:00").
 *
 * This applies to BOTH ZCQL WHERE-clause literals AND `insertRow`/`updateRow` REST payloads — an
 * earlier version of this comment claimed the REST path was untested and might not share the
 * restriction; that assumption was wrong (confirmed live: `writeAuditLog()`'s
 * `occurred_at: new Date().toISOString()` threw this exact `INVALID_INPUT` error on every
 * `insertRow` call, an app-wide bug that broke incident submission and every other write path that
 * passed a raw `.toISOString()` into a datetime column — see chat). Every Date value written to or
 * compared against a Catalyst datetime column in this app must go through this function; never
 * pass `.toISOString()` directly to `insertRow`/`updateRow`/ZCQL.
 */
export function toZcqlDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

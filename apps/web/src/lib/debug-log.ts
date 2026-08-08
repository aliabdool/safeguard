import "server-only";

/**
 * Logs an error as a single JSON line instead of a raw multi-line stack trace. AppSail's log
 * viewer splits a message into a separate row at every newline character, which turned a
 * three-line stack trace into a dozen unreadable, unorderable fragments — confirmed live (see
 * chat: a "Query: ..." error interleaved with an unrelated Next.js digest wrapper because both
 * landed in the log stream at the same millisecond). JSON.stringify escapes embedded newlines as
 * literal two-character "\n" sequences, so the whole error — message, name, and stack — always
 * prints as exactly one row, copyable in a single selection.
 */
export function logDebugError(tag: string, err: unknown): void {
  const payload =
    err instanceof Error
      ? { message: err.message, name: err.name, stack: err.stack }
      : { value: String(err) };
  console.error(`${tag} ${JSON.stringify(payload)}`);
}

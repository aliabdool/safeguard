import "server-only";

/**
 * Maps over `items` with at most `limit` calls to `fn` in flight at once, instead of firing every
 * call simultaneously via a bare `Promise.all`. Needed because Zoho Catalyst's Data Store enforces
 * a per-project concurrency limit — confirmed live against the deployed project (see chat): the
 * dashboard's 18 parallel KPI calculations (each making its own Data Store/ZCQL calls) tripped
 * `429 TOO_MANY_REQUESTS — Concurrency limit reached for the feature COMPONENT`. Preserves the
 * original order of results, same as `Promise.all`.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await fn(items[current]!, current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

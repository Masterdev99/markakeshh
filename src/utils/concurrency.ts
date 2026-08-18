/**
 * Bounded-concurrency map — runs `fn` over `items` with at most `limit`
 * in flight at once. Used anywhere a batch of Graph API calls could otherwise
 * fire all at once (e.g. sweeping hundreds of messages) and trip the
 * browser's own connection limits (net::ERR_INSUFFICIENT_RESOURCES).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      try {
        results[idx] = { status: 'fulfilled', value: await fn(items[idx]) };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

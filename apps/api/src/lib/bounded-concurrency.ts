export async function runSettledWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const item = items[nextIndex]!;
      nextIndex += 1;
      try {
        await task(item);
      } catch {
        // Match Promise.allSettled semantics: one intent must not block the batch.
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

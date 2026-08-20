import { describe, expect, it, vi } from "vitest";
import { runSettledWithConcurrency } from "./bounded-concurrency";

describe("runSettledWithConcurrency", () => {
  it("never starts more than the configured number of tasks", async () => {
    let active = 0;
    let maxActive = 0;

    await runSettledWithConcurrency([1, 2, 3, 4, 5, 6], 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
    });

    expect(maxActive).toBe(3);
  });

  it("continues processing later tasks after one task rejects", async () => {
    const processed = vi.fn();

    await expect(
      runSettledWithConcurrency([1, 2, 3], 2, async (item) => {
        processed(item);
        if (item === 2) throw new Error("429 ambiguous provider outcome");
      }),
    ).resolves.toBeUndefined();

    expect(processed).toHaveBeenCalledTimes(3);
  });

  it("handles empty batches and normalizes invalid concurrency", async () => {
    const task = vi.fn();

    await runSettledWithConcurrency([], 3, task);
    await runSettledWithConcurrency([1], 0, task);

    expect(task).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const close = vi.fn(async () => undefined);
  const db = {};
  const createDbHandle = vi.fn(async () => ({ db, close }));
  const processAwardIntakeJob = vi.fn(async () => undefined);
  const captureQueueException = vi.fn();
  return { close, createDbHandle, db, processAwardIntakeJob, captureQueueException };
});

vi.mock("@grantpipe/db", () => ({
  createDbHandle: mocks.createDbHandle,
}));

vi.mock("./service", () => ({
  processAwardIntakeJob: mocks.processAwardIntakeJob,
}));

vi.mock("../../lib/sentry", () => ({
  captureQueueException: mocks.captureQueueException,
}));

import { processAwardIntakeQueue } from "./queue";

const env = {
  DATABASE_URL: "postgres://example",
};

describe("award intake queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores non-award queue messages without opening a database handle", async () => {
    await processAwardIntakeQueue(
      {
        messages: [
          {
            body: {
              integrationId: "int-1",
              orgId: "org-1",
              syncRunId: "run-1",
            },
          },
        ],
      },
      env as never,
    );

    expect(mocks.createDbHandle).not.toHaveBeenCalled();
    expect(mocks.processAwardIntakeJob).not.toHaveBeenCalled();
  });

  it("processes award intake queue messages and closes the database handle", async () => {
    await processAwardIntakeQueue(
      {
        messages: [{ body: { extractionId: "ext-1", orgId: "org-1" } }],
      },
      env as never,
    );

    expect(mocks.createDbHandle).toHaveBeenCalledWith("postgres://example", undefined);
    expect(mocks.processAwardIntakeJob).toHaveBeenCalledWith(mocks.db, env, {
      extractionId: "ext-1",
      orgId: "org-1",
    });
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("still processes later messages when an earlier one throws, then rethrows", async () => {
    const boom = new Error("OpenRouter request failed: 503");
    mocks.processAwardIntakeJob.mockRejectedValueOnce(boom).mockResolvedValueOnce(undefined);

    await expect(
      processAwardIntakeQueue(
        {
          messages: [
            { body: { extractionId: "ext-1", orgId: "org-1" } },
            { body: { extractionId: "ext-2", orgId: "org-1" } },
          ],
        },
        env as never,
      ),
    ).rejects.toBe(boom);

    // The first (and only) failure is rethrown and captured by the withSentry queue
    // wrapper, so we do not capture it here — that would produce a duplicate event.
    expect(mocks.captureQueueException).not.toHaveBeenCalled();

    // Both messages were attempted even though the first threw.
    expect(mocks.processAwardIntakeJob).toHaveBeenCalledTimes(2);
    expect(mocks.processAwardIntakeJob).toHaveBeenNthCalledWith(2, mocks.db, env, {
      extractionId: "ext-2",
      orgId: "org-1",
    });
    // The handle is always closed.
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("captures the second failure but not the first when multiple messages fail", async () => {
    const first = new Error("first failed");
    const second = new Error("second failed");
    mocks.processAwardIntakeJob.mockRejectedValueOnce(first).mockRejectedValueOnce(second);

    await expect(
      processAwardIntakeQueue(
        {
          messages: [
            { body: { extractionId: "ext-1", orgId: "org-1" } },
            { body: { extractionId: "ext-2", orgId: "org-2" } },
          ],
        },
        env as never,
      ),
    ).rejects.toBe(first);

    // The first error is rethrown for batch redelivery (and captured by the
    // withSentry wrapper), so it is not captured here. The second error is never
    // rethrown, so it must be captured explicitly or it would be lost.
    expect(mocks.captureQueueException).not.toHaveBeenCalledWith(first, "award-intake", {
      org_id: "org-1",
    });
    expect(mocks.captureQueueException).toHaveBeenCalledWith(second, "award-intake", {
      org_id: "org-2",
    });
    expect(mocks.captureQueueException).toHaveBeenCalledTimes(1);
  });
});

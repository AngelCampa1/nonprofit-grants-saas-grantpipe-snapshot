import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@grantpipe/db", () => ({
  activityLog: {},
}));

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));
vi.mock("./sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

import { recordActivityLog, recordActivityLogBestEffort } from "./activity-log";

describe("recordActivityLog", () => {
  it("stores null when changes are omitted", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert };

    await recordActivityLog(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      action: "created",
      entityType: "contact",
      entityId: "contact-1",
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "created",
        entityType: "contact",
        entityId: "contact-1",
        changes: null,
      }),
    );
  });

  it("stores active entity scope separately from the subject id", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert };

    await recordActivityLog(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      actorId: "user-1",
      action: "created",
      entityType: "grant",
      entityId: "grant-1",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        activeEntityId: "entity-1",
        entityId: "grant-1",
      }),
    );
  });
});

describe("recordActivityLogBestEffort", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records the activity log on the happy path", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert };

    await recordActivityLogBestEffort(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      action: "accounting_sync_run.queued",
      entityType: "accounting_sync_run",
      entityId: "run-1",
    });

    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("swallows errors so a logging failure does not fail the operation", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const values = vi.fn().mockRejectedValue(new Error("db is down"));
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert };

    await expect(
      recordActivityLogBestEffort(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        action: "accounting_sync_run.completed",
        entityType: "accounting_sync_run",
        entityId: "run-1",
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "activity-log", {
      action: "accounting_sync_run.completed",
      entity_type: "accounting_sync_run",
    });
  });

  it("stringifies a non-Error rejection value when logging the failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const values = vi.fn().mockRejectedValue("db is down");
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert };

    await expect(
      recordActivityLogBestEffort(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        action: "accounting_sync_run.completed",
        entityType: "accounting_sync_run",
        entityId: "run-1",
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to record activity log (best-effort)",
      expect.objectContaining({ error: "db is down" }),
    );
  });
});

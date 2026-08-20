import { describe, expect, it, vi } from "vitest";
import { userGuideProgress } from "@grantpipe/db";
import { listGuideProgress, upsertGuideProgress } from "./service";

function makeListDb(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select };
}

function makeUpsertDb(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });
  return { insert, values, onConflictDoUpdate };
}

describe("help service", () => {
  it("lists guide progress for the current user and org", async () => {
    const db = makeListDb([
      {
        id: "progress-1",
        orgId: "org-1",
        userId: "user-1",
        guideKey: "first_setup",
        status: "in_progress",
        lastStep: "profile",
        completedAt: null,
        dismissedAt: null,
        updatedAt: new Date("2026-04-23T12:00:00Z"),
      },
    ]);

    const result = await listGuideProgress(db as never, {
      orgId: "org-1",
      userId: "user-1",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.guideKey).toBe("first_setup");
    expect(db.select).toHaveBeenCalled();
  });

  it("upserts guide progress for the current user and org", async () => {
    const db = makeUpsertDb([
      {
        id: "progress-1",
        orgId: "org-1",
        userId: "user-1",
        guideKey: "open_pdf_report",
        status: "completed",
        lastStep: "downloaded",
        completedAt: new Date("2026-04-23T12:00:00Z"),
        dismissedAt: null,
        updatedAt: new Date("2026-04-23T12:00:00Z"),
      },
    ]);

    const result = await upsertGuideProgress(db as never, {
      orgId: "org-1",
      userId: "user-1",
      guideKey: "open_pdf_report",
      data: { status: "completed", lastStep: "downloaded" },
    });

    expect(result.status).toBe("completed");
    expect(db.insert).toHaveBeenCalledWith(userGuideProgress);
    expect(db.onConflictDoUpdate).toHaveBeenCalled();
  });

  it("serializes dismissed progress timestamps", async () => {
    const db = makeUpsertDb([
      {
        id: "progress-1",
        orgId: "org-1",
        userId: "user-1",
        guideKey: "first_setup",
        status: "dismissed",
        lastStep: null,
        completedAt: null,
        dismissedAt: new Date("2026-04-23T12:00:00Z"),
        updatedAt: new Date("2026-04-23T12:00:00Z"),
      },
    ]);

    const result = await upsertGuideProgress(db as never, {
      orgId: "org-1",
      userId: "user-1",
      guideKey: "first_setup",
      data: { status: "dismissed" },
    });

    expect(result.dismissedAt).toBe("2026-04-23T12:00:00.000Z");
    expect(result.completedAt).toBeNull();
  });

  it("throws when the upsert returns no row", async () => {
    const db = makeUpsertDb([]);

    await expect(
      upsertGuideProgress(db as never, {
        orgId: "org-1",
        userId: "user-1",
        guideKey: "first_setup",
        data: { status: "dismissed" },
      }),
    ).rejects.toThrow("Failed to save guide progress");
  });
});

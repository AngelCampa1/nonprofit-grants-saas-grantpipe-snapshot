import { describe, it, expect, vi } from "vitest";
import { listSegments, createSegment, updateSegment, deleteSegment } from "./segment.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

import { recordActivityLog } from "../../lib/activity-log";

// Helper: wraps a mock db object with a transaction that invokes the callback
// with the same mock object as the tx, so inner db ops and recordActivityLog fire.
function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

// ---------------------------------------------------------------------------
// listSegments
// ---------------------------------------------------------------------------

describe("listSegments", () => {
  it("returns all segments for the org", async () => {
    const segments = [
      { id: "seg-1", name: "Active Prospects" },
      { id: "seg-2", name: "Major Donors" },
    ];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(segments),
          }),
        }),
      }),
    };

    const result = await listSegments(db as never, "org-1");
    expect(result).toEqual(segments);
  });
});

// ---------------------------------------------------------------------------
// createSegment
// ---------------------------------------------------------------------------

describe("createSegment", () => {
  it("rejects invalid input before inserting", async () => {
    const insertFn = vi.fn();
    const db = withTransaction({ insert: insertFn });

    await expect(
      createSegment(db as never, {
        orgId: "org-1",
        createdBy: "user-1",
        name: "",
        filters: { tagId: "not-a-uuid" },
      }),
    ).rejects.toThrow("Segment name is required");

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("inserts a segment with orgId, createdBy, and entityType=contact", async () => {
    const segment = {
      id: "seg-1",
      orgId: "org-1",
      name: "Active",
      entityType: "contact",
      filters: { pipelineStage: "prospect" },
    };
    const returningFn = vi.fn().mockResolvedValue([segment]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    const result = await createSegment(db as never, {
      orgId: "org-1",
      createdBy: "user-1",
      name: "Active",
      filters: { pipelineStage: "prospect" },
    });

    const inserted = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.entityType).toBe("contact");
    expect(inserted.orgId).toBe("org-1");
    expect(inserted.createdBy).toBe("user-1");
    expect(result).toEqual(segment);
  });

  it("throws when insert fails", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await expect(
      createSegment(db as never, {
        orgId: "org-1",
        createdBy: "user-1",
        name: "Test",
        filters: {},
      }),
    ).rejects.toThrow("Failed to create segment");
  });

  it("records activity when an actor id is provided", async () => {
    const segment = {
      id: "seg-1",
      orgId: "org-1",
      name: "Active",
      entityType: "contact",
      filters: { pipelineStage: "prospect" },
    };
    const returningFn = vi.fn().mockResolvedValue([segment]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await createSegment(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      createdBy: "user-1",
      name: "Active",
      filters: { pipelineStage: "prospect" },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "created",
        entityType: "saved_segment",
        entityId: "seg-1",
      }),
    );
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const segment = {
      id: "seg-1",
      orgId: "org-1",
      name: "Active",
      entityType: "contact",
      filters: {},
    };
    const returningFn = vi.fn().mockResolvedValue([segment]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await createSegment(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      createdBy: "user-1",
      name: "Active",
      filters: {},
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "saved_segment", action: "created" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const segment = {
      id: "seg-1",
      orgId: "org-1",
      name: "Active",
      entityType: "contact",
      filters: {},
    };
    const returningFn = vi.fn().mockResolvedValue([segment]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({ insert: insertFn });

    await expect(
      createSegment(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        createdBy: "user-1",
        name: "Active",
        filters: {},
      }),
    ).rejects.toThrow("audit log down");
  });
});

// ---------------------------------------------------------------------------
// updateSegment
// ---------------------------------------------------------------------------

describe("updateSegment", () => {
  it("rejects invalid input before updating", async () => {
    const updateFn = vi.fn();
    const db = withTransaction({ update: updateFn });

    await expect(
      updateSegment(db as never, {
        orgId: "org-1",
        segmentId: "seg-1",
        data: { filters: { tagId: "not-a-uuid" } },
      }),
    ).rejects.toThrow("Invalid UUID");

    expect(updateFn).not.toHaveBeenCalled();
  });

  it("updates name and filters", async () => {
    const updated = { id: "seg-1", name: "Updated" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    const result = await updateSegment(db as never, {
      orgId: "org-1",
      segmentId: "seg-1",
      data: { name: "Updated" },
    });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.name).toBe("Updated");
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    expect(result).toEqual(updated);
  });

  it("throws when segment not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      updateSegment(db as never, {
        orgId: "org-1",
        segmentId: "seg-missing",
        data: { name: "X" },
      }),
    ).rejects.toThrow("Segment not found");
  });

  it("records activity when an actor id is provided", async () => {
    const updated = { id: "seg-1", name: "Updated" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await updateSegment(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      segmentId: "seg-1",
      data: { name: "Updated" },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "updated",
        entityType: "saved_segment",
        entityId: "seg-1",
      }),
    );
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const updated = { id: "seg-1", name: "Updated" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await updateSegment(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      segmentId: "seg-1",
      data: { name: "Updated" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "saved_segment", action: "updated" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const updated = { id: "seg-1", name: "Updated" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      updateSegment(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        segmentId: "seg-1",
        data: { name: "Updated" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

// ---------------------------------------------------------------------------
// deleteSegment
// ---------------------------------------------------------------------------

describe("deleteSegment", () => {
  it("soft-deletes the segment", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "seg-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteSegment(db as never, { orgId: "org-1", segmentId: "seg-1" });
    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date), updatedAt: expect.any(Date) }),
    );
  });

  it("throws when segment not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      deleteSegment(db as never, { orgId: "org-1", segmentId: "seg-missing" }),
    ).rejects.toThrow("Segment not found");
  });

  it("records activity when an actor id is provided", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "seg-1", name: "Active Prospects" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteSegment(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      segmentId: "seg-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "deleted",
        entityType: "saved_segment",
        entityId: "seg-1",
      }),
    );
  });

  it("atomicity: transaction runs once and recordActivityLog is called inside it", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const returningFn = vi.fn().mockResolvedValue([{ id: "seg-1", name: "Active Prospects" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteSegment(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      segmentId: "seg-1",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "saved_segment", action: "deleted" }),
    );
  });

  it("atomicity: rejects when recordActivityLog throws (simulates audit log failure)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const returningFn = vi.fn().mockResolvedValue([{ id: "seg-1", name: "Active Prospects" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      deleteSegment(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        segmentId: "seg-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});

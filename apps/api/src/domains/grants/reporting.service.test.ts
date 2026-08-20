import { describe, expect, it, vi } from "vitest";
import { recordActivityLog } from "../../lib/activity-log";
import {
  createCloseoutItem,
  createReportingRequirement,
  deleteCloseoutItem,
  deleteReportingRequirement,
  updateCloseoutItem,
  updateReportingRequirement,
} from "./reporting.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

function makeInsertMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  return { insertFn, valuesFn };
}

function makeUpdateMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  const updateFn = vi.fn().mockReturnValue({ set: setFn });
  return { updateFn, setFn };
}

function makeSoftDeleteMock(returnValue: unknown = { id: "item-1" }) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  const updateFn = vi.fn().mockReturnValue({ set: setFn });
  return { updateFn, setFn, whereFn, returningFn };
}

function collectWhereChunkMetadata(value: unknown) {
  const columns: string[] = [];
  const stringChunks: string[] = [];

  function walk(node: unknown) {
    if (node == null || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    if (typeof record.name === "string") {
      columns.push(record.name);
    }
    if (Array.isArray(record.value) && record.value.every((item) => typeof item === "string")) {
      stringChunks.push(...(record.value as string[]));
    }
    if ("queryChunks" in record) {
      walk(record.queryChunks);
    }
  }

  walk(value);
  return { columns, stringChunks };
}

describe("reporting requirement mutations", () => {
  it("creates, updates, and deletes reporting requirements", async () => {
    const create = makeInsertMock({ id: "req-1" });
    const update = makeUpdateMock({ id: "req-1", status: "submitted" });

    expect(
      await createReportingRequirement(withTransaction({ insert: create.insertFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        reportType: "quarterly",
        dueDate: "2026-10-01T00:00:00Z",
      }),
    ).toEqual({ id: "req-1" });

    expect(
      await updateReportingRequirement(withTransaction({ update: update.updateFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        requirementId: "req-1",
        data: { status: "submitted" },
      }),
    ).toEqual({ id: "req-1", status: "submitted" });

    const softDelete = makeSoftDeleteMock({ id: "req-1" });
    await deleteReportingRequirement(withTransaction({ update: softDelete.updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      requirementId: "req-1",
    });
  });

  it("records reporting requirement activity when an actor is provided", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const create = makeInsertMock({ id: "req-1", reportType: "quarterly" });
    const update = makeUpdateMock({ id: "req-1", status: "submitted" });
    const db = withTransaction({
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" }),
        },
      },
      insert: create.insertFn,
      update: update.updateFn,
    });

    await createReportingRequirement(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      reportType: "quarterly",
      dueDate: "2026-10-01T00:00:00Z",
    });
    await updateReportingRequirement(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      requirementId: "req-1",
      data: { status: "submitted" },
    });
    await deleteReportingRequirement(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      requirementId: "req-1",
    });

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "reporting_requirement" }),
    );
  });

  it("applies default status and submittedAt parsing and throws on missing rows", async () => {
    const create = makeInsertMock(undefined);
    const update = makeUpdateMock(undefined);

    await expect(
      createReportingRequirement(withTransaction({ insert: create.insertFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        reportType: "annual",
        dueDate: "2026-10-01T00:00:00Z",
        submittedAt: "2026-10-02T00:00:00Z",
      }),
    ).rejects.toThrow("Failed to create reporting requirement");

    await expect(
      updateReportingRequirement(withTransaction({ update: update.updateFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        requirementId: "req-1",
        data: {
          reportType: "final",
          dueDate: "2026-10-10T00:00:00Z",
          status: "overdue",
          submittedAt: null,
          notes: "Follow up",
        },
      }),
    ).rejects.toThrow("Reporting requirement not found");
  });

  it("persists submittedAt values for reporting requirements", async () => {
    const create = makeInsertMock({ id: "req-1", submittedAt: null });
    const update = makeUpdateMock({ id: "req-1", submittedAt: new Date("2026-10-03T00:00:00Z") });

    await createReportingRequirement(withTransaction({ insert: create.insertFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      reportType: "annual",
      dueDate: "2026-10-01T00:00:00Z",
      submittedAt: "2026-10-02T00:00:00Z",
    });

    expect(create.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        submittedAt: new Date("2026-10-02T00:00:00Z"),
      }),
    );

    await updateReportingRequirement(withTransaction({ update: update.updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      requirementId: "req-1",
      data: {
        submittedAt: "2026-10-03T00:00:00Z",
      },
    });

    expect(update.setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        submittedAt: new Date("2026-10-03T00:00:00Z"),
      }),
    );
  });

  it("guards reporting requirement updates against soft-deleted rows", async () => {
    const update = makeUpdateMock({ id: "req-1", status: "submitted" });

    await updateReportingRequirement(withTransaction({ update: update.updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      requirementId: "req-1",
      data: { status: "submitted" },
    });

    const whereArg =
      update.updateFn.mock.results[0]?.value.set.mock.results[0]?.value.where.mock.calls[0]?.[0];
    const whereMetadata = collectWhereChunkMetadata(whereArg);
    expect(whereMetadata.columns).toContain("deleted_at");
    expect(whereMetadata.stringChunks).toContain(" is null");
  });

  it("accepts Date inputs and optional notes for reporting requirements", async () => {
    const create = makeInsertMock({ id: "req-2", reportType: "annual" });

    await createReportingRequirement(withTransaction({ insert: create.insertFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      reportType: "annual",
      dueDate: "2026-11-01T00:00:00Z",
      submittedAt: "2026-11-03T00:00:00Z",
      notes: "Board packet attached",
    });

    expect(create.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: new Date("2026-11-01T00:00:00Z"),
        submittedAt: new Date("2026-11-03T00:00:00Z"),
        notes: "Board packet attached",
      }),
    );
  });

  it("uses entity-scoped grant lookup and submittedAt values", async () => {
    const dueDate = "2026-11-01T00:00:00.000Z";
    const submittedAt = "2026-11-03T00:00:00.000Z";
    const create = makeInsertMock({ id: "req-entity", reportType: "annual" });
    const db = withTransaction({
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", entityId: "entity-1" }),
        },
      },
      insert: create.insertFn,
    });

    await createReportingRequirement(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      grantId: "grant-1",
      reportType: "annual",
      dueDate,
      submittedAt,
    });

    expect(create.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "entity-1",
        dueDate: new Date(dueDate),
        submittedAt: new Date(submittedAt),
      }),
    );
  });

  it("rejects reporting requirements for grants outside the org", async () => {
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createReportingRequirement(db as never, {
        orgId: "org-1",
        grantId: "grant-foreign",
        reportType: "annual",
        dueDate: "2026-10-01T00:00:00Z",
      }),
    ).rejects.toThrow("Grant not found");

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("closeout item mutations", () => {
  it("creates, updates, and deletes closeout items", async () => {
    const create = makeInsertMock({ id: "item-1" });
    const update = makeUpdateMock({ id: "item-1", completed: true });

    expect(
      await createCloseoutItem(withTransaction({ insert: create.insertFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        label: "Final report submitted",
      }),
    ).toEqual({ id: "item-1" });

    expect(
      await updateCloseoutItem(withTransaction({ update: update.updateFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        itemId: "item-1",
        userId: "user-1",
        data: { completed: true },
      }),
    ).toEqual({ id: "item-1", completed: true });

    const softDelete = makeSoftDeleteMock({ id: "item-1" });
    await deleteCloseoutItem(withTransaction({ update: softDelete.updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      itemId: "item-1",
    });
  });

  it("records closeout item activity when an actor is provided", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const create = makeInsertMock({ id: "item-1" });
    const db = withTransaction({
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" }),
        },
      },
      insert: create.insertFn,
      update: makeUpdateMock({ id: "item-1", completed: true }).updateFn,
    });

    await createCloseoutItem(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      label: "Final report submitted",
    });
    await updateCloseoutItem(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      itemId: "item-1",
      userId: "user-1",
      data: { completed: true },
    });
    await deleteCloseoutItem(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      itemId: "item-1",
    });

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "closeout_item" }),
    );
  });

  it("handles reopening closeout items and throws on missing rows", async () => {
    const create = makeInsertMock(undefined);
    const update = makeUpdateMock(undefined);

    await expect(
      createCloseoutItem(withTransaction({ insert: create.insertFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        label: "Archive files",
      }),
    ).rejects.toThrow("Failed to create closeout item");

    await expect(
      updateCloseoutItem(withTransaction({ update: update.updateFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        itemId: "item-1",
        userId: "user-1",
        data: { completed: false },
      }),
    ).rejects.toThrow("Closeout item not found");
  });

  it("persists nullable due dates for closeout items", async () => {
    const create = makeInsertMock({ id: "item-1", dueDate: new Date("2026-10-01T00:00:00Z") });
    const update = makeUpdateMock({ id: "item-1", dueDate: null });

    await createCloseoutItem(withTransaction({ insert: create.insertFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      label: "Final report submitted",
      dueDate: "2026-10-01T00:00:00Z",
    });

    expect(create.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: new Date("2026-10-01T00:00:00Z"),
      }),
    );

    await updateCloseoutItem(withTransaction({ update: update.updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      itemId: "item-1",
      userId: "user-1",
      data: { dueDate: null },
    });

    expect(update.setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: null,
      }),
    );
  });

  it("uses entity-scoped closeout create and update branches", async () => {
    const dueDate = "2026-10-01T00:00:00.000Z";
    const create = makeInsertMock({ id: "item-entity", label: "Archive files" });
    const update = makeUpdateMock({ id: "item-entity", completed: false });
    const db = withTransaction({
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", entityId: "entity-1" }),
        },
      },
      insert: create.insertFn,
      update: update.updateFn,
    });

    await createCloseoutItem(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      grantId: "grant-1",
      label: "Archive files",
      dueDate,
    });
    await updateCloseoutItem(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      grantId: "grant-1",
      itemId: "item-entity",
      userId: "user-1",
      data: {
        completed: false,
        dueDate,
      },
    });

    expect(create.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "entity-1", dueDate: new Date(dueDate) }),
    );
    expect(update.setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        completedAt: null,
        completedBy: null,
        dueDate: new Date(dueDate),
      }),
    );
  });

  it("guards closeout item updates against soft-deleted rows", async () => {
    const update = makeUpdateMock({ id: "item-1", completed: true });

    await updateCloseoutItem(withTransaction({ update: update.updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      itemId: "item-1",
      userId: "user-1",
      data: { completed: true },
    });

    const whereArg =
      update.updateFn.mock.results[0]?.value.set.mock.results[0]?.value.where.mock.calls[0]?.[0];
    const whereMetadata = collectWhereChunkMetadata(whereArg);
    expect(whereMetadata.columns).toContain("deleted_at");
    expect(whereMetadata.stringChunks).toContain(" is null");
  });

  it("updates closeout labels and Date due dates", async () => {
    const update = makeUpdateMock({ id: "item-1", label: "Updated checklist" });

    await updateCloseoutItem(withTransaction({ update: update.updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      itemId: "item-1",
      userId: "user-1",
      data: {
        label: "Updated checklist",
        dueDate: "2026-10-05T00:00:00Z",
      },
    });

    expect(update.setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Updated checklist",
        dueDate: new Date("2026-10-05T00:00:00Z"),
      }),
    );
  });

  it("rejects closeout items for grants outside the org", async () => {
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createCloseoutItem(db as never, {
        orgId: "org-1",
        grantId: "grant-foreign",
        label: "Archive files",
      }),
    ).rejects.toThrow("Grant not found");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("soft-deletes a reporting requirement using db.update (not db.delete)", async () => {
    const { updateFn, setFn } = makeSoftDeleteMock({ id: "req-1" });
    await deleteReportingRequirement(withTransaction({ update: updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      requirementId: "req-1",
    });
    expect(updateFn).toHaveBeenCalledTimes(1);
    const setArg = setFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg).toHaveProperty("deletedAt");
    expect(setArg.deletedAt).toBeInstanceOf(Date);
  });

  it("soft-deletes a closeout item using db.update (not db.delete)", async () => {
    const { updateFn, setFn } = makeSoftDeleteMock({ id: "item-1" });
    await deleteCloseoutItem(withTransaction({ update: updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      itemId: "item-1",
    });
    expect(updateFn).toHaveBeenCalledTimes(1);
    const setArg = setFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg).toHaveProperty("deletedAt");
    expect(setArg.deletedAt).toBeInstanceOf(Date);
  });

  it("throws notFound when deleteReportingRequirement targets a non-existent ID", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });

    await expect(
      deleteReportingRequirement(withTransaction({ update: updateFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        requirementId: "does-not-exist",
      }),
    ).rejects.toThrow("Reporting requirement not found");
  });

  it("throws notFound when deleteCloseoutItem targets a non-existent ID", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });

    await expect(
      deleteCloseoutItem(withTransaction({ update: updateFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        itemId: "does-not-exist",
      }),
    ).rejects.toThrow("Closeout item not found");
  });

  it("createReportingRequirement: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const create = makeInsertMock({ id: "req-1", reportType: "quarterly" });
    const db = withTransaction({
      query: { grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) } },
      insert: create.insertFn,
    });

    await createReportingRequirement(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      reportType: "quarterly",
      dueDate: "2026-10-01T00:00:00Z",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "reporting_requirement", action: "created" }),
    );
  });

  it("createReportingRequirement: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const create = makeInsertMock({ id: "req-1", reportType: "quarterly" });
    const db = withTransaction({
      query: { grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) } },
      insert: create.insertFn,
    });

    await expect(
      createReportingRequirement(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        reportType: "quarterly",
        dueDate: "2026-10-01T00:00:00Z",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updateReportingRequirement: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const update = makeUpdateMock({ id: "req-1", status: "submitted" });
    const db = withTransaction({ update: update.updateFn });

    await updateReportingRequirement(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      requirementId: "req-1",
      data: { status: "submitted" },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "reporting_requirement", action: "updated" }),
    );
  });

  it("updateReportingRequirement: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const update = makeUpdateMock({ id: "req-1", status: "submitted" });
    const db = withTransaction({ update: update.updateFn });

    await expect(
      updateReportingRequirement(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        requirementId: "req-1",
        data: { status: "submitted" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("deleteReportingRequirement: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const { updateFn } = makeSoftDeleteMock({ id: "req-1" });
    const db = withTransaction({ update: updateFn });

    await deleteReportingRequirement(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      requirementId: "req-1",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "reporting_requirement", action: "deleted" }),
    );
  });

  it("deleteReportingRequirement: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { updateFn } = makeSoftDeleteMock({ id: "req-1" });
    const db = withTransaction({ update: updateFn });

    await expect(
      deleteReportingRequirement(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        requirementId: "req-1",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("createCloseoutItem: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const create = makeInsertMock({ id: "item-1", label: "Final report" });
    const db = withTransaction({
      query: { grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) } },
      insert: create.insertFn,
    });

    await createCloseoutItem(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      label: "Final report",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "closeout_item", action: "created" }),
    );
  });

  it("createCloseoutItem: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const create = makeInsertMock({ id: "item-1", label: "Final report" });
    const db = withTransaction({
      query: { grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) } },
      insert: create.insertFn,
    });

    await expect(
      createCloseoutItem(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        label: "Final report",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updateCloseoutItem: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const update = makeUpdateMock({ id: "item-1" });
    const db = withTransaction({ update: update.updateFn });

    await updateCloseoutItem(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      itemId: "item-1",
      userId: "user-1",
      data: { completed: true },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "closeout_item", action: "updated" }),
    );
  });

  it("updateCloseoutItem: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const update = makeUpdateMock({ id: "item-1" });
    const db = withTransaction({ update: update.updateFn });

    await expect(
      updateCloseoutItem(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        itemId: "item-1",
        userId: "user-1",
        data: { completed: true },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("deleteCloseoutItem: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const { updateFn } = makeSoftDeleteMock({ id: "item-1" });
    const db = withTransaction({ update: updateFn });

    await deleteCloseoutItem(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      itemId: "item-1",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "closeout_item", action: "deleted" }),
    );
  });

  it("deleteCloseoutItem: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { updateFn } = makeSoftDeleteMock({ id: "item-1" });
    const db = withTransaction({ update: updateFn });

    await expect(
      deleteCloseoutItem(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        itemId: "item-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});

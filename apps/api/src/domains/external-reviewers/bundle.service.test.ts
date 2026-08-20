import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/app-error";
import {
  createBundle,
  updateBundle,
  softDeleteBundle,
  publishBundle,
  getBundle,
  listBundles,
  addBundleItem,
  removeBundleItem,
  reorderBundleItems,
} from "./bundle.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(async () => undefined),
}));

import { recordActivityLog } from "../../lib/activity-log";

function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

const now = new Date("2026-05-04T12:00:00.000Z");

const mockBundle = {
  id: "bundle-1",
  orgId: "org-1",
  title: "2026 Audit Package",
  description: null,
  purpose: "audit",
  periodStart: null,
  periodEnd: null,
  createdBy: "user-1",
  createdAt: now,
  publishedAt: null,
  deletedAt: null,
};

const mockItem = {
  id: "item-1",
  bundleId: "bundle-1",
  itemType: "grant",
  itemId: "grant-1",
  caption: null,
  sortOrder: 0,
};

function makeInsertWithReturning(result: unknown) {
  return vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(async () => result),
      onConflictDoNothing: vi.fn(async () => undefined),
    })),
  }));
}

function makeUpdateWithReturning(result: unknown) {
  return vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => result),
      })),
    })),
  }));
}

function makeSelectCountThenItems(countValue: number, items: unknown[]) {
  let callCount = 0;
  return vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // first call: count
          return Object.assign(Promise.resolve([{ value: countValue }]), {
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(async () => items),
              })),
            })),
          });
        }
        // second call: items
        return Object.assign(Promise.resolve([{ value: countValue }]), {
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(async () => items),
            })),
          })),
        });
      }),
    })),
  }));
}

type MockDb = {
  query: Record<string, { findFirst: ReturnType<typeof vi.fn> }>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};

function makeDb(overrides: Record<string, unknown> = {}) {
  const db: MockDb = {
    query: {
      evidenceBundles: {
        findFirst: vi.fn(async () => mockBundle),
      },
      grants: {
        findFirst: vi.fn(async () => ({ id: "grant-1" })),
      },
      funds: {
        findFirst: vi.fn(async () => ({ id: "fund-1" })),
      },
      programs: {
        findFirst: vi.fn(async () => ({ id: "program-1" })),
      },
      documents: {
        findFirst: vi.fn(async () => ({ id: "document-1", entityType: "subrecipient" })),
      },
      generatedReports: {
        findFirst: vi.fn(async () => ({ id: "report-1" })),
      },
      restrictionTerms: {
        findFirst: vi.fn(async () => ({ id: "restriction-1" })),
      },
      grantPaymentRequests: {
        findFirst: vi.fn(async () => ({ id: "request-1" })),
      },
      subrecipients: {
        findFirst: vi.fn(async () => ({ id: "subrecipient-1" })),
      },
      subawards: {
        findFirst: vi.fn(async () => ({ id: "subaward-1" })),
      },
      subrecipientMonitoringTasks: {
        findFirst: vi.fn(async () => ({ id: "task-1" })),
      },
      subrecipientMonitoringLogs: {
        findFirst: vi.fn(async () => ({ id: "log-1" })),
      },
      subrecipientFindings: {
        findFirst: vi.fn(async () => ({ id: "finding-1" })),
      },
      subrecipientCorrectiveActions: {
        findFirst: vi.fn(async () => ({ id: "corrective-action-1" })),
      },
    },
    insert: makeInsertWithReturning([mockBundle]),
    update: makeUpdateWithReturning([mockBundle]),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
    select: makeSelectCountThenItems(1, [mockBundle]),
    ...overrides,
  } as MockDb;

  return db as unknown as MockDb & Parameters<typeof createBundle>[0];
}

beforeEach(() => {
  vi.mocked(recordActivityLog).mockClear();
});

describe("createBundle", () => {
  it("inserts bundle and records activity log", async () => {
    const db = withTransaction(makeDb());
    const result = await createBundle(db, "org-1", "user-1", {
      title: "2026 Audit Package",
      purpose: "audit",
    });
    expect(result).toEqual(mockBundle);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "create",
        entityType: "evidence_bundle",
        entityId: "bundle-1",
      }),
    );
  });

  it("handles periodStart and periodEnd", async () => {
    const db = withTransaction(makeDb());
    await createBundle(db, "org-1", "user-1", {
      title: "Bundle",
      purpose: "audit",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-12-31T00:00:00.000Z",
    });
    const insertCall = vi.mocked(db.insert).mock.calls[0];
    expect(insertCall).toBeDefined();
  });

  it("throws if insert returns nothing", async () => {
    const db = withTransaction(makeDb({ insert: makeInsertWithReturning([]) }));
    await expect(
      createBundle(db, "org-1", "user-1", { title: "X", purpose: "other" }),
    ).rejects.toThrow("Failed to create bundle");
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await createBundle(db, "org-1", "user-1", { title: "2026 Audit Package", purpose: "audit" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "evidence_bundle", action: "create" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(
      createBundle(db, "org-1", "user-1", { title: "X", purpose: "audit" }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateBundle", () => {
  it("updates bundle and records activity log", async () => {
    const db = withTransaction(makeDb());
    const result = await updateBundle(db, "org-1", "bundle-1", "user-1", {
      title: "Updated Title",
    });
    expect(result).toEqual(mockBundle);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "update",
        entityType: "evidence_bundle",
      }),
    );
  });

  it("throws not found if bundle does not exist", async () => {
    const db = withTransaction(
      makeDb({
        query: { evidenceBundles: { findFirst: vi.fn(async () => null) } },
      }),
    );
    await expect(
      updateBundle(db, "org-1", "bundle-1", "user-1", { title: "X" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws not found if update returns nothing", async () => {
    const db = withTransaction(makeDb({ update: makeUpdateWithReturning([]) }));
    await expect(
      updateBundle(db, "org-1", "bundle-1", "user-1", { title: "X" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("handles empty input (covers false branches of all conditional spreads)", async () => {
    const db = withTransaction(makeDb());
    // All conditional spreads take false branch since nothing is defined
    const result = await updateBundle(db, "org-1", "bundle-1", "user-1", {});
    expect(result).toEqual(mockBundle);
  });

  it("updates periodStart and periodEnd when provided (covers true branches)", async () => {
    const db = withTransaction(makeDb());
    const result = await updateBundle(db, "org-1", "bundle-1", "user-1", {
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-12-31T00:00:00.000Z",
    });
    expect(result).toEqual(mockBundle);
  });

  it("updates description and purpose when provided (covers their truthy branches)", async () => {
    const db = withTransaction(makeDb());
    const result = await updateBundle(db, "org-1", "bundle-1", "user-1", {
      description: "Updated description",
      purpose: "funder_review",
    });
    expect(result).toEqual(mockBundle);
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await updateBundle(db, "org-1", "bundle-1", "user-1", { title: "T" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "evidence_bundle", action: "update" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(updateBundle(db, "org-1", "bundle-1", "user-1", { title: "X" })).rejects.toThrow(
      "audit log down",
    );
  });
});

describe("softDeleteBundle", () => {
  it("sets deletedAt and records activity log", async () => {
    const db = withTransaction(makeDb());
    await softDeleteBundle(db, "org-1", "bundle-1", "user-1");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "delete",
        entityType: "evidence_bundle",
        entityId: "bundle-1",
      }),
    );
  });

  it("throws not found if bundle does not exist", async () => {
    const db = withTransaction(
      makeDb({
        query: { evidenceBundles: { findFirst: vi.fn(async () => null) } },
      }),
    );
    await expect(softDeleteBundle(db, "org-1", "bundle-1", "user-1")).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await softDeleteBundle(db, "org-1", "bundle-1", "user-1");
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "evidence_bundle", action: "delete" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(softDeleteBundle(db, "org-1", "bundle-1", "user-1")).rejects.toThrow(
      "audit log down",
    );
  });
});

describe("publishBundle", () => {
  it("sets publishedAt and records activity log", async () => {
    const db = withTransaction(makeDb());
    const result = await publishBundle(db, "org-1", "bundle-1", "user-1");
    expect(result).toEqual(mockBundle);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "update",
        entityType: "evidence_bundle",
      }),
    );
  });

  it("throws not found if bundle does not exist", async () => {
    const db = withTransaction(
      makeDb({
        query: { evidenceBundles: { findFirst: vi.fn(async () => null) } },
      }),
    );
    await expect(publishBundle(db, "org-1", "bundle-1", "user-1")).rejects.toBeInstanceOf(AppError);
  });

  it("throws not found if update returns nothing", async () => {
    const db = withTransaction(makeDb({ update: makeUpdateWithReturning([]) }));
    await expect(publishBundle(db, "org-1", "bundle-1", "user-1")).rejects.toBeInstanceOf(AppError);
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const db = withTransaction(makeDb());
    await publishBundle(db, "org-1", "bundle-1", "user-1");
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "evidence_bundle", action: "update" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction(makeDb());
    await expect(publishBundle(db, "org-1", "bundle-1", "user-1")).rejects.toThrow(
      "audit log down",
    );
  });
});

describe("getBundle", () => {
  it("returns bundle with items", async () => {
    const db = makeDb({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => [mockItem]),
          })),
        })),
      })),
    });
    const result = await getBundle(db, "org-1", "bundle-1");
    expect(result).not.toBeNull();
    expect(result!.bundle).toEqual(mockBundle);
    expect(result!.items).toEqual([mockItem]);
  });

  it("returns null when bundle does not exist", async () => {
    const db = makeDb({
      query: { evidenceBundles: { findFirst: vi.fn(async () => null) } },
    });
    const result = await getBundle(db, "org-1", "bundle-1");
    expect(result).toBeNull();
  });
});

describe("listBundles", () => {
  it("returns items and total", async () => {
    const db = makeDb();
    const result = await listBundles(db, "org-1", {
      page: 1,
      pageSize: 25,
      includeDeleted: false,
    });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("applies purpose filter", async () => {
    const db = makeDb();
    const result = await listBundles(db, "org-1", {
      page: 1,
      pageSize: 25,
      purpose: "audit",
      includeDeleted: false,
    });
    expect(result).toBeDefined();
  });

  it("includes deleted bundles when includeDeleted is true", async () => {
    const db = makeDb();
    const result = await listBundles(db, "org-1", {
      page: 1,
      pageSize: 25,
      includeDeleted: true,
    });
    expect(result).toBeDefined();
  });

  it("defaults total to 0 when count result is undefined (covers ?? 0 branch)", async () => {
    let callCount = 0;
    const selectFn = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          callCount++;
          if (callCount === 1) {
            return Object.assign(Promise.resolve([]), {
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({ offset: vi.fn(async () => []) })),
              })),
            });
          }
          return Object.assign(Promise.resolve([]), {
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({ offset: vi.fn(async () => []) })),
            })),
          });
        }),
      })),
    }));
    const db = makeDb({ select: selectFn });
    const result = await listBundles(db, "org-1", { page: 1, pageSize: 25, includeDeleted: false });
    expect(result.total).toBe(0);
  });

  it("returns a JSON-safe number when the database count is a bigint", async () => {
    let callCount = 0;
    const selectFn = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          callCount++;
          if (callCount === 1) {
            return Object.assign(Promise.resolve([{ value: 1n }]), {
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({ offset: vi.fn(async () => []) })),
              })),
            });
          }
          return Object.assign(Promise.resolve([]), {
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({ offset: vi.fn(async () => []) })),
            })),
          });
        }),
      })),
    }));
    const db = makeDb({ select: selectFn });
    const result = await listBundles(db, "org-1", { page: 1, pageSize: 25, includeDeleted: false });
    expect(result.total).toBe(1);
    expect(typeof result.total).toBe("number");
  });
});

describe("addBundleItem", () => {
  it("inserts a bundle item and returns it", async () => {
    const db = makeDb({
      insert: makeInsertWithReturning([mockItem]),
    });
    const result = await addBundleItem(db, "org-1", "bundle-1", {
      itemType: "grant",
      itemId: "grant-1",
      sortOrder: 0,
    });
    expect(result).toEqual(mockItem);
  });

  it.each([
    ["grant", "grants"],
    ["fund", "funds"],
    ["program", "programs"],
    ["document", "documents"],
    ["subrecipient_file", "documents"],
    ["generated_report", "generatedReports"],
    ["evidence_bundle", "evidenceBundles"],
    ["restriction_term", "restrictionTerms"],
    ["reimbursement_request", "grantPaymentRequests"],
    ["subrecipient", "subrecipients"],
    ["subaward", "subawards"],
    ["subrecipient_monitoring_task", "subrecipientMonitoringTasks"],
    ["subrecipient_monitoring_log", "subrecipientMonitoringLogs"],
    ["subrecipient_finding", "subrecipientFindings"],
    ["subrecipient_corrective_action", "subrecipientCorrectiveActions"],
  ] as const)(
    "validates %s references before inserting bundle items",
    async (itemType, queryKey) => {
      const insert = makeInsertWithReturning([mockItem]);
      const db = makeDb({ insert });

      await addBundleItem(db, "org-1", "bundle-1", {
        itemType,
        itemId: "item-1",
        sortOrder: 0,
      });

      expect(db.query[queryKey]!.findFirst).toHaveBeenCalled();
      expect(insert).toHaveBeenCalled();
    },
  );

  it("throws not found and does not insert when the bundle is outside the org", async () => {
    const insert = makeInsertWithReturning([mockItem]);
    const db = makeDb({
      query: { evidenceBundles: { findFirst: vi.fn(async () => null) } },
      insert,
    });

    await expect(
      addBundleItem(db, "org-1", "bundle-other-org", {
        itemType: "grant",
        itemId: "grant-1",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("throws if insert returns nothing", async () => {
    const db = makeDb({ insert: makeInsertWithReturning([]) });
    await expect(
      addBundleItem(db, "org-1", "bundle-1", { itemType: "grant", itemId: "g-1", sortOrder: 0 }),
    ).rejects.toThrow("Failed to add bundle item");
  });

  it("throws not found and does not insert when the referenced item is outside the org", async () => {
    const insert = makeInsertWithReturning([mockItem]);
    const db = makeDb({
      query: {
        evidenceBundles: { findFirst: vi.fn(async () => mockBundle) },
        grants: { findFirst: vi.fn(async () => null) },
      },
      insert,
    });

    await expect(
      addBundleItem(db, "org-1", "bundle-1", {
        itemType: "grant",
        itemId: "grant-other-org",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("removeBundleItem", () => {
  it("deletes the bundle item and records activity", async () => {
    const deleteMock = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn(async () => [mockItem]) })),
    }));
    const db = withTransaction(makeDb({ delete: deleteMock }));
    await removeBundleItem(db, "org-1", "bundle-1", "item-1", "user-1");
    expect(deleteMock).toHaveBeenCalled();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "delete",
        entityType: "evidence_bundle_item",
        entityId: "item-1",
        changes: { bundleId: "bundle-1" },
      }),
    );
  });

  it("throws not found and does not record activity when no item is deleted", async () => {
    const deleteMock = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn(async () => []) })),
    }));
    const db = withTransaction(makeDb({ delete: deleteMock }));

    await expect(
      removeBundleItem(db, "org-1", "bundle-1", "missing-item", "user-1"),
    ).rejects.toBeInstanceOf(AppError);
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("throws not found and does not delete when the bundle is outside the org", async () => {
    const deleteMock = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn(async () => []) })),
    }));
    const db = withTransaction(
      makeDb({
        query: { evidenceBundles: { findFirst: vi.fn(async () => null) } },
        delete: deleteMock,
      }),
    );

    await expect(
      removeBundleItem(db, "org-1", "bundle-other-org", "item-1", "user-1"),
    ).rejects.toBeInstanceOf(AppError);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("atomicity: transaction is called once and activity log fires", async () => {
    const deleteMock = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn(async () => [mockItem]) })),
    }));
    const db = withTransaction(makeDb({ delete: deleteMock }));
    await removeBundleItem(db, "org-1", "bundle-1", "item-1", "user-1");
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "evidence_bundle_item", action: "delete" }),
    );
  });

  it("atomicity: rollback propagates when activity log throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const deleteMock = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn(async () => [mockItem]) })),
    }));
    const db = withTransaction(makeDb({ delete: deleteMock }));
    await expect(removeBundleItem(db, "org-1", "bundle-1", "item-1", "user-1")).rejects.toThrow(
      "audit log down",
    );
  });
});

describe("reorderBundleItems", () => {
  it("updates sortOrder for each item in order", async () => {
    const setSpy = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => [mockItem]),
      })),
    }));
    const db = makeDb({
      update: vi.fn(() => ({ set: setSpy })),
    });
    await reorderBundleItems(db, "org-1", "bundle-1", { itemIds: ["item-1", "item-2", "item-3"] });
    expect(setSpy).toHaveBeenCalledTimes(3);
    expect(setSpy).toHaveBeenNthCalledWith(1, { sortOrder: 0 });
    expect(setSpy).toHaveBeenNthCalledWith(2, { sortOrder: 1 });
    expect(setSpy).toHaveBeenNthCalledWith(3, { sortOrder: 2 });
  });

  it("throws not found and does not update when the bundle is outside the org", async () => {
    const updateMock = vi.fn(() => ({ set: vi.fn() }));
    const db = makeDb({
      query: { evidenceBundles: { findFirst: vi.fn(async () => null) } },
      update: updateMock,
    });

    await expect(
      reorderBundleItems(db, "org-1", "bundle-other-org", { itemIds: ["item-1"] }),
    ).rejects.toBeInstanceOf(AppError);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

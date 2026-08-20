import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  createEntity,
  createInviteLink,
  assignEntityAccess,
  createCustomFieldDefinition,
  getOrgBillingSummary,
  getOrgProfile,
  listDebugAnalyticsEvents,
  listDebugBillingEvents,
  listDebugEmails,
  listDebugErrorEvents,
  listDebugStorageObjects,
  listEntities,
  listCustomFieldValues,
  listCustomFieldDefinitions,
  listOrgMembers,
  archiveEntity,
  revokeEntityAccess,
  saveBillingSelection,
  softDeleteCustomFieldDefinition,
  updateEntity,
  updateOrgMember,
  updateOrgProfile,
  updateOrgSettings,
  updateCustomFieldDefinition,
  updateEntityAccess,
  upsertCustomFieldValue,
} from "./service";
import { recordActivityLog } from "../../lib/activity-log";
import { getIntegrations, resetLocalMockIntegrationRecords } from "../../lib/integrations";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Attaches a self-referencing `transaction` stub to any db mock object.
 * The callback receives the same mock so assertions on `.insert`/`.update`/etc.
 * still pass after the service wraps those calls in `db.transaction(...)`.
 */
function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

function makeInsertMock(returningValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue(returningValue);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  return { insertFn, valuesFn, returningFn };
}

function makeEntityAccessSelectMock(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, innerJoin, where, orderBy };
}

beforeEach(() => {
  vi.mocked(recordActivityLog).mockClear();
  resetLocalMockIntegrationRecords();
});

describe("listCustomFieldDefinitions", () => {
  it("returns definitions for the org and entity type", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([{ id: "field-1", name: "Program Area" }]),
          }),
        }),
      }),
    };

    const result = await listCustomFieldDefinitions(db as never, {
      orgId: "org-1",
      entityType: "grant",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Program Area");
  });

  it("ignores soft-deleted definitions", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { id: "field-1", name: "Program Area", deletedAt: null },
              {
                id: "field-2",
                name: "Historical Field",
                deletedAt: new Date("2026-04-08T00:00:00Z"),
              },
            ]),
          }),
        }),
      }),
    };

    const result = await listCustomFieldDefinitions(db as never, {
      orgId: "org-1",
      entityType: "grant",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("field-1");
  });
});

describe("createCustomFieldDefinition", () => {
  it("inserts the definition for the org", async () => {
    const insert = makeInsertMock([{ id: "field-1", name: "Program Area" }]);
    const db = withTransaction({
      insert: insert.insertFn,
      query: {
        entities: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity-1" }),
        },
      },
    });

    const result = await createCustomFieldDefinition(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      name: "Program Area",
      fieldType: "single_select",
      options: ["STEM", "Arts"],
      sortOrder: 0,
    });

    expect(insert.insertFn).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("field-1");
  });

  it("records activity log after creating a custom field definition", async () => {
    const insert = makeInsertMock([{ id: "field-1", name: "Program Area" }]);
    const db = withTransaction({
      insert: insert.insertFn,
      query: {
        entities: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity-1" }),
        },
      },
    });

    await createCustomFieldDefinition(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      name: "Program Area",
      fieldType: "single_select",
      options: ["STEM", "Arts"],
      sortOrder: 0,
    });

    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      action: "created",
      entityType: "custom_field",
      entityId: "field-1",
      changes: { name: "Program Area", fieldType: "single_select", entityType: "grant" },
    });
  });

  it("throws when insert does not return a row", async () => {
    const insert = makeInsertMock([]);
    const db = withTransaction({
      insert: insert.insertFn,
      query: {
        entities: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity-1" }),
        },
      },
    });

    await expect(
      createCustomFieldDefinition(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityType: "grant",
        name: "Program Area",
        fieldType: "single_select",
        options: ["STEM", "Arts"],
        sortOrder: 0,
      }),
    ).rejects.toThrow("Failed to create custom field definition");
  });

  it("defaults options to null and sort order to zero when omitted", async () => {
    const insert = makeInsertMock([{ id: "field-1", name: "Program Area" }]);
    const db = withTransaction({ insert: insert.insertFn });

    await createCustomFieldDefinition(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      name: "Program Area",
      fieldType: "text",
    });

    expect(insert.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        options: null,
        sortOrder: 0,
      }),
    );
  });
});

describe("updateCustomFieldDefinition", () => {
  it("updates the definition inside the org", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "field-1", name: "Program Focus" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({ update: vi.fn().mockReturnValue({ set: setFn }) });

    const result = await updateCustomFieldDefinition(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      definitionId: "field-1",
      data: { name: "Program Focus" },
    });

    expect(result.name).toBe("Program Focus");
  });

  it("records activity log after updating a custom field definition", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "field-1", name: "Program Focus" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({ update: vi.fn().mockReturnValue({ set: setFn }) });

    await updateCustomFieldDefinition(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      definitionId: "field-1",
      data: { name: "Program Focus" },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      action: "updated",
      entityType: "custom_field",
      entityId: "field-1",
      changes: { name: "Program Focus" },
    });
  });

  it("throws 404 when the definition is missing during update", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({ update: vi.fn().mockReturnValue({ set: setFn }) });

    let error: unknown;
    try {
      await updateCustomFieldDefinition(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        definitionId: "field-1",
        data: { name: "Program Focus" },
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Custom field definition not found");
    expect((error as { status?: number }).status).toBe(404);
  });
});

describe("softDeleteCustomFieldDefinition", () => {
  it("marks the definition deleted without deleting stored values", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ id: "field-1", orgId: "org-1", entityType: "grant" });
    const returningFn = vi
      .fn()
      .mockResolvedValue([{ id: "field-1", deletedAt: new Date("2026-04-08T00:00:00Z") }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst,
        },
      },
      update: vi.fn().mockReturnValue({ set: setFn }),
      delete: vi.fn(),
    });

    await softDeleteCustomFieldDefinition(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      definitionId: "field-1",
    });

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(Date),
      }),
    );
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("records activity log after soft-deleting a custom field definition", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ id: "field-1", orgId: "org-1", entityType: "grant" });
    const whereFn = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({
      query: {
        customFieldDefinitions: { findFirst },
      },
      update: vi.fn().mockReturnValue({ set: setFn }),
      delete: vi.fn(),
    });

    await softDeleteCustomFieldDefinition(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      definitionId: "field-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      action: "deleted",
      entityType: "custom_field",
      entityId: "field-1",
      changes: null,
    });
  });

  it("rejects deletes for definitions outside the org with 404", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      delete: vi.fn(),
    };

    let error: unknown;
    try {
      await softDeleteCustomFieldDefinition(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        definitionId: "field-1",
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Custom field definition not found");
    expect((error as { status?: number }).status).toBe(404);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe("upsertCustomFieldValue", () => {
  it("upserts a serialized value for an entity", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: '["alpha"]' }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "multi_select",
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    const result = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: ["alpha"],
    });

    expect(result.id).toBe("value-1");
  });

  it("records activity log after upserting a custom field value", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: '["alpha"]' }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "multi_select",
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: ["alpha"],
    });

    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      action: "upserted",
      entityType: "custom_field_value",
      entityId: "field-1:grant-1",
      changes: { value: ["alpha"] },
    });
  });

  it("upserts a value for a contact entity when the contact exists", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: "Alpha" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "contact",
            fieldType: "text",
          }),
        },
        contacts: {
          findFirst: vi.fn().mockResolvedValue({ id: "contact-1" }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    const result = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "contact",
      fieldId: "field-1",
      entityId: "contact-1",
      value: "Alpha",
    });

    expect(result.id).toBe("value-1");
  });

  it("rejects writes when the contact entity does not exist", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "contact",
            fieldType: "text",
          }),
        },
        contacts: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      upsertCustomFieldValue(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityType: "contact",
        fieldId: "field-1",
        entityId: "contact-1",
        value: "Alpha",
      }),
    ).rejects.toThrow("Contact not found");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("upserts a value for a donation entity when the donation exists", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: "Alpha" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "donation",
            fieldType: "text",
          }),
        },
        donations: {
          findFirst: vi.fn().mockResolvedValue({ id: "donation-1" }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    const result = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "donation",
      fieldId: "field-1",
      entityId: "donation-1",
      value: "Alpha",
    });

    expect(result.id).toBe("value-1");
  });

  it("rejects writes when the donation entity does not exist", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "donation",
            fieldType: "text",
          }),
        },
        donations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      upsertCustomFieldValue(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityType: "donation",
        fieldId: "field-1",
        entityId: "donation-1",
        value: "Alpha",
      }),
    ).rejects.toThrow("Donation not found");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects writes when the grant entity does not exist", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "text",
          }),
        },
        grants: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      upsertCustomFieldValue(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityType: "grant",
        fieldId: "field-1",
        entityId: "grant-1",
        value: "Alpha",
      }),
    ).rejects.toThrow("Grant not found");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("preserves string values without JSON stringifying them", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: "STEM" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "single_select",
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "STEM",
    });

    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "STEM",
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: {
          value: "STEM",
        },
      }),
    );
  });

  it("throws when the value upsert does not return a row", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "multi_select",
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    await expect(
      upsertCustomFieldValue(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityType: "grant",
        fieldId: "field-1",
        entityId: "grant-1",
        value: ["alpha"],
      }),
    ).rejects.toThrow("Failed to upsert custom field value");
  });

  it("rejects writes when the field does not belong to the org and entity type with 404", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    };

    let error: unknown;
    try {
      await upsertCustomFieldValue(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityType: "grant",
        fieldId: "field-1",
        entityId: "grant-1",
        value: ["alpha"],
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Custom field definition not found");
    expect((error as { status?: number }).status).toBe(404);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric value for a number field with HTTP 400", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "number",
          }),
        },
      },
      insert: vi.fn(),
    };

    const error = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "banana",
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(400);
    expect((error as Error).message).toMatch(/number/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("accepts a valid numeric string for a number field", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: "42.5" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "number",
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    const result = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "42.5",
    });

    expect(result.id).toBe("value-1");
  });

  it("rejects a non-date value for a date field with HTTP 400", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "date",
          }),
        },
      },
      insert: vi.fn(),
    };

    const error = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "not-a-date",
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(400);
    expect((error as Error).message).toMatch(/date/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects an impossible calendar date like 2026-13-45 with HTTP 400", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "date",
          }),
        },
      },
      insert: vi.fn(),
    };

    const error = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "2026-13-45",
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(400);
    expect((error as Error).message).toMatch(/calendar date/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("accepts a valid YYYY-MM-DD string for a date field", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: "2026-04-15" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "date",
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    const result = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "2026-04-15",
    });

    expect(result.id).toBe("value-1");
  });

  it("accepts any string for a text field", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: "any text" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "text",
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    const result = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "any text",
    });

    expect(result.id).toBe("value-1");
  });

  it("rejects a non-string value for a text field with HTTP 400", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "text",
          }),
        },
      },
      insert: vi.fn(),
    };

    const error = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: 42,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a non-string value for a single_select field with HTTP 400", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "single_select",
          }),
        },
      },
      insert: vi.fn(),
    };

    const error = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: 99,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a non-array value for a multi_select field with HTTP 400", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "multi_select",
          }),
        },
      },
      insert: vi.fn(),
    };

    const error = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "not-an-array",
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a non-string element inside a multi_select array with HTTP 400", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "multi_select",
          }),
        },
      },
      insert: vi.fn(),
    };

    const error = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: [1, 2, 3],
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a single_select value not in the definition's allowed options with HTTP 400", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "single_select",
            options: ["STEM", "Arts"],
          }),
        },
      },
      insert: vi.fn(),
    };

    const error = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "Music",
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("accepts a single_select value that is in the definition's allowed options", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: '"STEM"' }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "single_select",
            options: ["STEM", "Arts"],
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    const result = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "STEM",
    });

    expect(result.id).toBe("value-1");
  });

  it("rejects a multi_select containing a value not in the definition's allowed options with HTTP 400", async () => {
    const db = {
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "multi_select",
            options: ["STEM", "Arts"],
          }),
        },
      },
      insert: vi.fn(),
    };

    const error = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: ["STEM", "Music"],
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("accepts any string for a single_select field whose definition has null options (backward compat)", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: '"anything"' }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "single_select",
            options: null,
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    const result = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "anything",
    });

    expect(result.id).toBe("value-1");
  });

  it("accepts a numeric value (non-string) for a number field by coercing with String()", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: "99" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "number",
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    const result = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: 99,
    });

    expect(result.id).toBe("value-1");
  });

  it("passes through values unchanged for an unknown fieldType (future-proof default branch)", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "value-1", value: "anything" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            orgId: "org-1",
            entityType: "grant",
            fieldType: "rich_text",
          }),
        },
      },
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
    });

    const result = await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "anything",
    });

    expect(result.id).toBe("value-1");
  });
});

describe("listCustomFieldValues", () => {
  it("returns values matched to the org definition list", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                { id: "field-1", name: "Program Area" },
                { id: "field-2", name: "Funding Cycle" },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { id: "value-1", fieldId: "field-1", entityId: "grant-1", value: "STEM" },
              { id: "value-ignored", fieldId: "field-999", entityId: "grant-1", value: "Ignore" },
            ]),
          }),
        }),
    };

    const result = await listCustomFieldValues(db as never, {
      orgId: "org-1",
      entityType: "grant",
      entityId: "grant-1",
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.value?.value).toBe("STEM");
    expect(result[1]?.value).toBeNull();
  });

  it("rejects when the entity is missing or soft-deleted", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([{ id: "field-1", name: "Program Area" }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockResolvedValue([{ id: "value-1", fieldId: "field-1", entityId: "grant-1" }]),
          }),
        }),
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(
      listCustomFieldValues(db as never, {
        orgId: "org-1",
        entityType: "grant",
        entityId: "grant-1",
      }),
    ).rejects.toThrow("Grant not found");

    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("org profile and team services", () => {
  it("returns and updates the org profile", async () => {
    const db = withTransaction({
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", name: "GrantPipe" }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "org-1", name: "GrantPipe+" }]),
          }),
        }),
      }),
    });

    await expect(getOrgProfile(db as never, { orgId: "org-1" })).resolves.toEqual({
      id: "org-1",
      name: "GrantPipe",
    });
    await expect(
      updateOrgProfile(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: {
          name: "GrantPipe+",
          fiscalYearStartMonth: 1,
          timezone: "America/New_York",
        },
      }),
    ).resolves.toEqual({ id: "org-1", name: "GrantPipe+" });
  });

  it("records activity log after updating the org profile", async () => {
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "org-1", name: "GrantPipe+" }]),
          }),
        }),
      }),
    });

    const data = { name: "GrantPipe+", fiscalYearStartMonth: 1, timezone: "America/New_York" };
    await updateOrgProfile(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      data,
    });

    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      action: "updated",
      entityType: "organization",
      entityId: "org-1",
      changes: data,
    });
  });

  it("strips billing/Stripe fields from the updated org profile response", async () => {
    const updatedRow = {
      id: "org-1",
      name: "GrantPipe+",
      slug: "grantpipe",
      ein: "12-3456789",
      fiscalYearStartMonth: 7,
      timezone: "America/New_York",
      logoUrl: null,
      address: "1 Mission St",
      stripeCustomerId: "cus_SENSITIVE",
      stripeSubscriptionId: "sub_SENSITIVE",
      planTier: "growth",
      billingCycle: "annual",
      subscriptionStatus: "active",
      trialStartedAt: new Date("2026-01-01T00:00:00.000Z"),
      trialEndsAt: new Date("2026-02-01T00:00:00.000Z"),
      trialWillEndNotifiedAt: new Date("2026-01-25T00:00:00.000Z"),
      trialExpiredEventAt: null,
      promoCodeApplied: "SECRETPROMO",
      planSelectedAt: new Date("2026-01-10T00:00:00.000Z"),
      onboardingCompleted: true,
      accountingEnabled: true,
      createdAt: new Date("2026-04-22T11:00:00.000Z"),
      updatedAt: new Date("2026-04-22T12:00:00.000Z"),
      deletedAt: null,
    };
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedRow]),
          }),
        }),
      }),
    });

    const result = await updateOrgProfile(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      data: {
        name: "GrantPipe+",
        fiscalYearStartMonth: 7,
        timezone: "America/New_York",
      },
    });

    expect(result).toMatchObject({
      id: "org-1",
      name: "GrantPipe+",
      planTier: "growth",
    });
    expect(result).not.toHaveProperty("stripeCustomerId");
    expect(result).not.toHaveProperty("stripeSubscriptionId");
    expect(result).not.toHaveProperty("billingCycle");
    expect(result).not.toHaveProperty("subscriptionStatus");
    expect(result).not.toHaveProperty("trialStartedAt");
    expect(result).not.toHaveProperty("trialEndsAt");
    expect(result).not.toHaveProperty("trialWillEndNotifiedAt");
    expect(result).not.toHaveProperty("trialExpiredEventAt");
    expect(result).not.toHaveProperty("promoCodeApplied");
    expect(result).not.toHaveProperty("planSelectedAt");
  });

  it("getOrgProfile throws when the organization is not found", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(getOrgProfile(db as never, { orgId: "org-missing" })).rejects.toThrow(
      "Organization not found",
    );
  });

  it("getOrgProfile strips billing/Stripe fields from the returned profile", async () => {
    // GET /org/profile is reachable by Editor, Viewer, and Auditor (settings:view
    // OR accounting:view) — all of whom have billing:none. The full org row carries
    // Stripe identifiers and subscription state, which must never leak through the
    // settings profile; billing data has its own admin-only /org/billing endpoint.
    const fullRow = {
      id: "org-1",
      name: "GrantPipe",
      slug: "grantpipe",
      ein: "12-3456789",
      fiscalYearStartMonth: 7,
      timezone: "America/New_York",
      logoUrl: "https://example.com/logo.png",
      address: "1 Mission St",
      stripeCustomerId: "cus_SENSITIVE",
      stripeSubscriptionId: "sub_SENSITIVE",
      planTier: "growth",
      billingCycle: "annual",
      subscriptionStatus: "active",
      trialStartedAt: new Date("2026-01-01T00:00:00.000Z"),
      trialEndsAt: new Date("2026-02-01T00:00:00.000Z"),
      trialWillEndNotifiedAt: new Date("2026-01-25T00:00:00.000Z"),
      trialExpiredEventAt: null,
      promoCodeApplied: "SECRETPROMO",
      planSelectedAt: new Date("2026-01-10T00:00:00.000Z"),
      onboardingCompleted: true,
      accountingEnabled: true,
      createdAt: new Date("2026-04-22T11:00:00.000Z"),
      updatedAt: new Date("2026-04-22T12:00:00.000Z"),
      deletedAt: null,
    };

    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue(fullRow),
        },
      },
    };

    const result = await getOrgProfile(db as never, { orgId: "org-1" });

    expect(result).toEqual({
      id: "org-1",
      name: "GrantPipe",
      slug: "grantpipe",
      ein: "12-3456789",
      fiscalYearStartMonth: 7,
      timezone: "America/New_York",
      logoUrl: "https://example.com/logo.png",
      address: "1 Mission St",
      planTier: "growth",
      onboardingCompleted: true,
      accountingEnabled: true,
      createdAt: new Date("2026-04-22T11:00:00.000Z"),
      updatedAt: new Date("2026-04-22T12:00:00.000Z"),
      deletedAt: null,
    });
    expect(result).not.toHaveProperty("stripeCustomerId");
    expect(result).not.toHaveProperty("stripeSubscriptionId");
    expect(result).not.toHaveProperty("billingCycle");
    expect(result).not.toHaveProperty("subscriptionStatus");
    expect(result).not.toHaveProperty("trialStartedAt");
    expect(result).not.toHaveProperty("trialEndsAt");
    expect(result).not.toHaveProperty("trialWillEndNotifiedAt");
    expect(result).not.toHaveProperty("trialExpiredEventAt");
    expect(result).not.toHaveProperty("promoCodeApplied");
    expect(result).not.toHaveProperty("planSelectedAt");
  });

  it("getOrgProfile falls back to raw SQL when production is missing plan_selected_at", async () => {
    const row = {
      id: "org-1",
      name: "GrantPipe",
      slug: "grantpipe",
      ein: null,
      fiscalYearStartMonth: 1,
      timezone: "America/New_York",
      logoUrl: null,
      address: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      planTier: "starter",
      billingCycle: "monthly",
      subscriptionStatus: "trialing",
      trialStartedAt: null,
      trialEndsAt: null,
      trialWillEndNotifiedAt: null,
      promoCodeApplied: null,
      planSelectedAt: null,
      onboardingCompleted: false,
      accountingEnabled: false,
      createdAt: new Date("2026-04-22T11:00:00.000Z"),
      updatedAt: new Date("2026-04-22T12:00:00.000Z"),
      deletedAt: null,
    };

    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockRejectedValue(
            Object.assign(new Error('column "plan_selected_at" does not exist'), {
              code: "42703",
            }),
          ),
        },
      },
      execute: vi.fn().mockResolvedValue({ rows: [row] }),
    };

    await expect(getOrgProfile(db as never, { orgId: "org-1" })).resolves.toEqual({
      id: "org-1",
      name: "GrantPipe",
      slug: "grantpipe",
      ein: null,
      fiscalYearStartMonth: 1,
      timezone: "America/New_York",
      logoUrl: null,
      address: null,
      planTier: "starter",
      onboardingCompleted: false,
      accountingEnabled: false,
      createdAt: new Date("2026-04-22T11:00:00.000Z"),
      updatedAt: new Date("2026-04-22T12:00:00.000Z"),
      deletedAt: null,
    });
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("getOrgProfile handles fallback result returned as a bare array", async () => {
    const row = {
      id: "org-1",
      name: "GrantPipe",
      slug: "grantpipe",
      ein: null,
      fiscalYearStartMonth: 1,
      timezone: "America/New_York",
      logoUrl: null,
      address: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      planTier: "starter",
      billingCycle: "monthly",
      subscriptionStatus: "trialing",
      trialStartedAt: null,
      trialEndsAt: null,
      trialWillEndNotifiedAt: null,
      promoCodeApplied: null,
      planSelectedAt: null,
      onboardingCompleted: false,
      accountingEnabled: false,
      createdAt: new Date("2026-04-22T11:00:00.000Z"),
      updatedAt: new Date("2026-04-22T12:00:00.000Z"),
      deletedAt: null,
    };

    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockRejectedValue(
            Object.assign(new Error('column "plan_selected_at" does not exist'), {
              code: "42703",
            }),
          ),
        },
      },
      execute: vi.fn().mockResolvedValue([row]),
    };

    await expect(getOrgProfile(db as never, { orgId: "org-1" })).resolves.toEqual({
      id: "org-1",
      name: "GrantPipe",
      slug: "grantpipe",
      ein: null,
      fiscalYearStartMonth: 1,
      timezone: "America/New_York",
      logoUrl: null,
      address: null,
      planTier: "starter",
      onboardingCompleted: false,
      accountingEnabled: false,
      createdAt: new Date("2026-04-22T11:00:00.000Z"),
      updatedAt: new Date("2026-04-22T12:00:00.000Z"),
      deletedAt: null,
    });
  });

  it("getOrgProfile does not mask non-schema lookup errors", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockRejectedValue(new Error("database unavailable")),
        },
      },
      execute: vi.fn(),
    };

    await expect(getOrgProfile(db as never, { orgId: "org-1" })).rejects.toThrow(
      "database unavailable",
    );
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("getOrgProfile throws when fallback SQL returns no rows", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockRejectedValue(
            Object.assign(new Error('column "plan_selected_at" does not exist'), {
              code: "42703",
            }),
          ),
        },
      },
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await expect(getOrgProfile(db as never, { orgId: "org-missing" })).rejects.toThrow(
      "Organization not found",
    );
  });

  it("updateOrgProfile throws when the organization is not found", async () => {
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    await expect(
      updateOrgProfile(db as never, {
        orgId: "org-missing",
        actorId: "user-1",
        data: { name: "X", fiscalYearStartMonth: 1, timezone: "UTC" },
      }),
    ).rejects.toThrow("Organization not found");
  });

  it("lists org members and updates member records", async () => {
    const entityAccessSelect = makeEntityAccessSelectMock([
      {
        id: "entity-member-1",
        orgMemberId: "member-1",
        entityId: "entity-client",
        entityName: "Client Project",
        kind: "agency_client",
        status: "active",
        fiscalSponsorModel: "none",
        parentEntityId: null,
        role: "viewer",
        permissions: { grants: "view" },
      },
    ]);
    const db = withTransaction({
      select: entityAccessSelect.select,
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([{ id: "member-1", role: "viewer" }]),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "member-1", role: "editor" }]),
          }),
        }),
      }),
    });

    await expect(
      listOrgMembers(db as never, { orgId: "org-1", includeInactive: false }),
    ).resolves.toEqual([
      {
        id: "member-1",
        role: "viewer",
        entityAccess: [
          expect.objectContaining({
            entityId: "entity-client",
            entityName: "Client Project",
            role: "viewer",
            permissions: {
              entitySettings: "view",
              entityTeam: "none",
              grants: "view",
              funds: "view",
              documents: "view",
              compliance: "view",
              accounting: "view",
              reports: "view",
            },
          }),
        ],
      },
    ]);
    await expect(
      updateOrgMember(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        memberId: "member-1",
        data: { role: "editor", active: true },
      }),
    ).resolves.toEqual({ id: "member-1", role: "editor" });
  });

  it("records activity log after updating an org member", async () => {
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "member-1", role: "editor" }]),
          }),
        }),
      }),
    });

    const data = { role: "editor" as const };
    await updateOrgMember(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      memberId: "member-1",
      data,
    });

    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      action: "updated",
      entityType: "org_member",
      entityId: "member-1",
      changes: data,
    });
  });

  it("lists org members including inactive ones when includeInactive is true", async () => {
    const entityAccessSelect = makeEntityAccessSelectMock([]);
    const db = {
      select: entityAccessSelect.select,
      query: {
        orgMembers: {
          findMany: vi.fn().mockResolvedValue([
            { id: "member-1", role: "viewer", deletedAt: null },
            { id: "member-2", role: "admin", deletedAt: new Date("2026-01-01") },
          ]),
        },
      },
    };

    const result = await listOrgMembers(db as never, { orgId: "org-1", includeInactive: true });
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("entityAccess", []);
  });

  it("updateOrgMember sets deletedAt when active is false and leaves it undefined when active is absent", async () => {
    const captured: Record<string, unknown>[] = [];
    function buildDb() {
      return withTransaction({
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation((val: Record<string, unknown>) => {
            captured.push(val);
            return {
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: "member-1", role: "viewer" }]),
              }),
            };
          }),
        })),
      });
    }

    await updateOrgMember(buildDb() as never, {
      orgId: "org-1",
      actorId: "user-1",
      memberId: "member-1",
      data: { active: false },
    });
    await updateOrgMember(buildDb() as never, {
      orgId: "org-1",
      actorId: "user-1",
      memberId: "member-1",
      data: { role: "viewer" },
    });

    expect(captured[0]!.deletedAt).toBeInstanceOf(Date);
    expect(captured[1]!.deletedAt).toBeUndefined();
  });

  it("updateOrgMember throws when no row is updated", async () => {
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    });

    await expect(
      updateOrgMember(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        memberId: "missing",
        data: { role: "viewer" },
      }),
    ).rejects.toThrow("Org member not found");
  });

  it("prevents deactivating the last active admin", async () => {
    const db = {
      query: {
        orgMembers: {
          findFirst: vi.fn().mockResolvedValue({ id: "member-1", role: "admin" }),
          findMany: vi.fn().mockResolvedValue([{ id: "member-1", role: "admin" }]),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "org-1",
                planTier: "growth",
                billingCycle: "annual",
                promoCodeApplied: null,
              },
            ]),
          }),
        }),
      }),
    };

    await expect(
      updateOrgMember(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        memberId: "member-1",
        data: { active: false },
      }),
    ).rejects.toThrow("At least one active admin is required");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("prevents demoting the last active admin", async () => {
    const db = {
      query: {
        orgMembers: {
          findFirst: vi.fn().mockResolvedValue({ id: "member-1", role: "admin" }),
          findMany: vi.fn().mockResolvedValue([{ id: "member-1", role: "admin" }]),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "org-1",
                planTier: "growth",
                billingCycle: "annual",
                promoCodeApplied: null,
              },
            ]),
          }),
        }),
      }),
    };

    await expect(
      updateOrgMember(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        memberId: "member-1",
        data: { role: "viewer" },
      }),
    ).rejects.toThrow("At least one active admin is required");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("persists permission overrides when updating an org member", async () => {
    const setFn = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "member-1", role: "viewer" }]),
      }),
    });
    const db = withTransaction({
      query: {
        orgMembers: {
          findFirst: vi.fn().mockResolvedValue({ id: "member-1", role: "viewer" }),
        },
      },
      update: vi.fn().mockReturnValue({ set: setFn }),
    });

    await updateOrgMember(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      memberId: "member-1",
      data: { permissions: { donors: "view", grants: "edit" } },
    });

    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: { donors: "view", grants: "edit" },
      }),
    );
  });

  it("debug email helper returns an empty page when no local mock emails exist", async () => {
    const result = await listDebugEmails({} as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 10,
      sortOrder: "asc",
    });
    expect(result).toMatchObject({ data: [], total: 0, page: 1, pageSize: 10 });
  });

  it("creates invite links for team management", async () => {
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "invite-1", token: "token-1" }]),
        }),
      }),
    });

    const result = await createInviteLink(db as never, {
      orgId: "org-1",
      userId: "user-1",
      role: "editor",
      mode: "shareable",
    });

    expect(result.id).toBe("invite-1");
  });

  it("createInviteLink throws when insert does not return a row", async () => {
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await expect(
      createInviteLink(db as never, {
        orgId: "org-1",
        userId: "user-1",
        role: "admin",
        mode: "shareable",
      }),
    ).rejects.toThrow("Failed to create invite");
  });

  it("records activity log after creating an invite link", async () => {
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "invite-1", token: "token-1" }]),
        }),
      }),
    });

    await createInviteLink(db as never, {
      orgId: "org-1",
      userId: "user-1",
      role: "editor",
      mode: "shareable",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      action: "created",
      entityType: "invite_link",
      entityId: "invite-1",
      changes: { mode: "shareable", role: "editor" },
    });
  });

  it("creates email-specific invites with normalized email and permissions", async () => {
    const valuesFn = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "invite-1", token: "token-1" }]),
    });
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: valuesFn,
      }),
    });

    await createInviteLink(db as never, {
      orgId: "org-1",
      userId: "user-1",
      mode: "email",
      email: " Teammate@Example.Org ",
      role: "viewer",
      permissions: { grants: "edit", donors: "view" },
    });

    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "teammate@example.org",
        permissions: { grants: "edit", donors: "view" },
      }),
    );
  });

  it("debug email helper remains empty for descending sortOrder when no local mock emails exist", async () => {
    const result = await listDebugEmails({} as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 10,
      sortOrder: "desc",
    });
    expect(result).toMatchObject({ data: [], total: 0, page: 1, pageSize: 10 });
  });
});

describe("billing and debug services", () => {
  it("adds billing lifecycle state to trial billing summaries", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            id: "org-1",
            planTier: "starter",
            billingCycle: "annual",
            subscriptionStatus: "trialing",
            trialEndsAt: new Date("2000-01-01T00:00:00.000Z"),
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            promoCodeApplied: null,
          }),
        },
      },
    };

    const summary = await getOrgBillingSummary(
      db as never,
      { APP_URL: "http://localhost:5173" } as never,
      { orgId: "org-1" },
    );

    expect(summary).toMatchObject({
      status: "trialing",
      billingLifecycleState: "expired",
      trialEndsAt: "2000-01-01T00:00:00.000Z",
    });
  });

  it("returns billing summary and mock checkout or portal sessions", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            id: "org-1",
            planTier: "starter",
            stripeCustomerId: null,
            stripeSubscriptionId: null,
          }),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "event-1" }]),
          }),
          returning: vi.fn().mockResolvedValue([{ id: "event-1" }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    const summary = await getOrgBillingSummary(
      db as never,
      { APP_URL: "http://localhost:5173" } as never,
      {
        orgId: "org-1",
      },
    );
    const checkout = await createBillingCheckoutSession(
      db as never,
      { APP_URL: "http://localhost:5173" } as never,
      {
        orgId: "org-1",
        userId: "user-1",
        data: {
          planTier: "growth",
          billingCycle: "monthly",
          surface: "settings",
          checkoutAttemptId: "f7bc1df2-5375-4a8e-a43d-c61f863a034b",
        },
      },
    );
    const portal = await createBillingPortalSession(
      db as never,
      { APP_URL: "http://localhost:5173" } as never,
      {
        orgId: "org-1",
        userId: "user-1",
        data: { returnPath: "/settings" },
      },
    );

    expect(summary.planTier).toBe("starter");
    expect(summary.checkoutUrl).toBe("http://localhost:5173/app/settings#billing");
    expect(summary.portalUrl).toBe("http://localhost:5173/app/settings#billing");
    expect(checkout.url).toContain("/app/settings?checkout=");
    expect(checkout.url).toContain("#billing");
    expect(portal.url).toContain("/app/settings");
  });

  it("persists explicit billing selection on the org before checkout", async () => {
    const captured: Record<string, unknown>[] = [];
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          captured.push(payload);
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: "org-1",
                  planTier: "growth",
                  billingCycle: "annual",
                  promoCodeApplied: null,
                },
              ]),
            }),
          };
        }),
      }),
    });

    const result = await saveBillingSelection(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      data: { planTier: "growth", billingCycle: "annual" },
    });

    expect(result).toMatchObject({
      id: "org-1",
      planTier: "growth",
      billingCycle: "annual",
      promoCodeApplied: null,
    });
    expect(captured[0]).toMatchObject({
      planTier: "growth",
      billingCycle: "annual",
      updatedAt: expect.any(Date),
      planSelectedAt: expect.any(Date),
    });
    expect(captured[0]).not.toHaveProperty("promoCodeApplied");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: expect.not.objectContaining({
          promoCodeApplied: expect.anything(),
        }),
      }),
    );
  });

  it("ignores stale promo fields when saving billing selection", async () => {
    const captured: Record<string, unknown>[] = [];
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          captured.push(payload);
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: "org-1",
                  planTier: "growth",
                  billingCycle: "annual",
                  promoCodeApplied: null,
                },
              ]),
            }),
          };
        }),
      }),
    });

    await saveBillingSelection(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      data: {
        planTier: "growth",
        billingCycle: "annual",
        promoCode: "M80OFF",
      } as never,
    });

    expect(captured[0]).not.toHaveProperty("promoCodeApplied");
  });

  it("persists billing selection when production is missing plan_selected_at", async () => {
    const updatedAt = new Date("2026-04-22T12:00:00.000Z");
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(
              Object.assign(new Error('column "plan_selected_at" does not exist'), {
                code: "42703",
              }),
            ),
          }),
        }),
      }),
      execute: vi.fn().mockResolvedValue({
        rows: [
          {
            id: "org-1",
            name: "Acme Nonprofit",
            slug: "acme-nonprofit",
            ein: null,
            fiscalYearStartMonth: 1,
            timezone: "America/New_York",
            logoUrl: null,
            address: null,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            planTier: "growth",
            billingCycle: "annual",
            subscriptionStatus: "trialing",
            trialStartedAt: null,
            trialEndsAt: null,
            trialWillEndNotifiedAt: null,
            promoCodeApplied: null,
            planSelectedAt: updatedAt,
            onboardingCompleted: false,
            accountingEnabled: false,
            createdAt: new Date("2026-04-22T11:00:00.000Z"),
            updatedAt,
            deletedAt: null,
          },
        ],
      }),
    });

    const result = await saveBillingSelection(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      data: { planTier: "growth", billingCycle: "annual" },
    });

    expect(result).toMatchObject({
      id: "org-1",
      planTier: "growth",
      billingCycle: "annual",
      planSelectedAt: updatedAt,
    });
    expect(db.execute).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        changes: expect.objectContaining({
          planSelectedAt: expect.any(String),
        }),
      }),
    );
  });

  it("rejects direct plan changes for active Stripe-backed subscriptions", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            stripeSubscriptionId: "sub_live_123",
            subscriptionStatus: "active",
            planTier: "starter",
            billingCycle: "monthly",
          }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "org-1",
                planTier: "growth",
                billingCycle: "annual",
                promoCodeApplied: null,
              },
            ]),
          }),
        }),
      }),
    };

    await expect(
      saveBillingSelection(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: { planTier: "growth", billingCycle: "annual" },
      }),
    ).rejects.toThrow("Use the Stripe billing portal to change an active subscription plan");

    expect(db.update).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("rejects checkout plan changes for active Stripe-backed subscriptions", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            stripeSubscriptionId: "sub_live_123",
            subscriptionStatus: "active",
            planTier: "starter",
            billingCycle: "monthly",
          }),
        },
      },
    };

    await expect(
      createBillingCheckoutSession(db as never, { APP_URL: "http://localhost:5173" } as never, {
        orgId: "org-1",
        userId: "user-1",
        data: {
          planTier: "growth",
          billingCycle: "annual",
          surface: "settings",
          checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
        },
      }),
    ).rejects.toThrow("Use the Stripe billing portal to change an active subscription plan");
  });

  it("rejects checkout for active Stripe-backed subscriptions even when plan is unchanged", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            stripeSubscriptionId: "sub_live_123",
            subscriptionStatus: "active",
            planTier: "growth",
            billingCycle: "annual",
          }),
        },
      },
    };

    await expect(
      createBillingCheckoutSession(db as never, { APP_URL: "http://localhost:5173" } as never, {
        orgId: "org-1",
        userId: "user-1",
        data: {
          planTier: "growth",
          billingCycle: "annual",
          surface: "settings",
          checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
        },
      }),
    ).rejects.toThrow("Use the Stripe billing portal to manage an active subscription");
  });

  it.each(["trialing", "past_due"] as const)(
    "rejects checkout for %s Stripe-backed subscriptions",
    async (subscriptionStatus) => {
      const db = {
        query: {
          organizations: {
            findFirst: vi.fn().mockResolvedValue({
              stripeSubscriptionId: "sub_live_123",
              subscriptionStatus,
              planTier: "growth",
              billingCycle: "annual",
            }),
          },
        },
      };

      await expect(
        createBillingCheckoutSession(db as never, { APP_URL: "http://localhost:5173" } as never, {
          orgId: "org-1",
          userId: "user-1",
          data: {
            planTier: "growth",
            billingCycle: "annual",
            surface: "settings",
            checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
          },
        }),
      ).rejects.toThrow("Use the Stripe billing portal to manage an existing subscription");
    },
  );

  it("allows checkout for canceled Stripe-backed subscriptions", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            stripeSubscriptionId: "sub_canceled_123",
            subscriptionStatus: "canceled",
            planTier: "growth",
            billingCycle: "annual",
          }),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "event-1" }]),
          }),
          returning: vi.fn().mockResolvedValue([{ id: "event-1" }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    await expect(
      createBillingCheckoutSession(db as never, { APP_URL: "http://localhost:5173" } as never, {
        orgId: "org-1",
        userId: "user-1",
        data: {
          planTier: "growth",
          billingCycle: "annual",
          surface: "settings",
          checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
        },
      }),
    ).resolves.toMatchObject({
      url: expect.stringContaining("/app/settings?checkout="),
    });
  });

  it("fails checkout closed with a controlled 503 when Stripe is not configured", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            stripeSubscriptionId: null,
            subscriptionStatus: "trialing",
            planTier: "starter",
            billingCycle: "monthly",
          }),
        },
      },
    };

    await expect(
      createBillingCheckoutSession(
        db as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          RESEND_API_KEY: "re_test_key",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
        {
          orgId: "org-1",
          userId: "user-1",
          data: {
            planTier: "starter",
            billingCycle: "monthly",
            surface: "settings",
            checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 503, errorCode: "billing_unavailable" });
  });

  it("fails checkout closed when a production Stripe price binding is missing", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            stripeSubscriptionId: null,
            subscriptionStatus: "trialing",
            planTier: "starter",
            billingCycle: "monthly",
          }),
        },
      },
    };

    await expect(
      createBillingCheckoutSession(
        db as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          STRIPE_SECRET_KEY: "sk_test_configured",
          RESEND_API_KEY: "re_test_key",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
        {
          orgId: "org-1",
          userId: "user-1",
          data: {
            planTier: "starter",
            billingCycle: "monthly",
            surface: "settings",
            checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 503, errorCode: "billing_unavailable" });
  });

  it("fails the billing portal closed with a controlled 503 when Stripe is not configured", async () => {
    await expect(
      createBillingPortalSession(
        {} as never,
        {
          APP_URL: "https://app.grantpipe.com",
          INTEGRATION_MODE: "real",
          RESEND_API_KEY: "re_test_key",
          R2: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
        } as never,
        { orgId: "org-1", userId: "user-1", data: { returnPath: "/settings" } },
      ),
    ).rejects.toMatchObject({ status: 503, errorCode: "billing_unavailable" });
  });

  it("allows saving the same plan for an active Stripe-backed subscription", async () => {
    const db = withTransaction({
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            stripeSubscriptionId: "sub_live_123",
            subscriptionStatus: "active",
            planTier: "growth",
            billingCycle: "annual",
          }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "org-1",
                planTier: "growth",
                billingCycle: "annual",
                promoCodeApplied: null,
              },
            ]),
          }),
        }),
      }),
    });

    await expect(
      saveBillingSelection(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: { planTier: "growth", billingCycle: "annual" },
      }),
    ).resolves.toMatchObject({
      id: "org-1",
      planTier: "growth",
      billingCycle: "annual",
    });
  });

  it("ignores stale direct promo fields for active Stripe-backed subscriptions", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "org-1",
        planTier: "growth",
        billingCycle: "annual",
        promoCodeApplied: null,
      },
    ]);
    const db = withTransaction({
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            stripeSubscriptionId: "sub_live_123",
            subscriptionStatus: "active",
            planTier: "growth",
            billingCycle: "annual",
          }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning }),
        }),
      }),
    });

    await saveBillingSelection(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      data: {
        planTier: "growth",
        billingCycle: "annual",
        promoCode: "M80OFF",
      } as never,
    });

    expect(db.update).toHaveBeenCalled();
  });

  it("rejects direct plan changes for active Stripe-backed subscriptions", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            stripeSubscriptionId: "sub_live_123",
            subscriptionStatus: "active",
            planTier: "starter",
            billingCycle: "monthly",
          }),
        },
      },
      update: vi.fn(),
    };

    await expect(
      saveBillingSelection(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: { planTier: "growth", billingCycle: "annual" },
      }),
    ).rejects.toThrow("Use the Stripe billing portal to change an active subscription plan");

    expect(db.update).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it.each(["trialing", "past_due"] as const)(
    "rejects direct plan changes for %s Stripe-backed subscriptions",
    async (subscriptionStatus) => {
      const db = {
        query: {
          organizations: {
            findFirst: vi.fn().mockResolvedValue({
              stripeSubscriptionId: "sub_live_123",
              subscriptionStatus,
              planTier: "starter",
              billingCycle: "monthly",
              promoCodeApplied: null,
            }),
          },
        },
        update: vi.fn(),
      };

      await expect(
        saveBillingSelection(db as never, {
          orgId: "org-1",
          actorId: "user-1",
          data: { planTier: "growth", billingCycle: "annual" },
        }),
      ).rejects.toThrow("Use the Stripe billing portal to change an existing subscription plan");

      expect(db.update).not.toHaveBeenCalled();
      expect(recordActivityLog).not.toHaveBeenCalled();
    },
  );

  it("throws when billing selection update returns no organization row", async () => {
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    await expect(
      saveBillingSelection(db as never, {
        orgId: "org-missing",
        actorId: "user-1",
        data: { planTier: "growth", billingCycle: "annual" },
      }),
    ).rejects.toThrow("Organization not found");
  });

  it("does not mask non-schema billing selection failures", async () => {
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error("database unavailable")),
          }),
        }),
      }),
      execute: vi.fn(),
    });

    await expect(
      saveBillingSelection(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: { planTier: "growth", billingCycle: "annual" },
      }),
    ).rejects.toThrow("database unavailable");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("lists debug inspection records", async () => {
    const now = new Date("2026-04-08T00:00:00.000Z");
    const db = {
      query: {
        billingEvents: {
          findMany: vi.fn().mockResolvedValue([{ id: "event-1", createdAt: now }]),
        },
      },
    };
    const integrations = getIntegrations(
      db as never,
      { APP_URL: "http://localhost:5173" } as never,
    );

    await integrations.email.send({
      orgId: "org-1",
      to: ["admin@example.org"],
      subject: "Debug email",
      text: "email body",
      source: { entityType: "debug", entityId: "email-1" },
    });
    await integrations.storage.put({
      key: "org-1/debug/file.txt",
      body: "debug storage",
      contentType: "text/plain",
      fileName: "file.txt",
      source: { entityType: "debug", entityId: "storage-1", orgId: "org-1" },
    });
    await integrations.analytics.capture({
      orgId: "org-1",
      eventName: "debug.event",
      payload: { ok: true },
    });
    await integrations.errors.capture({
      orgId: "org-1",
      message: "debug error",
    });

    await expect(
      listDebugEmails(db as never, { orgId: "org-1", page: 1, pageSize: 10, sortOrder: "desc" }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      listDebugStorageObjects(db as never, {
        orgId: "org-1",
        page: 1,
        pageSize: 10,
        sortOrder: "desc",
      }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      listDebugBillingEvents(db as never, {
        orgId: "org-1",
        page: 1,
        pageSize: 10,
        sortOrder: "desc",
      }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      listDebugAnalyticsEvents(db as never, {
        orgId: "org-1",
        page: 1,
        pageSize: 10,
        sortOrder: "desc",
      }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      listDebugErrorEvents(db as never, {
        orgId: "org-1",
        page: 1,
        pageSize: 10,
        sortOrder: "desc",
      }),
    ).resolves.toMatchObject({ total: 1 });
  });
});

describe("updateOrgSettings", () => {
  it("updates accountingEnabled when provided", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "org-1" }]);
    const whereFn = vi.fn().mockReturnValue(returningFn);
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await updateOrgSettings(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      accountingEnabled: true,
    });

    expect(updateFn).toHaveBeenCalledTimes(1);
    const setArg = setFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg).toEqual({ accountingEnabled: true });
    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      action: "updated",
      entityType: "organization",
      entityId: "org-1",
      changes: { accountingEnabled: true },
    });
  });

  it("does nothing when no settings fields are provided", async () => {
    const updateFn = vi.fn();
    const db = { update: updateFn };

    await updateOrgSettings(db as never, { orgId: "org-1", actorId: "user-1" });

    expect(updateFn).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("does not update when accountingEnabled is undefined", async () => {
    const updateFn = vi.fn();
    const db = { update: updateFn };

    await updateOrgSettings(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      accountingEnabled: undefined,
    });

    expect(updateFn).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });
});

describe("entity settings service", () => {
  it("lists active entities for an org by default", async () => {
    const rows = [
      { id: "entity-1", orgId: "org-1", name: "Alpha", status: "active" },
      { id: "entity-2", orgId: "org-1", name: "Archived", status: "archived" },
    ];
    const db = {
      query: {
        entities: {
          findMany: vi.fn().mockResolvedValue(rows),
        },
      },
    };

    const result = await listEntities(db as never, {
      orgId: "org-1",
      includeArchived: false,
    });

    expect(result).toEqual(rows);
    expect(db.query.entities.findMany).toHaveBeenCalledOnce();
  });

  it("creates an entity and records a sanitized activity log", async () => {
    const insert = makeInsertMock([
      {
        id: "entity-2",
        orgId: "org-1",
        name: "Sponsored Project",
        kind: "sponsored_project",
        fiscalSponsorModel: "model_a",
        parentEntityId: "entity-1",
        status: "active",
      },
    ]);
    const db = withTransaction({
      insert: insert.insertFn,
      query: {
        entities: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity-1" }),
        },
      },
    });

    const result = await createEntity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      name: "Sponsored Project",
      kind: "sponsored_project",
      fiscalSponsorModel: "model_a",
      parentEntityId: "entity-1",
    });

    expect(result.id).toBe("entity-2");
    expect(insert.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        name: "Sponsored Project",
        kind: "sponsored_project",
        fiscalSponsorModel: "model_a",
        parentEntityId: "entity-1",
        status: "active",
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      action: "created",
      entityType: "entity",
      entityId: "entity-2",
      changes: {
        kind: "sponsored_project",
        fiscalSponsorModel: "model_a",
        parentEntityId: "entity-1",
      },
    });
  });

  it("updates an entity and records only safe changed fields", async () => {
    const returningFn = vi.fn().mockResolvedValue([
      {
        id: "entity-2",
        orgId: "org-1",
        name: "Updated Project",
        kind: "sponsored_project",
        fiscalSponsorModel: "model_c",
      },
    ]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({ update: vi.fn().mockReturnValue({ set: setFn }) });

    const result = await updateEntity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityId: "entity-2",
      data: {
        name: "Updated Project",
        fiscalSponsorModel: "model_c",
      },
    });

    expect(result.id).toBe("entity-2");
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated Project",
        fiscalSponsorModel: "model_c",
        updatedAt: expect.any(Date),
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      action: "updated",
      entityType: "entity",
      entityId: "entity-2",
      changes: {
        changedFields: ["fiscalSponsorModel", "name"],
      },
    });
  });

  it("does not let generic updates change entity status", async () => {
    const db = { update: vi.fn() };

    await expect(
      updateEntity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityId: "entity-2",
        data: { status: "archived" },
      }),
    ).rejects.toThrow("Use dedicated entity status endpoints to change status");
    await expect(
      updateEntity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityId: "entity-2",
        data: { status: "active" },
      }),
    ).rejects.toThrow("Use dedicated entity status endpoints to change status");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("requires parent entities to be active", async () => {
    const insert = makeInsertMock([{ id: "entity-2" }]);
    const db = withTransaction({
      insert: insert.insertFn,
      query: {
        entities: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    await expect(
      createEntity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        name: "Sponsored Project",
        kind: "sponsored_project",
        fiscalSponsorModel: "model_a",
        parentEntityId: "entity-archived",
      }),
    ).rejects.toThrow("Parent entity must be active");
    expect(insert.insertFn).not.toHaveBeenCalled();
  });

  it("refuses self-parent and cyclic parent updates", async () => {
    const db = withTransaction({
      update: vi.fn(),
      query: {
        entities: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity-parent" }),
          findMany: vi.fn().mockResolvedValue([
            { id: "entity-parent", parentEntityId: "entity-child" },
            { id: "entity-child", parentEntityId: "entity-2" },
            { id: "entity-2", parentEntityId: null },
          ]),
        },
      },
    });

    await expect(
      updateEntity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityId: "entity-2",
        data: { parentEntityId: "entity-2" },
      }),
    ).rejects.toThrow("Entity cannot be its own parent");

    await expect(
      updateEntity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityId: "entity-2",
        data: { parentEntityId: "entity-parent" },
      }),
    ).rejects.toThrow("Entity parent cannot create a cycle");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("refuses to archive the default entity", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ defaultEntityId: "entity-default" }),
        },
        entities: {
          findMany: vi.fn(),
        },
      },
      update: vi.fn(),
    };

    await expect(
      archiveEntity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityId: "entity-default",
      }),
    ).rejects.toThrow("The default entity cannot be archived");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("refuses to archive the last active entity", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ defaultEntityId: "entity-default" }),
        },
        entities: {
          findMany: vi.fn().mockResolvedValue([{ id: "entity-2" }]),
        },
      },
      update: vi.fn(),
    };

    await expect(
      archiveEntity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityId: "entity-2",
      }),
    ).rejects.toThrow("At least one active entity is required");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("refuses to archive entities with active children", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ defaultEntityId: "entity-default" }),
        },
        entities: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ id: "entity-2" }, { id: "entity-default" }])
            .mockResolvedValueOnce([{ id: "entity-child" }]),
        },
      },
      update: vi.fn(),
    };

    await expect(
      archiveEntity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityId: "entity-2",
      }),
    ).rejects.toThrow("Archive child entities first");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("assigns entity access to an existing org member and records sanitized activity", async () => {
    const insert = makeInsertMock([
      {
        id: "entity-member-1",
        orgId: "org-1",
        orgMemberId: "member-1",
        entityId: "entity-client",
        role: "viewer",
      },
    ]);
    const db = withTransaction({
      insert: insert.insertFn,
      query: {
        entities: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity-client", status: "active" }),
        },
        orgMembers: {
          findFirst: vi.fn().mockResolvedValue({ id: "member-1", role: "viewer" }),
        },
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      select: makeEntityAccessSelectMock([
        {
          id: "entity-member-other",
          orgMemberId: "member-1",
          entityId: "entity-other",
          entityName: "Other Project",
          kind: "agency_client",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "viewer",
          permissions: {},
        },
        {
          id: "entity-member-1",
          orgMemberId: "member-1",
          entityId: "entity-client",
          entityName: "Client Project",
          kind: "agency_client",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "viewer",
          permissions: { grants: "view", reports: "view" },
        },
      ]).select,
    });

    const result = await assignEntityAccess(db as never, {
      orgId: "org-1",
      actorId: "admin-1",
      memberId: "member-1",
      entityId: "entity-client",
      role: "viewer",
      permissions: { grants: "view", reports: "view" },
    });

    expect(result.id).toBe("entity-member-1");
    expect(result.entityName).toBe("Client Project");
    expect(result).not.toHaveProperty("orgMemberId");
    expect(result.permissions).toEqual({
      entitySettings: "view",
      entityTeam: "none",
      grants: "view",
      funds: "view",
      documents: "view",
      compliance: "view",
      accounting: "view",
      reports: "view",
    });
    expect(insert.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        orgMemberId: "member-1",
        entityId: "entity-client",
        role: "viewer",
        permissions: { grants: "view", reports: "view" },
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "admin-1",
      action: "created",
      entityType: "entity_member",
      entityId: "entity-member-1",
      changes: {
        entityId: "entity-client",
        memberId: "member-1",
        role: "viewer",
        permissionKeys: ["grants", "reports"],
      },
    });
  });

  it("updates an existing active entity membership when assigning duplicate access", async () => {
    const returningFn = vi.fn().mockResolvedValue([
      {
        id: "entity-member-1",
        orgId: "org-1",
        orgMemberId: "member-1",
        entityId: "entity-client",
        role: "editor",
      },
    ]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set: setFn }),
      query: {
        entities: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity-client" }),
        },
        orgMembers: {
          findFirst: vi.fn().mockResolvedValue({ id: "member-1" }),
        },
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity-member-1",
            deletedAt: null,
          }),
        },
      },
      select: makeEntityAccessSelectMock([
        {
          id: "entity-member-1",
          orgMemberId: "member-1",
          entityId: "entity-client",
          entityName: "Client Project",
          kind: "agency_client",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "editor",
          permissions: { entityTeam: undefined, grants: "manage" },
        },
      ]).select,
    });

    const result = await assignEntityAccess(db as never, {
      orgId: "org-1",
      actorId: "admin-1",
      memberId: "member-1",
      entityId: "entity-client",
      role: "editor",
      permissions: { entityTeam: undefined, grants: "manage" },
    });

    expect(result.role).toBe("editor");
    expect(result.permissions.grants).toBe("manage");
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "editor",
        permissions: { grants: "manage" },
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("reactivates a soft-deleted entity membership when assigning access", async () => {
    const returningFn = vi.fn().mockResolvedValue([
      {
        id: "entity-member-1",
        orgId: "org-1",
        orgMemberId: "member-1",
        entityId: "entity-client",
        role: "viewer",
      },
    ]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set: setFn }),
      query: {
        entities: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity-client" }),
        },
        orgMembers: {
          findFirst: vi.fn().mockResolvedValue({ id: "member-1" }),
        },
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity-member-1",
            deletedAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
        },
      },
      select: makeEntityAccessSelectMock([
        {
          id: "entity-member-1",
          orgMemberId: "member-1",
          entityId: "entity-client",
          entityName: "Client Project",
          kind: "agency_client",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "viewer",
          permissions: null,
        },
      ]).select,
    });

    const result = await assignEntityAccess(db as never, {
      orgId: "org-1",
      actorId: "admin-1",
      memberId: "member-1",
      entityId: "entity-client",
      role: "viewer",
    });

    expect(result.role).toBe("viewer");
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "viewer",
        permissions: null,
        deletedAt: null,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("rejects entity access assignment when entity or member validation fails", async () => {
    const inactiveEntityDb = withTransaction({
      query: {
        entities: { findFirst: vi.fn().mockResolvedValue(undefined) },
        orgMembers: { findFirst: vi.fn() },
        entityMembers: { findFirst: vi.fn() },
      },
    });

    await expect(
      assignEntityAccess(inactiveEntityDb as never, {
        orgId: "org-1",
        actorId: "admin-1",
        memberId: "member-1",
        entityId: "entity-client",
        role: "viewer",
      }),
    ).rejects.toThrow("Entity must be active");

    const missingMemberDb = withTransaction({
      query: {
        entities: { findFirst: vi.fn().mockResolvedValue({ id: "entity-client" }) },
        orgMembers: { findFirst: vi.fn().mockResolvedValue(undefined) },
        entityMembers: { findFirst: vi.fn() },
      },
    });

    await expect(
      assignEntityAccess(missingMemberDb as never, {
        orgId: "org-1",
        actorId: "admin-1",
        memberId: "member-missing",
        entityId: "entity-client",
        role: "viewer",
      }),
    ).rejects.toThrow("Org member not found");
  });

  it("throws when entity access assignment writes no row", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
      query: {
        entities: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity-client" }),
        },
        orgMembers: {
          findFirst: vi.fn().mockResolvedValue({ id: "member-1" }),
        },
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    await expect(
      assignEntityAccess(db as never, {
        orgId: "org-1",
        actorId: "admin-1",
        memberId: "member-1",
        entityId: "entity-client",
        role: "viewer",
      }),
    ).rejects.toThrow("Failed to assign entity access");
  });

  it("updates entity access role and permission overrides", async () => {
    const returningFn = vi.fn().mockResolvedValue([
      {
        id: "entity-member-1",
        orgId: "org-1",
        orgMemberId: "member-1",
        entityId: "entity-client",
        role: "editor",
      },
    ]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set: setFn }),
      select: makeEntityAccessSelectMock([
        {
          id: "entity-member-1",
          orgMemberId: "member-1",
          entityId: "entity-client",
          entityName: "Client Project",
          kind: "agency_client",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "editor",
          permissions: { grants: "edit" },
        },
      ]).select,
      query: {
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity-member-1",
            role: "viewer",
          }),
          findMany: vi.fn().mockResolvedValue([
            { id: "entity-member-1", role: "viewer" },
            { id: "entity-member-2", role: "admin" },
          ]),
        },
      },
    });

    const result = await updateEntityAccess(db as never, {
      orgId: "org-1",
      actorId: "admin-1",
      memberId: "member-1",
      entityId: "entity-client",
      data: {
        role: "editor",
        permissions: { grants: "edit" },
      },
    });

    expect(result.role).toBe("editor");
    expect(result).not.toHaveProperty("orgMemberId");
    expect(result.permissions).toEqual({
      entitySettings: "view",
      entityTeam: "none",
      grants: "edit",
      funds: "edit",
      documents: "edit",
      compliance: "edit",
      accounting: "edit",
      reports: "edit",
    });
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "editor",
        permissions: { grants: "edit" },
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("refuses to update missing entity access", async () => {
    const db = withTransaction({
      query: {
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      update: vi.fn(),
    });

    await expect(
      updateEntityAccess(db as never, {
        orgId: "org-1",
        actorId: "admin-1",
        memberId: "member-1",
        entityId: "entity-client",
        data: { role: "viewer" },
      }),
    ).rejects.toThrow("Entity access not found");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("refuses to demote the final active entity admin", async () => {
    const db = withTransaction({
      update: vi.fn(),
      query: {
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity-member-1",
            role: "admin",
          }),
          findMany: vi.fn().mockResolvedValue([{ id: "entity-member-1", role: "admin" }]),
        },
      },
    });

    await expect(
      updateEntityAccess(db as never, {
        orgId: "org-1",
        actorId: "admin-1",
        memberId: "member-1",
        entityId: "entity-client",
        data: { role: "editor" },
      }),
    ).rejects.toThrow("At least one active entity admin is required");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("demotes an entity admin when another active admin remains", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "entity-member-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set: setFn }),
      query: {
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity-member-1",
            role: "admin",
          }),
          findMany: vi.fn().mockResolvedValue([
            { id: "entity-member-1", role: "admin" },
            { id: "entity-member-2", role: "admin" },
          ]),
        },
      },
      select: makeEntityAccessSelectMock([
        {
          id: "entity-member-1",
          orgMemberId: "member-1",
          entityId: "entity-client",
          entityName: "Client Project",
          kind: "agency_client",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "editor",
          permissions: null,
        },
      ]).select,
    });

    const result = await updateEntityAccess(db as never, {
      orgId: "org-1",
      actorId: "admin-1",
      memberId: "member-1",
      entityId: "entity-client",
      data: { role: "editor" },
    });

    expect(result.role).toBe("editor");
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "editor",
        permissions: undefined,
      }),
    );
  });

  it("throws when entity access update writes no row", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set: setFn }),
      query: {
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity-member-1",
            role: "viewer",
          }),
        },
      },
    });

    await expect(
      updateEntityAccess(db as never, {
        orgId: "org-1",
        actorId: "admin-1",
        memberId: "member-1",
        entityId: "entity-client",
        data: { role: "editor" },
      }),
    ).rejects.toThrow("Entity access not found");
  });

  it("revokes entity access and returns the pre-revoke summary", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "entity-member-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set: setFn }),
      query: {
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity-member-1",
            role: "viewer",
          }),
        },
      },
      select: makeEntityAccessSelectMock([
        {
          id: "entity-member-1",
          orgMemberId: "member-1",
          entityId: "entity-client",
          entityName: "Client Project",
          kind: "agency_client",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "viewer",
          permissions: null,
        },
      ]).select,
    });

    const result = await revokeEntityAccess(db as never, {
      orgId: "org-1",
      actorId: "admin-1",
      memberId: "member-1",
      entityId: "entity-client",
    });

    expect(result.id).toBe("entity-member-1");
    expect(result).not.toHaveProperty("orgMemberId");
    expect(setFn).toHaveBeenCalledWith({
      deletedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(recordActivityLog).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "admin-1",
      action: "revoked",
      entityType: "entity_member",
      entityId: "entity-member-1",
      changes: {
        entityId: "entity-client",
        memberId: "member-1",
      },
    });
  });

  it("refuses to revoke missing entity access", async () => {
    const db = withTransaction({
      query: {
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      update: vi.fn(),
    });

    await expect(
      revokeEntityAccess(db as never, {
        orgId: "org-1",
        actorId: "admin-1",
        memberId: "member-1",
        entityId: "entity-client",
      }),
    ).rejects.toThrow("Entity access not found");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("revokes an entity admin when another active admin remains", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "entity-member-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set: setFn }),
      query: {
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity-member-1",
            role: "admin",
          }),
          findMany: vi.fn().mockResolvedValue([
            { id: "entity-member-1", role: "admin" },
            { id: "entity-member-2", role: "admin" },
          ]),
        },
      },
      select: makeEntityAccessSelectMock([
        {
          id: "entity-member-1",
          orgMemberId: "member-1",
          entityId: "entity-client",
          entityName: "Client Project",
          kind: "agency_client",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "admin",
          permissions: null,
        },
      ]).select,
    });

    const result = await revokeEntityAccess(db as never, {
      orgId: "org-1",
      actorId: "admin-1",
      memberId: "member-1",
      entityId: "entity-client",
    });

    expect(result.role).toBe("admin");
    expect(setFn).toHaveBeenCalledWith({
      deletedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
  });

  it("throws when entity access revoke writes no row", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set: setFn }),
      query: {
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity-member-1",
            role: "viewer",
          }),
        },
      },
      select: makeEntityAccessSelectMock([
        {
          id: "entity-member-1",
          orgMemberId: "member-1",
          entityId: "entity-client",
          entityName: "Client Project",
          kind: "agency_client",
          status: "active",
          fiscalSponsorModel: "none",
          parentEntityId: null,
          role: "viewer",
          permissions: null,
        },
      ]).select,
    });

    await expect(
      revokeEntityAccess(db as never, {
        orgId: "org-1",
        actorId: "admin-1",
        memberId: "member-1",
        entityId: "entity-client",
      }),
    ).rejects.toThrow("Entity access not found");
  });

  it("refuses to revoke the final active entity admin", async () => {
    const db = withTransaction({
      update: vi.fn(),
      query: {
        entityMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity-member-1",
            role: "admin",
          }),
          findMany: vi.fn().mockResolvedValue([{ id: "entity-member-1", role: "admin" }]),
        },
      },
    });

    await expect(
      revokeEntityAccess(db as never, {
        orgId: "org-1",
        actorId: "admin-1",
        memberId: "member-1",
        entityId: "entity-client",
      }),
    ).rejects.toThrow("At least one active entity admin is required");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("refuses to archive an entity without a remaining admin path", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ defaultEntityId: "entity-default" }),
        },
        entities: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ id: "entity-client" }, { id: "entity-default" }])
            .mockResolvedValueOnce([]),
        },
        entityMembers: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      update: vi.fn(),
    };

    await expect(
      archiveEntity(db as never, {
        orgId: "org-1",
        actorId: "admin-1",
        entityId: "entity-client",
      }),
    ).rejects.toThrow("At least one active entity admin is required");
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Atomicity tests — transaction wrapping for all 9 mutating functions
// ---------------------------------------------------------------------------

describe("createCustomFieldDefinition atomicity", () => {
  it("wraps insert and log in a transaction", async () => {
    const insert = makeInsertMock([{ id: "field-1", name: "F" }]);
    const db = withTransaction({ insert: insert.insertFn });

    await createCustomFieldDefinition(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      name: "F",
      fieldType: "text",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "custom_field", action: "created" }),
    );
  });

  it("propagates audit log failure so the write is rolled back", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const insert = makeInsertMock([{ id: "field-1", name: "F" }]);
    const db = withTransaction({ insert: insert.insertFn });

    await expect(
      createCustomFieldDefinition(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityType: "grant",
        name: "F",
        fieldType: "text",
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateCustomFieldDefinition atomicity", () => {
  it("wraps update and log in a transaction", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "field-1", name: "F2" }]);
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: returningFn }),
        }),
      }),
    });

    await updateCustomFieldDefinition(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      definitionId: "field-1",
      data: { name: "F2" },
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "custom_field", action: "updated" }),
    );
  });

  it("propagates audit log failure so the write is rolled back", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const returningFn = vi.fn().mockResolvedValue([{ id: "field-1", name: "F2" }]);
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: returningFn }),
        }),
      }),
    });

    await expect(
      updateCustomFieldDefinition(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        definitionId: "field-1",
        data: { name: "F2" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("softDeleteCustomFieldDefinition atomicity", () => {
  it("wraps update and log in a transaction", async () => {
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({ id: "field-1" }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    });

    await softDeleteCustomFieldDefinition(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      definitionId: "field-1",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "custom_field", action: "deleted" }),
    );
  });

  it("propagates audit log failure so the write is rolled back", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({ id: "field-1" }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    });

    await expect(
      softDeleteCustomFieldDefinition(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        definitionId: "field-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("upsertCustomFieldValue atomicity", () => {
  it("wraps insert and log in a transaction", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "val-1", value: "x" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            fieldType: "text",
            options: null,
          }),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ onConflictDoUpdate }),
      }),
    });

    await upsertCustomFieldValue(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      entityType: "grant",
      fieldId: "field-1",
      entityId: "grant-1",
      value: "x",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "custom_field_value", action: "upserted" }),
    );
  });

  it("propagates audit log failure so the write is rolled back", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const returningFn = vi.fn().mockResolvedValue([{ id: "val-1", value: "x" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningFn });
    const db = withTransaction({
      query: {
        customFieldDefinitions: {
          findFirst: vi.fn().mockResolvedValue({
            id: "field-1",
            fieldType: "text",
            options: null,
          }),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ onConflictDoUpdate }),
      }),
    });

    await expect(
      upsertCustomFieldValue(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        entityType: "grant",
        fieldId: "field-1",
        entityId: "grant-1",
        value: "x",
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateOrgProfile atomicity", () => {
  it("wraps update and log in a transaction", async () => {
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "org-1", name: "X" }]),
          }),
        }),
      }),
    });

    await updateOrgProfile(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      data: { name: "X", fiscalYearStartMonth: 1, timezone: "UTC" },
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "organization", action: "updated" }),
    );
  });

  it("propagates audit log failure so the write is rolled back", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "org-1", name: "X" }]),
          }),
        }),
      }),
    });

    await expect(
      updateOrgProfile(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: { name: "X", fiscalYearStartMonth: 1, timezone: "UTC" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("createInviteLink atomicity", () => {
  it("wraps insert and log in a transaction", async () => {
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "invite-1", token: "tok" }]),
        }),
      }),
    });

    await createInviteLink(db as never, {
      orgId: "org-1",
      userId: "user-1",
      role: "editor",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "invite_link", action: "created" }),
    );
  });

  it("propagates audit log failure so the write is rolled back", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "invite-1", token: "tok" }]),
        }),
      }),
    });

    await expect(
      createInviteLink(db as never, {
        orgId: "org-1",
        userId: "user-1",
        role: "editor",
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateOrgMember atomicity", () => {
  it("wraps update and log in a transaction", async () => {
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "member-1", role: "editor" }]),
          }),
        }),
      }),
    });

    await updateOrgMember(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      memberId: "member-1",
      data: { role: "editor" },
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "org_member", action: "updated" }),
    );
  });

  it("propagates audit log failure so the write is rolled back", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "member-1", role: "editor" }]),
          }),
        }),
      }),
    });

    await expect(
      updateOrgMember(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        memberId: "member-1",
        data: { role: "editor" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("saveBillingSelection atomicity", () => {
  it("wraps update and log in a transaction", async () => {
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ id: "org-1", planTier: "growth", billingCycle: "annual" }]),
          }),
        }),
      }),
    });

    await saveBillingSelection(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      data: { planTier: "growth", billingCycle: "annual" },
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "organization", action: "updated" }),
    );
  });

  it("propagates audit log failure so the write is rolled back", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ id: "org-1", planTier: "growth", billingCycle: "annual" }]),
          }),
        }),
      }),
    });

    await expect(
      saveBillingSelection(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: { planTier: "growth", billingCycle: "annual" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("uses tx.execute in the fallback path inside the transaction", async () => {
    const updatedAt = new Date("2026-04-22T12:00:00.000Z");
    const fallbackRow = {
      id: "org-1",
      name: "Acme",
      slug: "acme",
      ein: null,
      fiscalYearStartMonth: 1,
      timezone: "UTC",
      logoUrl: null,
      address: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      planTier: "growth",
      billingCycle: "annual",
      subscriptionStatus: "trialing",
      trialStartedAt: null,
      trialEndsAt: null,
      trialWillEndNotifiedAt: null,
      promoCodeApplied: null,
      planSelectedAt: updatedAt,
      onboardingCompleted: false,
      accountingEnabled: false,
      createdAt: updatedAt,
      updatedAt,
      deletedAt: null,
    };
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(
              Object.assign(new Error('column "plan_selected_at" does not exist'), {
                code: "42703",
              }),
            ),
          }),
        }),
      }),
      execute: vi.fn().mockResolvedValue({ rows: [fallbackRow] }),
    });

    const result = await saveBillingSelection(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      data: { planTier: "growth", billingCycle: "annual" },
    });

    expect(result).toMatchObject({ id: "org-1", planTier: "growth" });
    expect(db.transaction).toHaveBeenCalledOnce();
  });
});

describe("updateOrgSettings atomicity", () => {
  it("wraps update and log in a transaction", async () => {
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });

    await updateOrgSettings(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      accountingEnabled: true,
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "organization", action: "updated" }),
    );
  });

  it("propagates audit log failure so the write is rolled back", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const db = withTransaction({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });

    await expect(
      updateOrgSettings(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        accountingEnabled: false,
      }),
    ).rejects.toThrow("audit log down");
  });
});

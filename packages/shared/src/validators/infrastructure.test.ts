import { describe, expect, it } from "vitest";
import {
  createCustomFieldDefinitionSchema,
  createDocumentSchema,
  documentListSchema,
  importCommitSchema,
  importPreviewSchema,
  importHistoryListSchema,
  importMigrationPlanQuerySchema,
  notificationListSchema,
  notificationPreferenceSchema,
  orgActivityListSchema,
  upsertCustomFieldValueSchema,
  updateCustomFieldDefinitionSchema,
} from "./infrastructure";

describe("orgActivityListSchema", () => {
  it("accepts an empty query (dates optional)", () => {
    expect(orgActivityListSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a valid fromDate/toDate range", () => {
    expect(
      orgActivityListSchema.safeParse({
        fromDate: "2026-01-01T00:00:00.000Z",
        toDate: "2026-12-31T23:59:59.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects an inverted range (fromDate after toDate)", () => {
    expect(
      orgActivityListSchema.safeParse({
        fromDate: "2026-12-31T23:59:59.000Z",
        toDate: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("accepts an equal fromDate/toDate range", () => {
    expect(
      orgActivityListSchema.safeParse({
        fromDate: "2026-06-01T00:00:00.000Z",
        toDate: "2026-06-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});

describe("createDocumentSchema", () => {
  it("accepts document upload metadata", () => {
    expect(
      createDocumentSchema.safeParse({
        entityType: "contact",
        entityId: "contact-1",
        filename: "appeal.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
      }).success,
    ).toBe(true);
  });

  it("rejects unsupported entity types", () => {
    expect(
      createDocumentSchema.safeParse({
        entityType: "user",
        entityId: "user-1",
        filename: "appeal.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
      }).success,
    ).toBe(false);
  });

  it("rejects mime types outside the allowlist", () => {
    expect(
      createDocumentSchema.safeParse({
        entityType: "contact",
        entityId: "contact-1",
        filename: "payload.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 2048,
      }).success,
    ).toBe(false);
  });

  it("rejects sizes over the 25 MiB cap", () => {
    expect(
      createDocumentSchema.safeParse({
        entityType: "contact",
        entityId: "contact-1",
        filename: "big.pdf",
        mimeType: "application/pdf",
        sizeBytes: 25 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
  });
});

describe("documentListSchema", () => {
  it("applies pagination defaults", () => {
    const result = documentListSchema.safeParse({ entityType: "grant", entityId: "grant-1" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
      expect(result.data.sortBy).toBe("createdAt");
      expect(result.data.sortOrder).toBe("desc");
    }
  });
});

describe("custom field schemas", () => {
  it("accepts a valid definition with options", () => {
    expect(
      createCustomFieldDefinitionSchema.safeParse({
        entityType: "grant",
        name: "Program Area",
        fieldType: "single_select",
        options: ["STEM", "Arts"],
        sortOrder: 2,
      }).success,
    ).toBe(true);
  });

  it("rejects select definitions without options", () => {
    expect(
      createCustomFieldDefinitionSchema.safeParse({
        entityType: "grant",
        name: "Program Area",
        fieldType: "single_select",
      }).success,
    ).toBe(false);
  });

  it("rejects options for non-select definitions", () => {
    expect(
      createCustomFieldDefinitionSchema.safeParse({
        entityType: "contact",
        name: "Stewardship Notes",
        fieldType: "text",
        options: ["unexpected"],
      }).success,
    ).toBe(false);
  });

  it("accepts nullable updates", () => {
    expect(
      updateCustomFieldDefinitionSchema.safeParse({
        name: "Updated Label",
        options: null,
      }).success,
    ).toBe(true);
  });

  it("accepts a value write", () => {
    expect(
      upsertCustomFieldValueSchema.safeParse({
        value: ["alpha", "beta"],
      }).success,
    ).toBe(true);
  });
});

describe("notification schemas", () => {
  it("accepts inbox filters", () => {
    expect(
      notificationListSchema.safeParse({
        read: "false",
        type: "grant_deadline",
        page: "2",
      }).success,
    ).toBe(true);
  });

  it("accepts preference upserts", () => {
    expect(
      notificationPreferenceSchema.safeParse({
        notificationType: "report_due",
        emailEnabled: true,
        inAppEnabled: false,
      }).success,
    ).toBe(true);
  });

  it("accepts trial lifecycle email preference upserts", () => {
    expect(
      notificationPreferenceSchema.safeParse({
        notificationType: "trial_lifecycle",
        emailEnabled: false,
        inAppEnabled: true,
      }).success,
    ).toBe(true);
  });
});

describe("import schemas", () => {
  it("accepts preview input", () => {
    expect(
      importPreviewSchema.safeParse({
        entityType: "contacts",
        filename: "contacts.csv",
        csvText: "email,first_name\njane@example.com,Jane",
      }).success,
    ).toBe(true);
  });

  it("accepts commit input", () => {
    expect(
      importCommitSchema.safeParse({
        entityType: "donations",
        filename: "donations.csv",
        mapping: {
          amountCents: "amount",
          date: "date",
          contactEmail: "email",
        },
        rows: [
          {
            amount: "10000",
            date: "2026-04-01T00:00:00.000Z",
            email: "jane@example.com",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("requires rows for commit", () => {
    expect(
      importCommitSchema.safeParse({
        entityType: "grants",
        filename: "grants.csv",
        mapping: {
          name: "name",
          funderName: "funder",
        },
        rows: [],
      }).success,
    ).toBe(false);
  });

  it("accepts rows up to the cap (10000)", () => {
    expect(
      importCommitSchema.safeParse({
        entityType: "donations",
        filename: "donations.csv",
        mapping: { amount: "amount" },
        rows: Array.from({ length: 10000 }, () => ({ amount: "100" })),
      }).success,
    ).toBe(true);
  });

  it("rejects rows over the cap (10001)", () => {
    expect(
      importCommitSchema.safeParse({
        entityType: "donations",
        filename: "donations.csv",
        mapping: { amount: "amount" },
        rows: Array.from({ length: 10001 }, () => ({ amount: "100" })),
      }).success,
    ).toBe(false);
  });

  it("accepts import history filters", () => {
    expect(
      importHistoryListSchema.safeParse({
        entityType: "contacts",
        status: "completed",
        pageSize: "10",
      }).success,
    ).toBe(true);
  });

  it("accepts migration plan sources and defaults to generic", () => {
    const defaultResult = importMigrationPlanQuerySchema.safeParse({});
    const quickBooksResult = importMigrationPlanQuerySchema.safeParse({
      source: "quickbooks",
    });

    expect(defaultResult.success).toBe(true);
    if (defaultResult.success) {
      expect(defaultResult.data.source).toBe("generic");
    }
    expect(quickBooksResult.success).toBe(true);
  });

  it("rejects unknown migration plan sources", () => {
    expect(
      importMigrationPlanQuerySchema.safeParse({
        source: "unknown",
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  DOCUMENT_EXTRACTION_STATUSES,
  documentExtractionCommitSchema,
  documentExtractionFieldSchema,
  documentExtractionProviderResponseSchema,
  documentExtractionReviewActionSchema,
  documentExtractionSourceSchema,
  documentExtractionStartSchema,
} from "./document-extractions";

it("treats staged provider results as a shared extraction status", () => {
  expect(DOCUMENT_EXTRACTION_STATUSES).toContain("provider_result_pending");
});

const source = {
  pageNumber: 2,
  snippet: "Award amount shall not exceed $250,000.",
};

const field = {
  fieldKey: "grant.amountCents",
  section: "grant_basics",
  destinationEntityType: "grant",
  destinationField: "amountCents",
  value: "$250,000",
  normalizedValue: 25000000,
  confidence: 0.91,
  required: true,
  sources: [source],
};

describe("documentExtractionSourceSchema", () => {
  it("accepts a page-backed source snippet", () => {
    expect(documentExtractionSourceSchema.parse(source)).toEqual(source);
  });

  it("rejects empty snippets", () => {
    expect(() => documentExtractionSourceSchema.parse({ pageNumber: 1, snippet: "" })).toThrow();
  });
});

describe("documentExtractionFieldSchema", () => {
  it("requires confidence bounds and at least one source", () => {
    expect(documentExtractionFieldSchema.parse(field)).toMatchObject({
      fieldKey: "grant.amountCents",
      confidence: 0.91,
    });

    expect(() => documentExtractionFieldSchema.parse({ ...field, confidence: 1.2 })).toThrow();
    expect(() => documentExtractionFieldSchema.parse({ ...field, sources: [] })).toThrow();
  });

  it("accepts award budget line extraction fields", () => {
    expect(
      documentExtractionFieldSchema.parse({
        ...field,
        fieldKey: "budget.personnel",
        section: "budget",
        destinationEntityType: "budget_line",
        destinationField: "approvedAmountCents",
        value: { category: "Personnel", approvedAmountCents: 125000 },
        normalizedValue: { category: "Personnel", approvedAmountCents: 125000 },
      }),
    ).toMatchObject({ destinationEntityType: "budget_line" });
  });
});

describe("documentExtractionProviderResponseSchema", () => {
  it("accepts a normalized provider extraction", () => {
    const parsed = documentExtractionProviderResponseSchema.parse({
      documentType: "award_letter",
      fields: [field],
      duplicateCandidates: {
        funders: [{ id: "funder-1", name: "Acme Foundation", confidence: 0.8 }],
        grants: [{ id: "grant-1", name: "Youth STEM", confidence: 0.74 }],
      },
    });

    expect(parsed.fields).toHaveLength(1);
  });
});

describe("document extraction request schemas", () => {
  it("accepts a start request for an award-intake document", () => {
    const attemptId = "28e0825f-7e61-4bda-b663-a3b5fa2f147b";
    expect(
      documentExtractionStartSchema.parse({
        documentId: "doc-1",
        attemptId,
      }),
    ).toEqual({ documentId: "doc-1", attemptId });
    expect(() =>
      documentExtractionStartSchema.parse({ documentId: "doc-1", attemptId: "not-a-uuid" }),
    ).toThrow();
    expect(() => documentExtractionStartSchema.parse({ documentId: "doc-1" })).toThrow();
  });

  it("requires valid review actions", () => {
    expect(
      documentExtractionReviewActionSchema.parse({
        fieldId: "field-1",
        action: "edit",
        nextValue: "25000000",
        note: "Normalized to cents.",
      }),
    ).toMatchObject({ action: "edit" });

    expect(() =>
      documentExtractionReviewActionSchema.parse({
        fieldId: "field-1",
        action: "map_existing",
      }),
    ).toThrow();

    expect(
      documentExtractionReviewActionSchema.parse({
        fieldId: "field-1",
        action: "map_existing",
        mappedEntityType: "grant",
        mappedEntityId: "grant-1",
      }),
    ).toMatchObject({ action: "map_existing", mappedEntityId: "grant-1" });

    expect(() =>
      documentExtractionReviewActionSchema.parse({
        fieldId: "field-1",
        action: "edit",
      }),
    ).toThrow();

    expect(() =>
      documentExtractionReviewActionSchema.parse({
        fieldId: "field-1",
        action: "map_existing",
        mappedEntityType: "grant",
      }),
    ).toThrow();

    expect(() =>
      documentExtractionReviewActionSchema.parse({
        fieldId: "field-1",
        action: "map_existing",
        mappedEntityId: "grant-1",
      }),
    ).toThrow();
  });

  it("requires explicit funder and grant duplicate decisions before commit", () => {
    expect(
      documentExtractionCommitSchema.parse({
        funderDecision: { action: "map_existing", existingId: "funder-1" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Youth STEM Award",
          amountCents: 25000000,
        },
      }),
    ).toMatchObject({
      funderDecision: { action: "map_existing" },
      grantDecision: { action: "create_new" },
    });

    expect(() =>
      documentExtractionCommitSchema.parse({
        funderDecision: { action: "map_existing" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: { name: "" },
      }),
    ).toThrow();
  });

  it("rejects a commit whose grant end date precedes its start date", () => {
    const result = documentExtractionCommitSchema.safeParse({
      funderDecision: { action: "create_new" },
      grantDecision: { action: "create_new" },
      requiredGrantBasics: {
        name: "Backwards Award",
        startDate: "2026-12-31T00:00:00.000Z",
        endDate: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("endDate"))).toBe(true);
    }
  });

  it("accepts a commit whose grant start and end dates are equal", () => {
    expect(
      documentExtractionCommitSchema.parse({
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Single Day Award",
          startDate: "2026-06-01T00:00:00.000Z",
          endDate: "2026-06-01T00:00:00.000Z",
        },
      }),
    ).toMatchObject({ requiredGrantBasics: { name: "Single Day Award" } });
  });

  it("accepts a commit with only one of the two grant dates supplied", () => {
    expect(
      documentExtractionCommitSchema.parse({
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Open Ended Award",
          startDate: "2026-06-01T00:00:00.000Z",
        },
      }),
    ).toMatchObject({ requiredGrantBasics: { name: "Open Ended Award" } });
  });
});

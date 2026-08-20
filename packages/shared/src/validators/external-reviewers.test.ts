import { describe, expect, it } from "vitest";
import { PORTAL_SESSION_DEFAULT_TTL_MS, PORTAL_SESSION_MAX_TTL_MS } from "../constants";
import {
  addBundleItemSchema,
  addScopeSchema,
  addScopesSchema,
  createBundleSchema,
  createReviewerSchema,
  createSessionSchema,
  extendSessionSchema,
  listAuditEventsSchema,
  listBundlesSchema,
  listReviewersSchema,
  listSessionsSchema,
  portalAuthSchema,
  quickShareSchema,
  reorderBundleItemsSchema,
  removeScopeSchema,
  updateBundleSchema,
  updateReviewerSchema,
} from "./external-reviewers";

// ---------------------------------------------------------------------------
// createReviewerSchema
// ---------------------------------------------------------------------------
describe("createReviewerSchema", () => {
  const valid = {
    email: "auditor@firm.com",
    name: "Alice Audit",
    reviewerType: "auditor" as const,
  };

  it("accepts a minimal valid input", () => {
    expect(createReviewerSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional fields", () => {
    expect(
      createReviewerSchema.safeParse({
        ...valid,
        organizationName: "Big Four LLP",
        notes: "Annual audit",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(createReviewerSchema.safeParse({ ...valid, email: "notanemail" }).success).toBe(false);
  });

  it("rejects unknown reviewerType", () => {
    expect(createReviewerSchema.safeParse({ ...valid, reviewerType: "investor" }).success).toBe(
      false,
    );
  });

  it("rejects empty name", () => {
    expect(createReviewerSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateReviewerSchema
// ---------------------------------------------------------------------------
describe("updateReviewerSchema", () => {
  it("accepts partial input", () => {
    expect(updateReviewerSchema.safeParse({ name: "Bob" }).success).toBe(true);
  });

  it("rejects invalid email if provided", () => {
    expect(updateReviewerSchema.safeParse({ email: "bad" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listReviewersSchema
// ---------------------------------------------------------------------------
describe("listReviewersSchema", () => {
  it("uses defaults", () => {
    const result = listReviewersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts reviewerType filter", () => {
    expect(listReviewersSchema.safeParse({ reviewerType: "funder" }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createSessionSchema
// ---------------------------------------------------------------------------
describe("createSessionSchema", () => {
  const valid = {
    reviewerId: "rev-123",
    purpose: "FY25 audit",
  };

  it("accepts minimal input with defaults", () => {
    const result = createSessionSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttlMs).toBe(PORTAL_SESSION_DEFAULT_TTL_MS);
      expect(result.data.scopes).toEqual([]);
    }
  });

  it("accepts explicit ttlMs within limit", () => {
    expect(
      createSessionSchema.safeParse({ ...valid, ttlMs: 7 * 24 * 60 * 60 * 1000 }).success,
    ).toBe(true);
  });

  it("rejects ttlMs beyond max", () => {
    expect(
      createSessionSchema.safeParse({ ...valid, ttlMs: PORTAL_SESSION_MAX_TTL_MS + 1 }).success,
    ).toBe(false);
  });

  it("accepts scopes array", () => {
    expect(
      createSessionSchema.safeParse({
        ...valid,
        scopes: [{ scopeType: "grant", scopeId: "g-1" }],
      }).success,
    ).toBe(true);
  });

  it("rejects scopes with unknown scopeType", () => {
    expect(
      createSessionSchema.safeParse({
        ...valid,
        scopes: [{ scopeType: "invoice", scopeId: "i-1" }],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 100 scopes", () => {
    const scopes = Array.from({ length: 101 }, (_, i) => ({
      scopeType: "grant" as const,
      scopeId: `g-${i}`,
    }));
    expect(createSessionSchema.safeParse({ ...valid, scopes }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extendSessionSchema
// ---------------------------------------------------------------------------
describe("extendSessionSchema", () => {
  it("accepts valid extensionMs", () => {
    expect(extendSessionSchema.safeParse({ extensionMs: 86400000 }).success).toBe(true);
  });

  it("rejects zero", () => {
    expect(extendSessionSchema.safeParse({ extensionMs: 0 }).success).toBe(false);
  });

  it("rejects beyond max", () => {
    expect(
      extendSessionSchema.safeParse({ extensionMs: PORTAL_SESSION_MAX_TTL_MS + 1 }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addScopeSchema / addScopesSchema / removeScopeSchema
// ---------------------------------------------------------------------------
describe("addScopeSchema", () => {
  it("accepts valid scope", () => {
    expect(addScopeSchema.safeParse({ scopeType: "fund", scopeId: "f-1" }).success).toBe(true);
  });

  it("rejects empty scopeId", () => {
    expect(addScopeSchema.safeParse({ scopeType: "fund", scopeId: "" }).success).toBe(false);
  });
});

describe("addScopesSchema", () => {
  it("rejects empty array", () => {
    expect(addScopesSchema.safeParse({ scopes: [] }).success).toBe(false);
  });

  it("accepts one scope", () => {
    expect(
      addScopesSchema.safeParse({ scopes: [{ scopeType: "document", scopeId: "d-1" }] }).success,
    ).toBe(true);
  });
});

describe("removeScopeSchema", () => {
  it("accepts valid scope", () => {
    expect(removeScopeSchema.safeParse({ scopeType: "grant", scopeId: "g-1" }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createBundleSchema / updateBundleSchema
// ---------------------------------------------------------------------------
describe("createBundleSchema", () => {
  const valid = { title: "FY25 Audit Pack", purpose: "audit" as const };

  it("accepts minimal input", () => {
    expect(createBundleSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts with optional fields", () => {
    expect(
      createBundleSchema.safeParse({
        ...valid,
        description: "Full fiscal year package",
        periodStart: "2024-01-01T00:00:00.000Z",
        periodEnd: "2024-12-31T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown purpose", () => {
    expect(createBundleSchema.safeParse({ ...valid, purpose: "marketing" }).success).toBe(false);
  });

  it("rejects invalid ISO datetime", () => {
    expect(createBundleSchema.safeParse({ ...valid, periodStart: "not-a-date" }).success).toBe(
      false,
    );
  });

  it("rejects a bundle whose period end precedes its period start", () => {
    const result = createBundleSchema.safeParse({
      ...valid,
      periodStart: "2024-12-31T00:00:00.000Z",
      periodEnd: "2024-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("periodEnd"))).toBe(true);
    }
  });

  it("accepts a bundle whose period start and end are equal", () => {
    expect(
      createBundleSchema.safeParse({
        ...valid,
        periodStart: "2024-06-01T00:00:00.000Z",
        periodEnd: "2024-06-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("accepts a bundle with only one of the two period dates supplied", () => {
    expect(
      createBundleSchema.safeParse({ ...valid, periodStart: "2024-06-01T00:00:00.000Z" }).success,
    ).toBe(true);
    expect(
      createBundleSchema.safeParse({ ...valid, periodEnd: "2024-06-01T00:00:00.000Z" }).success,
    ).toBe(true);
  });
});

describe("updateBundleSchema", () => {
  it("accepts partial update", () => {
    expect(updateBundleSchema.safeParse({ title: "Updated Pack" }).success).toBe(true);
  });

  it("rejects a partial update whose period end precedes its period start", () => {
    const result = updateBundleSchema.safeParse({
      periodStart: "2024-12-31T00:00:00.000Z",
      periodEnd: "2024-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("periodEnd"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// listBundlesSchema
// ---------------------------------------------------------------------------
describe("listBundlesSchema", () => {
  it("defaults includeDeleted to false", () => {
    const result = listBundlesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.includeDeleted).toBe(false);
  });

  it("accepts includeDeleted as a query string boolean", () => {
    const result = listBundlesSchema.safeParse({ includeDeleted: "true" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.includeDeleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// listSessionsSchema
// ---------------------------------------------------------------------------
describe("listSessionsSchema", () => {
  it("accepts include flags as query string booleans", () => {
    const result = listSessionsSchema.safeParse({
      includeExpired: "true",
      includeRevoked: "false",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeExpired).toBe(true);
      expect(result.data.includeRevoked).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// addBundleItemSchema / reorderBundleItemsSchema
// ---------------------------------------------------------------------------
describe("addBundleItemSchema", () => {
  it("accepts valid item", () => {
    expect(addBundleItemSchema.safeParse({ itemType: "document", itemId: "d-1" }).success).toBe(
      true,
    );
  });

  it("defaults sortOrder to 0", () => {
    const result = addBundleItemSchema.safeParse({ itemType: "grant", itemId: "g-1" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sortOrder).toBe(0);
  });
});

describe("reorderBundleItemsSchema", () => {
  it("rejects empty array", () => {
    expect(reorderBundleItemsSchema.safeParse({ itemIds: [] }).success).toBe(false);
  });

  it("accepts array of ids", () => {
    expect(reorderBundleItemsSchema.safeParse({ itemIds: ["a", "b", "c"] }).success).toBe(true);
  });

  it("accepts itemIds up to the cap (1000)", () => {
    expect(
      reorderBundleItemsSchema.safeParse({
        itemIds: Array.from({ length: 1000 }, (_, i) => `item-${i}`),
      }).success,
    ).toBe(true);
  });

  it("rejects itemIds over the cap (1001)", () => {
    expect(
      reorderBundleItemsSchema.safeParse({
        itemIds: Array.from({ length: 1001 }, (_, i) => `item-${i}`),
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listAuditEventsSchema
// ---------------------------------------------------------------------------
describe("listAuditEventsSchema", () => {
  it("accepts empty input", () => {
    expect(listAuditEventsSchema.safeParse({}).success).toBe(true);
  });

  it("accepts all filters", () => {
    expect(
      listAuditEventsSchema.safeParse({
        sessionId: "s-1",
        reviewerId: "r-1",
        eventType: "view",
        fromDate: "2024-01-01T00:00:00.000Z",
        toDate: "2024-12-31T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects an inverted date range (fromDate after toDate)", () => {
    expect(
      listAuditEventsSchema.safeParse({
        fromDate: "2024-12-31T00:00:00.000Z",
        toDate: "2024-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("accepts an equal fromDate/toDate range", () => {
    expect(
      listAuditEventsSchema.safeParse({
        fromDate: "2024-06-01T00:00:00.000Z",
        toDate: "2024-06-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// portalAuthSchema
// ---------------------------------------------------------------------------
describe("portalAuthSchema", () => {
  it("accepts valid token", () => {
    expect(portalAuthSchema.safeParse({ token: "abc.def.123.hex" }).success).toBe(true);
  });

  it("rejects empty token", () => {
    expect(portalAuthSchema.safeParse({ token: "  " }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// quickShareSchema
// ---------------------------------------------------------------------------
describe("quickShareSchema", () => {
  const valid = {
    reviewerId: "r-1",
    purpose: "Grant closeout review",
    scopeType: "grant" as const,
    scopeId: "g-1",
  };

  it("accepts minimal input", () => {
    const result = quickShareSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ttlMs).toBe(PORTAL_SESSION_DEFAULT_TTL_MS);
  });

  it("accepts optional bundleId", () => {
    expect(quickShareSchema.safeParse({ ...valid, bundleId: "b-1" }).success).toBe(true);
  });

  it("rejects unknown scopeType", () => {
    expect(quickShareSchema.safeParse({ ...valid, scopeType: "invoice" }).success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    expect(quickShareSchema.safeParse({ ...valid, extraField: "x" }).success).toBe(false);
  });
});

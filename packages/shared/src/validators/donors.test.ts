// packages/shared/src/validators/donors.test.ts
import { describe, it, expect } from "vitest";
import {
  createContactSchema,
  updateContactSchema,
  updatePipelineStageSchema,
  contactListSchema,
  createDonationSchema,
  updateDonationSchema,
  createTagSchema,
  updateTagSchema,
  addTagsSchema,
  createCommunicationSchema,
  donorMailMergeSendSchema,
  createSegmentSchema,
  updateSegmentSchema,
  contactExportSchema,
} from "./donors";

// ---------------------------------------------------------------------------
// createContactSchema
// ---------------------------------------------------------------------------

describe("createContactSchema", () => {
  it("accepts a valid individual contact", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid organization contact", () => {
    const result = createContactSchema.safeParse({
      type: "organization",
      organizationName: "Acme Corp",
    });
    expect(result.success).toBe(true);
  });

  it("requires firstName when type is individual", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("returns a friendly message when an individual first name is blank", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "   ",
      email: "   ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "First name is required.",
      );
      expect(result.error.issues.map((issue) => issue.message)).not.toContain(
        "Invalid email address",
      );
    }
  });

  it("requires organizationName when type is organization", () => {
    const result = createContactSchema.safeParse({
      type: "organization",
      firstName: "Jane",
    });
    expect(result.success).toBe(false);
  });

  it("returns a friendly message when an organization name is blank", () => {
    const result = createContactSchema.safeParse({
      type: "organization",
      organizationName: "   ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Organization name is required.");
    }
  });

  it("rejects invalid type", () => {
    const result = createContactSchema.safeParse({
      type: "unknown",
      firstName: "Jane",
    });
    expect(result.success).toBe(false);
  });

  it("defaults pipelineStage to prospect", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pipelineStage).toBe("prospect");
    }
  });

  it("rejects invalid pipelineStage", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      pipelineStage: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("validates email format", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Enter a valid email address.");
    }
  });

  it("accepts blank optional contact fields by normalizing them away", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      lastName: "   ",
      email: "   ",
      phone: "   ",
      address: "   ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastName).toBeUndefined();
      expect(result.data.email).toBeUndefined();
      expect(result.data.phone).toBeUndefined();
      expect(result.data.address).toBeUndefined();
    }
  });

  it("accepts null optional contact fields by normalizing them away", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      phone: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeUndefined();
    }
  });

  it("accepts all optional fields", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      lastName: "Doe",
      organizationName: "Acme",
      email: "jane@example.com",
      phone: "555-1234",
      address: "123 Main St",
      pipelineStage: "cultivation",
      isVolunteer: true,
      affiliatedOrgId: "11111111-1111-4111-8111-111111111111",
      notes: "Met at conference",
    });
    expect(result.success).toBe(true);
  });

  it("defaults isVolunteer to false", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isVolunteer).toBe(false);
    }
  });

  it("defaults emailOptOut to false", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emailOptOut).toBe(false);
    }
  });

  it("rejects invalid affiliatedOrgId format", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      affiliatedOrgId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("passes through non-string non-null optional field values for downstream Zod validation", () => {
    // Exercises the `typeof value !== "string"` branch of normalizeOptionalString
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      phone: 12345,
    });
    // A number passes the preprocess (returned as-is) then fails the z.string().max() check
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateContactSchema
// ---------------------------------------------------------------------------

describe("updateContactSchema", () => {
  it("accepts partial update with just firstName", () => {
    const result = updateContactSchema.safeParse({ firstName: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateContactSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = updateContactSchema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid affiliatedOrgId format", () => {
    const result = updateContactSchema.safeParse({ affiliatedOrgId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("accepts null email to allow clearing the email field", () => {
    const result = updateContactSchema.safeParse({ email: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it("coerces empty string email to null", () => {
    const result = updateContactSchema.safeParse({ email: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      // empty string should be coerced to null (clearing the field)
      expect(result.data.email == null).toBe(true);
    }
  });

  it("trims email values before validating updates", () => {
    const result = updateContactSchema.safeParse({ email: " jane@example.com " });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("jane@example.com");
    }
  });

  it("rejects non-string email values in updates", () => {
    const result = updateContactSchema.safeParse({ email: 12345 });

    expect(result.success).toBe(false);
  });

  it("accepts isVolunteer updates", () => {
    const result = updateContactSchema.safeParse({ isVolunteer: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isVolunteer).toBe(true);
    }
  });

  it("accepts emailOptOut updates", () => {
    const result = updateContactSchema.safeParse({ emailOptOut: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emailOptOut).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// updatePipelineStageSchema
// ---------------------------------------------------------------------------

describe("updatePipelineStageSchema", () => {
  it("accepts valid stage", () => {
    const result = updatePipelineStageSchema.safeParse({ stage: "stewardship" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid stage", () => {
    const result = updatePipelineStageSchema.safeParse({ stage: "invalid" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// contactListSchema
// ---------------------------------------------------------------------------

describe("contactListSchema", () => {
  it("accepts empty query (all defaults)", () => {
    const result = contactListSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.sortBy).toBe("name");
      expect(result.data.sortOrder).toBe("asc");
    }
  });

  it("accepts all filter params", () => {
    const result = contactListSchema.safeParse({
      page: "2",
      pageSize: "10",
      search: "jane",
      pipelineStage: "prospect",
      tagId: "11111111-1111-4111-8111-111111111111",
      type: "individual",
      sortBy: "totalGiving",
      sortOrder: "desc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid sortBy", () => {
    const result = contactListSchema.safeParse({ sortBy: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type filter", () => {
    const result = contactListSchema.safeParse({ type: "robot" });
    expect(result.success).toBe(false);
  });

  it("ignores unknown extra fields (lybunt was removed from schema)", () => {
    // lybunt was removed from contactListSchema — unknown extra fields are stripped by Zod
    const result = contactListSchema.safeParse({ lybunt: "true" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createDonationSchema
// ---------------------------------------------------------------------------

describe("createDonationSchema", () => {
  it("accepts an ISO datetime string for date", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a YYYY-MM-DD date-only string", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15",
      type: "one_time",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a partial date like YYYY-MM", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01",
      type: "one_time",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a date with wrong separator", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026/01/15",
      type: "one_time",
    });
    expect(result.success).toBe(false);
  });

  it("defaults restriction to unrestricted", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.restriction).toBe("unrestricted");
    }
  });

  it("rejects zero amountCents", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 0,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amountCents", () => {
    const result = createDonationSchema.safeParse({
      amountCents: -100,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid donation type", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "grant",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all optional fields", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 10000,
      currency: "USD",
      date: "2026-03-01T00:00:00.000Z",
      type: "recurring",
      restriction: "restricted",
      fundId: "11111111-1111-4111-8111-111111111111",
      grantId: "22222222-2222-4222-8222-222222222222",
      paymentMethod: "check",
      notes: "Annual pledge payment",
      goodsServicesValueCents: 2500,
      goodsServicesDescription: "Dinner ticket fair market value",
    });
    expect(result.success).toBe(true);
  });

  it("rejects quid-pro-quo value above the donation amount", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 10000,
      goodsServicesValueCents: 10001,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateDonationSchema
// ---------------------------------------------------------------------------

describe("updateDonationSchema", () => {
  it("accepts partial update", () => {
    const result = updateDonationSchema.safeParse({ amountCents: 7500 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateDonationSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts an ISO datetime string in update", () => {
    const result = updateDonationSchema.safeParse({ date: "2026-06-15T00:00:00.000Z" });
    expect(result.success).toBe(true);
  });

  it("rejects a YYYY-MM-DD date-only string in update", () => {
    const result = updateDonationSchema.safeParse({ date: "2026-06-15" });
    expect(result.success).toBe(false);
  });

  it("rejects updated quid-pro-quo value above the updated donation amount", () => {
    const result = updateDonationSchema.safeParse({
      amountCents: 5000,
      goodsServicesValueCents: 5001,
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #28 — Currency ISO-3 validation
// ---------------------------------------------------------------------------

describe("createDonationSchema — currency (#28)", () => {
  it("accepts a valid 3-letter uppercase currency", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
      currency: "USD",
    });
    expect(result.success).toBe(true);
  });

  it("rejects lowercase currency code", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
      currency: "usd",
    });
    expect(result.success).toBe(false);
  });

  it("rejects 4-letter currency code", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
      currency: "USDD",
    });
    expect(result.success).toBe(false);
  });

  it("rejects 2-letter currency code", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
      currency: "US",
    });
    expect(result.success).toBe(false);
  });

  it("defaults currency to USD when omitted", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("USD");
    }
  });
});

describe("updateDonationSchema — currency (#28)", () => {
  it("accepts a valid 3-letter uppercase currency", () => {
    const result = updateDonationSchema.safeParse({ currency: "EUR" });
    expect(result.success).toBe(true);
  });

  it("rejects empty string currency", () => {
    const result = updateDonationSchema.safeParse({ currency: "" });
    expect(result.success).toBe(false);
  });

  it("rejects null currency (optional but not nullable)", () => {
    const result = updateDonationSchema.safeParse({ currency: null });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #29 — UUID validation on fundId, grantId
// ---------------------------------------------------------------------------

describe("createDonationSchema — fundId/grantId UUID (#29)", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";

  it("accepts a valid UUID for fundId", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
      fundId: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID string for fundId", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
      fundId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts undefined fundId", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fundId).toBeUndefined();
    }
  });

  it("accepts a valid UUID for grantId", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
      grantId: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID string for grantId", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
      grantId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts undefined grantId", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.grantId).toBeUndefined();
    }
  });
});

describe("updateDonationSchema — fundId/grantId UUID (#29)", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";

  it("accepts a valid UUID for fundId", () => {
    const result = updateDonationSchema.safeParse({ fundId: validUuid });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID string for fundId", () => {
    const result = updateDonationSchema.safeParse({ fundId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("accepts null fundId (clearing the field)", () => {
    const result = updateDonationSchema.safeParse({ fundId: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fundId).toBeNull();
    }
  });

  it("accepts undefined fundId", () => {
    const result = updateDonationSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a valid UUID for grantId", () => {
    const result = updateDonationSchema.safeParse({ grantId: validUuid });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID string for grantId", () => {
    const result = updateDonationSchema.safeParse({ grantId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("accepts null grantId (clearing the field)", () => {
    const result = updateDonationSchema.safeParse({ grantId: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.grantId).toBeNull();
    }
  });
});

describe("contactListSchema — tagId UUID (#29)", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";

  it("accepts a valid UUID for tagId", () => {
    const result = contactListSchema.safeParse({ tagId: validUuid });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID string for tagId", () => {
    const result = contactListSchema.safeParse({ tagId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("accepts undefined tagId", () => {
    const result = contactListSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("createSegmentSchema — tagId UUID (#29)", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";

  it("accepts a valid UUID for tagId in filters", () => {
    const result = createSegmentSchema.safeParse({
      name: "Seg",
      filters: { tagId: validUuid },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID string for tagId in filters", () => {
    const result = createSegmentSchema.safeParse({
      name: "Seg",
      filters: { tagId: "not-a-uuid" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts undefined tagId in filters", () => {
    const result = createSegmentSchema.safeParse({ name: "Seg", filters: {} });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #30 — Length limits on notes and communication body
// ---------------------------------------------------------------------------

describe("contactBaseSchema / updateContactSchema — notes length (#30)", () => {
  it("accepts notes at max length (10000 chars)", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      notes: "x".repeat(10_000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects notes exceeding max length (10001 chars)", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      notes: "x".repeat(10_001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts notes at max length in updateContactSchema", () => {
    const result = updateContactSchema.safeParse({ notes: "x".repeat(10_000) });
    expect(result.success).toBe(true);
  });

  it("rejects notes exceeding max length in updateContactSchema", () => {
    const result = updateContactSchema.safeParse({ notes: "x".repeat(10_001) });
    expect(result.success).toBe(false);
  });
});

describe("createCommunicationSchema — body length (#30)", () => {
  it("accepts body at max length (50000 chars)", () => {
    const result = createCommunicationSchema.safeParse({
      type: "email",
      body: "x".repeat(50_000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects body exceeding max length (50001 chars)", () => {
    const result = createCommunicationSchema.safeParse({
      type: "email",
      body: "x".repeat(50_001),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createTagSchema
// ---------------------------------------------------------------------------

describe("createTagSchema", () => {
  it("accepts name only", () => {
    const result = createTagSchema.safeParse({ name: "Major Donor" });
    expect(result.success).toBe(true);
  });

  it("accepts name and color", () => {
    const result = createTagSchema.safeParse({ name: "VIP", color: "#e07a5f" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createTagSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    const result = createTagSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace from the name", () => {
    const result = createTagSchema.safeParse({ name: "  VIP  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("VIP");
    }
  });

  it("rejects invalid hex color", () => {
    const result = createTagSchema.safeParse({ name: "VIP", color: "red" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateTagSchema
// ---------------------------------------------------------------------------

describe("updateTagSchema", () => {
  it("accepts partial update", () => {
    const result = updateTagSchema.safeParse({ color: "#065f46" });
    expect(result.success).toBe(true);
  });

  it("rejects a whitespace-only name", () => {
    const result = updateTagSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addTagsSchema
// ---------------------------------------------------------------------------

describe("addTagsSchema", () => {
  it("accepts non-empty tagIds array", () => {
    const result = addTagsSchema.safeParse({
      tagIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty tagIds array", () => {
    const result = addTagsSchema.safeParse({ tagIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tagId format", () => {
    const result = addTagsSchema.safeParse({ tagIds: ["not-a-uuid"] });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createCommunicationSchema
// ---------------------------------------------------------------------------

describe("createCommunicationSchema", () => {
  it("accepts with subject only", () => {
    const result = createCommunicationSchema.safeParse({
      type: "note",
      subject: "Follow-up call",
    });
    expect(result.success).toBe(true);
  });

  it("accepts with body only", () => {
    const result = createCommunicationSchema.safeParse({
      type: "email",
      body: "Sent grant proposal",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when both subject and body are missing", () => {
    const result = createCommunicationSchema.safeParse({ type: "call" });
    expect(result.success).toBe(false);
  });

  it("rejects when subject and body are whitespace-only", () => {
    const result = createCommunicationSchema.safeParse({
      type: "note",
      subject: "   ",
      body: "  ",
    });
    expect(result.success).toBe(false);
  });

  it("trims a subject down to its content", () => {
    const result = createCommunicationSchema.safeParse({
      type: "note",
      subject: "  Follow-up  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBe("Follow-up");
    }
  });

  it("rejects invalid communication type", () => {
    const result = createCommunicationSchema.safeParse({
      type: "sms",
      subject: "Hello",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// donorMailMergeSendSchema
// ---------------------------------------------------------------------------

describe("donorMailMergeSendSchema", () => {
  const contactId = "11111111-1111-4111-8111-111111111111";
  const attemptId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("accepts a donor email with supported merge tokens", () => {
    const result = donorMailMergeSendSchema.safeParse({
      attemptId,
      contactIds: [contactId],
      subject: "A quick note for {{ firstName }}",
      body: "Hi {{fullName}}, thank you for staying close to the work.",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.attemptId).toBe(attemptId);
  });

  it("requires an attempt id so stale clients fail before delivery", () => {
    const result = donorMailMergeSendSchema.safeParse({
      contactIds: [contactId],
      subject: "Hello",
      body: "Message",
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one selected donor", () => {
    const result = donorMailMergeSendSchema.safeParse({
      attemptId,
      contactIds: [],
      subject: "Hello",
      body: "Message",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Choose at least one donor.");
    }
  });

  it("rejects unsupported merge tokens in the subject and body", () => {
    const result = donorMailMergeSendSchema.safeParse({
      attemptId,
      contactIds: [contactId],
      subject: "Hello {{nickname}}",
      body: "Your last gift was {{lastGiftAmount}}.",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        "Unsupported merge token: nickname.",
        "Unsupported merge token: lastGiftAmount.",
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// createSegmentSchema
// ---------------------------------------------------------------------------

describe("createSegmentSchema", () => {
  it("accepts name with empty filters", () => {
    const result = createSegmentSchema.safeParse({
      name: "Active Prospects",
      filters: {},
    });
    expect(result.success).toBe(true);
  });

  it("accepts name with all filters", () => {
    const result = createSegmentSchema.safeParse({
      name: "Major Donors in Stewardship",
      filters: {
        pipelineStage: "stewardship",
        tagId: "11111111-1111-4111-8111-111111111111",
        type: "individual",
        search: "smith",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createSegmentSchema.safeParse({ name: "", filters: {} });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    const result = createSegmentSchema.safeParse({ name: "   ", filters: {} });
    expect(result.success).toBe(false);
  });

  it("rejects missing filters object", () => {
    const result = createSegmentSchema.safeParse({ name: "Test" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateSegmentSchema
// ---------------------------------------------------------------------------

describe("updateSegmentSchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateSegmentSchema.safeParse({ name: "Updated Name" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with filters only", () => {
    const result = updateSegmentSchema.safeParse({
      filters: { pipelineStage: "prospect" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateSegmentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects a whitespace-only name", () => {
    const result = updateSegmentSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #30 — Donation notes max length
// ---------------------------------------------------------------------------

describe("createDonationSchema/updateDonationSchema — notes length (#30)", () => {
  it("accepts notes up to 10,000 chars", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
      notes: "x".repeat(10_000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects notes over 10,000 chars", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00.000Z",
      type: "one_time",
      notes: "x".repeat(10_001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts notes up to 10,000 chars in updateDonationSchema", () => {
    const result = updateDonationSchema.safeParse({ notes: "x".repeat(10_000) });
    expect(result.success).toBe(true);
  });

  it("rejects notes over 10,000 chars in updateDonationSchema", () => {
    const result = updateDonationSchema.safeParse({ notes: "x".repeat(10_001) });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #29 — contactExportSchema tagId UUID
// ---------------------------------------------------------------------------

describe("contactExportSchema — tagId UUID (#29)", () => {
  it("accepts a valid UUID tagId", () => {
    expect(
      contactExportSchema.safeParse({ tagId: "123e4567-e89b-12d3-a456-426614174000" }).success,
    ).toBe(true);
  });

  it("rejects a non-UUID tagId string", () => {
    expect(contactExportSchema.safeParse({ tagId: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts when tagId is omitted", () => {
    expect(contactExportSchema.safeParse({}).success).toBe(true);
  });
});

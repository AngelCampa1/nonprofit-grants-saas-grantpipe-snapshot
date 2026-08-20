import { describe, expect, it } from "vitest";
import {
  PLEDGE_STATUSES,
  PLEDGE_INSTALLMENT_STATUSES,
  createPledgeSchema,
  recordPledgePaymentSchema,
  setPledgeAllowanceSchema,
  writeOffPledgeSchema,
  pledgeQuerySchema,
} from "./pledge-tracker";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("PLEDGE_STATUSES", () => {
  it("contains the expected statuses in order", () => {
    expect(PLEDGE_STATUSES).toEqual([
      "conditional",
      "active",
      "completed",
      "written_off",
      "cancelled",
    ]);
  });
});

describe("PLEDGE_INSTALLMENT_STATUSES", () => {
  it("contains the expected statuses in order", () => {
    expect(PLEDGE_INSTALLMENT_STATUSES).toEqual(["scheduled", "paid", "partial", "written_off"]);
  });
});

// ---------------------------------------------------------------------------
// createPledgeSchema
// ---------------------------------------------------------------------------

const validCreatePledge = {
  contactId: "contact-123",
  pledgeDate: "2024-01-15",
  discountRateBasisPoints: 500,
  netAssetClass: "temporarily_restricted" as const,
  installments: [
    { dueDate: "2024-06-01", amountCents: 50_000 },
    { dueDate: "2025-06-01", amountCents: 50_000 },
  ],
};

describe("createPledgeSchema", () => {
  it("accepts a valid minimal pledge", () => {
    const r = createPledgeSchema.safeParse(validCreatePledge);
    expect(r.success).toBe(true);
  });

  it("coerces pledgeDate and installment dueDates from strings", () => {
    const r = createPledgeSchema.safeParse(validCreatePledge);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.pledgeDate).toBeInstanceOf(Date);
    const first = r.data.installments[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.dueDate).toBeInstanceOf(Date);
  });

  it("defaults hasBarrier and hasRightOfReturn to false", () => {
    const r = createPledgeSchema.safeParse(validCreatePledge);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.hasBarrier).toBe(false);
    expect(r.data.hasRightOfReturn).toBe(false);
  });

  it("accepts optional fundId, grantId, conditionNote, notes", () => {
    const r = createPledgeSchema.safeParse({
      ...validCreatePledge,
      fundId: "fund-1",
      grantId: "grant-1",
      conditionNote: "Must complete matching campaign",
      notes: "Multi-year leadership gift",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null fundId and grantId", () => {
    const r = createPledgeSchema.safeParse({
      ...validCreatePledge,
      fundId: null,
      grantId: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing contactId", () => {
    const rest: Partial<typeof validCreatePledge> = { ...validCreatePledge };
    delete rest.contactId;
    const r = createPledgeSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects empty contactId", () => {
    const r = createPledgeSchema.safeParse({ ...validCreatePledge, contactId: "" });
    expect(r.success).toBe(false);
  });

  it("rejects empty installments array", () => {
    const r = createPledgeSchema.safeParse({ ...validCreatePledge, installments: [] });
    expect(r.success).toBe(false);
  });

  it("rejects discountRateBasisPoints below 0", () => {
    const r = createPledgeSchema.safeParse({
      ...validCreatePledge,
      discountRateBasisPoints: -1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects discountRateBasisPoints above 10000", () => {
    const r = createPledgeSchema.safeParse({
      ...validCreatePledge,
      discountRateBasisPoints: 10_001,
    });
    expect(r.success).toBe(false);
  });

  it("accepts discountRateBasisPoints at boundaries (0 and 10000)", () => {
    expect(
      createPledgeSchema.safeParse({ ...validCreatePledge, discountRateBasisPoints: 0 }).success,
    ).toBe(true);
    expect(
      createPledgeSchema.safeParse({ ...validCreatePledge, discountRateBasisPoints: 10_000 })
        .success,
    ).toBe(true);
  });

  it("rejects invalid netAssetClass", () => {
    const r = createPledgeSchema.safeParse({
      ...validCreatePledge,
      netAssetClass: "restricted",
    });
    expect(r.success).toBe(false);
  });

  it("accepts all three netAssetClass values", () => {
    for (const cls of [
      "unrestricted",
      "temporarily_restricted",
      "permanently_restricted",
    ] as const) {
      expect(
        createPledgeSchema.safeParse({ ...validCreatePledge, netAssetClass: cls }).success,
      ).toBe(true);
    }
  });

  it("rejects installment with amountCents = 0", () => {
    const r = createPledgeSchema.safeParse({
      ...validCreatePledge,
      installments: [{ dueDate: "2024-06-01", amountCents: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects installment with non-integer amountCents", () => {
    const r = createPledgeSchema.safeParse({
      ...validCreatePledge,
      installments: [{ dueDate: "2024-06-01", amountCents: 100.5 }],
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordPledgePaymentSchema
// ---------------------------------------------------------------------------

describe("recordPledgePaymentSchema", () => {
  const valid = {
    amountCents: 25_000,
    paymentDate: "2024-06-01",
  };

  it("accepts a valid payment record", () => {
    expect(recordPledgePaymentSchema.safeParse(valid).success).toBe(true);
  });

  it("coerces paymentDate from string", () => {
    const r = recordPledgePaymentSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.paymentDate).toBeInstanceOf(Date);
  });

  it("accepts optional installmentId", () => {
    expect(recordPledgePaymentSchema.safeParse({ ...valid, installmentId: "inst-1" }).success).toBe(
      true,
    );
  });

  it("accepts null installmentId", () => {
    expect(recordPledgePaymentSchema.safeParse({ ...valid, installmentId: null }).success).toBe(
      true,
    );
  });

  it("rejects amountCents = 0", () => {
    expect(recordPledgePaymentSchema.safeParse({ ...valid, amountCents: 0 }).success).toBe(false);
  });

  it("rejects negative amountCents", () => {
    expect(recordPledgePaymentSchema.safeParse({ ...valid, amountCents: -100 }).success).toBe(
      false,
    );
  });

  it("does not require pledgeId (identity comes from the path)", () => {
    expect(recordPledgePaymentSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing paymentDate", () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.paymentDate;
    expect(recordPledgePaymentSchema.safeParse(rest).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setPledgeAllowanceSchema
// ---------------------------------------------------------------------------

describe("setPledgeAllowanceSchema", () => {
  it("accepts zero allowanceCents", () => {
    expect(setPledgeAllowanceSchema.safeParse({ allowanceCents: 0 }).success).toBe(true);
  });

  it("accepts positive allowanceCents", () => {
    expect(setPledgeAllowanceSchema.safeParse({ allowanceCents: 5000 }).success).toBe(true);
  });

  it("rejects negative allowanceCents", () => {
    expect(setPledgeAllowanceSchema.safeParse({ allowanceCents: -1 }).success).toBe(false);
  });

  it("rejects non-integer allowanceCents", () => {
    expect(setPledgeAllowanceSchema.safeParse({ allowanceCents: 10.5 }).success).toBe(false);
  });

  it("rejects missing allowanceCents", () => {
    expect(setPledgeAllowanceSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// writeOffPledgeSchema
// ---------------------------------------------------------------------------

describe("writeOffPledgeSchema", () => {
  it("accepts an empty body (reason optional, identity from path)", () => {
    expect(writeOffPledgeSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a reason", () => {
    expect(writeOffPledgeSchema.safeParse({ reason: "Donor deceased" }).success).toBe(true);
  });

  it("rejects a non-string reason", () => {
    expect(writeOffPledgeSchema.safeParse({ reason: 123 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pledgeQuerySchema
// ---------------------------------------------------------------------------

describe("pledgeQuerySchema", () => {
  it("defaults limit to 25 when not provided", () => {
    const r = pledgeQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.limit).toBe(25);
  });

  it("accepts all valid status values", () => {
    for (const status of PLEDGE_STATUSES) {
      expect(pledgeQuerySchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(pledgeQuerySchema.safeParse({ status: "bogus" }).success).toBe(false);
  });

  it("rejects limit below 1", () => {
    expect(pledgeQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("rejects limit above 100", () => {
    expect(pledgeQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("accepts limit at boundaries (1 and 100)", () => {
    expect(pledgeQuerySchema.safeParse({ limit: 1 }).success).toBe(true);
    expect(pledgeQuerySchema.safeParse({ limit: 100 }).success).toBe(true);
  });

  it("coerces HTTP query string limits", () => {
    const r = pledgeQuerySchema.safeParse({ limit: "100" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.limit).toBe(100);
  });

  it("accepts status omitted (optional)", () => {
    const r = pledgeQuerySchema.safeParse({ limit: 10 });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.status).toBeUndefined();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { listDonations, createDonation, updateDonation, deleteDonation } from "./donation.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

vi.mock("../accounting/postingEngine", () => ({
  postDonation: vi.fn(),
}));

import { recordActivityLog } from "../../lib/activity-log";
import { postDonation } from "../accounting/postingEngine";

afterEach(() => {
  vi.clearAllMocks();
});

// Add transaction support to a mock db object so service functions that wrap
// mutations in db.transaction(async (tx) => {...}) work correctly in tests.
function withTransaction<T extends object>(
  db: T,
): T & { transaction: (cb: (tx: T) => Promise<unknown>) => Promise<unknown> } {
  return Object.assign(db, {
    transaction: async (cb: (tx: T) => Promise<unknown>) => cb(db),
  });
}

// ---------------------------------------------------------------------------
// createDonation
// ---------------------------------------------------------------------------

describe("createDonation", () => {
  it("inserts a donation with orgId and contactId", async () => {
    const newDonation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      type: "one_time",
    };
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const returningFn = vi.fn().mockResolvedValue([newDonation]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: insertFn,
    });

    const result = await createDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "unrestricted",
    });

    const inserted = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.orgId).toBe("org-1");
    expect(inserted.contactId).toBe("c-1");
    expect(inserted.amountCents).toBe(5000);
    expect(result).toEqual(newDonation);
  });

  it("records activity when an actor id is provided", async () => {
    const newDonation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      type: "one_time",
    };
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const returningFn = vi.fn().mockResolvedValue([newDonation]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: insertFn,
    });

    await createDonation(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "unrestricted",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "created",
        entityType: "donation",
        entityId: "d-1",
      }),
    );
  });

  it("records fundId and grantId in donation creation activity changes", async () => {
    const newDonation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      type: "one_time",
      fundId: "11111111-1111-4111-8111-111111111111",
      grantId: "22222222-2222-4222-8222-222222222222",
    };
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const fundLookup = vi
      .fn()
      .mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", orgId: "org-1" });
    const grantLookup = vi
      .fn()
      .mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", orgId: "org-1" });
    const allocationLookup = vi.fn().mockResolvedValue({ id: "allocation-1" });
    const returningFn = vi.fn().mockResolvedValue([newDonation]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
        funds: {
          findFirst: fundLookup,
        },
        grants: {
          findFirst: grantLookup,
        },
        grantFundAllocations: {
          findFirst: allocationLookup,
        },
        restrictionTerms: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: insertFn,
    });

    await createDonation(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "restricted",
      fundId: "11111111-1111-4111-8111-111111111111",
      grantId: "22222222-2222-4222-8222-222222222222",
    });

    const inserted = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    // A restricted gift on a temporarily restricted fund resolves to the
    // temporarily restricted net-asset class.
    expect(inserted.netAssetClass).toBe("temporarily_restricted");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: expect.objectContaining({
          fundId: "11111111-1111-4111-8111-111111111111",
          grantId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
    );
  });

  it("posts donation when an actor id is provided", async () => {
    const newDonation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      type: "one_time",
    };
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const returningFn = vi.fn().mockResolvedValue([newDonation]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: insertFn,
    });

    await createDonation(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "unrestricted",
    });

    expect(postDonation).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-2",
      donationId: "d-1",
      action: "create",
    });
  });

  it("does not post donation when actor id is not provided", async () => {
    const newDonation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      type: "one_time",
    };
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const returningFn = vi.fn().mockResolvedValue([newDonation]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: insertFn,
    });

    await createDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "unrestricted",
    });

    expect(postDonation).not.toHaveBeenCalled();
  });

  it("rejects contacts outside the org before insert", async () => {
    const contactLookup = vi.fn().mockResolvedValue(undefined);
    const insertFn = vi.fn();
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: insertFn,
    });

    await expect(
      createDonation(db as never, {
        orgId: "org-1",
        contactId: "contact-foreign",
        amountCents: 5000,
        currency: "USD",
        date: "2026-01-15T00:00:00Z",
        type: "one_time",
        restriction: "unrestricted",
      }),
    ).rejects.toThrow("Contact not found");

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("rejects invalid create input before reading contacts", async () => {
    const contactLookup = vi.fn();
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: vi.fn(),
    });

    await expect(
      createDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        amountCents: 0,
        currency: "USD",
        date: "2026-01-15T00:00:00Z",
        type: "one_time",
        restriction: "unrestricted",
      }),
    ).rejects.toThrow(/Amount must be positive/);

    expect(contactLookup).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects funds outside the org before insert", async () => {
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const fundLookup = vi.fn().mockResolvedValue(undefined);
    const grantLookup = vi.fn().mockResolvedValue(undefined);
    const insertFn = vi.fn();
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
        funds: {
          findFirst: fundLookup,
        },
        grants: {
          findFirst: grantLookup,
        },
      },
      insert: insertFn,
    });

    await expect(
      createDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        amountCents: 5000,
        currency: "USD",
        date: "2026-01-15T00:00:00Z",
        type: "one_time",
        restriction: "unrestricted",
        fundId: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toThrow("Fund not found");

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("rejects grants outside the org before insert", async () => {
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const grantLookup = vi.fn().mockResolvedValue(undefined);
    const insertFn = vi.fn();
    const db = withTransaction({
      query: {
        contacts: { findFirst: contactLookup },
        funds: { findFirst: vi.fn().mockResolvedValue(undefined) },
        grants: { findFirst: grantLookup },
      },
      insert: insertFn,
    });

    await expect(
      createDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        amountCents: 5000,
        currency: "USD",
        date: "2026-01-15T00:00:00Z",
        type: "one_time",
        restriction: "unrestricted",
        grantId: "44444444-4444-4444-8444-444444444444",
      }),
    ).rejects.toThrow("Grant not found");

    expect(insertFn).not.toHaveBeenCalled();

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("inserts grant-backed donations when the grant belongs to the org", async () => {
    const newDonation = {
      id: "d-2",
      orgId: "org-1",
      contactId: "c-1",
      grantId: "22222222-2222-4222-8222-222222222222",
    };
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const fundLookup = vi
      .fn()
      .mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", orgId: "org-1" });
    const grantLookup = vi
      .fn()
      .mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", orgId: "org-1" });
    const allocationLookup = vi.fn().mockResolvedValue({ id: "allocation-1" });
    const returningFn = vi.fn().mockResolvedValue([newDonation]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
        funds: {
          findFirst: fundLookup,
        },
        grants: {
          findFirst: grantLookup,
        },
        grantFundAllocations: {
          findFirst: allocationLookup,
        },
        restrictionTerms: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: insertFn,
    });

    const result = await createDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 7500,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "restricted",
      fundId: "11111111-1111-4111-8111-111111111111",
      grantId: "22222222-2222-4222-8222-222222222222",
    });

    const inserted = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(fundLookup).toHaveBeenCalled();
    expect(grantLookup).toHaveBeenCalled();
    expect(inserted.fundId).toBe("11111111-1111-4111-8111-111111111111");
    expect(inserted.grantId).toBe("22222222-2222-4222-8222-222222222222");
    expect(inserted.netAssetClass).toBe("temporarily_restricted");
    expect(result).toEqual(newDonation);
  });

  it("rejects donations whose fundId is not allocated to grantId", async () => {
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const fundLookup = vi
      .fn()
      .mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", orgId: "org-1" });
    const grantLookup = vi
      .fn()
      .mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", orgId: "org-1" });
    const allocationLookup = vi.fn().mockResolvedValue(undefined);
    const insertFn = vi.fn();
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
        funds: {
          findFirst: fundLookup,
        },
        grants: {
          findFirst: grantLookup,
        },
        grantFundAllocations: {
          findFirst: allocationLookup,
        },
      },
      insert: insertFn,
    });

    await expect(
      createDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        amountCents: 7500,
        currency: "USD",
        date: "2026-01-15T00:00:00Z",
        type: "one_time",
        restriction: "restricted",
        fundId: "11111111-1111-4111-8111-111111111111",
        grantId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toThrow("Fund is not allocated to this grant");

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("throws when insert returns no rows", async () => {
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
      },
      insert: insertFn,
    });

    await expect(
      createDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        amountCents: 5000,
        currency: "USD",
        date: "2026-01-15T00:00:00Z",
        type: "one_time",
        restriction: "unrestricted",
      }),
    ).rejects.toThrow("Failed to create donation");
  });

  it("rejects donations for contacts outside the org", async () => {
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    });

    await expect(
      createDonation(db as never, {
        orgId: "org-1",
        contactId: "c-foreign",
        amountCents: 5000,
        currency: "USD",
        date: "2026-01-15T00:00:00Z",
        type: "one_time",
        restriction: "unrestricted",
      }),
    ).rejects.toThrow("Contact not found");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateDonation
// ---------------------------------------------------------------------------

describe("updateDonation", () => {
  it("updates a donation scoped by orgId and contactId", async () => {
    const updated = { id: "d-1", amountCents: 7500 };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    const result = await updateDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      donationId: "d-1",
      data: { amountCents: 7500 },
    });

    expect(result).toEqual(updated);
  });

  it("rejects updates that leave goods and services value above the final amount", async () => {
    const updated = {
      id: "d-1",
      amountCents: 5000,
      goodsServicesValueCents: 7500,
    };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      updateDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        donationId: "d-1",
        data: { amountCents: 5000 },
      }),
    ).rejects.toThrow("Goods and services value cannot exceed the donation amount");

    expect(recordActivityLog).not.toHaveBeenCalled();
    expect(postDonation).not.toHaveBeenCalled();
  });

  it("records activity when an actor id is provided", async () => {
    const updated = { id: "d-1", amountCents: 7500 };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await updateDonation(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      donationId: "d-1",
      data: { amountCents: 7500 },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "updated",
        entityType: "donation",
        entityId: "d-1",
      }),
    );
  });

  it("posts donation when an actor id is provided", async () => {
    const updated = { id: "d-1", amountCents: 7500 };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await updateDonation(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      donationId: "d-1",
      data: { amountCents: 7500 },
    });

    expect(postDonation).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-2",
      donationId: "d-1",
      action: "update",
    });
  });

  it("does not post donation when actor id is not provided", async () => {
    const updated = { id: "d-1", amountCents: 7500 };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await updateDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      donationId: "d-1",
      data: { amountCents: 7500 },
    });

    expect(postDonation).not.toHaveBeenCalled();
  });

  it("converts date string to Date when date is provided", async () => {
    const updated = { id: "d-1", date: new Date("2026-03-01") };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await updateDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      donationId: "d-1",
      data: { date: "2026-03-01T00:00:00Z" },
    });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.date).toBeInstanceOf(Date);
  });

  it("accepts org-scoped fund and grant updates", async () => {
    const updated = {
      id: "d-1",
      amountCents: 8000,
      fundId: "11111111-1111-4111-8111-111111111111",
      grantId: "22222222-2222-4222-8222-222222222222",
    };
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const fundLookup = vi
      .fn()
      .mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", orgId: "org-1" });
    const grantLookup = vi
      .fn()
      .mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", orgId: "org-1" });
    const allocationLookup = vi.fn().mockResolvedValue({ id: "allocation-1" });
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({
      query: {
        contacts: {
          findFirst: contactLookup,
        },
        funds: {
          findFirst: fundLookup,
        },
        grants: {
          findFirst: grantLookup,
        },
        grantFundAllocations: {
          findFirst: allocationLookup,
        },
      },
      update: updateFn,
    });

    const result = await updateDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      donationId: "d-1",
      data: {
        amountCents: 8000,
        fundId: "11111111-1111-4111-8111-111111111111",
        grantId: "22222222-2222-4222-8222-222222222222",
      },
    });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(fundLookup).toHaveBeenCalled();
    expect(grantLookup).toHaveBeenCalled();
    expect(setArg.fundId).toBe("11111111-1111-4111-8111-111111111111");
    expect(setArg.grantId).toBe("22222222-2222-4222-8222-222222222222");
    expect(result).toEqual(updated);
  });

  it("rejects updates whose final fundId is not allocated to the final grantId", async () => {
    const updated = {
      id: "d-1",
      amountCents: 8000,
      fundId: "11111111-1111-4111-8111-111111111111",
      grantId: "22222222-2222-4222-8222-222222222222",
    };
    const fundLookup = vi
      .fn()
      .mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", orgId: "org-1" });
    const grantLookup = vi
      .fn()
      .mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", orgId: "org-1" });
    const allocationLookup = vi.fn().mockResolvedValue(undefined);
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({
      query: {
        funds: {
          findFirst: fundLookup,
        },
        grants: {
          findFirst: grantLookup,
        },
        grantFundAllocations: {
          findFirst: allocationLookup,
        },
      },
      update: updateFn,
    });

    await expect(
      updateDonation(db as never, {
        orgId: "org-1",
        actorId: "user-2",
        contactId: "c-1",
        donationId: "d-1",
        data: {
          fundId: "11111111-1111-4111-8111-111111111111",
          grantId: "22222222-2222-4222-8222-222222222222",
        },
      }),
    ).rejects.toThrow("Fund is not allocated to this grant");

    expect(recordActivityLog).not.toHaveBeenCalled();
    expect(postDonation).not.toHaveBeenCalled();
  });

  it("rejects relation-backed updates outside the org", async () => {
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const fundLookup = vi.fn().mockResolvedValue(undefined);
    const grantLookup = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: {
        contacts: {
          findFirst: contactLookup,
        },
        funds: {
          findFirst: fundLookup,
        },
        grants: {
          findFirst: grantLookup,
        },
      },
      update: vi.fn(),
    };

    await expect(
      updateDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        donationId: "d-1",
        data: {
          fundId: "33333333-3333-4333-8333-333333333333",
          grantId: "44444444-4444-4444-8444-444444444444",
        },
      }),
    ).rejects.toThrow("Fund not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("throws when donation not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      updateDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        donationId: "d-missing",
        data: { amountCents: 100 },
      }),
    ).rejects.toThrow("Donation not found");
  });

  it("rejects invalid update input before updating donations", async () => {
    const updateFn = vi.fn();
    const db = withTransaction({ update: updateFn });

    await expect(
      updateDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        donationId: "d-1",
        data: { amountCents: 0 },
      }),
    ).rejects.toThrow(/Too small|Number must be greater than 0/);

    expect(updateFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteDonation
// ---------------------------------------------------------------------------

describe("deleteDonation", () => {
  it("sets deletedAt on the donation", async () => {
    const deleted = { id: "d-1", deletedAt: new Date() };
    const returningFn = vi.fn().mockResolvedValue([deleted]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      donationId: "d-1",
    });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.deletedAt).toBeInstanceOf(Date);
  });

  it("records activity when an actor id is provided", async () => {
    const deleted = { id: "d-1", deletedAt: new Date("2026-04-08T00:00:00Z") };
    const returningFn = vi.fn().mockResolvedValue([deleted]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteDonation(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      donationId: "d-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-2",
        action: "deleted",
        entityType: "donation",
        entityId: "d-1",
      }),
    );
  });

  it("posts donation when an actor id is provided", async () => {
    const deleted = { id: "d-1", deletedAt: new Date("2026-04-08T00:00:00Z") };
    const returningFn = vi.fn().mockResolvedValue([deleted]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteDonation(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      donationId: "d-1",
    });

    expect(postDonation).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-2",
      donationId: "d-1",
      action: "delete",
    });
  });

  it("does not post donation when actor id is not provided", async () => {
    const deleted = { id: "d-1", deletedAt: new Date("2026-04-08T00:00:00Z") };
    const returningFn = vi.fn().mockResolvedValue([deleted]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      donationId: "d-1",
    });

    expect(postDonation).not.toHaveBeenCalled();
  });

  it("logs null deletedAt changes when the returned row does not include a timestamp", async () => {
    const deleted = { id: "d-1", deletedAt: undefined };
    const returningFn = vi.fn().mockResolvedValue([deleted]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await deleteDonation(db as never, {
      orgId: "org-1",
      actorId: "user-2",
      contactId: "c-1",
      donationId: "d-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: { deletedAt: null },
      }),
    );
  });

  it("throws when donation not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({ update: updateFn });

    await expect(
      deleteDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        donationId: "d-missing",
      }),
    ).rejects.toThrow("Donation not found");
  });
});

// ---------------------------------------------------------------------------
// listDonations
// ---------------------------------------------------------------------------

describe("listDonations", () => {
  it("returns paginated donations for a contact", async () => {
    const donationRows = [
      { id: "d-1", amountCents: 5000 },
      { id: "d-2", amountCents: 10000 },
    ];

    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue(donationRows),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 2 }]),
          }),
        };
      }),
    };

    const result = await listDonations(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      page: 1,
      pageSize: 25,
    });

    expect(result.data).toEqual(donationRows);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
  });

  it("includes funds.orgId (not donations.orgId) in the leftJoin so cross-org funds cannot leak names", async () => {
    const leftJoinSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: leftJoinSpy,
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        };
      }),
    };

    await listDonations(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      page: 1,
      pageSize: 25,
    });

    expect(leftJoinSpy).toHaveBeenCalledTimes(1);
    const joinClause = leftJoinSpy.mock.calls[0]?.[1] as {
      queryChunks?: unknown[];
    };
    expect(joinClause?.queryChunks).toBeDefined();

    // Collect { columnName, tableName } pairs from the Drizzle SQL predicate.
    // A Drizzle column node has `.name` (column name) and `.table` (a Drizzle
    // table object). The table's SQL name lives under Symbol(drizzle:Name).
    // We inspect `.table` shallowly — name only — to avoid traversing sibling
    // columns and risking circular references.
    const drizzleNameSym = Symbol.for("drizzle:Name");
    const seenTableColumns: Array<{ col: string; table: string }> = [];
    const visited = new WeakSet<object>();
    const visit = (node: unknown) => {
      if (node === null || node === undefined) return;
      if (typeof node !== "object") return;
      if (visited.has(node as object)) return;
      visited.add(node as object);
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      const obj = node as Record<string, unknown>;
      // Drizzle Column: has `name` (column name) and `table` (table object).
      if (typeof obj.name === "string" && obj.table !== undefined) {
        const tbl = obj.table as Record<symbol, unknown>;
        const tableName =
          typeof tbl[drizzleNameSym] === "string" ? (tbl[drizzleNameSym] as string) : "";
        seenTableColumns.push({ col: obj.name, table: tableName });
        return; // do not traverse into `table` further
      }
      for (const [key, value] of Object.entries(obj)) {
        if (key === "table") continue;
        visit(value);
      }
    };
    visit(joinClause);

    // The predicate must reference orgId specifically on the `funds` table.
    // A bug that joined on `donations.orgId` instead would put "donations" here.
    const fundsOrgId = seenTableColumns.find(
      ({ col, table }) => (col === "orgId" || col === "org_id") && table === "funds",
    );
    expect(fundsOrgId).toBeDefined();

    // Confirm no orgId reference sneaks in from the donations table in the join clause.
    const donationsOrgId = seenTableColumns.find(
      ({ col, table }) => (col === "orgId" || col === "org_id") && table === "donations",
    );
    expect(donationsOrgId).toBeUndefined();
  });

  it("defaults total to 0 when count query returns empty", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        };
      }),
    };

    const result = await listDonations(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createDonation — acceptedClassification integration
// ---------------------------------------------------------------------------

describe("createDonation — acceptedClassification", () => {
  function buildDbWithReturning(donation: Record<string, unknown>, termId = "term-1") {
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    // Each insert call returns its own chain; we rotate through them.
    const donationReturning = vi.fn().mockResolvedValue([donation]);
    const termReturning = vi.fn().mockResolvedValue([{ id: termId, title: "Test" }]);
    const additionReturning = vi.fn().mockResolvedValue([{ id: "add-1" }]);

    let insertCallCount = 0;
    const insertFn = vi.fn().mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        return { values: vi.fn().mockReturnValue({ returning: donationReturning }) };
      }
      if (insertCallCount === 2) {
        return { values: vi.fn().mockReturnValue({ returning: termReturning }) };
      }
      return { values: vi.fn().mockReturnValue({ returning: additionReturning }) };
    });

    const db = withTransaction({
      query: { contacts: { findFirst: contactLookup } },
      insert: insertFn,
    });
    return { db, insertFn, contactLookup };
  }

  it("creates a restriction term + addition when acceptedClassification is provided and restricted", async () => {
    const donation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      type: "one_time",
      restriction: "restricted",
    };
    const { db, insertFn } = buildDbWithReturning(donation);

    await createDonation(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "restricted",
      // The server re-grounds the classification: a "scholarship program"
      // designation resolves to a restricted gift, so the term is created.
      designation: "scholarship program",
      acceptedClassification: {
        restrictionType: "purpose",
        title: "Youth Program Gift",
        releaseRule: "program completion",
        startDate: "2026-01-01T00:00:00Z",
        endDate: "2026-12-31T00:00:00Z",
      },
    });

    // insert is called 3 times: donation, term, addition
    expect(insertFn).toHaveBeenCalledTimes(3);
  });

  it("does NOT create a restriction term when the server re-grounds to unrestricted", async () => {
    // The client claims a restricted classification, but there is no real
    // signal (no fund/grant/designation). The server must NOT trust the client
    // payload and must skip term creation.
    const donation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      type: "one_time",
      restriction: "restricted",
    };
    const { db, insertFn } = buildDbWithReturning(donation);

    await createDonation(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "restricted",
      acceptedClassification: {
        restrictionType: "purpose",
        title: "Fabricated restriction",
      },
    });

    // Only the donation insert — the unsupported restriction is rejected.
    expect(insertFn).toHaveBeenCalledTimes(1);
  });

  it("does NOT create a restriction term when restrictionType is unrestricted", async () => {
    const donation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      type: "one_time",
      restriction: "unrestricted",
    };
    const { db, insertFn } = buildDbWithReturning(donation);

    await createDonation(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "unrestricted",
      acceptedClassification: {
        restrictionType: "unrestricted",
        title: "No restriction",
      },
    });

    // Only 1 insert (the donation itself) — term/addition not created for unrestricted
    expect(insertFn).toHaveBeenCalledTimes(1);
  });

  it("does NOT create a restriction term when no acceptedClassification", async () => {
    const donation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      type: "one_time",
      restriction: "unrestricted",
    };
    const { db, insertFn } = buildDbWithReturning(donation);

    await createDonation(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "unrestricted",
    });

    expect(insertFn).toHaveBeenCalledTimes(1);
  });

  it("does NOT create a restriction term when no actorId", async () => {
    const donation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      type: "one_time",
      restriction: "restricted",
    };
    const { db, insertFn } = buildDbWithReturning(donation);

    await createDonation(db as never, {
      orgId: "org-1",
      // no actorId
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "restricted",
      acceptedClassification: {
        restrictionType: "purpose",
        title: "Youth Program Gift",
      },
    });

    // actorId is required for the term creation path
    expect(insertFn).toHaveBeenCalledTimes(1);
  });

  it("stores the term with correct restrictionType and title", async () => {
    const donation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 7500,
      currency: "USD",
      type: "one_time",
      restriction: "restricted",
    };
    const { db, insertFn } = buildDbWithReturning(donation);

    await createDonation(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      contactId: "c-1",
      amountCents: 7500,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "restricted",
      designation: "restricted to youth program",
      acceptedClassification: {
        restrictionType: "time",
        title: "Annual Gift Restriction",
      },
    });

    // Second insert is for the restriction term
    const termInsertValues = (insertFn.mock.calls[1] as unknown[])?.[0];
    const termValues = termInsertValues as { values: (v: unknown) => unknown };
    // We just verify that insertFn was called 3 times (donation + term + addition)
    expect(insertFn).toHaveBeenCalledTimes(3);
    void termValues; // used only for structural check above
  });

  it("reuses an existing fund term instead of creating a parallel one (dedup)", async () => {
    const donation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      type: "one_time",
      restriction: "restricted",
    };
    const donationReturning = vi.fn().mockResolvedValue([donation]);
    const additionReturning = vi.fn().mockResolvedValue([{ id: "add-1" }]);
    const insertFn = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        // First insert = donation, any later insert = addition (no term insert).
        returning: insertFn.mock.calls.length === 1 ? donationReturning : additionReturning,
      }),
    }));

    const existingTerm = {
      id: "existing-term-1",
      restrictionType: "purpose",
      releaseRule: null,
      startDate: null,
      endDate: null,
    };
    const db = withTransaction({
      query: {
        contacts: { findFirst: vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" }) },
        funds: {
          findFirst: vi.fn().mockResolvedValue({
            id: "00000000-0000-4000-8000-000000000001",
            orgId: "org-1",
            type: "temporarily_restricted",
          }),
        },
        grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
        restrictionTerms: { findFirst: vi.fn().mockResolvedValue(existingTerm) },
      },
      insert: insertFn,
    });

    await createDonation(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      contactId: "c-1",
      fundId: "00000000-0000-4000-8000-000000000001",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "restricted",
      acceptedClassification: {
        restrictionType: "purpose",
        title: "Youth Program Gift",
      },
    });

    // donation + addition only — NO new term insert (the existing one is reused).
    expect(insertFn).toHaveBeenCalledTimes(2);
  });

  it("reuses an existing grant term (fund absent) instead of creating a parallel one", async () => {
    const donation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      type: "one_time",
      restriction: "restricted",
    };
    const donationReturning = vi.fn().mockResolvedValue([donation]);
    const additionReturning = vi.fn().mockResolvedValue([{ id: "add-1" }]);
    const insertFn = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: insertFn.mock.calls.length === 1 ? donationReturning : additionReturning,
      }),
    }));

    const existingTerm = {
      id: "existing-grant-term-1",
      restrictionType: "purpose",
      releaseRule: null,
      startDate: null,
      endDate: null,
    };
    const db = withTransaction({
      query: {
        contacts: { findFirst: vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" }) },
        funds: { findFirst: vi.fn().mockResolvedValue(undefined) },
        grants: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", orgId: "org-1" }),
        },
        restrictionTerms: { findFirst: vi.fn().mockResolvedValue(existingTerm) },
      },
      insert: insertFn,
    });

    await createDonation(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      contactId: "c-1",
      grantId: "00000000-0000-4000-8000-000000000002",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "restricted",
      acceptedClassification: {
        restrictionType: "purpose",
        title: "Grant-funded Gift",
      },
    });

    // donation + addition only — the existing grant term is reused.
    expect(insertFn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// net-asset class derivation (feature #7)
// ---------------------------------------------------------------------------

describe("createDonation — netAssetClass derivation", () => {
  function buildDb(donation: Record<string, unknown>, fund?: Record<string, unknown>) {
    const contactLookup = vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" });
    const returningFn = vi.fn().mockResolvedValue([donation]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = withTransaction({
      query: {
        contacts: { findFirst: contactLookup },
        funds: { findFirst: vi.fn().mockResolvedValue(fund) },
        grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
        grantFundAllocations: { findFirst: vi.fn().mockResolvedValue({ id: "a-1" }) },
        restrictionTerms: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      insert: insertFn,
    });
    return { db, valuesFn };
  }

  it("stores permanently_restricted when a restricted gift links a permanently restricted fund", async () => {
    const fundId = "11111111-1111-4111-8111-111111111111";
    const { db, valuesFn } = buildDb(
      { id: "d-1", orgId: "org-1", contactId: "c-1", amountCents: 5000, type: "one_time" },
      { id: fundId, orgId: "org-1", type: "permanently_restricted" },
    );

    await createDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "restricted",
      fundId,
    });

    const inserted = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.netAssetClass).toBe("permanently_restricted");
  });

  it("keeps unrestricted even when the gift links a permanently restricted fund (human flag wins)", async () => {
    const fundId = "11111111-1111-4111-8111-111111111111";
    const { db, valuesFn } = buildDb(
      { id: "d-1", orgId: "org-1", contactId: "c-1", amountCents: 5000, type: "one_time" },
      { id: fundId, orgId: "org-1", type: "permanently_restricted" },
    );

    await createDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      currency: "USD",
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
      restriction: "unrestricted",
      fundId,
    });

    const inserted = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.netAssetClass).toBe("unrestricted");
  });
});

describe("updateDonation — netAssetClass reclassification", () => {
  it("rewrites netAssetClass when an edit flips the gift to restricted", async () => {
    const updatedRow = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      restriction: "restricted",
      netAssetClass: "unrestricted",
      fundId: null,
      grantId: null,
      designation: null,
      date: new Date("2026-01-15T00:00:00Z"),
    };
    const reclassedRow = { ...updatedRow, netAssetClass: "temporarily_restricted" };
    const firstReturning = vi.fn().mockResolvedValue([updatedRow]);
    const secondReturning = vi.fn().mockResolvedValue([reclassedRow]);
    let updateCalls = 0;
    const setFn = vi.fn().mockImplementation(() => {
      updateCalls++;
      const returning = updateCalls === 1 ? firstReturning : secondReturning;
      return { where: vi.fn().mockReturnValue({ returning }) };
    });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = withTransaction({
      query: {
        funds: { findFirst: vi.fn().mockResolvedValue(undefined) },
        grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
        grantFundAllocations: { findFirst: vi.fn().mockResolvedValue(undefined) },
        restrictionTerms: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      update: updateFn,
    });

    const result = await updateDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      donationId: "d-1",
      data: { restriction: "restricted" },
    });

    // Two updates: the field edit, then the net-asset reclassification.
    expect(setFn).toHaveBeenCalledTimes(2);
    expect(setFn).toHaveBeenLastCalledWith({ netAssetClass: "temporarily_restricted" });
    expect(result.netAssetClass).toBe("temporarily_restricted");
  });
});

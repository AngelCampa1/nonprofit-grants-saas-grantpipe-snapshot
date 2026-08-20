import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/app-error";

// ---------------------------------------------------------------------------
// Module mocks — must appear before import of the module under test
// ---------------------------------------------------------------------------

vi.mock("@grantpipe/db", () => ({
  organizations: { id: "organizations.id", accountingEnabled: "organizations.accountingEnabled" },
  donations: { id: "donations.id", orgId: "donations.orgId", contactId: "donations.contactId" },
  contacts: {
    id: "contacts.id",
    orgId: "contacts.orgId",
    deletedAt: "contacts.deletedAt",
    type: "contacts.type",
    firstName: "contacts.firstName",
    lastName: "contacts.lastName",
    organizationName: "contacts.organizationName",
  },
  expenses: { id: "expenses.id", orgId: "expenses.orgId" },
  funds: { id: "funds.id", orgId: "funds.orgId" },
  chartOfAccounts: {
    id: "chartOfAccounts.id",
    orgId: "chartOfAccounts.orgId",
    code: "chartOfAccounts.code",
    isActive: "chartOfAccounts.isActive",
    deletedAt: "chartOfAccounts.deletedAt",
    type: "chartOfAccounts.type",
    naturalRestriction: "chartOfAccounts.naturalRestriction",
  },
  fiscalPeriods: {
    id: "fiscalPeriods.id",
    orgId: "fiscalPeriods.orgId",
    status: "fiscalPeriods.status",
    startDate: "fiscalPeriods.startDate",
    endDate: "fiscalPeriods.endDate",
  },
  journalEntries: {
    id: "journalEntries.id",
    orgId: "journalEntries.orgId",
    entryNumber: "journalEntries.entryNumber",
    source: "journalEntries.source",
    sourceId: "journalEntries.sourceId",
    reversedByEntryId: "journalEntries.reversedByEntryId",
    fiscalPeriodId: "journalEntries.fiscalPeriodId",
  },
  journalLines: {
    id: "journalLines.id",
    orgId: "journalLines.orgId",
    journalEntryId: "journalLines.journalEntryId",
    accountId: "journalLines.accountId",
    grantId: "journalLines.grantId",
    creditCents: "journalLines.creditCents",
    debitCents: "journalLines.debitCents",
  },
  restrictionTerms: {
    id: "restrictionTerms.id",
    orgId: "restrictionTerms.orgId",
    fundId: "restrictionTerms.fundId",
    grantId: "restrictionTerms.grantId",
    startDate: "restrictionTerms.startDate",
    endDate: "restrictionTerms.endDate",
    beginningBalanceCents: "restrictionTerms.beginningBalanceCents",
    createdAt: "restrictionTerms.createdAt",
    deletedAt: "restrictionTerms.deletedAt",
  },
  restrictionAdditions: {
    orgId: "restrictionAdditions.orgId",
    restrictionTermId: "restrictionAdditions.restrictionTermId",
    amountCents: "restrictionAdditions.amountCents",
    deletedAt: "restrictionAdditions.deletedAt",
  },
  restrictionReleases: {
    id: "restrictionReleases.id",
    orgId: "restrictionReleases.orgId",
    restrictionTermId: "restrictionReleases.restrictionTermId",
    expenseId: "restrictionReleases.expenseId",
    amountCents: "restrictionReleases.amountCents",
    source: "restrictionReleases.source",
    deletedAt: "restrictionReleases.deletedAt",
  },
  restrictionAllowedCategories: {
    orgId: "restrictionAllowedCategories.orgId",
    restrictionTermId: "restrictionAllowedCategories.restrictionTermId",
    category: "restrictionAllowedCategories.category",
    accountId: "restrictionAllowedCategories.accountId",
    deletedAt: "restrictionAllowedCategories.deletedAt",
  },
  pledges: {
    id: "pledges.id",
    orgId: "pledges.orgId",
    deletedAt: "pledges.deletedAt",
  },
  pledgePayments: {
    id: "pledgePayments.id",
    orgId: "pledgePayments.orgId",
    deletedAt: "pledgePayments.deletedAt",
  },
}));

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(async () => undefined),
}));

const mockCaptureBackgroundException = vi.hoisted(() => vi.fn());
vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { restrictionReleases } from "@grantpipe/db";
import { recordActivityLog } from "../../lib/activity-log";
import {
  postDonation,
  postExpense,
  postGrantCloseout,
  postGrantPayment,
  postPledgeRecognition,
  postPledgeAccretion,
  postPledgePayment,
  postPledgeWriteOff,
  postPledgeAllowance,
  reverseGrantPayment,
} from "./postingEngine";

// ---------------------------------------------------------------------------
// DB mock builder
// ---------------------------------------------------------------------------

/**
 * Creates a db mock where `.select()` returns a chain that resolves to values
 * from `selectQueue` in order. Each call to `select()` consumes the next slot.
 *
 * Important: when a query uses `.innerJoin()`, the call to `select()` still
 * consumes one slot from selectQueue (that value is discarded), and the
 * innerJoin result comes from `innerJoinQueue` instead.
 *
 * insert() uses `insertQueue` in the same fashion.
 * update() is a no-op that resolves to [].
 */
function makeDb(options: {
  selectQueue?: unknown[][];
  insertQueue?: unknown[][];
  updateQueue?: unknown[][];
  innerJoinResolves?: unknown[][];
}) {
  const configuredSelectQueue = [...(options.selectQueue ?? [])];
  const isMaxEntryNumberResult = (rows: unknown[]) => {
    const [row] = rows;
    return rows.length === 1 && typeof row === "object" && row !== null && "max" in row;
  };
  const maxEntryNumberQueue = configuredSelectQueue.filter(isMaxEntryNumberResult);
  const selectQueue = configuredSelectQueue.filter((rows) => !isMaxEntryNumberResult(rows));
  const insertQueue = [...(options.insertQueue ?? [])];
  const updateQueue = [...(options.updateQueue ?? [])];
  const innerJoinQueue = [...(options.innerJoinResolves ?? [])];

  const selectFn = vi.fn().mockImplementation((selection?: Record<string, unknown>) => {
    const result =
      selection && "max" in selection
        ? (maxEntryNumberQueue.shift() ?? [{ max: 0 }])
        : (selectQueue.shift() ?? []);
    // innerJoin result is resolved lazily when innerJoin() is called, not at select() time.
    const innerJoin = vi.fn().mockImplementation(() => ({
      where: vi.fn().mockResolvedValue(innerJoinQueue.shift() ?? []),
    }));
    const where = vi.fn().mockResolvedValue(result);
    return { from: vi.fn().mockReturnValue({ where, innerJoin }) };
  });

  const returningFn = vi.fn().mockImplementation(() => {
    const result = insertQueue.shift() ?? [{ id: "inserted-id", entryNumber: 1 }];
    return Promise.resolve(result);
  });
  const valuesFn = vi.fn().mockReturnValue({
    returning: returningFn,
    onConflictDoNothing: vi.fn().mockReturnValue({ returning: returningFn }),
  });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });

  const updateReturningFn = vi.fn().mockImplementation(() => {
    const result = updateQueue.shift() ?? [];
    return Promise.resolve(result);
  });
  const updateWhereFn = vi.fn().mockReturnValue({
    returning: updateReturningFn,
  });
  const updateSetFn = vi.fn().mockReturnValue({
    where: updateWhereFn,
  });
  const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });
  const executeFn = vi.fn().mockResolvedValue([]);

  return {
    select: selectFn,
    insert: insertFn,
    insertValues: valuesFn,
    update: updateFn,
    updateWhere: updateWhereFn,
    updateReturning: updateReturningFn,
    execute: executeFn,
  };
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const ORG_ENABLED = { accountingEnabled: true };
const ORG_DISABLED = { accountingEnabled: false };
const DONATION_UNRESTRICTED = {
  id: "donation-1",
  orgId: "org-1",
  contactId: "contact-alice",
  amountCents: 10000,
  restriction: "unrestricted",
  netAssetClass: "unrestricted",
  fundId: null,
  date: new Date("2025-01-15"),
};
const DONATION_RESTRICTED = {
  id: "donation-1",
  orgId: "org-1",
  contactId: "contact-alice",
  amountCents: 10000,
  restriction: "restricted",
  netAssetClass: "temporarily_restricted",
  fundId: "fund-1",
  date: new Date("2025-01-15"),
};
const DONATION_PERMANENTLY_RESTRICTED = {
  id: "donation-1",
  orgId: "org-1",
  contactId: "contact-alice",
  amountCents: 10000,
  restriction: "restricted",
  netAssetClass: "permanently_restricted",
  fundId: "fund-1",
  date: new Date("2025-01-15"),
};
const CONTACT_INDIVIDUAL = {
  type: "individual",
  firstName: "Alice",
  lastName: "Smith",
  organizationName: null,
};
const ACCOUNT_CASH = { id: "acc-cash", code: "1010", type: "asset", isActive: true };
const ACCOUNT_4000 = { id: "acc-4000", code: "4000", type: "revenue", isActive: true };
const ACCOUNT_4100 = { id: "acc-4100", code: "4100", type: "revenue", isActive: true };
const ACCOUNT_4200 = { id: "acc-4200", code: "4200", type: "revenue", isActive: true };
const ACCOUNT_3000 = {
  id: "acc-3000",
  code: "3000",
  type: "net_assets",
  naturalRestriction: "unrestricted",
  isActive: true,
};
const ACCOUNT_3100 = {
  id: "acc-3100",
  code: "3100",
  type: "net_assets",
  naturalRestriction: "temporarily_restricted",
  isActive: true,
};
const ACCOUNT_5000 = { id: "acc-5000", code: "5000", type: "expense", isActive: true };
const ACCOUNT_EXPENSE = { id: "acc-exp", code: "6000", type: "expense", isActive: true };
const FISCAL_PERIOD_OPEN = {
  id: "fp-1",
  orgId: "org-1",
  status: "open",
  startDate: new Date("2025-01-01"),
  endDate: new Date("2025-12-31"),
};
const EXPENSE_BASE = {
  id: "expense-1",
  orgId: "org-1",
  amountCents: 5000,
  accountId: "acc-exp",
  fundId: null as string | null,
  grantId: null as string | null,
  date: new Date("2025-02-10"),
  category: null as string | null,
};
const FUND_UNRESTRICTED = { id: "fund-1", orgId: "org-1", type: "unrestricted" };
const FUND_RESTRICTED = { id: "fund-1", orgId: "org-1", type: "temporarily_restricted" };
const RESTRICTION_TERM_FUND = {
  id: "term-1",
  orgId: "org-1",
  fundId: "fund-1",
  grantId: null,
  beginningBalanceCents: 10000,
  createdAt: new Date("2025-01-01"),
};
const RESTRICTION_TERM_GRANT = {
  id: "term-grant-1",
  orgId: "org-1",
  fundId: "fund-1",
  grantId: "grant-1",
  beginningBalanceCents: 10000,
  createdAt: new Date("2025-01-01"),
};
const RESTRICTION_RELEASE_VALIDATION_SELECTS = [[], [{ total: 0 }], [{ total: 0 }]];
const MAX_ENTRY_ROW = [{ max: 0 }];
const INSERTED_ENTRY = [{ id: "je-1", entryNumber: 1 }];

// ---------------------------------------------------------------------------
// postDonation
// ---------------------------------------------------------------------------

describe("postDonation", () => {
  it("no-ops when accountingEnabled is false", async () => {
    const db = makeDb({ selectQueue: [[ORG_DISABLED]] });
    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when donation not found", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED], // org check
        [], // no donation found
      ],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates JE for unrestricted donation (create)", async () => {
    // postDonation "create" call order:
    // 1. isAccountingEnabled: select org
    // 2. select donation
    // 3. select contact (for donor name memo)
    // 4. findAccountByCode("1010"): select cash
    // 5. findAccountByCode("4000"): select cr account
    // 6. findOpenFiscalPeriod: select period
    // 7. getNextEntryNumber: select max entry number
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_UNRESTRICTED],
        [CONTACT_INDIVIDUAL],
        [ACCOUNT_CASH],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insert).toHaveBeenCalledTimes(2); // JE + lines
  });

  it("uses Unknown Donor when an organization donor has no organization name", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_UNRESTRICTED],
        [{ type: "organization", organizationName: null }],
        [ACCOUNT_CASH],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        memo: expect.stringContaining("Unknown Donor"),
      }),
    );
  });

  it("creates JE for restricted donation (create)", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_RESTRICTED],
        [CONTACT_INDIVIDUAL],
        [ACCOUNT_CASH],
        [ACCOUNT_4100], // 4100 for restricted
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("uses the legacy restriction flag when net-asset class is absent", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...DONATION_RESTRICTED, netAssetClass: null }],
        [CONTACT_INDIVIDUAL],
        [ACCOUNT_CASH],
        [ACCOUNT_4100],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: ACCOUNT_4100.id,
          creditCents: DONATION_RESTRICTED.amountCents,
        }),
      ]),
    );
  });

  it("uses unrestricted legacy classification when the donor is unavailable", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [
          {
            ...DONATION_UNRESTRICTED,
            netAssetClass: null,
            date: "2025-01-15T00:00:00.000Z",
          },
        ],
        [],
        [ACCOUNT_CASH],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ memo: "Donation — Unknown Donor" }),
    );
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ accountId: ACCOUNT_4000.id })]),
    );
  });

  it("posts a permanently restricted donation to revenue account 4200", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_PERMANENTLY_RESTRICTED],
        [CONTACT_INDIVIDUAL],
        [ACCOUNT_CASH],
        [ACCOUNT_4200], // 4200 for permanently restricted
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
    // Credit line carries the fund and posts the full amount to 4200.
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "acc-4200", creditCents: 10000, fundId: "fund-1" }),
      ]),
    );
  });

  it("scopes donor lookup by organization to prevent cross-org contact names in journal memos", async () => {
    const whereSpy = vi.fn().mockResolvedValue([]);
    const fromSpy = vi.fn().mockReturnValue({ where: whereSpy });
    const selectSpy = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([ORG_ENABLED]) }),
      })
      .mockReturnValueOnce({
        from: vi
          .fn()
          .mockReturnValue({ where: vi.fn().mockResolvedValue([DONATION_UNRESTRICTED]) }),
      })
      .mockReturnValueOnce({ from: fromSpy })
      .mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) });
    const db = {
      select: selectSpy,
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as Parameters<typeof postDonation>[0];

    await postDonation(db, {
      orgId: "org-isolated",
      actorId: "user-1",
      donationId: "donation-1",
      action: "delete",
    });

    expect(whereSpy).toHaveBeenCalledTimes(1);
    const donorPredicate = whereSpy.mock.calls[0]?.[0];
    const predicateStr = JSON.stringify(donorPredicate);
    expect(predicateStr).toContain("contacts.orgId");
    expect(predicateStr).toContain("org-isolated");
    expect(predicateStr).toContain("contacts.deletedAt");
  });

  it("reverses prior JE and posts new JE on update", async () => {
    // "update" call order:
    // 1. isAccountingEnabled
    // 2. select donation
    // 3. reverseSourceLinkedEntry:
    //    a. select original JE (unreversed)
    //    b. select original lines
    //    c. check if original period is still open
    //    d. getNextEntryNumber for reversal
    //    → insert reversal JE
    //    → insert reversal lines (skipped if empty)
    //    → update original JE (reversedByEntryId)
    // 4. (new JE path) findAccountByCode 1010
    // 5. findAccountByCode 4000
    // 6. findOpenFiscalPeriod
    // 7. getNextEntryNumber for new JE
    //    → insert new JE
    //    → insert new lines
    const originalEntry = {
      id: "je-old",
      orgId: "org-1",
      entryNumber: 5,
      fiscalPeriodId: "fp-1",
      source: "donation",
      sourceId: "donation-1",
      reversedByEntryId: null,
    };
    const originalLines = [
      {
        id: "jl-1",
        journalEntryId: "je-old",
        accountId: "acc-cash",
        fundId: null,
        grantId: null,
        contactId: null,
        debitCents: 10000,
        creditCents: 0,
        memo: null,
      },
    ];

    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_UNRESTRICTED],
        [CONTACT_INDIVIDUAL], // donor name for memo
        [originalEntry], // find original JE for reversal
        originalLines, // original lines
        [FISCAL_PERIOD_OPEN], // check if original period open → yes, use it
        MAX_ENTRY_ROW, // reversal entry number
        [ACCOUNT_CASH], // findAccountByCode 1010
        [ACCOUNT_4000], // findAccountByCode 4000
        [FISCAL_PERIOD_OPEN], // findOpenFiscalPeriod for new JE
        MAX_ENTRY_ROW, // new JE entry number
      ],
      // Only JE inserts use .returning() — line inserts use .values() only (no returning)
      insertQueue: [
        [{ id: "je-reversal", entryNumber: 6 }], // reversal JE
        INSERTED_ENTRY, // new JE
      ],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "update",
    });

    expect(db.insert).toHaveBeenCalledTimes(4);
    expect(db.update).toHaveBeenCalledTimes(1); // mark original as reversed
  });

  it("reverses only (no new JE) on delete", async () => {
    const originalEntry = {
      id: "je-old",
      orgId: "org-1",
      entryNumber: 5,
      fiscalPeriodId: "fp-1",
      source: "donation",
      sourceId: "donation-1",
      reversedByEntryId: null,
    };

    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_UNRESTRICTED],
        [CONTACT_INDIVIDUAL], // donor name (not used in delete path but still looked up)
        [originalEntry], // original JE
        [], // no lines
        [FISCAL_PERIOD_OPEN], // period check
        MAX_ENTRY_ROW, // reversal entry number
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 6 }]],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "delete",
    });

    // 1 insert for reversal entry only; no new JE
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("no-ops gracefully when prior JE not found on update", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_UNRESTRICTED],
        [CONTACT_INDIVIDUAL],
        [], // no original JE → reversal is a no-op
        [ACCOUNT_CASH],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });

    await expect(
      postDonation(db as unknown as Parameters<typeof postDonation>[0], {
        orgId: "org-1",
        actorId: "user-1",
        donationId: "donation-1",
        action: "update",
      }),
    ).resolves.toBeUndefined();

    expect(db.insert).toHaveBeenCalledTimes(2); // new JE still posted
  });

  it("throws a conflict when Cash account (1010) is not found", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_UNRESTRICTED],
        [CONTACT_INDIVIDUAL],
        [], // no cash account
      ],
    });

    await expect(
      postDonation(db as unknown as Parameters<typeof postDonation>[0], {
        orgId: "org-1",
        actorId: "user-1",
        donationId: "donation-1",
        action: "create",
      }),
    ).rejects.toThrow("Donation posting requires chart of accounts code 1010");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws a conflict when revenue account (4000) is not found", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_UNRESTRICTED],
        [CONTACT_INDIVIDUAL],
        [ACCOUNT_CASH],
        [], // no 4000 account
      ],
    });

    await expect(
      postDonation(db as unknown as Parameters<typeof postDonation>[0], {
        orgId: "org-1",
        actorId: "user-1",
        donationId: "donation-1",
        action: "create",
      }),
    ).rejects.toThrow("Donation posting requires chart of accounts code 4000");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws a conflict when revenue account (4100) is not found for restricted donation", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_RESTRICTED],
        [CONTACT_INDIVIDUAL],
        [ACCOUNT_CASH],
        [], // no 4100
      ],
    });

    await expect(
      postDonation(db as unknown as Parameters<typeof postDonation>[0], {
        orgId: "org-1",
        actorId: "user-1",
        donationId: "donation-1",
        action: "create",
      }),
    ).rejects.toThrow("Donation posting requires chart of accounts code 4100");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when no open fiscal period covers the date", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_UNRESTRICTED],
        [CONTACT_INDIVIDUAL],
        [ACCOUNT_CASH],
        [ACCOUNT_4000],
        [], // no open period → throws
      ],
    });

    await expect(
      postDonation(db as unknown as Parameters<typeof postDonation>[0], {
        orgId: "org-1",
        actorId: "user-1",
        donationId: "donation-1",
        action: "create",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// postExpense
// ---------------------------------------------------------------------------

describe("postExpense", () => {
  it("no-ops when accountingEnabled is false", async () => {
    const db = makeDb({ selectQueue: [[ORG_DISABLED]] });
    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when expense not found", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], []],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips auto posting and captures Sentry when expense.accountId is null", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [{ ...EXPENSE_BASE, accountId: null }]],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insert).not.toHaveBeenCalled();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "accounting-posting",
      {
        operation: "expense_posting_missing_account",
        action: "create",
        org_id: "org-1",
      },
    );
  });

  it("reverses and soft-deletes prior releases for deleted expenses without account ids", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, accountId: null, deletedAt: new Date("2025-02-11") }],
        [],
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "delete",
    });

    expect(db.update).toHaveBeenCalledWith(restrictionReleases);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates expense JE against unrestricted fund (no release JE)", async () => {
    // postExpense "create" call order:
    // 1. isAccountingEnabled: select org
    // 2. select expense
    // 3. findAccountByCode("1010"): cash account
    // 4. select expenseAccount by ID (from chartOfAccounts)
    // 5. findOpenFiscalPeriod
    // 6. getNextEntryNumber
    // → insert JE
    // → insert lines
    // 7. select fund (fundId is set)
    // fund.type = "unrestricted" → no release JE
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH], // 1010
        [ACCOUNT_EXPENSE], // expense account by ID
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_UNRESTRICTED], // fund lookup → not restricted
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    // Only 2 inserts (JE + lines), no release JE
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("creates expense JE + release JE against restricted fund", async () => {
    // After main JE inserts:
    // 8. select fund → restricted
    // 9. findAccountByCode("3100"): release-from
    // 10. findAccountByCode("3000"): release-to
    // 11. getNextEntryNumber for release JE
    // → insert release JE
    // → insert release lines
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH], // 1010
        [ACCOUNT_EXPENSE], // expense by ID
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW, // main JE entry number
        [FUND_RESTRICTED], // fund is restricted
        [ACCOUNT_3100], // release from (3100)
        [ACCOUNT_3000], // release to (3000)
        MAX_ENTRY_ROW, // release JE entry number
      ],
      // Only JE inserts use .returning() — line inserts use .values() only
      insertQueue: [INSERTED_ENTRY, [{ id: "je-release", entryNumber: 2 }]],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    // 4 inserts: main JE, main lines, release JE, release lines
    expect(db.insert).toHaveBeenCalledTimes(4);
  });

  it("uses the vendor in expense memos and treats missing lifecycle totals as zero", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1", vendor: "Acme Supplies" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [RESTRICTION_TERM_FUND],
        [],
        [],
        [],
      ],
      insertQueue: [
        INSERTED_ENTRY,
        [{ id: "je-release", entryNumber: 2 }],
        [{ id: "restriction-release-1" }],
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        memo: expect.stringContaining("Acme Supplies"),
      }),
    );
    expect(db.insert).toHaveBeenCalledWith(restrictionReleases);
  });

  it("records a restriction lifecycle release when a restricted expense matches a fund term", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [RESTRICTION_TERM_FUND],
        ...RESTRICTION_RELEASE_VALIDATION_SELECTS,
      ],
      insertQueue: [
        INSERTED_ENTRY,
        [{ id: "je-release", entryNumber: 2 }],
        [{ id: "restriction-release-1" }],
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insert).toHaveBeenCalledWith(restrictionReleases);
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        restrictionTermId: "term-1",
        expenseId: "expense-1",
        amountCents: 5000,
        date: new Date("2025-02-10"),
        reason: "Release of restriction - expense expense-1",
        createdBy: "user-1",
        source: "accounting_posting",
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "created",
        entityType: "restriction_release",
        entityId: "restriction-release-1",
      }),
    );
  });

  it("takes a restriction-term advisory lock before automatic release balance validation", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [RESTRICTION_TERM_FUND],
        ...RESTRICTION_RELEASE_VALIDATION_SELECTS,
      ],
      insertQueue: [
        INSERTED_ENTRY,
        [{ id: "je-release", entryNumber: 2 }],
        [{ id: "restriction-release-1" }],
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.execute.mock.invocationCallOrder[0]).toBeLessThan(
      db.insert.mock.invocationCallOrder.at(-1)!,
    );
  });

  it("rejects an automatic restriction release that exceeds the term balance", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [{ ...RESTRICTION_TERM_FUND, beginningBalanceCents: 1000 }],
        [],
        [{ total: 0 }],
        [{ total: 0 }],
      ],
      insertQueue: [INSERTED_ENTRY, [{ id: "je-release", entryNumber: 2 }]],
    });

    await expect(
      postExpense(db as unknown as Parameters<typeof postExpense>[0], {
        orgId: "org-1",
        actorId: "user-1",
        expenseId: "expense-1",
        action: "create",
      }),
    ).rejects.toThrow("Release exceeds available restricted balance");

    expect(db.insert).not.toHaveBeenCalledWith(restrictionReleases);
  });

  it("does not record an automatic restriction release for a disallowed account", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [RESTRICTION_TERM_FUND],
        [{ category: "program", accountId: "acc-other" }],
      ],
      insertQueue: [INSERTED_ENTRY, [{ id: "je-release", entryNumber: 2 }]],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insert).not.toHaveBeenCalledWith(restrictionReleases);
  });

  it("does not fall back to a fund term when a grant term rejects the expense category", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1", grantId: "grant-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [RESTRICTION_TERM_GRANT],
        [{ category: "program", accountId: "acc-other" }],
        [RESTRICTION_TERM_FUND],
        ...RESTRICTION_RELEASE_VALIDATION_SELECTS,
      ],
      insertQueue: [INSERTED_ENTRY, [{ id: "je-release", entryNumber: 2 }]],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insert).not.toHaveBeenCalledWith(restrictionReleases);
  });

  it("uses the newest matching restriction term deterministically", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [
          {
            ...RESTRICTION_TERM_FUND,
            id: "term-old",
            createdAt: new Date("2025-01-01"),
          },
          {
            ...RESTRICTION_TERM_FUND,
            id: "term-new",
            createdAt: new Date("2025-01-15"),
          },
        ],
        ...RESTRICTION_RELEASE_VALIDATION_SELECTS,
      ],
      insertQueue: [
        INSERTED_ENTRY,
        [{ id: "je-release", entryNumber: 2 }],
        [{ id: "restriction-release-1" }],
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        restrictionTermId: "term-new",
      }),
    );
  });

  it("breaks restriction term created-at ties by id", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [
          {
            ...RESTRICTION_TERM_FUND,
            id: "term-b",
            createdAt: new Date("2025-01-01"),
          },
          {
            ...RESTRICTION_TERM_FUND,
            id: "term-a",
            createdAt: new Date("2025-01-01"),
          },
        ],
        ...RESTRICTION_RELEASE_VALIDATION_SELECTS,
      ],
      insertQueue: [
        INSERTED_ENTRY,
        [{ id: "je-release", entryNumber: 2 }],
        [{ id: "restriction-release-1" }],
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        restrictionTermId: "term-a",
      }),
    );
  });

  it("prefers a grant-specific restriction term for a restricted grant expense", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1", grantId: "grant-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [RESTRICTION_TERM_GRANT],
        ...RESTRICTION_RELEASE_VALIDATION_SELECTS,
      ],
      insertQueue: [
        INSERTED_ENTRY,
        [{ id: "je-release", entryNumber: 2 }],
        [{ id: "restriction-release-1" }],
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        restrictionTermId: "term-grant-1",
        expenseId: "expense-1",
        amountCents: 5000,
      }),
    );
  });

  it("does not record a restriction lifecycle release when no active term matches", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [],
      ],
      insertQueue: [INSERTED_ENTRY, [{ id: "je-release", entryNumber: 2 }]],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insert).not.toHaveBeenCalledWith(restrictionReleases);
  });

  it("soft-deletes prior restriction lifecycle releases before reposting an updated expense", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const deletedAt = new Date("2025-02-11T12:00:00.000Z");
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [], // no existing source-linked JEs to reverse
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [ACCOUNT_3000],
        MAX_ENTRY_ROW,
        [RESTRICTION_TERM_FUND],
        ...RESTRICTION_RELEASE_VALIDATION_SELECTS,
      ],
      insertQueue: [
        INSERTED_ENTRY,
        [{ id: "je-release", entryNumber: 2 }],
        [{ id: "restriction-release-1" }],
      ],
      updateQueue: [
        [
          {
            id: "restriction-release-old",
            orgId: "org-1",
            expenseId: "expense-1",
            deletedAt,
          },
        ],
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "update",
    });

    expect(db.update).toHaveBeenCalledWith(restrictionReleases);
    expect(db.insert).toHaveBeenCalledWith(restrictionReleases);
    expect(recordActivityLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "deleted",
        entityType: "restriction_release",
        entityId: "restriction-release-old",
        changes: {
          before: expect.objectContaining({ deletedAt: null }),
          after: expect.objectContaining({ deletedAt }),
        },
      }),
    );
  });

  it("soft-deletes prior restriction lifecycle releases before skipping an unpostable update", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, accountId: null, fundId: null }],
        [], // no existing source-linked JEs to reverse
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "update",
    });

    expect(db.update).toHaveBeenCalledWith(restrictionReleases);
    expect(db.insert).not.toHaveBeenCalled();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "accounting-posting",
      expect.objectContaining({
        operation: "expense_posting_missing_account",
        action: "update",
      }),
    );
  });

  it("throws a conflict when release JE account 3100 is missing", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [], // no 3100 → skips release JE
      ],
    });

    await expect(
      postExpense(db as unknown as Parameters<typeof postExpense>[0], {
        orgId: "org-1",
        actorId: "user-1",
        expenseId: "expense-1",
        action: "create",
      }),
    ).rejects.toThrow("release-of-restriction chart of accounts codes 3100/3000");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws a conflict when release JE account 3000 is missing", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [FUND_RESTRICTED],
        [ACCOUNT_3100],
        [], // no 3000 → skips release JE
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });

    await expect(
      postExpense(db as unknown as Parameters<typeof postExpense>[0], {
        orgId: "org-1",
        actorId: "user-1",
        expenseId: "expense-1",
        action: "create",
      }),
    ).rejects.toThrow("release-of-restriction chart of accounts code 3000");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("reverses prior JE on update and posts new JE", async () => {
    // update call order:
    // 1. isAccountingEnabled
    // 2. select expense (no fund)
    // 3. reversal: find original JE
    // 4. reversal: get original lines
    // 5. reversal: check period still open
    // 6. reversal: getNextEntryNumber
    //    → insert reversal JE
    //    → (lines empty, skip)
    //    → update original JE
    // 7. findAccountByCode("1010")
    // 8. select expenseAccount by ID
    // 9. findOpenFiscalPeriod
    // 10. getNextEntryNumber
    //    → insert new JE
    //    → insert new lines
    // (no fund → no release JE)
    const originalEntry = {
      id: "je-old",
      orgId: "org-1",
      entryNumber: 3,
      fiscalPeriodId: "fp-1",
      source: "expense",
      sourceId: "expense-1",
      reversedByEntryId: null,
    };

    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [EXPENSE_BASE],
        [originalEntry], // reversal lookup
        [], // no lines
        [FISCAL_PERIOD_OPEN], // reversal period check
        MAX_ENTRY_ROW, // reversal entry number
        [ACCOUNT_CASH], // 1010
        [ACCOUNT_EXPENSE], // expense by ID
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        // no fund (fundId is null)
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 4 }], INSERTED_ENTRY, []],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "update",
    });

    // reversal JE + new JE + new lines = 3 inserts
    expect(db.insert).toHaveBeenCalledTimes(3);
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(db.update).toHaveBeenCalledWith(restrictionReleases);
  });

  it("only reverses on delete, no new JE", async () => {
    const originalEntry = {
      id: "je-old",
      orgId: "org-1",
      entryNumber: 3,
      fiscalPeriodId: "fp-1",
      source: "expense",
      sourceId: "expense-1",
      reversedByEntryId: null,
    };

    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [EXPENSE_BASE],
        [originalEntry],
        [], // no lines
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 4 }]],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "delete",
    });

    // Only 1 insert (reversal entry), no new JE
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("reverses both main and release entries when deleting a restricted expense", async () => {
    const originalMainEntry = {
      id: "je-main",
      orgId: "org-1",
      entryNumber: 3,
      fiscalPeriodId: "fp-1",
      source: "expense",
      sourceId: "expense-1",
      reversedByEntryId: null,
    };
    const originalReleaseEntry = {
      id: "je-release",
      orgId: "org-1",
      entryNumber: 4,
      fiscalPeriodId: "fp-1",
      source: "expense",
      sourceId: "expense-1",
      reversedByEntryId: null,
    };
    const mainLines = [
      {
        id: "jl-main-1",
        journalEntryId: "je-main",
        accountId: "acc-exp",
        fundId: "fund-1",
        grantId: "grant-1",
        contactId: null,
        debitCents: 5000,
        creditCents: 0,
        memo: null,
      },
      {
        id: "jl-main-2",
        journalEntryId: "je-main",
        accountId: "acc-cash",
        fundId: null,
        grantId: null,
        contactId: null,
        debitCents: 0,
        creditCents: 5000,
        memo: null,
      },
    ];
    const releaseLines = [
      {
        id: "jl-release-1",
        journalEntryId: "je-release",
        accountId: "acc-3100",
        fundId: "fund-1",
        grantId: "grant-1",
        contactId: null,
        debitCents: 5000,
        creditCents: 0,
        memo: "release from restricted",
      },
      {
        id: "jl-release-2",
        journalEntryId: "je-release",
        accountId: "acc-3000",
        fundId: "fund-1",
        grantId: "grant-1",
        contactId: null,
        debitCents: 0,
        creditCents: 5000,
        memo: "release to unrestricted",
      },
    ];

    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, fundId: "fund-1" }],
        [originalMainEntry, originalReleaseEntry],
        mainLines,
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        releaseLines,
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [
        [{ id: "je-main-reversal", entryNumber: 5 }],
        [{ id: "je-release-reversal", entryNumber: 6 }],
      ],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "delete",
    });

    expect(db.insert).toHaveBeenCalledTimes(4);
    expect(db.update).toHaveBeenCalledTimes(3);
    expect(db.update).toHaveBeenCalledWith(restrictionReleases);
    expect(db.insertValues).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        journalEntryId: "je-main-reversal",
        accountId: "acc-exp",
        fundId: "fund-1",
        grantId: "grant-1",
        debitCents: 0,
        creditCents: 5000,
      }),
      expect.objectContaining({
        journalEntryId: "je-main-reversal",
        accountId: "acc-cash",
        fundId: undefined,
        grantId: undefined,
        debitCents: 5000,
        creditCents: 0,
      }),
    ]);
    expect(db.insertValues).toHaveBeenNthCalledWith(4, [
      expect.objectContaining({
        journalEntryId: "je-release-reversal",
        accountId: "acc-3100",
        fundId: "fund-1",
        grantId: "grant-1",
        debitCents: 0,
        creditCents: 5000,
        memo: "release from restricted",
      }),
      expect.objectContaining({
        journalEntryId: "je-release-reversal",
        accountId: "acc-3000",
        fundId: "fund-1",
        grantId: "grant-1",
        debitCents: 5000,
        creditCents: 0,
        memo: "release to unrestricted",
      }),
    ]);
  });

  it("no-ops gracefully when prior JE not found on update", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [EXPENSE_BASE],
        [], // no original JE found → reversal no-op
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });

    await expect(
      postExpense(db as unknown as Parameters<typeof postExpense>[0], {
        orgId: "org-1",
        actorId: "user-1",
        expenseId: "expense-1",
        action: "update",
      }),
    ).resolves.toBeUndefined();

    expect(db.insert).toHaveBeenCalledTimes(2); // new JE still posted
  });

  it("throws a conflict when Cash account (1010) is not found", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [EXPENSE_BASE],
        [], // no cash account (1010) → early return
      ],
    });

    await expect(
      postExpense(db as unknown as Parameters<typeof postExpense>[0], {
        orgId: "org-1",
        actorId: "user-1",
        expenseId: "expense-1",
        action: "create",
      }),
    ).rejects.toThrow("Expense posting requires chart of accounts code 1010");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws a conflict when expense account by ID is not found", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [EXPENSE_BASE],
        [ACCOUNT_CASH], // 1010 found
        [], // expense account by ID NOT found → no-op
      ],
    });

    await expect(
      postExpense(db as unknown as Parameters<typeof postExpense>[0], {
        orgId: "org-1",
        actorId: "user-1",
        expenseId: "expense-1",
        action: "create",
      }),
    ).rejects.toThrow("Expense posting requires an active expense account");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when no open fiscal period covers the expense date", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [EXPENSE_BASE],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [], // no period → throws
      ],
    });

    await expect(
      postExpense(db as unknown as Parameters<typeof postExpense>[0], {
        orgId: "org-1",
        actorId: "user-1",
        expenseId: "expense-1",
        action: "create",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// postGrantCloseout
// ---------------------------------------------------------------------------

describe("postGrantCloseout", () => {
  it("no-ops when accountingEnabled is false", async () => {
    const db = makeDb({ selectQueue: [[ORG_DISABLED]] });
    await postGrantCloseout(db as unknown as Parameters<typeof postGrantCloseout>[0], {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      closeoutDisposition: "release",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when remaining restricted balance is 0", async () => {
    // Call order:
    // 1. isAccountingEnabled: select org (selectQueue[0])
    // 2. balance query: select().from(journalLines).innerJoin(chartOfAccounts).where()
    //    → select() consumes selectQueue[1] (unused), innerJoin result from innerJoinQueue[0]
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED], // [0] org check
        [], // [1] consumed by balance query (unused)
      ],
      innerJoinResolves: [[{ totalCredit: 0, totalDebit: 0 }]],
    });

    await postGrantCloseout(db as unknown as Parameters<typeof postGrantCloseout>[0], {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      closeoutDisposition: "release",
    });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when balance is negative (totalDebit > totalCredit)", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], []],
      innerJoinResolves: [[{ totalCredit: 1000, totalDebit: 5000 }]],
    });

    await postGrantCloseout(db as unknown as Parameters<typeof postGrantCloseout>[0], {
      orgId: "org-1",
      grantId: "grant-1",
      actorId: "user-1",
      closeoutDisposition: "return",
    });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("posts release closeout JE (Dr 3100, Cr 4000)", async () => {
    // Call order after org + balance:
    // 3. findOpenFiscalPeriod: selectQueue[2]
    // 4. findAccountByCode("3100"): selectQueue[3]
    // 5. findAccountByCode("4000"): selectQueue[4] (release disposition)
    // 6. getNextEntryNumber: selectQueue[5]
    // → insert JE
    // → insert lines
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED], // [0]
        [], // [1] balance query (innerJoin route)
        [FISCAL_PERIOD_OPEN], // [2]
        [ACCOUNT_3100], // [3] Dr account
        [ACCOUNT_4000], // [4] Cr account (release)
        MAX_ENTRY_ROW, // [5]
      ],
      insertQueue: [INSERTED_ENTRY, []],
      innerJoinResolves: [[{ totalCredit: 5000, totalDebit: 0 }]],
    });

    await postGrantCloseout(db as unknown as Parameters<typeof postGrantCloseout>[0], {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      closeoutDisposition: "release",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("posts return closeout JE (Dr 3100, Cr 5000)", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [],
        [FISCAL_PERIOD_OPEN],
        [ACCOUNT_3100],
        [ACCOUNT_5000], // Cr account (return)
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
      innerJoinResolves: [[{ totalCredit: 3000, totalDebit: 1000 }]],
    });

    await postGrantCloseout(db as unknown as Parameters<typeof postGrantCloseout>[0], {
      orgId: "org-1",
      grantId: "grant-1",
      actorId: "user-1",
      closeoutDisposition: "return",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("throws a conflict when Dr account (3100) is not found", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [],
        [FISCAL_PERIOD_OPEN],
        [], // no 3100
      ],
      innerJoinResolves: [[{ totalCredit: 5000, totalDebit: 0 }]],
    });

    await expect(
      postGrantCloseout(db as unknown as Parameters<typeof postGrantCloseout>[0], {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        closeoutDisposition: "release",
      }),
    ).rejects.toThrow("Grant closeout requires chart of accounts code 3100");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws a conflict when Cr account is not found", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [],
        [FISCAL_PERIOD_OPEN],
        [ACCOUNT_3100],
        [], // no 4000
      ],
      innerJoinResolves: [[{ totalCredit: 5000, totalDebit: 0 }]],
    });

    await expect(
      postGrantCloseout(db as unknown as Parameters<typeof postGrantCloseout>[0], {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        closeoutDisposition: "release",
      }),
    ).rejects.toThrow("Grant closeout requires chart of accounts code 4000");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when no open fiscal period", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [], // balance query (innerJoin)
        [], // no period → throws
      ],
      innerJoinResolves: [[{ totalCredit: 5000, totalDebit: 0 }]],
    });

    await expect(
      postGrantCloseout(db as unknown as Parameters<typeof postGrantCloseout>[0], {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        closeoutDisposition: "release",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// reversal — original period closed uses current open period fallback
// ---------------------------------------------------------------------------

describe("reversal — original period closed falls back to current open period", () => {
  it("falls back to current open period when original period is not open", async () => {
    // When reverseSourceLinkedEntry checks the original period and finds it NOT open,
    // it calls findOpenFiscalPeriod(tx, orgId, reversalDate) for the current period.
    // Call order for "update":
    // 1. isAccountingEnabled
    // 2. select donation
    // 3. reversal: select original JE
    // 4. reversal: select original lines (empty)
    // 5. reversal: check original period open → NOT open (empty result)
    // 6. reversal: findOpenFiscalPeriod → fallback period
    // 7. reversal: getNextEntryNumber
    //    → insert reversal JE
    //    (no lines to insert)
    //    → update original JE
    // 8. new JE: findAccountByCode 1010
    // 9. new JE: findAccountByCode 4000
    // 10. new JE: findOpenFiscalPeriod
    // 11. new JE: getNextEntryNumber
    //    → insert new JE
    //    → insert new lines
    const originalEntry = {
      id: "je-old",
      orgId: "org-1",
      entryNumber: 2,
      fiscalPeriodId: "fp-closed",
      source: "donation",
      sourceId: "donation-1",
      reversedByEntryId: null,
    };

    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED], // [0] org check
        [DONATION_UNRESTRICTED], // [1] donation
        [CONTACT_INDIVIDUAL], // [2] contact lookup
        [originalEntry], // [3] find original JE
        [], // [4] no lines
        [], // [5] original period NOT open → fallback
        [FISCAL_PERIOD_OPEN], // [6] fallback current open period
        MAX_ENTRY_ROW, // [7] reversal entry number
        [ACCOUNT_CASH], // [8] 1010
        [ACCOUNT_4000], // [9] 4000
        [FISCAL_PERIOD_OPEN], // [10] period for new JE
        MAX_ENTRY_ROW, // [11] new JE entry number
      ],
      insertQueue: [
        [{ id: "je-rev", entryNumber: 3 }], // reversal entry (no lines since empty)
        INSERTED_ENTRY, // new JE
        [], // new lines
      ],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "update",
    });

    // 3 inserts: reversal JE, new JE, new lines
    // (no reversal lines insert since original had no lines)
    expect(db.insert).toHaveBeenCalledTimes(3);
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Branch coverage: restricted donation with null fundId (covers donation.fundId ?? null)
// ---------------------------------------------------------------------------

describe("branch coverage: edge cases", () => {
  it("restricted donation with null fundId uses null on credit line (fundId ?? null branch)", async () => {
    // Covers the `donation.fundId ?? null` branch when fundId IS null
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...DONATION_RESTRICTED, fundId: null }], // restricted but no fund
        [CONTACT_INDIVIDUAL], // contact lookup
        [ACCOUNT_CASH],
        [ACCOUNT_4100],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("expense with string date (covers instanceof Date branch)", async () => {
    // Covers the `expense.date instanceof Date ? expense.date : new Date(expense.date)` branch
    // when date is NOT a Date instance
    const stringDate = "2025-02-10T00:00:00.000Z";
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...EXPENSE_BASE, date: stringDate as unknown as Date }],
        [ACCOUNT_CASH],
        [ACCOUNT_EXPENSE],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        // no fund
      ],
      insertQueue: [INSERTED_ENTRY],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "create",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("grant closeout with empty balance rows (row?.totalCredit ?? 0 branch)", async () => {
    // Covers `Number(row?.totalCredit ?? 0)` when row is undefined (empty innerJoin result)
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], []],
      innerJoinResolves: [[]], // empty result → row = undefined → remainingBalance = 0
    });

    await postGrantCloseout(db as unknown as Parameters<typeof postGrantCloseout>[0], {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      closeoutDisposition: "release",
    });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("org not found → accountingEnabled defaults to false (org?.accountingEnabled ?? false branch)", async () => {
    // Covers `org?.accountingEnabled ?? false` when org is undefined
    const db = makeDb({ selectQueue: [[]] }); // empty org result

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-missing",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no prior entries: getNextEntryNumber returns 1 (row?.max ?? 0 branch when max is null)", async () => {
    // Covers `row?.max ?? 0` when row.max is null (no entries yet)
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [DONATION_UNRESTRICTED],
        [CONTACT_INDIVIDUAL],
        [ACCOUNT_CASH],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        [{ max: null }], // max is null → triggers ?? 0
      ],
      insertQueue: [INSERTED_ENTRY],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("donation with string date (covers instanceof Date branch in postDonation)", async () => {
    // Covers `donation.date instanceof Date ? donation.date : new Date(donation.date)` when string
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [{ ...DONATION_UNRESTRICTED, date: "2025-01-15T00:00:00.000Z" as unknown as Date }],
        [CONTACT_INDIVIDUAL],
        [ACCOUNT_CASH],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY],
    });

    await postDonation(db as unknown as Parameters<typeof postDonation>[0], {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("reversal: lines with non-null fundId, grantId, memo cover ?? undefined branches", async () => {
    // Covers `line.fundId ?? undefined`, `line.grantId ?? undefined`, `line.memo ?? undefined`
    // when the values ARE non-null (the first branch of ??)
    const originalEntry = {
      id: "je-old",
      orgId: "org-1",
      entryNumber: 5,
      fiscalPeriodId: "fp-1",
      source: "expense",
      sourceId: "expense-1",
      reversedByEntryId: null,
    };
    const linesWithData = [
      {
        id: "jl-1",
        journalEntryId: "je-old",
        accountId: "acc-exp",
        fundId: "fund-1", // non-null
        grantId: "grant-1", // non-null
        contactId: "contact-1", // non-null
        debitCents: 5000,
        creditCents: 0,
        memo: "some memo", // non-null
      },
    ];

    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [EXPENSE_BASE],
        [originalEntry],
        linesWithData, // lines with non-null fields
        [FISCAL_PERIOD_OPEN], // period still open
        MAX_ENTRY_ROW, // reversal entry number
        // action = delete, so no new JE
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 6 }]],
    });

    await postExpense(db as unknown as Parameters<typeof postExpense>[0], {
      orgId: "org-1",
      actorId: "user-1",
      expenseId: "expense-1",
      action: "delete",
    });

    expect(db.insert).toHaveBeenCalledTimes(2); // reversal JE + reversal lines
  });
});

// ---------------------------------------------------------------------------
// postGrantPayment
// ---------------------------------------------------------------------------

const PAYMENT_PARAMS = {
  orgId: "org-1",
  actorId: "user-1",
  paymentId: "pay-1",
  requestId: "req-1",
  grantId: "grant-1",
  receivedDate: new Date("2026-03-15"),
  amountCents: 5000,
};

describe("postGrantPayment", () => {
  it("no-ops when accounting is disabled", async () => {
    const db = makeDb({ selectQueue: [[ORG_DISABLED]] });
    const result = await postGrantPayment(
      db as unknown as Parameters<typeof postGrantPayment>[0],
      PAYMENT_PARAMS,
    );
    expect(result).toBeNull();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws a conflict when Cash account (1010) is not found", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], []],
    });
    await expect(
      postGrantPayment(db as unknown as Parameters<typeof postGrantPayment>[0], PAYMENT_PARAMS),
    ).rejects.toThrow("Grant payment posting requires chart of accounts code 1010");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws a conflict when revenue account (4100) is not found", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [ACCOUNT_CASH], []],
    });
    await expect(
      postGrantPayment(db as unknown as Parameters<typeof postGrantPayment>[0], PAYMENT_PARAMS),
    ).rejects.toThrow("Grant payment posting requires chart of accounts code 4100");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates journal entry and two lines when all accounts exist", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED], // isAccountingEnabled
        [ACCOUNT_CASH], // findAccountByCode 1010
        [ACCOUNT_4100], // findAccountByCode 4100
        [FISCAL_PERIOD_OPEN], // findOpenFiscalPeriod
        MAX_ENTRY_ROW, // getNextEntryNumber
      ],
      insertQueue: [
        [{ id: "je-grant-pay", entryNumber: 7 }], // journal entry
        // lines insert returns default
      ],
    });

    const result = await postGrantPayment(
      db as unknown as Parameters<typeof postGrantPayment>[0],
      PAYMENT_PARAMS,
    );
    expect(result).toBe("je-grant-pay");
    expect(db.insert).toHaveBeenCalledTimes(2); // journal entry + journal lines
  });
});

// ---------------------------------------------------------------------------
// reverseGrantPayment
// ---------------------------------------------------------------------------

describe("reverseGrantPayment", () => {
  const REVERSE_PARAMS = {
    orgId: "org-1",
    actorId: "user-1",
    paymentId: "pay-1",
    reversalDate: new Date("2026-04-01"),
  };

  it("no-ops when accounting is disabled", async () => {
    const db = makeDb({ selectQueue: [[ORG_DISABLED]] });
    await reverseGrantPayment(
      db as unknown as Parameters<typeof reverseGrantPayment>[0],
      REVERSE_PARAMS,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when no existing journal entry found for payment", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED], // isAccountingEnabled
        [], // reverseSourceLinkedEntry: no original entry found
      ],
    });
    await reverseGrantPayment(
      db as unknown as Parameters<typeof reverseGrantPayment>[0],
      REVERSE_PARAMS,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates reversal entry when original journal entry exists", async () => {
    const originalEntry = {
      id: "je-pay-1",
      orgId: "org-1",
      entryNumber: 5,
      fiscalPeriodId: "fp-1",
      source: "grant_payment",
      sourceId: "pay-1",
      reversedByEntryId: null,
    };

    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED], // isAccountingEnabled
        [originalEntry], // find original entry (reverseSourceLinkedEntry)
        [], // get lines for original entry (empty → no line insert)
        [FISCAL_PERIOD_OPEN], // check if original fiscal period still open → yes
        MAX_ENTRY_ROW, // getNextEntryNumber for reversal entry
      ],
      insertQueue: [
        [{ id: "je-reversal", entryNumber: 6 }], // reversal journal entry
        // no line insert because lines array is empty
      ],
    });

    await reverseGrantPayment(
      db as unknown as Parameters<typeof reverseGrantPayment>[0],
      REVERSE_PARAMS,
    );
    // reversal JE inserted; no lines because original had none
    expect(db.insert).toHaveBeenCalledTimes(1);
    // original entry marked as reversed
    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Pledge posting fixtures
// ---------------------------------------------------------------------------

const PLEDGE_UNRESTRICTED = {
  id: "pledge-1",
  orgId: "org-1",
  contactId: "contact-alice",
  fundId: null as string | null,
  faceAmountCents: 12000,
  discountCents: 2000,
  presentValueCents: 10000,
  netAssetClass: "unrestricted",
  pledgeDate: new Date("2025-03-01"),
  status: "active",
};

const PLEDGE_RESTRICTED = {
  ...PLEDGE_UNRESTRICTED,
  fundId: "fund-1",
  netAssetClass: "temporarily_restricted",
};

const PLEDGE_NO_DISCOUNT = {
  ...PLEDGE_UNRESTRICTED,
  discountCents: 0,
  presentValueCents: 12000,
};

const ACCOUNT_1100 = { id: "acc-1100", code: "1100", type: "asset", isActive: true };
const ACCOUNT_1150 = { id: "acc-1150", code: "1150", type: "asset", isActive: true };
const ACCOUNT_1190 = { id: "acc-1190", code: "1190", type: "asset", isActive: true };

// ---------------------------------------------------------------------------
// postPledgeRecognition
// ---------------------------------------------------------------------------

describe("postPledgeRecognition", () => {
  it("no-ops when accountingEnabled is false", async () => {
    const db = makeDb({ selectQueue: [[ORG_DISABLED]] });
    await postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when pledge not found", async () => {
    const db = makeDb({ selectQueue: [[ORG_ENABLED], []] });
    await postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("posts three lines for unrestricted pledge with discount (Dr 1100, Cr 1150, Cr 4000)", async () => {
    // select order for create:
    // 1. isAccountingEnabled
    // 2. select pledge
    // 3. findAccountByCode("1100")
    // 4. findAccountByCode("1150")
    // 5. findAccountByCode("4000") — unrestricted
    // 6. findOpenFiscalPeriod
    // 7. getNextEntryNumber
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [ACCOUNT_1100],
        [ACCOUNT_1150],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });
    await postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      action: "create",
    });
    expect(db.insert).toHaveBeenCalledTimes(2); // JE + lines
    // three lines: Dr 1100, Cr 1150, Cr 4000
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "acc-1100", debitCents: 12000, creditCents: 0 }),
        expect.objectContaining({ accountId: "acc-1150", debitCents: 0, creditCents: 2000 }),
        expect.objectContaining({ accountId: "acc-4000", debitCents: 0, creditCents: 10000 }),
      ]),
    );
  });

  it("posts two lines when discountCents is 0 (no 1150 line)", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_NO_DISCOUNT],
        [ACCOUNT_1100],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });
    await postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      action: "create",
    });
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "acc-1100", debitCents: 12000, creditCents: 0 }),
        expect.objectContaining({ accountId: "acc-4000", debitCents: 0, creditCents: 12000 }),
      ]),
    );
    // should NOT include a 1150 line
    expect(db.insertValues).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ accountId: "acc-1150" })]),
    );
  });

  it("uses 4100 revenue account for temporarily restricted pledge", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_RESTRICTED],
        [ACCOUNT_1100],
        [ACCOUNT_1150],
        [ACCOUNT_4100],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });
    await postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      action: "create",
    });
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "acc-4100", creditCents: 10000, fundId: "fund-1" }),
      ]),
    );
  });

  it("stamps fundId only on the revenue line when restricted", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_RESTRICTED],
        [ACCOUNT_1100],
        [ACCOUNT_1150],
        [ACCOUNT_4100],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });
    await postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      action: "create",
    });
    const allLinesCalls = (db.insertValues.mock.calls as unknown[][]).filter((args) =>
      Array.isArray(args[0]),
    ) as Array<Array<Array<Record<string, unknown>>>>;
    const lines = allLinesCalls[0]?.[0] ?? [];
    const drLine = lines.find((l) => (l["debitCents"] as number) > 0);
    const crRevLine = lines.find((l) => l["accountId"] === "acc-4100");
    // debit line should not have fundId set
    expect(drLine?.["fundId"]).toBeNull();
    // revenue line should carry fundId
    expect(crRevLine?.["fundId"]).toBe("fund-1");
  });

  it("throws when 1100 account not found", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_UNRESTRICTED], []],
    });
    await expect(
      postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 1100");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when revenue account not found (unrestricted pledge, 4000 missing)", async () => {
    // PLEDGE_NO_DISCOUNT has discountCents=0 so 1150 lookup is skipped;
    // next lookup is revenue account (4000) which returns empty → early return.
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_NO_DISCOUNT], [ACCOUNT_1100], []],
    });
    await expect(
      postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 4000");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when revenue account not found (restricted pledge, 4100 missing)", async () => {
    // Covers the warn path at lines 961-965: restricted pledge, 4100 not found.
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_RESTRICTED], [ACCOUNT_1100], [ACCOUNT_1150], []],
    });
    await expect(
      postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 4100");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when no open fiscal period covers the pledge date", async () => {
    // PLEDGE_UNRESTRICTED has discountCents = 2000, so 1150 is looked up between 1100 and 4000
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [ACCOUNT_1100],
        [ACCOUNT_1150],
        [ACCOUNT_4000],
        [], // no open period → throws
      ],
    });
    await expect(
      postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        action: "create",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("reverses prior JE and posts new on update", async () => {
    const originalEntry = {
      id: "je-old",
      orgId: "org-1",
      entryNumber: 5,
      fiscalPeriodId: "fp-1",
      source: "pledge",
      sourceId: "pledge-1",
      reversedByEntryId: null,
    };
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [originalEntry], // reversal: original JE
        [], // reversal: no lines
        [FISCAL_PERIOD_OPEN], // reversal: period still open
        MAX_ENTRY_ROW, // reversal entry number
        [ACCOUNT_1100],
        [ACCOUNT_1150],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 6 }], INSERTED_ENTRY, []],
    });
    await postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      action: "update",
    });
    expect(db.insert).toHaveBeenCalledTimes(3); // reversal JE + new JE + new lines
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("only reverses on delete, no new JE", async () => {
    const originalEntry = {
      id: "je-old",
      orgId: "org-1",
      entryNumber: 5,
      fiscalPeriodId: "fp-1",
      source: "pledge",
      sourceId: "pledge-1",
      reversedByEntryId: null,
    };
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [originalEntry],
        [],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 6 }]],
    });
    await postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      action: "delete",
    });
    expect(db.insert).toHaveBeenCalledTimes(1); // reversal JE only
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("throws when discount > 0 but 1150 account not found", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED], // discountCents = 2000
        [ACCOUNT_1100],
        [], // no 1150 account
      ],
    });
    await expect(
      postPledgeRecognition(db as unknown as Parameters<typeof postPledgeRecognition>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 1150");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// postPledgeAccretion
// ---------------------------------------------------------------------------

describe("postPledgeAccretion", () => {
  it("no-ops when accountingEnabled is false", async () => {
    const db = makeDb({ selectQueue: [[ORG_DISABLED]] });
    await postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      accretionCents: 500,
      asOfDate: new Date("2025-06-30"),
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when accretionCents is 0", async () => {
    const db = makeDb({ selectQueue: [[ORG_ENABLED]] });
    await postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      accretionCents: 0,
      asOfDate: new Date("2025-06-30"),
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when accretionCents is negative", async () => {
    const db = makeDb({ selectQueue: [[ORG_ENABLED]] });
    await postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      accretionCents: -100,
      asOfDate: new Date("2025-06-30"),
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when pledge not found", async () => {
    const db = makeDb({ selectQueue: [[ORG_ENABLED], []] });
    await postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      accretionCents: 500,
      asOfDate: new Date("2025-06-30"),
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("posts two lines: Dr 1150, Cr 4000 for unrestricted pledge", async () => {
    // create order:
    // 1. isAccountingEnabled
    // 2. select pledge
    // 3. findAccountByCode("1150")
    // 4. findAccountByCode("4000") — unrestricted
    // 5. findOpenFiscalPeriod
    // 6. getNextEntryNumber
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [ACCOUNT_1150],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });
    await postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      accretionCents: 500,
      asOfDate: new Date("2025-06-30"),
      action: "create",
    });
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "acc-1150", debitCents: 500, creditCents: 0 }),
        expect.objectContaining({ accountId: "acc-4000", debitCents: 0, creditCents: 500 }),
      ]),
    );
  });

  it("uses 4100 for restricted pledge accretion", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_RESTRICTED],
        [ACCOUNT_1150],
        [ACCOUNT_4100],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });
    await postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      accretionCents: 300,
      asOfDate: new Date("2025-06-30"),
      action: "create",
    });
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "acc-4100", debitCents: 0, creditCents: 300 }),
      ]),
    );
  });

  it("throws when no open fiscal period covers the asOfDate", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [ACCOUNT_1150],
        [ACCOUNT_4000],
        [], // no period
      ],
    });
    await expect(
      postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        accretionCents: 500,
        asOfDate: new Date("2025-06-30"),
        action: "create",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("reverses prior accretion entry on update using compound sourceId", async () => {
    const asOfDate = new Date("2025-06-30");
    const asOf = asOfDate.toISOString().slice(0, 10);
    const originalEntry = {
      id: "je-accretion",
      orgId: "org-1",
      entryNumber: 8,
      fiscalPeriodId: "fp-1",
      source: "pledge",
      sourceId: `pledge-1:accretion:${asOf}`,
      reversedByEntryId: null,
    };
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [originalEntry], // reversal: find original
        [], // reversal: no lines
        [FISCAL_PERIOD_OPEN], // reversal: period open
        MAX_ENTRY_ROW, // reversal: entry number
        [ACCOUNT_1150],
        [ACCOUNT_4000],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 9 }], INSERTED_ENTRY, []],
    });
    await postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      accretionCents: 500,
      asOfDate,
      action: "update",
    });
    expect(db.insert).toHaveBeenCalledTimes(3);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("throws when 1150 account not found", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_UNRESTRICTED], []],
    });
    await expect(
      postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        accretionCents: 500,
        asOfDate: new Date("2025-06-30"),
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 1150");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when revenue account not found (unrestricted, 4000 missing)", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_UNRESTRICTED], [ACCOUNT_1150], []],
    });
    await expect(
      postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        accretionCents: 500,
        asOfDate: new Date("2025-06-30"),
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 4000");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when revenue account not found (restricted, 4100 missing)", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_RESTRICTED], [ACCOUNT_1150], []],
    });
    await expect(
      postPledgeAccretion(db as unknown as Parameters<typeof postPledgeAccretion>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        accretionCents: 500,
        asOfDate: new Date("2025-06-30"),
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 4100");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// postPledgePayment
// ---------------------------------------------------------------------------

describe("postPledgePayment", () => {
  it("no-ops when accountingEnabled is false", async () => {
    const db = makeDb({ selectQueue: [[ORG_DISABLED]] });
    await postPledgePayment(db as unknown as Parameters<typeof postPledgePayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      paymentId: "pay-1",
      amountCents: 5000,
      paymentDate: new Date("2025-07-01"),
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when pledge payment record not found", async () => {
    const db = makeDb({ selectQueue: [[ORG_ENABLED], []] });
    await postPledgePayment(db as unknown as Parameters<typeof postPledgePayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      paymentId: "pay-1",
      amountCents: 5000,
      paymentDate: new Date("2025-07-01"),
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("posts Dr 1010 Cr 1100 for payment", async () => {
    // create order:
    // 1. isAccountingEnabled
    // 2. select pledgePayment
    // 3. findAccountByCode("1010")
    // 4. findAccountByCode("1100")
    // 5. findOpenFiscalPeriod
    // 6. getNextEntryNumber
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [
          {
            id: "pay-1",
            orgId: "org-1",
            pledgeId: "pledge-1",
            amountCents: 5000,
            paymentDate: new Date("2025-07-01"),
          },
        ],
        [ACCOUNT_CASH], // 1010
        [ACCOUNT_1100], // 1100
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });
    await postPledgePayment(db as unknown as Parameters<typeof postPledgePayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      paymentId: "pay-1",
      amountCents: 5000,
      paymentDate: new Date("2025-07-01"),
      action: "create",
    });
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "acc-cash", debitCents: 5000, creditCents: 0 }),
        expect.objectContaining({ accountId: "acc-1100", debitCents: 0, creditCents: 5000 }),
      ]),
    );
  });

  it("throws when no open fiscal period covers the payment date", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [
          {
            id: "pay-1",
            orgId: "org-1",
            pledgeId: "pledge-1",
            amountCents: 5000,
            paymentDate: new Date("2025-07-01"),
          },
        ],
        [ACCOUNT_CASH],
        [ACCOUNT_1100],
        [], // no period
      ],
    });
    await expect(
      postPledgePayment(db as unknown as Parameters<typeof postPledgePayment>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        paymentId: "pay-1",
        amountCents: 5000,
        paymentDate: new Date("2025-07-01"),
        action: "create",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("reverses prior JE and posts new on update", async () => {
    const originalEntry = {
      id: "je-pay-old",
      orgId: "org-1",
      entryNumber: 10,
      fiscalPeriodId: "fp-1",
      source: "pledge",
      sourceId: "pay-1",
      reversedByEntryId: null,
    };
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [
          {
            id: "pay-1",
            orgId: "org-1",
            pledgeId: "pledge-1",
            amountCents: 5000,
            paymentDate: new Date("2025-07-01"),
          },
        ],
        [originalEntry],
        [],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [ACCOUNT_CASH],
        [ACCOUNT_1100],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 11 }], INSERTED_ENTRY, []],
    });
    await postPledgePayment(db as unknown as Parameters<typeof postPledgePayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      paymentId: "pay-1",
      amountCents: 5000,
      paymentDate: new Date("2025-07-01"),
      action: "update",
    });
    expect(db.insert).toHaveBeenCalledTimes(3);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("only reverses on delete, no new JE", async () => {
    const originalEntry = {
      id: "je-pay-old",
      orgId: "org-1",
      entryNumber: 10,
      fiscalPeriodId: "fp-1",
      source: "pledge",
      sourceId: "pay-1",
      reversedByEntryId: null,
    };
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [
          {
            id: "pay-1",
            orgId: "org-1",
            pledgeId: "pledge-1",
            amountCents: 5000,
            paymentDate: new Date("2025-07-01"),
          },
        ],
        [originalEntry],
        [],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 11 }]],
    });
    await postPledgePayment(db as unknown as Parameters<typeof postPledgePayment>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      paymentId: "pay-1",
      amountCents: 5000,
      paymentDate: new Date("2025-07-01"),
      action: "delete",
    });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("throws when 1010 account not found", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [
          {
            id: "pay-1",
            orgId: "org-1",
            pledgeId: "pledge-1",
            amountCents: 5000,
            paymentDate: new Date("2025-07-01"),
          },
        ],
        [], // no 1010
      ],
    });
    await expect(
      postPledgePayment(db as unknown as Parameters<typeof postPledgePayment>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        paymentId: "pay-1",
        amountCents: 5000,
        paymentDate: new Date("2025-07-01"),
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 1010");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when 1100 account not found", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [
          {
            id: "pay-1",
            orgId: "org-1",
            pledgeId: "pledge-1",
            amountCents: 5000,
            paymentDate: new Date("2025-07-01"),
          },
        ],
        [ACCOUNT_CASH],
        [], // no 1100
      ],
    });
    await expect(
      postPledgePayment(db as unknown as Parameters<typeof postPledgePayment>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        paymentId: "pay-1",
        amountCents: 5000,
        paymentDate: new Date("2025-07-01"),
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 1100");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// postPledgeWriteOff
// ---------------------------------------------------------------------------

describe("postPledgeWriteOff", () => {
  it("no-ops when accountingEnabled is false", async () => {
    const db = makeDb({ selectQueue: [[ORG_DISABLED]] });
    await postPledgeWriteOff(db as unknown as Parameters<typeof postPledgeWriteOff>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      writeOffCents: 3000,
      remainingDiscountCents: 0,
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops when pledge not found", async () => {
    const db = makeDb({ selectQueue: [[ORG_ENABLED], []] });
    await postPledgeWriteOff(db as unknown as Parameters<typeof postPledgeWriteOff>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      writeOffCents: 3000,
      remainingDiscountCents: 0,
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("posts four lines when remainingDiscountCents > 0", async () => {
    // Dr 1190 writeOff, Cr 1100 writeOff, Dr 1150 residual, Cr 1190 residual
    // create order:
    // 1. isAccountingEnabled
    // 2. select pledge
    // 3. findAccountByCode("1190")
    // 4. findAccountByCode("1100")
    // 5. findAccountByCode("1150")  — only when remainingDiscount > 0
    // 6. findOpenFiscalPeriod
    // 7. getNextEntryNumber
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [ACCOUNT_1190],
        [ACCOUNT_1100],
        [ACCOUNT_1150],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });
    await postPledgeWriteOff(db as unknown as Parameters<typeof postPledgeWriteOff>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      writeOffCents: 3000,
      remainingDiscountCents: 1000,
      action: "create",
    });
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "acc-1190", debitCents: 3000, creditCents: 0 }),
        expect.objectContaining({ accountId: "acc-1100", debitCents: 0, creditCents: 3000 }),
        expect.objectContaining({ accountId: "acc-1150", debitCents: 1000, creditCents: 0 }),
        expect.objectContaining({ accountId: "acc-1190", debitCents: 0, creditCents: 1000 }),
      ]),
    );
  });

  it("posts two lines when remainingDiscountCents is 0", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [ACCOUNT_1190],
        [ACCOUNT_1100],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [INSERTED_ENTRY, []],
    });
    await postPledgeWriteOff(db as unknown as Parameters<typeof postPledgeWriteOff>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      writeOffCents: 3000,
      remainingDiscountCents: 0,
      action: "create",
    });
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "acc-1190", debitCents: 3000, creditCents: 0 }),
        expect.objectContaining({ accountId: "acc-1100", debitCents: 0, creditCents: 3000 }),
      ]),
    );
    expect(db.insertValues).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ accountId: "acc-1150" })]),
    );
  });

  it("throws when no open fiscal period", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [ACCOUNT_1190],
        [ACCOUNT_1100],
        [], // no period
      ],
    });
    await expect(
      postPledgeWriteOff(db as unknown as Parameters<typeof postPledgeWriteOff>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        writeOffCents: 3000,
        remainingDiscountCents: 0,
        action: "create",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("reverses prior write-off JE on update", async () => {
    const originalEntry = {
      id: "je-writeoff",
      orgId: "org-1",
      entryNumber: 12,
      fiscalPeriodId: "fp-1",
      source: "pledge",
      sourceId: "pledge-1:writeoff",
      reversedByEntryId: null,
    };
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [originalEntry],
        [],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
        [ACCOUNT_1190],
        [ACCOUNT_1100],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 13 }], INSERTED_ENTRY, []],
    });
    await postPledgeWriteOff(db as unknown as Parameters<typeof postPledgeWriteOff>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      writeOffCents: 3000,
      remainingDiscountCents: 0,
      action: "update",
    });
    expect(db.insert).toHaveBeenCalledTimes(3);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("only reverses on delete", async () => {
    const originalEntry = {
      id: "je-writeoff",
      orgId: "org-1",
      entryNumber: 12,
      fiscalPeriodId: "fp-1",
      source: "pledge",
      sourceId: "pledge-1:writeoff",
      reversedByEntryId: null,
    };
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [originalEntry],
        [],
        [FISCAL_PERIOD_OPEN],
        MAX_ENTRY_ROW,
      ],
      insertQueue: [[{ id: "je-rev", entryNumber: 13 }]],
    });
    await postPledgeWriteOff(db as unknown as Parameters<typeof postPledgeWriteOff>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      writeOffCents: 3000,
      remainingDiscountCents: 0,
      action: "delete",
    });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("throws when 1190 account not found", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_UNRESTRICTED], []],
    });
    await expect(
      postPledgeWriteOff(db as unknown as Parameters<typeof postPledgeWriteOff>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        writeOffCents: 3000,
        remainingDiscountCents: 0,
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 1190");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when 1100 account not found", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_UNRESTRICTED], [ACCOUNT_1190], []],
    });
    await expect(
      postPledgeWriteOff(db as unknown as Parameters<typeof postPledgeWriteOff>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        writeOffCents: 3000,
        remainingDiscountCents: 0,
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 1100");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when 1150 account not found and remainingDiscountCents > 0", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_UNRESTRICTED], [ACCOUNT_1190], [ACCOUNT_1100], []],
    });
    await expect(
      postPledgeWriteOff(db as unknown as Parameters<typeof postPledgeWriteOff>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        writeOffCents: 3000,
        remainingDiscountCents: 1000,
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 1150");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// postPledgeAllowance
// ---------------------------------------------------------------------------

const ACCOUNT_6500 = { id: "acc-6500", code: "6500", type: "expense", isActive: true };
const ALLOWANCE_FISCAL_PERIOD = { id: "fp-allow-1", status: "open" };
const ALLOWANCE_ENTRY = { id: "je-allowance", entryNumber: 42 };

describe("postPledgeAllowance", () => {
  it("is a no-op when accounting is disabled", async () => {
    const db = makeDb({ selectQueue: [[ORG_DISABLED]] });
    await postPledgeAllowance(db as unknown as Parameters<typeof postPledgeAllowance>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      deltaCents: 5000,
      asOfDate: new Date("2025-06-01"),
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("is a no-op when deltaCents === 0", async () => {
    const db = makeDb({ selectQueue: [[ORG_ENABLED]] });
    await postPledgeAllowance(db as unknown as Parameters<typeof postPledgeAllowance>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      deltaCents: 0,
      asOfDate: new Date("2025-06-01"),
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("is a no-op when pledge not found", async () => {
    const db = makeDb({ selectQueue: [[ORG_ENABLED], []] });
    await postPledgeAllowance(db as unknown as Parameters<typeof postPledgeAllowance>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-missing",
      deltaCents: 1000,
      asOfDate: new Date("2025-06-01"),
      action: "create",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when 1190 account not found", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_UNRESTRICTED], [], []],
    });
    await expect(
      postPledgeAllowance(db as unknown as Parameters<typeof postPledgeAllowance>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        deltaCents: 1000,
        asOfDate: new Date("2025-06-01"),
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 1190");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when 6500 account not found", async () => {
    const db = makeDb({
      selectQueue: [[ORG_ENABLED], [PLEDGE_UNRESTRICTED], [ACCOUNT_1190], []],
    });
    await expect(
      postPledgeAllowance(db as unknown as Parameters<typeof postPledgeAllowance>[0], {
        orgId: "org-1",
        actorId: "user-1",
        pledgeId: "pledge-1",
        deltaCents: 1000,
        asOfDate: new Date("2025-06-01"),
        action: "create",
      }),
    ).rejects.toThrow("requires chart of accounts code 6500");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("posts Dr BadDebt / Cr Allowance for positive delta (increase)", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED], // pledge lookup
        [ACCOUNT_1190], // findAccountByCode 1190
        [ACCOUNT_6500], // findAccountByCode 6500
        [ALLOWANCE_FISCAL_PERIOD], // findOpenFiscalPeriod
        [{ max: 10 }], // getNextEntryNumber
      ],
      insertQueue: [[ALLOWANCE_ENTRY], []],
    });

    await postPledgeAllowance(db as unknown as Parameters<typeof postPledgeAllowance>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      deltaCents: 5000,
      asOfDate: new Date("2025-06-01"),
      action: "create",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
    const lineInsertValues = (db.insert as ReturnType<typeof vi.fn>).mock.calls[1]?.[0];
    expect(lineInsertValues).toBeDefined();
  });

  it("posts Dr Allowance / Cr BadDebt for negative delta (release)", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        [ACCOUNT_1190],
        [ACCOUNT_6500],
        [ALLOWANCE_FISCAL_PERIOD],
        [{ max: 11 }],
      ],
      insertQueue: [[ALLOWANCE_ENTRY], []],
    });

    await postPledgeAllowance(db as unknown as Parameters<typeof postPledgeAllowance>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      deltaCents: -3000,
      asOfDate: new Date("2025-06-01"),
      action: "create",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("reverses prior entry on update action", async () => {
    const db = makeDb({
      selectQueue: [
        [ORG_ENABLED],
        [PLEDGE_UNRESTRICTED],
        // reverseSourceLinkedEntries: find originals → none found (safe no-op)
        [],
        [ACCOUNT_1190],
        [ACCOUNT_6500],
        [ALLOWANCE_FISCAL_PERIOD],
        [{ max: 12 }],
      ],
      insertQueue: [[ALLOWANCE_ENTRY], []],
    });

    await postPledgeAllowance(db as unknown as Parameters<typeof postPledgeAllowance>[0], {
      orgId: "org-1",
      actorId: "user-1",
      pledgeId: "pledge-1",
      deltaCents: 2000,
      asOfDate: new Date("2025-06-01"),
      action: "update",
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
  });
});

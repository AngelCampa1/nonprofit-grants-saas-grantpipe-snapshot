import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPES,
  ACCOUNT_NATURAL_RESTRICTIONS,
  ACCOUNT_FUNCTIONAL_CLASSES,
  FISCAL_PERIOD_STATUSES,
  JOURNAL_ENTRY_SOURCES,
  RECURRING_TEMPLATE_FREQUENCIES,
  RECURRING_TEMPLATE_FREQUENCY_LABELS,
  createAccountSchema,
  updateAccountSchema,
  accountListSchema,
  createFiscalPeriodSchema,
  updateFiscalPeriodSchema,
  journalLineInputSchema,
  createJournalEntrySchema,
  journalEntryListSchema,
  trialBalanceQuerySchema,
  ledgerQuerySchema,
  financialPositionQuerySchema,
  activitiesQuerySchema,
  functionalExpensesQuerySchema,
  createRecurringTemplateSchema,
  updateRecurringTemplateSchema,
} from "./accounting";

// ---------------------------------------------------------------------------
// Enum constants
// ---------------------------------------------------------------------------

describe("exported constants", () => {
  it("ACCOUNT_TYPES has all expected members", () => {
    expect(ACCOUNT_TYPES).toContain("asset");
    expect(ACCOUNT_TYPES).toContain("liability");
    expect(ACCOUNT_TYPES).toContain("net_assets");
    expect(ACCOUNT_TYPES).toContain("revenue");
    expect(ACCOUNT_TYPES).toContain("expense");
    expect(ACCOUNT_TYPES.length).toBe(5);
  });

  it("ACCOUNT_NATURAL_RESTRICTIONS has all expected members", () => {
    expect(ACCOUNT_NATURAL_RESTRICTIONS).toContain("unrestricted");
    expect(ACCOUNT_NATURAL_RESTRICTIONS).toContain("temporarily_restricted");
    expect(ACCOUNT_NATURAL_RESTRICTIONS).toContain("permanently_restricted");
    expect(ACCOUNT_NATURAL_RESTRICTIONS.length).toBe(3);
  });

  it("ACCOUNT_FUNCTIONAL_CLASSES has all expected members", () => {
    expect(ACCOUNT_FUNCTIONAL_CLASSES).toContain("program");
    expect(ACCOUNT_FUNCTIONAL_CLASSES).toContain("management");
    expect(ACCOUNT_FUNCTIONAL_CLASSES).toContain("fundraising");
    expect(ACCOUNT_FUNCTIONAL_CLASSES.length).toBe(3);
  });

  it("FISCAL_PERIOD_STATUSES has all expected members", () => {
    expect(FISCAL_PERIOD_STATUSES).toContain("open");
    expect(FISCAL_PERIOD_STATUSES).toContain("closed");
    expect(FISCAL_PERIOD_STATUSES).toContain("locked");
    expect(FISCAL_PERIOD_STATUSES.length).toBe(3);
  });

  it("JOURNAL_ENTRY_SOURCES has all expected members", () => {
    const expected = [
      "manual",
      "donation",
      "expense",
      "grant_payment",
      "grant_allocation",
      "grant_release",
      "grant_closeout",
      "recurring",
      "adjustment",
      "opening_balance",
      "year_end_close",
    ];
    for (const s of expected) {
      expect(JOURNAL_ENTRY_SOURCES).toContain(s);
    }
    expect(JOURNAL_ENTRY_SOURCES.length).toBe(11);
  });

  it("RECURRING_TEMPLATE_FREQUENCIES has all expected members and labels", () => {
    expect(RECURRING_TEMPLATE_FREQUENCIES).toEqual(["monthly", "quarterly", "annually"]);
    expect(RECURRING_TEMPLATE_FREQUENCY_LABELS).toEqual({
      monthly: "Monthly",
      quarterly: "Quarterly",
      annually: "Annually",
    });
  });
});

// ---------------------------------------------------------------------------
// createAccountSchema
// ---------------------------------------------------------------------------

describe("createAccountSchema", () => {
  it("accepts a valid asset account", () => {
    const result = createAccountSchema.safeParse({
      code: "1000",
      name: "Cash — Operating",
      type: "asset",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a full account with all optional fields", () => {
    const result = createAccountSchema.safeParse({
      code: "5100",
      name: "Program Salaries",
      type: "expense",
      subtype: "compensation",
      parentAccountId: "parent-uuid",
      naturalRestriction: "temporarily_restricted",
      functionalClass: "program",
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a net_assets account with naturalRestriction", () => {
    const result = createAccountSchema.safeParse({
      code: "3100",
      name: "Net Assets — Temporarily Restricted",
      type: "net_assets",
      naturalRestriction: "temporarily_restricted",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required name", () => {
    const result = createAccountSchema.safeParse({
      code: "1000",
      type: "asset",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required code", () => {
    const result = createAccountSchema.safeParse({
      name: "Cash",
      type: "asset",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = createAccountSchema.safeParse({
      code: "1000",
      name: "Cash",
      type: "equity",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid naturalRestriction", () => {
    const result = createAccountSchema.safeParse({
      code: "3000",
      name: "Net Assets",
      type: "net_assets",
      naturalRestriction: "board_designated",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid functionalClass", () => {
    const result = createAccountSchema.safeParse({
      code: "5000",
      name: "Salaries",
      type: "expense",
      functionalClass: "administrative",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty code string", () => {
    const result = createAccountSchema.safeParse({
      code: "",
      name: "Cash",
      type: "asset",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateAccountSchema
// ---------------------------------------------------------------------------

describe("updateAccountSchema", () => {
  it("accepts a partial update (only name)", () => {
    const result = updateAccountSchema.safeParse({ name: "Updated Name" });
    expect(result.success).toBe(true);
  });

  it("accepts isActive toggle", () => {
    const result = updateAccountSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it("accepts nullable optional fields", () => {
    const result = updateAccountSchema.safeParse({
      subtype: null,
      parentAccountId: null,
      naturalRestriction: null,
      functionalClass: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type on update", () => {
    const result = updateAccountSchema.safeParse({ type: "bogus" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// accountListSchema
// ---------------------------------------------------------------------------

describe("accountListSchema", () => {
  it("accepts empty params (all optional)", () => {
    const result = accountListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts search and type filter", () => {
    const result = accountListSchema.safeParse({
      search: "cash",
      type: "asset",
      isActive: "true",
    });
    expect(result.success).toBe(true);
  });

  it("accepts boolean true for isActive", () => {
    const result = accountListSchema.safeParse({ isActive: true });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type filter", () => {
    const result = accountListSchema.safeParse({ type: "equity" });
    expect(result.success).toBe(false);
  });

  it("rejects search string longer than 200 characters", () => {
    const result = accountListSchema.safeParse({ search: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("accepts search string of exactly 200 characters", () => {
    const result = accountListSchema.safeParse({ search: "a".repeat(200) });
    expect(result.success).toBe(true);
  });

  it('transforms "false" string to boolean false for isActive', () => {
    const result = accountListSchema.safeParse({ isActive: "false" });
    expect(result.success).toBe(true);
    expect(result.data?.isActive).toBe(false);
  });

  it("accepts page and pageSize parameters (inherited from paginationSchema)", () => {
    const result = accountListSchema.safeParse({ page: "2", pageSize: "50" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createFiscalPeriodSchema
// ---------------------------------------------------------------------------

describe("createFiscalPeriodSchema", () => {
  it("accepts valid fiscal period", () => {
    const result = createFiscalPeriodSchema.safeParse({
      name: "FY 2026",
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-ISO startDate", () => {
    const result = createFiscalPeriodSchema.safeParse({
      name: "FY 2026",
      startDate: "Jan 1 2026",
      endDate: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO endDate", () => {
    const result = createFiscalPeriodSchema.safeParse({
      name: "FY 2026",
      startDate: "2026-01-01T00:00:00Z",
      endDate: "December 2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = createFiscalPeriodSchema.safeParse({
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when endDate is before startDate", () => {
    const result = createFiscalPeriodSchema.safeParse({
      name: "FY 2026",
      startDate: "2026-12-31T23:59:59Z",
      endDate: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("endDate"))).toBe(true);
    }
  });

  it("rejects when endDate equals startDate", () => {
    const result = createFiscalPeriodSchema.safeParse({
      name: "FY 2026",
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateFiscalPeriodSchema
// ---------------------------------------------------------------------------

describe("updateFiscalPeriodSchema", () => {
  it("accepts partial update with only status", () => {
    const result = updateFiscalPeriodSchema.safeParse({ status: "closed" });
    expect(result.success).toBe(true);
  });

  it("accepts full update", () => {
    const result = updateFiscalPeriodSchema.safeParse({
      name: "FY 2026 Updated",
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-12-31T23:59:59Z",
      status: "locked",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = updateFiscalPeriodSchema.safeParse({ status: "archived" });
    expect(result.success).toBe(false);
  });

  it("rejects update when both dates provided and endDate <= startDate", () => {
    const result = updateFiscalPeriodSchema.safeParse({
      startDate: "2026-06-01T00:00:00Z",
      endDate: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("endDate"))).toBe(true);
    }
  });

  it("accepts update when only startDate is provided (no endDate to compare)", () => {
    const result = updateFiscalPeriodSchema.safeParse({ startDate: "2026-06-01T00:00:00Z" });
    expect(result.success).toBe(true);
  });

  it("accepts update when only endDate is provided", () => {
    const result = updateFiscalPeriodSchema.safeParse({ endDate: "2026-12-31T23:59:59Z" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// journalLineInputSchema
// ---------------------------------------------------------------------------

describe("journalLineInputSchema", () => {
  it("accepts a valid debit line", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "account-1",
      debitCents: 10000,
      creditCents: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid credit line", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "account-2",
      debitCents: 0,
      creditCents: 10000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a line with fundId, grantId, contactId, memo", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "account-1",
      fundId: "fund-1",
      grantId: "grant-1",
      contactId: "contact-1",
      debitCents: 5000,
      creditCents: 0,
      memo: "Program expense",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty accountId", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "",
      debitCents: 10000,
      creditCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative debitCents", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "account-1",
      debitCents: -100,
      creditCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative creditCents", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "account-1",
      debitCents: 0,
      creditCents: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer debitCents", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "account-1",
      debitCents: 10.5,
      creditCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects debitCents greater than the maximum safe integer", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "account-1",
      debitCents: Number.MAX_SAFE_INTEGER + 1,
      creditCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects creditCents greater than the maximum safe integer", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "account-1",
      debitCents: 0,
      creditCents: Number.MAX_SAFE_INTEGER + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts memo of exactly 1000 characters", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "account-1",
      debitCents: 10000,
      creditCents: 0,
      memo: "a".repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects memo longer than 1000 characters", () => {
    const result = journalLineInputSchema.safeParse({
      accountId: "account-1",
      debitCents: 10000,
      creditCents: 0,
      memo: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createJournalEntrySchema
// ---------------------------------------------------------------------------

describe("createJournalEntrySchema", () => {
  const validLines = [
    { accountId: "account-1", debitCents: 10000, creditCents: 0 },
    { accountId: "account-2", debitCents: 0, creditCents: 10000 },
  ];

  it("accepts a valid balanced 2-line entry", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines: validLines,
    });
    expect(result.success).toBe(true);
  });

  it("defaults isAdjusting to false", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines: validLines,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isAdjusting).toBe(false);
    }
  });

  it("accepts memo and isAdjusting", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      memo: "Quarter-end adjustment",
      isAdjusting: true,
      lines: validLines,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid multi-line balanced entry", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines: [
        { accountId: "account-1", debitCents: 6000, creditCents: 0 },
        { accountId: "account-2", debitCents: 4000, creditCents: 0 },
        { accountId: "account-3", debitCents: 0, creditCents: 10000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts lines with optional fund/grant references", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines: [
        {
          accountId: "account-1",
          fundId: "fund-1",
          grantId: "grant-1",
          debitCents: 10000,
          creditCents: 0,
        },
        { accountId: "account-2", debitCents: 0, creditCents: 10000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unbalanced entry (debits ≠ credits)", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines: [
        { accountId: "account-1", debitCents: 10000, creditCents: 0 },
        { accountId: "account-2", debitCents: 0, creditCents: 9000 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("balanced") || m.includes("equal"))).toBe(true);
    }
  });

  it("rejects an entry whose totals exceed the safe-integer range instead of treating it as balanced", () => {
    // Real debits = MAX_SAFE_INTEGER + 2, real credits = MAX_SAFE_INTEGER + 1.
    // Naive float accumulation rounds both running totals to 2^53, which would
    // make a genuinely unbalanced entry pass the debits === credits check.
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines: [
        { accountId: "account-1", debitCents: Number.MAX_SAFE_INTEGER, creditCents: 0 },
        { accountId: "account-2", debitCents: 2, creditCents: 0 },
        { accountId: "account-3", debitCents: 0, creditCents: Number.MAX_SAFE_INTEGER },
        { accountId: "account-4", debitCents: 0, creditCents: 1 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("maximum") || m.includes("exceed"))).toBe(true);
    }
  });

  it("accepts a balanced entry with lines up to the cap (1000)", () => {
    const lines = [
      ...Array.from({ length: 500 }, (_, i) => ({
        accountId: `debit-${i}`,
        debitCents: 100,
        creditCents: 0,
      })),
      ...Array.from({ length: 500 }, (_, i) => ({
        accountId: `credit-${i}`,
        debitCents: 0,
        creditCents: 100,
      })),
    ];
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an entry with lines over the cap (1001)", () => {
    const lines = Array.from({ length: 1001 }, (_, i) => ({
      accountId: `account-${i}`,
      debitCents: i % 2 === 0 ? 100 : 0,
      creditCents: i % 2 === 0 ? 0 : 100,
    }));
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a line with both debitCents > 0 and creditCents > 0", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines: [
        { accountId: "account-1", debitCents: 5000, creditCents: 5000 },
        { accountId: "account-2", debitCents: 0, creditCents: 0 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(
        messages.some((m) => m.includes("debit") || m.includes("credit") || m.includes("both")),
      ).toBe(true);
    }
  });

  it("rejects a line with both debitCents = 0 and creditCents = 0", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines: [
        { accountId: "account-1", debitCents: 0, creditCents: 0 },
        { accountId: "account-2", debitCents: 10000, creditCents: 0 },
        { accountId: "account-3", debitCents: 0, creditCents: 10000 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(
        messages.some((m) => m.includes("debit") || m.includes("credit") || m.includes("zero")),
      ).toBe(true);
    }
  });

  it("rejects fewer than 2 lines", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines: [{ accountId: "account-1", debitCents: 10000, creditCents: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty lines array", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      lines: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO date", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "April 1, 2026",
      fiscalPeriodId: "period-1",
      lines: validLines,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fiscalPeriodId", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      lines: validLines,
    });
    expect(result.success).toBe(false);
  });

  it("accepts memo of exactly 1000 characters", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      memo: "a".repeat(1000),
      lines: validLines,
    });
    expect(result.success).toBe(true);
  });

  it("rejects memo longer than 1000 characters", () => {
    const result = createJournalEntrySchema.safeParse({
      date: "2026-04-01T00:00:00Z",
      fiscalPeriodId: "period-1",
      memo: "a".repeat(1001),
      lines: validLines,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// trialBalanceQuerySchema
// ---------------------------------------------------------------------------

describe("trialBalanceQuerySchema", () => {
  it("accepts valid asOf datetime", () => {
    const result = trialBalanceQuerySchema.safeParse({
      asOf: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional fundId and grantId", () => {
    const result = trialBalanceQuerySchema.safeParse({
      asOf: "2026-12-31T23:59:59Z",
      fundId: "fund-1",
      grantId: "grant-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-ISO asOf", () => {
    const result = trialBalanceQuerySchema.safeParse({
      asOf: "end of year",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing asOf", () => {
    const result = trialBalanceQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ledgerQuerySchema
// ---------------------------------------------------------------------------

describe("ledgerQuerySchema", () => {
  it("accepts all optional params (empty object)", () => {
    const result = ledgerQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts from and to with fundId and grantId", () => {
    const result = ledgerQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
      fundId: "fund-1",
      grantId: "grant-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-ISO from date", () => {
    const result = ledgerQuerySchema.safeParse({
      from: "January 2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO to date", () => {
    const result = ledgerQuerySchema.safeParse({
      to: "2026-Q4",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an inverted range (from after to)", () => {
    const result = ledgerQuerySchema.safeParse({
      from: "2026-12-31T23:59:59Z",
      to: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an equal from/to range", () => {
    const result = ledgerQuerySchema.safeParse({
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// journalEntryListSchema
// ---------------------------------------------------------------------------

describe("journalEntryListSchema", () => {
  it("accepts empty params (all optional)", () => {
    const result = journalEntryListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts fiscalPeriodId and source filters", () => {
    const result = journalEntryListSchema.safeParse({
      fiscalPeriodId: "period-1",
      source: "manual",
    });
    expect(result.success).toBe(true);
  });

  it("accepts from and to datetime filters", () => {
    const result = journalEntryListSchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid source value", () => {
    const result = journalEntryListSchema.safeParse({ source: "wire_transfer" });
    expect(result.success).toBe(false);
  });

  it("accepts page and pageSize (inherited from paginationSchema)", () => {
    const result = journalEntryListSchema.safeParse({ page: "2", pageSize: "25" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(25);
    }
  });

  it("accepts grant_closeout as a valid source", () => {
    const result = journalEntryListSchema.safeParse({ source: "grant_closeout" });
    expect(result.success).toBe(true);
  });

  it("rejects an inverted range (from after to)", () => {
    const result = journalEntryListSchema.safeParse({
      from: "2026-12-31T23:59:59Z",
      to: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an equal from/to range", () => {
    const result = journalEntryListSchema.safeParse({
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// financialPositionQuerySchema
// ---------------------------------------------------------------------------

describe("financialPositionQuerySchema", () => {
  it("accepts valid asOf datetime with no format", () => {
    const result = financialPositionQuerySchema.safeParse({
      asOf: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("json");
    }
  });

  it("accepts json format explicitly", () => {
    const result = financialPositionQuerySchema.safeParse({
      asOf: "2026-12-31T23:59:59Z",
      format: "json",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("json");
    }
  });

  it("accepts csv format", () => {
    const result = financialPositionQuerySchema.safeParse({
      asOf: "2026-12-31T23:59:59Z",
      format: "csv",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("csv");
    }
  });

  it("rejects missing asOf", () => {
    const result = financialPositionQuerySchema.safeParse({ format: "json" });
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO asOf", () => {
    const result = financialPositionQuerySchema.safeParse({ asOf: "end of year" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid format value", () => {
    const result = financialPositionQuerySchema.safeParse({
      asOf: "2026-12-31T23:59:59Z",
      format: "xml",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// activitiesQuerySchema
// ---------------------------------------------------------------------------

describe("activitiesQuerySchema", () => {
  it("accepts valid from/to datetime with default format", () => {
    const result = activitiesQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("json");
    }
  });

  it("accepts csv format", () => {
    const result = activitiesQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
      format: "csv",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("csv");
    }
  });

  it("rejects missing from", () => {
    const result = activitiesQuerySchema.safeParse({ to: "2026-12-31T23:59:59Z" });
    expect(result.success).toBe(false);
  });

  it("rejects missing to", () => {
    const result = activitiesQuerySchema.safeParse({ from: "2026-01-01T00:00:00Z" });
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO from", () => {
    const result = activitiesQuerySchema.safeParse({
      from: "January 2026",
      to: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO to", () => {
    const result = activitiesQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "December 2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid format value", () => {
    const result = activitiesQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
      format: "xlsx",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an inverted range (from after to)", () => {
    const result = activitiesQuerySchema.safeParse({
      from: "2026-12-31T23:59:59Z",
      to: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an equal from/to range", () => {
    const result = activitiesQuerySchema.safeParse({
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// functionalExpensesQuerySchema
// ---------------------------------------------------------------------------

describe("functionalExpensesQuerySchema", () => {
  it("accepts valid from/to with default format", () => {
    const result = functionalExpensesQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("json");
    }
  });

  it("accepts csv format", () => {
    const result = functionalExpensesQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
      format: "csv",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("csv");
    }
  });

  it("rejects missing from", () => {
    const result = functionalExpensesQuerySchema.safeParse({ to: "2026-12-31T23:59:59Z" });
    expect(result.success).toBe(false);
  });

  it("rejects missing to", () => {
    const result = functionalExpensesQuerySchema.safeParse({ from: "2026-01-01T00:00:00Z" });
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO from", () => {
    const result = functionalExpensesQuerySchema.safeParse({
      from: "Q1 2026",
      to: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid format value", () => {
    const result = functionalExpensesQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
      format: "pdf",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an inverted range (from after to)", () => {
    const result = functionalExpensesQuerySchema.safeParse({
      from: "2026-12-31T23:59:59Z",
      to: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an equal from/to range", () => {
    const result = functionalExpensesQuerySchema.safeParse({
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createRecurringTemplateSchema
// ---------------------------------------------------------------------------

const validRecurringLines = [
  { accountId: "acc-1", debitCents: 10000, creditCents: 0 },
  { accountId: "acc-2", debitCents: 0, creditCents: 10000 },
];

describe("createRecurringTemplateSchema", () => {
  it("accepts a valid minimal template", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "Monthly Rent",
      frequency: "monthly",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines: validRecurringLines,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "Quarterly Depreciation",
      description: "Monthly depreciation posting",
      frequency: "quarterly",
      nextRunDate: "2026-04-01T00:00:00.000Z",
      isActive: false,
      fiscalPeriodId: "fp-1",
      memo: "Q1 depreciation",
      lines: validRecurringLines,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "",
      frequency: "monthly",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines: validRecurringLines,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid frequency", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "Test",
      frequency: "weekly",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines: validRecurringLines,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid nextRunDate", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "Test",
      frequency: "monthly",
      nextRunDate: "not-a-date",
      lines: validRecurringLines,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a balanced template with lines up to the cap (1000)", () => {
    const lines = [
      ...Array.from({ length: 500 }, (_, i) => ({
        accountId: `debit-${i}`,
        debitCents: 100,
        creditCents: 0,
      })),
      ...Array.from({ length: 500 }, (_, i) => ({
        accountId: `credit-${i}`,
        debitCents: 0,
        creditCents: 100,
      })),
    ];
    const result = createRecurringTemplateSchema.safeParse({
      name: "Capped template",
      frequency: "monthly",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a template with lines over the cap (1001)", () => {
    const lines = Array.from({ length: 1001 }, (_, i) => ({
      accountId: `account-${i}`,
      debitCents: i % 2 === 0 ? 100 : 0,
      creditCents: i % 2 === 0 ? 0 : 100,
    }));
    const result = createRecurringTemplateSchema.safeParse({
      name: "Over cap",
      frequency: "monthly",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines,
    });
    expect(result.success).toBe(false);
  });

  it("rejects fewer than 2 lines", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "Test",
      frequency: "monthly",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines: [{ accountId: "acc-1", debitCents: 100, creditCents: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unbalanced lines (debits != credits)", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "Test",
      frequency: "monthly",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines: [
        { accountId: "acc-1", debitCents: 100, creditCents: 0 },
        { accountId: "acc-2", debitCents: 0, creditCents: 50 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects template totals that exceed the safe-integer range instead of treating them as balanced", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "Test",
      frequency: "monthly",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines: [
        { accountId: "acc-1", debitCents: Number.MAX_SAFE_INTEGER, creditCents: 0 },
        { accountId: "acc-2", debitCents: 2, creditCents: 0 },
        { accountId: "acc-3", debitCents: 0, creditCents: Number.MAX_SAFE_INTEGER },
        { accountId: "acc-4", debitCents: 0, creditCents: 1 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("maximum") || m.includes("exceed"))).toBe(true);
    }
  });

  it("rejects line with both debit and credit > 0", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "Test",
      frequency: "monthly",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines: [
        { accountId: "acc-1", debitCents: 100, creditCents: 100 },
        { accountId: "acc-2", debitCents: 0, creditCents: 0 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects line with both debit and credit = 0", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "Test",
      frequency: "monthly",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines: [
        { accountId: "acc-1", debitCents: 100, creditCents: 0 },
        { accountId: "acc-2", debitCents: 0, creditCents: 0 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("defaults isActive to true when not provided", () => {
    const result = createRecurringTemplateSchema.safeParse({
      name: "Test",
      frequency: "annually",
      nextRunDate: "2026-02-01T00:00:00.000Z",
      lines: validRecurringLines,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateRecurringTemplateSchema
// ---------------------------------------------------------------------------

describe("updateRecurringTemplateSchema", () => {
  it("accepts an empty update (no fields)", () => {
    const result = updateRecurringTemplateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a name-only update", () => {
    const result = updateRecurringTemplateSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts nullable description and memo", () => {
    const result = updateRecurringTemplateSchema.safeParse({
      description: null,
      memo: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts nullable fiscalPeriodId", () => {
    const result = updateRecurringTemplateSchema.safeParse({ fiscalPeriodId: null });
    expect(result.success).toBe(true);
  });

  it("accepts a valid frequency update", () => {
    const result = updateRecurringTemplateSchema.safeParse({ frequency: "quarterly" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid frequency in update", () => {
    const result = updateRecurringTemplateSchema.safeParse({ frequency: "daily" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name in update", () => {
    const result = updateRecurringTemplateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("accepts balanced lines in update", () => {
    const result = updateRecurringTemplateSchema.safeParse({ lines: validRecurringLines });
    expect(result.success).toBe(true);
  });

  it("rejects unbalanced lines in update", () => {
    const result = updateRecurringTemplateSchema.safeParse({
      lines: [
        { accountId: "acc-1", debitCents: 100, creditCents: 0 },
        { accountId: "acc-2", debitCents: 0, creditCents: 50 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts balanced lines up to the cap (1000) in update", () => {
    const lines = [
      ...Array.from({ length: 500 }, (_, i) => ({
        accountId: `debit-${i}`,
        debitCents: 100,
        creditCents: 0,
      })),
      ...Array.from({ length: 500 }, (_, i) => ({
        accountId: `credit-${i}`,
        debitCents: 0,
        creditCents: 100,
      })),
    ];
    const result = updateRecurringTemplateSchema.safeParse({ lines });
    expect(result.success).toBe(true);
  });

  it("rejects lines over the cap (1001) in update", () => {
    const lines = Array.from({ length: 1001 }, (_, i) => ({
      accountId: `account-${i}`,
      debitCents: i % 2 === 0 ? 100 : 0,
      creditCents: i % 2 === 0 ? 0 : 100,
    }));
    const result = updateRecurringTemplateSchema.safeParse({ lines });
    expect(result.success).toBe(false);
  });

  it("rejects line with both debit and credit > 0 in update", () => {
    const result = updateRecurringTemplateSchema.safeParse({
      lines: [
        { accountId: "acc-1", debitCents: 100, creditCents: 100 },
        { accountId: "acc-2", debitCents: 0, creditCents: 0 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects line with both debit and credit = 0 in update", () => {
    const result = updateRecurringTemplateSchema.safeParse({
      lines: [
        { accountId: "acc-1", debitCents: 100, creditCents: 0 },
        { accountId: "acc-2", debitCents: 0, creditCents: 0 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("skips line validation when lines is not provided", () => {
    // No lines in update → refinement returns early, no errors
    const result = updateRecurringTemplateSchema.safeParse({ name: "Test", isActive: true });
    expect(result.success).toBe(true);
  });
});

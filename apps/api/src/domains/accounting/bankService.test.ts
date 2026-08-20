import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/app-error";

// ---------------------------------------------------------------------------
// Module mocks — before any imports from the module under test
// ---------------------------------------------------------------------------

vi.mock("@grantpipe/db", () => ({
  bankAccounts: {
    id: "bankAccounts.id",
    orgId: "bankAccounts.orgId",
    name: "bankAccounts.name",
    accountNumber: "bankAccounts.accountNumber",
    glAccountId: "bankAccounts.glAccountId",
    deletedAt: "bankAccounts.deletedAt",
  },
  chartOfAccounts: {
    id: "chartOfAccounts.id",
    orgId: "chartOfAccounts.orgId",
    deletedAt: "chartOfAccounts.deletedAt",
  },
  bankTransactions: {
    id: "bankTransactions.id",
    orgId: "bankTransactions.orgId",
    bankAccountId: "bankTransactions.bankAccountId",
    date: "bankTransactions.date",
    amountCents: "bankTransactions.amountCents",
    description: "bankTransactions.description",
    referenceNumber: "bankTransactions.referenceNumber",
    status: "bankTransactions.status",
    journalEntryId: "bankTransactions.journalEntryId",
  },
  bankReconciliations: {
    id: "bankReconciliations.id",
    orgId: "bankReconciliations.orgId",
    bankAccountId: "bankReconciliations.bankAccountId",
    statementDate: "bankReconciliations.statementDate",
    statementEndingBalanceCents: "bankReconciliations.statementEndingBalanceCents",
    reconciledAt: "bankReconciliations.reconciledAt",
    deletedAt: "bankReconciliations.deletedAt",
  },
  journalEntries: {
    id: "journalEntries.id",
    orgId: "journalEntries.orgId",
    date: "journalEntries.date",
  },
  journalLines: {
    id: "journalLines.id",
    orgId: "journalLines.orgId",
    journalEntryId: "journalLines.journalEntryId",
    accountId: "journalLines.accountId",
    reconciliationId: "journalLines.reconciliationId",
    debitCents: "journalLines.debitCents",
    creditCents: "journalLines.creditCents",
  },
}));

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { recordActivityLog } from "../../lib/activity-log";

import {
  importBankTransactions,
  getBankTransactions,
  matchBankTransaction,
  ignoreBankTransaction,
  unmatchBankTransaction,
  createReconciliation,
  completeReconciliation,
  cancelReconciliation,
  getBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from "./bankService";

// ---------------------------------------------------------------------------
// DB mock builder helpers
// ---------------------------------------------------------------------------

function makeFindFirstMock(value: unknown) {
  return vi.fn().mockResolvedValue(value);
}

function makeSelectChain(resolvedValue: unknown) {
  const offset = vi.fn().mockResolvedValue(resolvedValue);
  const limit = vi.fn().mockReturnValue({ offset });
  // orderBy returns { limit } so callers that paginate can call .limit()
  // but is also thenable so callers that just await it work too
  const orderBy = vi
    .fn()
    .mockReturnValue({ limit, then: (resolve: (v: unknown) => void) => resolve(resolvedValue) });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ where, innerJoin, leftJoin });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, where, orderBy, limit, offset, innerJoin, leftJoin };
}

function makeInsert(returnValue: unknown) {
  const returning = vi.fn().mockResolvedValue([returnValue]);
  const values = vi.fn().mockReturnValue({ returning });
  const insertFn = vi.fn().mockReturnValue({ values });
  return { insertFn, values, returning };
}

function makeUpdate(returnValue: unknown) {
  const returning = vi.fn().mockResolvedValue(returnValue === null ? [] : [returnValue]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return { update, set, where, returning };
}

// Standard no-op transaction: runs the callback synchronously with the same db
function withTx(db: unknown) {
  return {
    ...(db as Record<string, unknown>),
    transaction: vi.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(db)),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BANK_ACCOUNT = {
  id: "ba-1",
  orgId: "org-1",
  name: "Checking",
  accountNumber: "1234",
  glAccountId: "acc-cash",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BANK_TXN = {
  id: "btxn-1",
  orgId: "org-1",
  bankAccountId: "ba-1",
  date: new Date("2026-01-15"),
  amountCents: 10000,
  description: "Deposit",
  referenceNumber: "REF001",
  status: "unmatched",
  journalEntryId: null,
  journalEntryNumber: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const JOURNAL_ENTRY = {
  id: "je-1",
  orgId: "org-1",
  entryNumber: 1,
  date: new Date("2026-01-15"),
};

const RECON = {
  id: "recon-1",
  orgId: "org-1",
  bankAccountId: "ba-1",
  statementDate: new Date("2026-01-31"),
  statementEndingBalanceCents: 10000,
  reconciledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  bankAccount: BANK_ACCOUNT,
};

// ---------------------------------------------------------------------------
// importBankTransactions — CSV
// ---------------------------------------------------------------------------

describe("importBankTransactions — CSV standard format", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws 404 when bank account belongs to a different org", async () => {
    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(undefined) },
      bankTransactions: { findFirst: vi.fn() },
    };
    const db = {
      query: queryMock,
      insert: vi.fn(),
    } as unknown as Parameters<typeof importBankTransactions>[0];

    await expect(
      importBankTransactions(db, {
        orgId: "org-other",
        bankAccountId: "ba-1",
        format: "csv",
        content: "Date,Amount,Description\n2026-01-15,100.00,Test",
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(queryMock.bankAccounts.findFirst).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("imports rows from standard CSV (Amount column)", async () => {
    const csv = [
      "Date,Amount,Description,Reference",
      "2026-01-15,100.00,Coffee Shop,REF001",
      "2026-01-16,-50.00,ATM Withdrawal,REF002",
    ].join("\n");

    // First call: findFirst dedup check → not found (no duplicate)
    // Second call: same
    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(insertFn).toHaveBeenCalledTimes(2);
    expect(values).toHaveBeenCalledTimes(2);
  });

  it("imports from debit/credit column format", async () => {
    const csv = [
      "Date,Debit,Credit,Description",
      "2026-01-15,50.00,,Payment",
      "2026-01-16,,200.00,Deposit",
    ].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(2);
    // First row: debit 50 → amountCents = -5000
    // Second row: credit 200 → amountCents = 20000
    const firstCall = insertFn.mock.calls[0]?.[0];
    expect(firstCall).toBeDefined();
  });

  it("detects and counts duplicates", async () => {
    const csv = ["Date,Amount,Description", "2026-01-15,100.00,Coffee Shop"].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: {
        findFirst: vi.fn().mockResolvedValue(BANK_TXN), // already exists
      },
    };
    const { insertFn } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("detects duplicate when referenceNumber is null — uses isNull check", async () => {
    // CSV row has no Reference column → referenceNumber = null
    // DB already has a matching row with null referenceNumber
    const csv = ["Date,Amount,Description", "2026-01-15,100.00,Coffee Shop"].join("\n");

    const existingTxnNullRef = { ...BANK_TXN, referenceNumber: null };
    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: {
        findFirst: vi.fn().mockResolvedValue(existingTxnNullRef),
      },
    };
    const { insertFn } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(insertFn).not.toHaveBeenCalled();
    // Verify the findFirst was called (which internally uses isNull for null referenceNumber)
    expect(queryMock.bankTransactions.findFirst).toHaveBeenCalledTimes(1);
  });

  it("skips rows with invalid dates", async () => {
    const csv = [
      "Date,Amount,Description",
      "not-a-date,100.00,Bad Row",
      "2026-01-16,50.00,Good Row",
    ].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(1);
  });

  it("parses MM/DD/YYYY date format", async () => {
    const csv = ["Date,Amount,Description", "01/15/2026,100.00,Test"].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(1);
    const insertedRow = insertFn.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedRow).toBeDefined();
  });

  it("returns zero rows for empty CSV (header only)", async () => {
    const csv = "Date,Amount,Description\n";

    const db = {
      query: {
        bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
        bankTransactions: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(0);
  });

  it("skips blank lines within CSV body", async () => {
    // Blank line between rows hits `if (!line) continue` branch (line 65)
    const csv = [
      "Date,Amount,Description",
      "2026-01-15,100.00,First",
      "",
      "2026-01-16,50.00,Second",
    ].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(2);
  });

  it("handles CSV rows with fewer cells than headers — ?? fallbacks fire", async () => {
    // Row has only Date and Amount, missing Description and Reference
    // cells[idxDescription] and cells[idxReference] will be undefined → ?? "" → "" fallback
    const csv = ["Date,Amount,Description,Reference", "2026-01-15,100.00"].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(1);
    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    // description falls back to "(no description)" since cells[idxDescription] is undefined → ?? "" → ""
    expect(insertedValues?.description).toBe("(no description)");
    expect(insertedValues?.referenceNumber).toBeNull();
  });

  it("handles debit/credit CSV with fewer cells than headers — ?? fallbacks for debit/credit", async () => {
    // Row has only Date, missing Debit and Credit — cells[idxDebit/Credit] undefined → ?? ""
    const csv = ["Date,Debit,Credit,Description", "2026-01-15"].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    // Valid date, debit=0, credit=0, amountCents=0 → still imported
    expect(result.imported).toBe(1);
  });

  it("handles Amount column with empty value — amountRaw || '0' fallback", async () => {
    // Amount cell is present but empty → amountRaw = "" → || "0" branch fires
    const csv = ["Date,Amount,Description", "2026-01-15,,No Amount"].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(1);
    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.amountCents).toBe(0);
  });

  it("handles CSV with no Amount column at all — idxAmount === -1 fallback", async () => {
    // No Amount, Debit or Credit column → idxAmount = -1 → amountRaw = "0" fallback
    const csv = ["Date,Description", "2026-01-15,Test Row"].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(1);
    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.amountCents).toBe(0);
  });

  it("handles quoted fields with embedded commas", async () => {
    const csv = ["Date,Amount,Description", '2026-01-15,100.00,"Coffee, Shop"'].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(1);
    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.description).toBe("Coffee, Shop");
  });

  it("handles quoted fields with escaped double-quotes", async () => {
    const csv = ["Date,Amount,Description", '2026-01-15,100.00,"He said ""hello"""'].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(1);
    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.description).toBe('He said "hello"');
  });

  it("falls back to '(no description)' when description field is empty", async () => {
    // Description column present but value is empty string — triggers || "(no description)"
    const csv = ["Date,Amount,Description,Reference", "2026-01-15,100.00,,REF001"].join("\n");

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    expect(result.imported).toBe(1);
    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.description).toBe("(no description)");
  });
});

// ---------------------------------------------------------------------------
// importBankTransactions — OFX
// ---------------------------------------------------------------------------

describe("importBankTransactions — OFX", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts STMTTRN blocks and imports them", async () => {
    const ofx = `
<OFX>
<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>100.00
<MEMO>Coffee Shop
<FITID>FIT001
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260116
<TRNAMT>-50.00
<MEMO>ATM
<FITID>FIT002
</STMTTRN>
</OFX>
    `.trim();

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    expect(result.imported).toBe(2);
    expect(result.duplicates).toBe(0);
  });

  it("uses FITID as referenceNumber", async () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>100.00
<MEMO>Test
<FITID>UNIQUEREF123
</STMTTRN>`;

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.referenceNumber).toBe("UNIQUEREF123");
  });

  it("parses YYYYMMDDHHMMSS date format", async () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260115120000
<TRNAMT>50.00
<MEMO>Test
<FITID>F1
</STMTTRN>`;

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    expect(result.imported).toBe(1);
    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const insertedDate = insertedValues?.date as Date | undefined;
    expect(insertedDate?.getUTCFullYear()).toBe(2026);
    expect(insertedDate?.getUTCMonth()).toBe(0); // January
    expect(insertedDate?.getUTCDate()).toBe(15);
  });

  it("converts OFX float amounts to cents", async () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>12.34
<MEMO>Test
<FITID>F1
</STMTTRN>`;

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.amountCents).toBe(1234);
  });

  it("skips STMTTRN blocks where DTPOSTED produces NaN date (isNaN branch)", async () => {
    // DTPOSTED=20260015 → regex matches → date = "2026-00-15" → isNaN → return null → skip
    const ofx = `<STMTTRN>
<DTPOSTED>20260015
<TRNAMT>100.00
<MEMO>Invalid Month
<FITID>BAD2
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>50.00
<MEMO>Good
<FITID>GOOD2
</STMTTRN>`;

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    expect(result.imported).toBe(1);
  });

  it("handles OFX transaction with no TRNAMT — trnamt || '0' fallback", async () => {
    // No <TRNAMT> tag → trnamt = "" → || "0" fallback on line 155
    const ofx = `<STMTTRN>
<DTPOSTED>20260115
<MEMO>No Amount
<FITID>F5
</STMTTRN>`;

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.amountCents).toBe(0);
  });

  it("skips STMTTRN blocks with missing DTPOSTED tag", async () => {
    // Block 1: no DTPOSTED tag at all → regex doesn't match → ?? "" fallback → parseOfxDate("")
    // returns null → skip (covers lines 129, 146 ?? branch)
    // Block 2: valid → imported
    const ofx = `<STMTTRN>
<TRNAMT>100.00
<MEMO>Bad Date
<FITID>BAD1
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>50.00
<MEMO>Good
<FITID>GOOD1
</STMTTRN>`;

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    const result = await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    // Only the valid block is imported
    expect(result.imported).toBe(1);
    expect(insertFn).toHaveBeenCalledTimes(1);
  });

  it("uses NAME as description fallback when MEMO is absent", async () => {
    // No <MEMO> tag → memo = "" → falls through to name (line 156: memo || name || "")
    const ofx = `<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>75.00
<NAME>John Doe Payment
<FITID>F2
</STMTTRN>`;

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.description).toBe("John Doe Payment");
  });

  it("uses empty string description when both MEMO and NAME are absent", async () => {
    // No <MEMO> and no <NAME> → description = "" → stored as "(no description)" via || fallback
    const ofx = `<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>30.00
<FITID>F3
</STMTTRN>`;

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    // description="" → || "(no description)" fallback in importBankTransactions
    expect(insertedValues?.description).toBe("(no description)");
  });

  it("stores null referenceNumber when FITID is absent", async () => {
    // No <FITID> tag → fitid = null → referenceNumber = null (line 157: fitid || null)
    const ofx = `<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>20.00
<MEMO>No FITID
</STMTTRN>`;

    const queryMock = {
      bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
      bankTransactions: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.referenceNumber).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getBankTransactions
// ---------------------------------------------------------------------------

describe("getBankTransactions", () => {
  it("returns paginated transactions ordered by date desc", async () => {
    const { select, from, leftJoin, where, orderBy, limit, offset } = makeSelectChain([BANK_TXN]);
    const db = { select } as unknown as Parameters<typeof getBankTransactions>[0];

    const result = await getBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
    });

    expect(result).toEqual([BANK_TXN]);
    expect(from).toHaveBeenCalled();
    expect(leftJoin).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
    expect(orderBy).toHaveBeenCalled();
    expect(limit).toHaveBeenCalled();
    expect(offset).toHaveBeenCalled();
  });

  it("filters by status when provided", async () => {
    const { select, where } = makeSelectChain([]);
    const db = { select } as unknown as Parameters<typeof getBankTransactions>[0];

    await getBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      status: "matched",
    });

    expect(where).toHaveBeenCalled();
  });

  it("scopes leftJoin on journalEntries by journalEntries.orgId to prevent cross-org journal entry leakage", async () => {
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
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ leftJoin: leftJoinSpy }),
      }),
    } as unknown as Parameters<typeof getBankTransactions>[0];

    await getBankTransactions(db, { orgId: "org-99", bankAccountId: "ba-1" });

    expect(leftJoinSpy).toHaveBeenCalledTimes(1);
    // The second argument is the ON predicate (an `and(...)` node).
    // Serialise it to a string and confirm the orgId value appears in the clause.
    const joinPredicate = leftJoinSpy.mock.calls[0]?.[1];
    const predicateStr = JSON.stringify(joinPredicate);
    // The predicate must bind to "org-99" (the orgId param) so cross-org rows cannot leak.
    expect(predicateStr).toContain("org-99");
  });
});

// ---------------------------------------------------------------------------
// matchBankTransaction
// ---------------------------------------------------------------------------

describe("matchBankTransaction", () => {
  it("sets status to matched and links journalEntryId", async () => {
    const queryMock = {
      bankTransactions: { findFirst: makeFindFirstMock(BANK_TXN) },
      journalEntries: { findFirst: makeFindFirstMock(JOURNAL_ENTRY) },
    };
    const { update, set, where, returning } = makeUpdate({
      ...BANK_TXN,
      status: "matched",
      journalEntryId: "je-1",
    });
    const db = withTx({
      query: queryMock,
      update,
    } as unknown as Parameters<typeof matchBankTransaction>[0]);

    const result = await matchBankTransaction(
      db as unknown as Parameters<typeof matchBankTransaction>[0],
      {
        orgId: "org-1",
        bankTransactionId: "btxn-1",
        journalEntryId: "je-1",
      },
    );

    expect(result.status).toBe("matched");
    expect(result.journalEntryId).toBe("je-1");
    expect(set).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
    expect(returning).toHaveBeenCalled();
  });

  it("throws 404 when bank transaction not found", async () => {
    const queryMock = {
      bankTransactions: { findFirst: makeFindFirstMock(undefined) },
      journalEntries: { findFirst: makeFindFirstMock(JOURNAL_ENTRY) },
    };
    const db = withTx({
      query: queryMock,
      update: vi.fn(),
    } as unknown as Parameters<typeof matchBankTransaction>[0]);

    await expect(
      matchBankTransaction(db as unknown as Parameters<typeof matchBankTransaction>[0], {
        orgId: "org-1",
        bankTransactionId: "btxn-missing",
        journalEntryId: "je-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws 404 when journal entry not found for wrong org", async () => {
    const queryMock = {
      bankTransactions: { findFirst: makeFindFirstMock(BANK_TXN) },
      journalEntries: { findFirst: makeFindFirstMock(undefined) }, // wrong org
    };
    const db = withTx({
      query: queryMock,
      update: vi.fn(),
    } as unknown as Parameters<typeof matchBankTransaction>[0]);

    await expect(
      matchBankTransaction(db as unknown as Parameters<typeof matchBankTransaction>[0], {
        orgId: "org-other",
        bankTransactionId: "btxn-1",
        journalEntryId: "je-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// ignoreBankTransaction
// ---------------------------------------------------------------------------

describe("ignoreBankTransaction", () => {
  it("sets status to ignored", async () => {
    const { update, returning } = makeUpdate({ ...BANK_TXN, status: "ignored" });
    const db = { update } as unknown as Parameters<typeof ignoreBankTransaction>[0];

    const result = await ignoreBankTransaction(db, {
      orgId: "org-1",
      bankTransactionId: "btxn-1",
    });

    expect(result.status).toBe("ignored");
    expect(returning).toHaveBeenCalled();
  });

  it("throws 404 when transaction not found", async () => {
    const { update } = makeUpdate(null);
    const db = { update } as unknown as Parameters<typeof ignoreBankTransaction>[0];

    await expect(
      ignoreBankTransaction(db, {
        orgId: "org-1",
        bankTransactionId: "btxn-missing",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// unmatchBankTransaction
// ---------------------------------------------------------------------------

describe("unmatchBankTransaction", () => {
  it("sets status to unmatched and clears journalEntryId", async () => {
    const { update, returning } = makeUpdate({
      ...BANK_TXN,
      status: "unmatched",
      journalEntryId: null,
    });
    const db = { update } as unknown as Parameters<typeof unmatchBankTransaction>[0];

    const result = await unmatchBankTransaction(db, {
      orgId: "org-1",
      bankTransactionId: "btxn-1",
    });

    expect(result.status).toBe("unmatched");
    expect(result.journalEntryId).toBeNull();
    expect(returning).toHaveBeenCalled();
  });

  it("throws 404 when transaction not found", async () => {
    const { update } = makeUpdate(null);
    const db = { update } as unknown as Parameters<typeof unmatchBankTransaction>[0];

    await expect(
      unmatchBankTransaction(db, {
        orgId: "org-1",
        bankTransactionId: "btxn-missing",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// createReconciliation
// ---------------------------------------------------------------------------

describe("createReconciliation", () => {
  it("rejects invalid reconciliation input before loading the bank account", async () => {
    const queryMock = {
      bankAccounts: { findFirst: vi.fn() },
    };
    const db = {
      query: queryMock,
      insert: vi.fn(),
    } as unknown as Parameters<typeof createReconciliation>[0];

    await expect(
      createReconciliation(db, {
        orgId: "org-1",
        bankAccountId: "",
        statementDate: "not-a-date",
        statementEndingBalanceCents: 100.5,
      }),
    ).rejects.toThrow();

    expect(queryMock.bankAccounts.findFirst).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates a reconciliation record", async () => {
    const queryMock = {
      bankAccounts: { findFirst: makeFindFirstMock(BANK_ACCOUNT) },
    };
    const newRecon = {
      id: "recon-1",
      orgId: "org-1",
      bankAccountId: "ba-1",
      statementDate: new Date("2026-01-31"),
      statementEndingBalanceCents: 10000,
      reconciledAt: null,
    };
    const { insertFn } = makeInsert(newRecon);
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof createReconciliation>[0];

    const result = await createReconciliation(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      statementDate: "2026-01-31T00:00:00.000Z",
      statementEndingBalanceCents: 10000,
    });

    expect(result.bankAccountId).toBe("ba-1");
    expect(insertFn).toHaveBeenCalled();
  });

  it("throws 404 when bank account not found", async () => {
    const queryMock = {
      bankAccounts: { findFirst: makeFindFirstMock(undefined) },
    };
    const db = {
      query: queryMock,
      insert: vi.fn(),
    } as unknown as Parameters<typeof createReconciliation>[0];

    await expect(
      createReconciliation(db, {
        orgId: "org-1",
        bankAccountId: "ba-missing",
        statementDate: "2026-01-31T00:00:00.000Z",
        statementEndingBalanceCents: 10000,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// completeReconciliation — balance check
// ---------------------------------------------------------------------------

describe("completeReconciliation", () => {
  it("completes when GL balance + uncleared = statement balance (exact)", async () => {
    // GL balance: debit=10000, credit=0 → cash balance = 10000 cents
    // Uncleared transactions: none
    // Statement ending balance: 10000
    const queryMock = {
      bankReconciliations: { findFirst: makeFindFirstMock(RECON) },
    };

    // select for GL balance: sum query
    const glBalanceResult = [{ totalDebit: "10000", totalCredit: "0" }];
    // select for uncleared transactions
    const unclearedResult: unknown[] = [];
    // select for matched transactions (to write reconciliationId)
    const matchedResult: unknown[] = [];

    let selectCallCount = 0;
    const selectFn = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // GL balance query: .from().innerJoin().where()
        const where = vi.fn().mockResolvedValue(glBalanceResult);
        const innerJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ innerJoin });
        return { from };
      } else if (selectCallCount === 2) {
        // Uncleared txns: .from().where()
        const where = vi.fn().mockResolvedValue(unclearedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      } else {
        // Matched txns: .from().where()
        const where = vi.fn().mockResolvedValue(matchedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    const { update, where } = makeUpdate({ ...RECON, reconciledAt: new Date() });
    const db = withTx({
      query: queryMock,
      select: selectFn,
      update,
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    const result = await completeReconciliation(
      db as unknown as Parameters<typeof completeReconciliation>[0],
      { orgId: "org-1", reconId: "recon-1" },
    );

    expect(result.reconciledAt).toBeTruthy();
    expect(JSON.stringify(where.mock.calls[0]?.[0])).toContain("bankReconciliations.deletedAt");
  });

  it("completes when difference is within 1-cent tolerance", async () => {
    // GL balance: 9999, uncleared: 0, statement: 10000 → diff = 1 → within tolerance
    const queryMock = {
      bankReconciliations: {
        findFirst: makeFindFirstMock({
          ...RECON,
          statementEndingBalanceCents: 10000,
        }),
      },
    };

    const glBalanceResult = [{ totalDebit: "9999", totalCredit: "0" }];
    const unclearedResult: unknown[] = [];
    const matchedResult: unknown[] = [];

    let selectCallCount = 0;
    const selectFn = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        const where = vi.fn().mockResolvedValue(glBalanceResult);
        const innerJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ innerJoin });
        return { from };
      } else if (selectCallCount === 2) {
        const where = vi.fn().mockResolvedValue(unclearedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue(matchedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    const { update } = makeUpdate({ ...RECON, reconciledAt: new Date() });
    const db = withTx({
      query: queryMock,
      select: selectFn,
      update,
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    await expect(
      completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-1",
      }),
    ).resolves.toBeDefined();
  });

  it("throws badRequest when balance is out of balance by more than 1 cent", async () => {
    // GL balance: 5000, uncleared: 0, statement: 10000 → diff = 5000 → throws
    const queryMock = {
      bankReconciliations: {
        findFirst: makeFindFirstMock(RECON), // statementEndingBalanceCents = 10000
      },
    };

    const glBalanceResult = [{ totalDebit: "5000", totalCredit: "0" }];
    const unclearedResult: unknown[] = [];

    let selectCallCount = 0;
    const selectFn = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        const where = vi.fn().mockResolvedValue(glBalanceResult);
        const innerJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ innerJoin });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue(unclearedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    const db = withTx({
      query: queryMock,
      select: selectFn,
      update: vi.fn().mockReturnValue({ set: vi.fn() }),
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    await expect(
      completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws 404 when reconciliation not found", async () => {
    const queryMock = {
      bankReconciliations: { findFirst: makeFindFirstMock(undefined) },
    };
    const db = withTx({
      query: queryMock,
      select: vi.fn(),
      update: vi.fn(),
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    await expect(
      completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-missing",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws 409 conflict when a concurrent completion wins the race (status-guarded claim)", async () => {
    // findFirst sees an in-progress recon (reconciledAt null) and the balance
    // checks out, but the guarded UPDATE matches nothing because a concurrent
    // request already stamped reconciledAt. The empty result must surface as a
    // 409 conflict, not a spurious 404 or a silent double-completion.
    const queryMock = {
      bankReconciliations: { findFirst: makeFindFirstMock(RECON) },
    };

    const glBalanceResult = [{ totalDebit: "10000", totalCredit: "0" }];
    const unclearedResult: unknown[] = [];

    let selectCallCount = 0;
    const selectFn = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        const where = vi.fn().mockResolvedValue(glBalanceResult);
        const innerJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ innerJoin });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue(unclearedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    // makeUpdate(null) → .returning() resolves to [] → no row claimed.
    const { update } = makeUpdate(null);
    const db = withTx({
      query: queryMock,
      select: selectFn,
      update,
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    await expect(
      completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-1",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("guards the completion UPDATE on reconciledAt being null (atomic claim)", async () => {
    const queryMock = {
      bankReconciliations: { findFirst: makeFindFirstMock(RECON) },
    };
    const glBalanceResult = [{ totalDebit: "10000", totalCredit: "0" }];
    const unclearedResult: unknown[] = [];
    const matchedResult: unknown[] = [];
    let selectCallCount = 0;
    const selectFn = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        const where = vi.fn().mockResolvedValue(glBalanceResult);
        const innerJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ innerJoin });
        return { from };
      } else if (selectCallCount === 2) {
        const where = vi.fn().mockResolvedValue(unclearedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue(matchedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    const { update, where } = makeUpdate({ ...RECON, reconciledAt: new Date() });
    const db = withTx({
      query: queryMock,
      select: selectFn,
      update,
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    await completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
      orgId: "org-1",
      reconId: "recon-1",
    });

    // The completion UPDATE's WHERE must include the reconciledAt-null guard so
    // it is an atomic claim, not a check-then-act write.
    expect(JSON.stringify(where.mock.calls[0]?.[0])).toContain("bankReconciliations.reconciledAt");
  });

  it("writes reconciliationId to journal lines for matched transactions", async () => {
    // GL balance exactly matches
    const matchedTxn = { ...BANK_TXN, status: "matched", journalEntryId: "je-1" };
    const queryMock = {
      bankReconciliations: { findFirst: makeFindFirstMock(RECON) },
    };

    const glBalanceResult = [{ totalDebit: "10000", totalCredit: "0" }];
    const unclearedResult: unknown[] = [];
    const matchedResult = [matchedTxn];

    let selectCallCount = 0;
    const selectFn = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        const where = vi.fn().mockResolvedValue(glBalanceResult);
        const innerJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ innerJoin });
        return { from };
      } else if (selectCallCount === 2) {
        const where = vi.fn().mockResolvedValue(unclearedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue(matchedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    // Two update calls: one for reconciledAt, one for journalLines reconciliationId
    const reconReturning = vi.fn().mockResolvedValue([{ ...RECON, reconciledAt: new Date() }]);
    const reconWhere = vi.fn().mockReturnValue({ returning: reconReturning });
    const reconSet = vi.fn().mockReturnValue({ where: reconWhere });

    const linesWhere = vi.fn().mockResolvedValue([]);
    const linesSet = vi.fn().mockReturnValue({ where: linesWhere });

    let updateCallCount = 0;
    const updateFn = vi.fn().mockImplementation(() => {
      updateCallCount++;
      if (updateCallCount === 1) return { set: reconSet };
      return { set: linesSet };
    });

    const db = withTx({
      query: queryMock,
      select: selectFn,
      update: updateFn,
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    await completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
      orgId: "org-1",
      reconId: "recon-1",
    });

    // Should have called update twice: once for recon, once for journal lines
    expect(updateFn).toHaveBeenCalledTimes(2);
    expect(linesSet).toHaveBeenCalledWith(expect.objectContaining({ reconciliationId: "recon-1" }));
  });

  it("limits reconciliation stamping to current-period unreconciled journal lines", async () => {
    const matchedTxn = { ...BANK_TXN, status: "matched", journalEntryId: "je-1" };
    const queryMock = {
      bankReconciliations: { findFirst: makeFindFirstMock(RECON) },
    };

    const glBalanceResult = [{ totalDebit: "10000", totalCredit: "0" }];
    const unclearedResult: unknown[] = [];
    const matchedResult = [matchedTxn];
    const matchedWhere = vi.fn().mockResolvedValue(matchedResult);
    const linesWhere = vi.fn().mockResolvedValue([]);

    let selectCallCount = 0;
    const selectFn = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        const where = vi.fn().mockResolvedValue(glBalanceResult);
        const innerJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ innerJoin });
        return { from };
      }
      if (selectCallCount === 2) {
        const where = vi.fn().mockResolvedValue(unclearedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
      const from = vi.fn().mockReturnValue({ where: matchedWhere });
      return { from };
    });

    const reconReturning = vi.fn().mockResolvedValue([{ ...RECON, reconciledAt: new Date() }]);
    const reconWhere = vi.fn().mockReturnValue({ returning: reconReturning });
    const reconSet = vi.fn().mockReturnValue({ where: reconWhere });
    const linesSet = vi.fn().mockReturnValue({ where: linesWhere });

    let updateCallCount = 0;
    const updateFn = vi.fn().mockImplementation(() => {
      updateCallCount++;
      if (updateCallCount === 1) return { set: reconSet };
      return { set: linesSet };
    });

    const db = withTx({
      query: queryMock,
      select: selectFn,
      update: updateFn,
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    await completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
      orgId: "org-1",
      reconId: "recon-1",
    });

    const seen = new WeakSet<object>();
    const stringifyCondition = (value: unknown) =>
      JSON.stringify(value, (_key, nested) => {
        if (typeof nested === "object" && nested !== null) {
          if (seen.has(nested)) return "[Circular]";
          seen.add(nested);
        }
        if (typeof nested === "function") return "[Function]";
        return nested;
      });

    expect(stringifyCondition(matchedWhere.mock.calls[0]?.[0])).toContain("bankTransactions.date");
    expect(stringifyCondition(linesWhere.mock.calls[0]?.[0])).toContain(
      "journalLines.reconciliationId",
    );
  });

  it("includes uncleared transactions in balance computation", async () => {
    // GL balance: 8000, uncleared: +2000 (deposit not yet in books), statement: 10000 → matches
    const queryMock = {
      bankReconciliations: { findFirst: makeFindFirstMock(RECON) },
    };

    const glBalanceResult = [{ totalDebit: "8000", totalCredit: "0" }];
    const unclearedResult = [{ amountCents: 2000 }]; // +2000 uncleared
    const matchedResult: unknown[] = [];

    let selectCallCount = 0;
    const selectFn = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        const where = vi.fn().mockResolvedValue(glBalanceResult);
        const innerJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ innerJoin });
        return { from };
      } else if (selectCallCount === 2) {
        const where = vi.fn().mockResolvedValue(unclearedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue(matchedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    const { update } = makeUpdate({ ...RECON, reconciledAt: new Date() });
    const db = withTx({
      query: queryMock,
      select: selectFn,
      update,
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    await expect(
      completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-1",
      }),
    ).resolves.toBeDefined();
  });

  it("handles empty GL balance result (no journal lines yet) — uses 0 via ?? fallback", async () => {
    // GL balance query returns empty array → balRow is undefined → ?? 0 fallback triggers

    // Empty array → [balRow] = [] → balRow = undefined
    const glBalanceResult: unknown[] = [];
    const unclearedResult: unknown[] = [];
    const matchedResult: unknown[] = [];

    const callCounts = { select: 0 };
    const selectFn = vi.fn().mockImplementation(() => {
      callCounts.select++;
      if (callCounts.select === 1) {
        // GL balance query: .from().innerJoin().where() → returns empty array
        const where = vi.fn().mockResolvedValue(glBalanceResult);
        const innerJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ innerJoin });
        return { from };
      } else if (callCounts.select === 2) {
        const where = vi.fn().mockResolvedValue(unclearedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue(matchedResult);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    // GL = 0, uncleared = 0, statement = 0 (would mismatch at 10000) — use recon with 0 balance
    const reconZeroBalance = { ...RECON, statementEndingBalanceCents: 0 };
    const queryMockZero = {
      bankReconciliations: { findFirst: makeFindFirstMock(reconZeroBalance) },
    };

    const { update } = makeUpdate({ ...reconZeroBalance, reconciledAt: new Date() });
    const db = withTx({
      query: queryMockZero,
      select: selectFn,
      update,
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    await expect(
      completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-1",
      }),
    ).resolves.toBeDefined();
  });

  it("throws badRequest when trying to complete an already-completed reconciliation", async () => {
    // A reconciliation with reconciledAt already set must be rejected to prevent
    // double-stamping journal lines and overwriting the completion timestamp.
    const completedRecon = {
      ...RECON,
      reconciledAt: new Date("2026-02-01T10:00:00.000Z"),
      bankAccount: BANK_ACCOUNT,
    };
    const queryMock = {
      bankReconciliations: { findFirst: makeFindFirstMock(completedRecon) },
    };

    const db = withTx({
      query: queryMock,
      select: vi.fn(),
      update: vi.fn(),
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    await expect(
      completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("handles bank account with no glAccountId (glBalanceCents = 0)", async () => {
    const reconWithNoGl = {
      ...RECON,
      statementEndingBalanceCents: 0,
      bankAccount: { ...BANK_ACCOUNT, glAccountId: null },
    };
    const queryMock = {
      bankReconciliations: { findFirst: makeFindFirstMock(reconWithNoGl) },
    };

    const selectFn = vi.fn().mockImplementation(() => {
      // No GL query since glAccountId is null
      // First select: uncleared transactions
      // Second select: matched transactions
      const where = vi.fn().mockResolvedValue([]);
      const from = vi.fn().mockReturnValue({ where });
      return { from };
    });

    const { update } = makeUpdate({ ...reconWithNoGl, reconciledAt: new Date() });
    const db = withTx({
      query: queryMock,
      select: selectFn,
      update,
    } as unknown as Parameters<typeof completeReconciliation>[0]);

    // Statement balance = 0, GL = 0, uncleared = 0 → balance matches
    await expect(
      completeReconciliation(db as unknown as Parameters<typeof completeReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-1",
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// cancelReconciliation
// ---------------------------------------------------------------------------

describe("cancelReconciliation", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockClear();
  });

  it("soft-deletes an in-progress reconciliation and records activity", async () => {
    const inProgressRecon = {
      id: "recon-1",
      orgId: "org-1",
      bankAccountId: "ba-1",
      reconciledAt: null,
      statementDate: new Date("2026-01-31"),
      statementEndingBalanceCents: 10000,
    };
    const { update, set, where } = makeUpdate({
      ...inProgressRecon,
      deletedAt: new Date(),
    });
    const deleteFn = vi.fn();
    const db = withTx({
      query: { bankReconciliations: { findFirst: makeFindFirstMock(inProgressRecon) } },
      update,
      delete: deleteFn,
    });

    await expect(
      cancelReconciliation(db as unknown as Parameters<typeof cancelReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-1",
        actorId: "user-1",
      }),
    ).resolves.toBeUndefined();

    expect(deleteFn).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date), updatedAt: expect.any(Date) }),
    );
    expect(where).toHaveBeenCalled();
    expect(recordActivityLog).toHaveBeenCalledWith(expect.objectContaining({ update }), {
      orgId: "org-1",
      actorId: "user-1",
      action: "deleted",
      entityType: "bank_reconciliation",
      entityId: "recon-1",
      changes: expect.objectContaining({
        bankAccountId: "ba-1",
        statementEndingBalanceCents: 10000,
      }),
    });
  });

  it("throws 404 when reconciliation not found", async () => {
    const db = withTx({
      query: { bankReconciliations: { findFirst: makeFindFirstMock(undefined) } },
      delete: vi.fn(),
    });

    await expect(
      cancelReconciliation(db as unknown as Parameters<typeof cancelReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-missing",
        actorId: "user-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws when trying to cancel a completed reconciliation", async () => {
    const completedRecon = {
      id: "recon-1",
      orgId: "org-1",
      bankAccountId: "ba-1",
      reconciledAt: new Date("2026-02-01"),
    };
    const db = withTx({
      query: { bankReconciliations: { findFirst: makeFindFirstMock(completedRecon) } },
      delete: vi.fn(),
    });

    await expect(
      cancelReconciliation(db as unknown as Parameters<typeof cancelReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-1",
        actorId: "user-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("does not record activity when the soft-delete write finds no active row", async () => {
    const inProgressRecon = {
      id: "recon-1",
      orgId: "org-1",
      bankAccountId: "ba-1",
      reconciledAt: null,
      statementDate: new Date("2026-01-31"),
      statementEndingBalanceCents: 10000,
    };
    const { update, returning } = makeUpdate(null);
    const db = withTx({
      query: {
        bankReconciliations: { findFirst: makeFindFirstMock(inProgressRecon) },
      },
      update,
    });

    await expect(
      cancelReconciliation(db as unknown as Parameters<typeof cancelReconciliation>[0], {
        orgId: "org-1",
        reconId: "recon-1",
        actorId: "user-1",
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(returning).toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getBankAccounts
// ---------------------------------------------------------------------------

describe("getBankAccounts", () => {
  it("returns all bank accounts for org", async () => {
    const { select, from, where, orderBy } = makeSelectChain([BANK_ACCOUNT]);
    const db = { select } as unknown as Parameters<typeof getBankAccounts>[0];

    const result = await getBankAccounts(db, { orgId: "org-1" });

    expect(result).toEqual([BANK_ACCOUNT]);
    expect(from).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
    expect(orderBy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createBankAccount
// ---------------------------------------------------------------------------

describe("createBankAccount", () => {
  it("rejects invalid bank account input before checking the GL account", async () => {
    const queryMock = {
      chartOfAccounts: { findFirst: vi.fn() },
    };
    const db = {
      query: queryMock,
      insert: vi.fn(),
    } as unknown as Parameters<typeof createBankAccount>[0];

    await expect(
      createBankAccount(db, {
        orgId: "org-1",
        name: "",
        glAccountId: "acc-cash",
      }),
    ).rejects.toThrow();

    expect(queryMock.chartOfAccounts.findFirst).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts and returns new bank account", async () => {
    const { insertFn, returning } = makeInsert(BANK_ACCOUNT);
    const queryMock = {
      chartOfAccounts: { findFirst: makeFindFirstMock({ id: "acc-cash" }) },
    };
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof createBankAccount>[0];

    const result = await createBankAccount(db, {
      orgId: "org-1",
      name: "Checking",
      accountNumber: "1234",
      glAccountId: "acc-cash",
    });

    expect(result).toEqual(BANK_ACCOUNT);
    expect(queryMock.chartOfAccounts.findFirst).toHaveBeenCalledTimes(1);
    expect(insertFn).toHaveBeenCalled();
    expect(returning).toHaveBeenCalled();
  });

  it("inserts with null accountNumber and glAccountId when not provided", async () => {
    const { insertFn, values } = makeInsert(BANK_ACCOUNT);
    const db = { insert: insertFn } as unknown as Parameters<typeof createBankAccount>[0];

    await createBankAccount(db, { orgId: "org-1", name: "Savings" });

    const insertedValues = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedValues?.accountNumber).toBeNull();
    expect(insertedValues?.glAccountId).toBeNull();
  });

  it("rejects glAccountId that does not belong to the org", async () => {
    const { insertFn } = makeInsert(BANK_ACCOUNT);
    const queryMock = {
      chartOfAccounts: { findFirst: makeFindFirstMock(undefined) },
    };
    const db = {
      query: queryMock,
      insert: insertFn,
    } as unknown as Parameters<typeof createBankAccount>[0];

    await expect(
      createBankAccount(db, {
        orgId: "org-1",
        name: "Checking",
        glAccountId: "foreign-cash",
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(queryMock.chartOfAccounts.findFirst).toHaveBeenCalledTimes(1);
    expect(insertFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateBankAccount
// ---------------------------------------------------------------------------

describe("updateBankAccount", () => {
  it("rejects invalid bank account updates before loading the bank account", async () => {
    const queryMock = {
      bankAccounts: { findFirst: vi.fn() },
    };
    const db = {
      query: queryMock,
      update: vi.fn(),
    } as unknown as Parameters<typeof updateBankAccount>[0];

    await expect(
      updateBankAccount(db, {
        orgId: "org-1",
        bankAccountId: "ba-1",
        accountNumber: "",
      }),
    ).rejects.toThrow();

    expect(queryMock.bankAccounts.findFirst).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates and returns modified bank account", async () => {
    const queryMock = {
      bankAccounts: { findFirst: makeFindFirstMock(BANK_ACCOUNT) },
    };
    const updatedAccount = { ...BANK_ACCOUNT, name: "Updated Name" };
    const { update, returning } = makeUpdate(updatedAccount);
    const db = {
      query: queryMock,
      update,
    } as unknown as Parameters<typeof updateBankAccount>[0];

    const result = await updateBankAccount(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      name: "Updated Name",
    });

    expect(result.name).toBe("Updated Name");
    expect(returning).toHaveBeenCalled();
  });

  it("updates glAccountId when the account belongs to the org", async () => {
    const queryMock = {
      bankAccounts: { findFirst: makeFindFirstMock(BANK_ACCOUNT) },
      chartOfAccounts: { findFirst: makeFindFirstMock({ id: "acc-new-cash" }) },
    };
    const { update, set } = makeUpdate({
      ...BANK_ACCOUNT,
      glAccountId: "acc-new-cash",
    });
    const db = {
      query: queryMock,
      update,
    } as unknown as Parameters<typeof updateBankAccount>[0];

    const result = await updateBankAccount(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      glAccountId: "acc-new-cash",
    });

    const setPayload = set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(queryMock.chartOfAccounts.findFirst).toHaveBeenCalledTimes(1);
    expect(setPayload?.glAccountId).toBe("acc-new-cash");
    expect(result.glAccountId).toBe("acc-new-cash");
  });

  it("throws 404 when bank account not found", async () => {
    const queryMock = {
      bankAccounts: { findFirst: makeFindFirstMock(undefined) },
    };
    const db = {
      query: queryMock,
      update: vi.fn(),
    } as unknown as Parameters<typeof updateBankAccount>[0];

    await expect(
      updateBankAccount(db, {
        orgId: "org-1",
        bankAccountId: "ba-missing",
        name: "New Name",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("nullifies accountNumber when set to null", async () => {
    const queryMock = {
      bankAccounts: { findFirst: makeFindFirstMock(BANK_ACCOUNT) },
    };
    const { update, set } = makeUpdate({ ...BANK_ACCOUNT, accountNumber: null });
    const db = {
      query: queryMock,
      update,
    } as unknown as Parameters<typeof updateBankAccount>[0];

    await updateBankAccount(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      accountNumber: null,
    });

    const setPayload = set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(setPayload?.accountNumber).toBeNull();
  });

  it("nullifies glAccountId when key is present but value is undefined — hits ?? null", async () => {
    // params.glAccountId = undefined triggers `"glAccountId" in params` true,
    // then `params.glAccountId ?? null` → null (covers the ?? null branch on line 554)
    const queryMock = {
      bankAccounts: { findFirst: makeFindFirstMock(BANK_ACCOUNT) },
    };
    const { update, set } = makeUpdate({ ...BANK_ACCOUNT, glAccountId: null });
    const db = {
      query: queryMock,
      update,
    } as unknown as Parameters<typeof updateBankAccount>[0];

    await updateBankAccount(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      glAccountId: undefined,
    });

    const setPayload = set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(setPayload?.glAccountId).toBeNull();
  });

  it("nullifies glAccountId without a chart account lookup when value is null", async () => {
    const queryMock = {
      bankAccounts: { findFirst: makeFindFirstMock(BANK_ACCOUNT) },
      chartOfAccounts: { findFirst: vi.fn() },
    };
    const { update, set } = makeUpdate({ ...BANK_ACCOUNT, glAccountId: null });
    const db = {
      query: queryMock,
      update,
    } as unknown as Parameters<typeof updateBankAccount>[0];

    await updateBankAccount(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      glAccountId: null,
    });

    const setPayload = set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(queryMock.chartOfAccounts.findFirst).not.toHaveBeenCalled();
    expect(setPayload?.glAccountId).toBeNull();
  });

  it("rejects updating glAccountId to an account outside the org", async () => {
    const queryMock = {
      bankAccounts: { findFirst: makeFindFirstMock(BANK_ACCOUNT) },
      chartOfAccounts: { findFirst: makeFindFirstMock(undefined) },
    };
    const { update } = makeUpdate({ ...BANK_ACCOUNT, glAccountId: "foreign-cash" });
    const db = {
      query: queryMock,
      update,
    } as unknown as Parameters<typeof updateBankAccount>[0];

    await expect(
      updateBankAccount(db, {
        orgId: "org-1",
        bankAccountId: "ba-1",
        glAccountId: "foreign-cash",
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(queryMock.chartOfAccounts.findFirst).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteBankAccount
// ---------------------------------------------------------------------------

describe("deleteBankAccount", () => {
  it("soft-deletes the bank account", async () => {
    const { update, set, where } = makeUpdate(BANK_ACCOUNT);
    const db = { update } as unknown as Parameters<typeof deleteBankAccount>[0];

    await expect(
      deleteBankAccount(db, { orgId: "org-1", bankAccountId: "ba-1" }),
    ).resolves.toBeUndefined();

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date), updatedAt: expect.any(Date) }),
    );
    expect(where).toHaveBeenCalled();
  });

  it("throws 404 when bank account not found", async () => {
    const { update } = makeUpdate(null);
    const db = { update } as unknown as Parameters<typeof deleteBankAccount>[0];

    await expect(
      deleteBankAccount(db, { orgId: "org-1", bankAccountId: "ba-missing" }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// Cents-parser precision — CSV amount column
// ---------------------------------------------------------------------------

describe("importBankTransactions — cents parser precision", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeDb(overrides?: Partial<{ bankTransactionFindFirst: ReturnType<typeof vi.fn> }>) {
    const bankTransactionFindFirst =
      overrides?.bankTransactionFindFirst ?? vi.fn().mockResolvedValue(undefined);
    const { insertFn, values } = makeInsert({ id: "new-txn" });
    const db = {
      query: {
        bankAccounts: { findFirst: vi.fn().mockResolvedValue(BANK_ACCOUNT) },
        bankTransactions: { findFirst: bankTransactionFindFirst },
      },
      insert: insertFn,
    } as unknown as Parameters<typeof importBankTransactions>[0];
    return { db, values };
  }

  it.each([
    ["0.29", 29],
    ["0.99", 99],
    ["19.99", 1999],
    ["1.10", 110],
    ["100.01", 10001],
  ])("parses CSV amount %s as exactly %d cents without float drift", async (amount, expected) => {
    const csv = ["Date,Amount,Description", `2026-01-15,${amount},Test`].join("\n");
    const { db, values } = makeDb();

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    const inserted = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(inserted?.amountCents).toBe(expected);
  });

  it("parses a negative CSV amount as negative cents without float drift", async () => {
    const csv = ["Date,Amount,Description", "2026-01-15,-0.29,Withdrawal"].join("\n");
    const { db, values } = makeDb();

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    const inserted = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(inserted?.amountCents).toBe(-29);
  });

  it("parses a CSV amount with leading/trailing whitespace correctly", async () => {
    const csv = ["Date,Amount,Description", "2026-01-15,  1.99  ,Padded"].join("\n");
    const { db, values } = makeDb();

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    const inserted = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(inserted?.amountCents).toBe(199);
  });

  it("parses an empty CSV amount field as 0 cents", async () => {
    const csv = ["Date,Amount,Description", "2026-01-15,,Empty amount"].join("\n");
    const { db, values } = makeDb();

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "csv",
      content: csv,
    });

    const inserted = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(inserted?.amountCents).toBe(0);
  });

  it("parses OFX amount 0.29 as exactly 29 cents without float drift", async () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>0.29
<MEMO>Precision test
<FITID>P1
</STMTTRN>`;
    const { db, values } = makeDb();

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    const inserted = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(inserted?.amountCents).toBe(29);
  });

  it("parses OFX amount -19.99 as exactly -1999 cents without float drift", async () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>-19.99
<MEMO>Negative precision
<FITID>P2
</STMTTRN>`;
    const { db, values } = makeDb();

    await importBankTransactions(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      format: "ofx",
      content: ofx,
    });

    const inserted = values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(inserted?.amountCents).toBe(-1999);
  });
});

describe("updateBankAccount field clearing edge cases", () => {
  it("nullifies accountNumber when key is present but value is undefined", async () => {
    const queryMock = {
      bankAccounts: { findFirst: makeFindFirstMock(BANK_ACCOUNT) },
    };
    const { update, set } = makeUpdate({ ...BANK_ACCOUNT, accountNumber: null });
    const db = {
      query: queryMock,
      update,
    } as unknown as Parameters<typeof updateBankAccount>[0];

    await updateBankAccount(db, {
      orgId: "org-1",
      bankAccountId: "ba-1",
      accountNumber: undefined,
    });

    const setPayload = set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(setPayload?.accountNumber).toBeNull();
  });
});

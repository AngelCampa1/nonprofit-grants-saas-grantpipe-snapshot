import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvalidateQueries = vi.fn();
const mockCaptureEvent = vi.fn();
const mockOnMutationError = vi.fn();

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

vi.mock("../lib/mutation-error", () => ({
  onMutationError: (...args: unknown[]) => mockOnMutationError(...args),
}));

vi.mock("../lib/api-client", () => {
  function jr(payload: unknown) {
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: vi.fn().mockResolvedValue(payload),
    };
  }
  function ok() {
    return { ok: true };
  }
  return {
    api: {
      api: {
        accounting: {
          accounts: {
            $get: vi.fn().mockResolvedValue(jr([])),
            $post: vi.fn().mockResolvedValue(jr({ id: "acc-1" })),
            seed: {
              $post: vi.fn().mockResolvedValue(jr({ seeded: true })),
            },
            ":accountId": {
              $get: vi.fn().mockResolvedValue(jr({ id: "acc-1" })),
              $patch: vi.fn().mockResolvedValue(jr({ id: "acc-1" })),
              ledger: {
                $get: vi.fn().mockResolvedValue(jr({ account: {}, lines: [] })),
              },
            },
          },
          periods: {
            $get: vi.fn().mockResolvedValue(jr([])),
            $post: vi.fn().mockResolvedValue(jr({ id: "period-1" })),
            ":periodId": {
              $patch: vi.fn().mockResolvedValue(jr({ id: "period-1" })),
              close: {
                $post: vi.fn().mockResolvedValue(jr({ id: "period-1" })),
              },
            },
          },
          "fiscal-periods": {
            ":periodId": {
              "close-checklist": {
                $get: vi
                  .fn()
                  .mockResolvedValue(jr({ periodId: "period-1", readyToClose: true, checks: [] })),
              },
            },
          },
          journal: {
            $get: vi.fn().mockResolvedValue(jr([])),
            $post: vi.fn().mockResolvedValue(jr({ id: "je-1" })),
            ":entryId": {
              $get: vi.fn().mockResolvedValue(jr({ id: "je-1" })),
              reverse: {
                $post: vi.fn().mockResolvedValue(jr({ id: "je-2" })),
              },
            },
          },
          reports: {
            "trial-balance": { $get: vi.fn().mockResolvedValue(jr([])) },
            "financial-position": { $get: vi.fn().mockResolvedValue(jr({})) },
            activities: { $get: vi.fn().mockResolvedValue(jr({})) },
            "functional-expenses": { $get: vi.fn().mockResolvedValue(jr({})) },
          },
          seed: {
            "opening-balances": {
              $post: vi.fn().mockResolvedValue(
                jr({
                  dryRun: false,
                  donations: 0,
                  expenses: 0,
                  estimatedJEs: 0,
                  fiscalPeriodCreated: false,
                  errors: [],
                }),
              ),
            },
          },
          "bank-accounts": {
            $get: vi.fn().mockResolvedValue(jr([])),
            $post: vi.fn().mockResolvedValue(jr({ id: "ba-1" })),
            ":bankAccountId": {
              $patch: vi.fn().mockResolvedValue(jr({ id: "ba-1" })),
              $delete: vi.fn().mockResolvedValue(ok()),
              transactions: { $get: vi.fn().mockResolvedValue(jr([])) },
              import: { $post: vi.fn().mockResolvedValue(jr({ imported: 1 })) },
              match: { $post: vi.fn().mockResolvedValue(jr({ matched: true })) },
              ignore: { $post: vi.fn().mockResolvedValue(jr({ ignored: true })) },
              unmatch: { $post: vi.fn().mockResolvedValue(jr({ unmatched: true })) },
            },
          },
          reconciliations: {
            $post: vi.fn().mockResolvedValue(jr({ id: "recon-1" })),
            ":reconId": {
              complete: { $post: vi.fn().mockResolvedValue(jr({ id: "recon-1" })) },
              $delete: vi.fn().mockResolvedValue(ok()),
            },
          },
          "recurring-templates": {
            $get: vi.fn().mockResolvedValue(jr([])),
            $post: vi.fn().mockResolvedValue(jr({ id: "tmpl-1" })),
            ":templateId": {
              $patch: vi.fn().mockResolvedValue(jr({ id: "tmpl-1" })),
              $delete: vi.fn().mockResolvedValue(ok()),
              run: { $post: vi.fn().mockResolvedValue(jr({ id: "je-3" })) },
            },
          },
        },
        org: {
          settings: {
            $patch: vi.fn().mockResolvedValue(jr({ accountingEnabled: true })),
          },
        },
      },
    },
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
  keepPreviousData: Symbol("keepPreviousData"),
}));

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  useAccounts,
  useAccount,
  useCreateAccount,
  useUpdateAccount,
  useSeedChartOfAccounts,
  useFiscalPeriods,
  useCreateFiscalPeriod,
  useCloseFiscalPeriod,
  useUpdateFiscalPeriod,
  usePeriodCloseChecklist,
  useJournalEntries,
  useJournalEntry,
  useCreateJournalEntry,
  useReverseJournalEntry,
  useTrialBalance,
  useAccountLedger,
  useSeedOpeningBalances,
  useBankAccounts,
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
  useBankTransactions,
  useImportBankTransactions,
  useMatchBankTransaction,
  useIgnoreBankTransaction,
  useUnmatchBankTransaction,
  useCreateReconciliation,
  useCompleteReconciliation,
  useCancelReconciliation,
  useFinancialPosition,
  useStatementOfActivities,
  useFunctionalExpenses,
  useRecurringTemplates,
  useCreateRecurringTemplate,
  useUpdateRecurringTemplate,
  useDeleteRecurringTemplate,
  useRunRecurringTemplate,
  useEnableAccounting,
} from "./use-accounting";

function resetMocks() {
  vi.mocked(useQuery).mockClear();
  vi.mocked(useMutation).mockClear();
  mockInvalidateQueries.mockClear();
  mockCaptureEvent.mockClear();
  mockOnMutationError.mockClear();
}

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureMutationFn() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as { mutationFn: (arg: unknown) => Promise<unknown> }).mutationFn;
}

function captureOnSuccess() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as { onSuccess: (data: unknown, vars: unknown) => void }).onSuccess;
}

function captureOnError() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as { onError?: (error: unknown) => void }).onError;
}

// Views derived from journal-entry balances that every balance-changing mutation
// must refresh (see invalidateAccountingBalanceViews in use-accounting.ts).
function expectBalanceViewsInvalidated() {
  for (const queryKey of [
    ["accounting-trial-balance"],
    ["accounting-ledger"],
    ["accounting-report-financial-position"],
    ["accounting-report-activities"],
    ["accounting-report-functional-expenses"],
  ]) {
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey });
  }
}

describe("chart of accounts queries", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
  });

  it("loads accounts list", async () => {
    useAccounts();
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads accounts list with filters", async () => {
    useAccounts({ search: "cash", type: "asset", isActive: true, page: 2, pageSize: 10 });
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads a single account", async () => {
    useAccount("acc-1");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    const result = await captureQueryFn()();
    expect(result).toMatchObject({ id: "acc-1" });
  });

  it("disables account query when id is empty", () => {
    useAccount("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe("chart of accounts mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("creates an account and invalidates list", async () => {
    useCreateAccount();
    const result = await captureMutationFn()({
      code: "1000",
      name: "Cash",
      type: "asset",
      parentAccountId: "parent-1",
      isActive: true,
    });
    expect(result).toMatchObject({ id: "acc-1" });
    captureOnSuccess()(result, {
      code: "1000",
      name: "Cash",
      type: "asset",
      parentAccountId: "parent-1",
      isActive: true,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("account_created", {
      account_type: "asset",
      has_parent: true,
      is_active: true,
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounting-accounts"] });
  });

  it("updates an account and invalidates list and detail", async () => {
    useUpdateAccount("acc-1");
    const result = await captureMutationFn()({ type: "liability", isActive: false });
    captureOnSuccess()(result, { type: "liability", isActive: false });
    expect(mockCaptureEvent).toHaveBeenCalledWith("account_updated", {
      account_type_changed: true,
      active_status_changed: true,
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounting-accounts"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-account", "acc-1"],
    });
    // Renaming or re-coding an account changes the account name/code that the
    // trial balance, ledger, and the three FASB reports embed server-side in
    // every row/line, so those balance views must be refreshed too — or they
    // keep showing the old account name/code until a full reload.
    expectBalanceViewsInvalidated();
  });

  it("seeds chart of accounts", async () => {
    useSeedChartOfAccounts();
    const result = await captureMutationFn()(undefined);
    expect(result).toMatchObject({ seeded: true });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("chart_of_accounts_seeded");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounting-accounts"] });
  });
});

describe("fiscal period queries and mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("loads fiscal periods", async () => {
    useFiscalPeriods();
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["accounting-fiscal-periods"] }),
    );
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("creates a fiscal period", async () => {
    useCreateFiscalPeriod();
    const result = await captureMutationFn()({
      name: "FY2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(result).toMatchObject({ id: "period-1" });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("fiscal_period_created");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-fiscal-periods"],
    });
  });

  it("closes a fiscal period", async () => {
    useCloseFiscalPeriod("period-1");
    const result = await captureMutationFn()(undefined);
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("fiscal_period_closed");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-fiscal-periods"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-period-close-checklist"],
    });
  });

  it("updates a fiscal period", async () => {
    useUpdateFiscalPeriod("period-1");
    const result = await captureMutationFn()({ name: "FY2026 Updated" });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("fiscal_period_updated");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-fiscal-periods"],
    });
  });

  it("loads period close checklist", async () => {
    usePeriodCloseChecklist("period-1");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    const result = await captureQueryFn()();
    expect(result).toMatchObject({ periodId: "period-1" });
  });

  it("disables checklist query when periodId is empty", () => {
    usePeriodCloseChecklist("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe("journal entry queries and mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("loads journal entries list", async () => {
    useJournalEntries();
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(["accounting-journal-entries"]),
      }),
    );
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads journal entries with filters", async () => {
    useJournalEntries({
      fiscalPeriodId: "period-1",
      source: "manual",
      from: "2026-01-01",
      to: "2026-12-31",
      page: 2,
      pageSize: 25,
    });
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads a single journal entry", async () => {
    useJournalEntry("je-1");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    const result = await captureQueryFn()();
    expect(result).toMatchObject({ id: "je-1" });
  });

  it("disables journal entry query when id is empty", () => {
    useJournalEntry("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("creates a journal entry, fires journal_entry_created, and invalidates entries", async () => {
    useCreateJournalEntry();
    const result = await captureMutationFn()({
      date: "2026-04-01",
      fiscalPeriodId: "period-1",
      lines: [],
    });
    expect(result).toMatchObject({ id: "je-1" });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("journal_entry_created");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expectBalanceViewsInvalidated();
  });

  it("does not fire journal_entry_created before onSuccess is called", async () => {
    useCreateJournalEntry();
    await captureMutationFn()({ date: "2026-04-01", fiscalPeriodId: "period-1", lines: [] });
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("calls onMutationError handler when useCreateJournalEntry mutation errors", () => {
    useCreateJournalEntry();
    const onError = captureOnError();
    expect(onError).toBeDefined();
    const err = new Error("server error");
    onError?.(err);
    expect(mockOnMutationError).toHaveBeenCalledWith(err);
    expect(mockCaptureEvent).toHaveBeenCalledWith("accounting_operation_failed", {
      operation: "create_journal_entry",
      failure_type: "request_error",
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "accounting_operation_failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it("tracks validation failures for accounting operations without raw messages", () => {
    useReverseJournalEntry("je-1");
    const onError = captureOnError();
    expect(onError).toBeDefined();
    onError?.(new Error("fiscal period is required"));
    expect(mockCaptureEvent).toHaveBeenCalledWith("accounting_operation_failed", {
      operation: "reverse_journal_entry",
      failure_type: "validation_error",
    });
  });

  it("reverses a journal entry and invalidates entries and detail", async () => {
    useReverseJournalEntry("je-1");
    const result = await captureMutationFn()({ date: "2026-04-15", memo: "Reversal" });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("journal_entry_reversed");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entry", "je-1"],
    });
    expectBalanceViewsInvalidated();
  });
});

describe("trial balance and ledger queries", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
  });

  it("loads trial balance", async () => {
    useTrialBalance({ asOf: "2026-04-25" });
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["accounting-trial-balance", "2026-04-25", "", ""],
      }),
    );
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads trial balance with fund and grant filters", async () => {
    useTrialBalance({ asOf: "2026-04-25", fundId: "fund-1", grantId: "grant-1" });
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["accounting-trial-balance", "2026-04-25", "fund-1", "grant-1"],
      }),
    );
  });

  it("loads account ledger", async () => {
    useAccountLedger("acc-1");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    const result = await captureQueryFn()();
    expect(result).toMatchObject({ account: {}, lines: [] });
  });

  it("loads account ledger with filters", async () => {
    useAccountLedger("acc-1", {
      from: "2026-01-01",
      to: "2026-12-31",
      fundId: "fund-1",
      grantId: "grant-1",
    });
    const result = await captureQueryFn()();
    expect(result).toMatchObject({ account: {}, lines: [] });
  });

  it("disables account ledger query when accountId is empty", () => {
    useAccountLedger("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe("opening balances seed", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("seeds opening balances (live run) and invalidates caches", async () => {
    useSeedOpeningBalances();
    const result = await captureMutationFn()({ dryRun: false });
    captureOnSuccess()(result, { dryRun: false });
    expect(mockCaptureEvent).toHaveBeenCalledWith("opening_balances_seeded", {
      dry_run: false,
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-fiscal-periods"],
    });
    expectBalanceViewsInvalidated();
  });

  it("skips cache invalidation on dry run", async () => {
    useSeedOpeningBalances();
    const result = await captureMutationFn()({ dryRun: true });
    captureOnSuccess()(result, { dryRun: true });
    expect(mockCaptureEvent).toHaveBeenCalledWith("opening_balances_seeded", {
      dry_run: true,
    });
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});

describe("bank accounts mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
  });

  it("loads bank accounts", async () => {
    useBankAccounts();
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["accounting-bank-accounts"] }),
    );
  });

  it("creates a bank account", async () => {
    useCreateBankAccount();
    const result = await captureMutationFn()({
      name: "Checking",
      accountNumber: "1234",
      glAccountId: "acc-1",
    });
    expect(result).toMatchObject({ id: "ba-1" });
    captureOnSuccess()(result, {
      name: "Checking",
      accountNumber: "1234",
      glAccountId: "acc-1",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("bank_account_created", {
      has_account_number: true,
      has_gl_account: true,
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-accounts"],
    });
  });

  it("updates a bank account", async () => {
    useUpdateBankAccount("ba-1");
    const result = await captureMutationFn()({
      accountNumber: null,
      glAccountId: "acc-2",
    });
    captureOnSuccess()(result, { accountNumber: null, glAccountId: "acc-2" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("bank_account_updated", {
      account_number_changed: true,
      gl_account_changed: true,
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-accounts"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-account", "ba-1"],
    });
  });

  it("deletes a bank account", async () => {
    useDeleteBankAccount();
    await captureMutationFn()("ba-1");
    captureOnSuccess()(undefined, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("bank_account_deleted");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-accounts"],
    });
  });
});

describe("bank transactions queries and mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("loads bank transactions", async () => {
    useBankTransactions("ba-1");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads bank transactions with filters", async () => {
    useBankTransactions("ba-1", {
      status: "unmatched",
      page: 2,
      pageSize: 10,
    });
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("disables bank transactions query when bankAccountId is empty", () => {
    useBankTransactions("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("imports bank transactions", async () => {
    useImportBankTransactions("ba-1");
    const result = await captureMutationFn()({ format: "csv", content: "date,amount\n" });
    expect(result).toMatchObject({ imported: 1 });
    captureOnSuccess()(result, { format: "csv", content: "date,amount\n" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("bank_transactions_imported", {
      import_format: "csv",
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-transactions", "ba-1"],
    });
  });

  it("matches a bank transaction", async () => {
    useMatchBankTransaction("ba-1");
    const result = await captureMutationFn()({
      bankTransactionId: "tx-1",
      journalEntryId: "je-1",
    });
    expect(result).toMatchObject({ matched: true });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("bank_transaction_matched");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-transactions", "ba-1"],
    });
    // Matching changes a transaction's status, which drives the period-close
    // checklist's no_unmatched_transactions check — refresh it too.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-period-close-checklist"],
    });
  });

  it("ignores a bank transaction", async () => {
    useIgnoreBankTransaction("ba-1");
    const result = await captureMutationFn()({ bankTransactionId: "tx-1" });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("bank_transaction_ignored");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-transactions", "ba-1"],
    });
    // Ignoring changes a transaction's status, which drives the period-close
    // checklist's no_unmatched_transactions check — refresh it too.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-period-close-checklist"],
    });
  });

  it("unmatches a bank transaction", async () => {
    useUnmatchBankTransaction("ba-1");
    const result = await captureMutationFn()({ bankTransactionId: "tx-1" });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("bank_transaction_unmatched");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-transactions", "ba-1"],
    });
    // Unmatching changes a transaction's status, which drives the period-close
    // checklist's no_unmatched_transactions check — refresh it too.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-period-close-checklist"],
    });
  });
});

describe("reconciliation mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("creates a reconciliation", async () => {
    useCreateReconciliation();
    const result = await captureMutationFn()({
      bankAccountId: "ba-1",
      statementDate: "2026-03-31",
      statementEndingBalanceCents: 100000,
    });
    expect(result).toMatchObject({ id: "recon-1" });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("reconciliation_started");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-transactions"],
    });
  });

  it("completes a reconciliation", async () => {
    useCompleteReconciliation();
    const result = await captureMutationFn()("recon-1");
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("reconciliation_completed");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-transactions"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entry"],
    });
  });

  it("cancels a reconciliation", async () => {
    useCancelReconciliation();
    await captureMutationFn()("recon-1");
    captureOnSuccess()(undefined, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("reconciliation_cancelled");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-bank-transactions"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entry"],
    });
  });
});

describe("FASB report queries", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
  });

  it("loads financial position", async () => {
    useFinancialPosition("2026-04-25");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    const result = await captureQueryFn()();
    expect(result).toEqual({});
  });

  it("disables financial position when asOf is empty", () => {
    useFinancialPosition("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("loads statement of activities", async () => {
    useStatementOfActivities("2026-01-01", "2026-12-31");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    const result = await captureQueryFn()();
    expect(result).toEqual({});
  });

  it("disables statement of activities when dates are empty", () => {
    useStatementOfActivities("", "");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("loads functional expenses", async () => {
    useFunctionalExpenses("2026-01-01", "2026-12-31");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    const result = await captureQueryFn()();
    expect(result).toEqual({});
  });

  it("disables functional expenses when dates are empty", () => {
    useFunctionalExpenses("", "");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe("recurring templates", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("loads recurring templates", async () => {
    useRecurringTemplates();
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads recurring templates with isActive filter", async () => {
    useRecurringTemplates(true);
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("creates a recurring template", async () => {
    useCreateRecurringTemplate();
    const result = await captureMutationFn()({
      name: "Monthly Rent",
      frequency: "monthly",
      nextRunDate: "2026-05-01",
      lines: [],
    });
    expect(result).toMatchObject({ id: "tmpl-1" });
    captureOnSuccess()(result, {
      name: "Monthly Rent",
      frequency: "monthly",
      nextRunDate: "2026-05-01",
      isActive: true,
      lines: [],
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("recurring_template_created", {
      frequency: "monthly",
      is_active: true,
      line_count_bucket: "0",
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-recurring-templates"],
    });
  });

  it("updates a recurring template", async () => {
    useUpdateRecurringTemplate("tmpl-1");
    const result = await captureMutationFn()({
      frequency: "quarterly",
      isActive: false,
      lines: [{ accountId: "acc-1", debitCents: 1000, creditCents: 0 }],
    });
    captureOnSuccess()(result, {
      frequency: "quarterly",
      isActive: false,
      lines: [{ accountId: "acc-1", debitCents: 1000, creditCents: 0 }],
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("recurring_template_updated", {
      active_status_changed: true,
      frequency_changed: true,
      lines_changed: true,
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-recurring-templates"],
    });
  });

  it("deletes a recurring template", async () => {
    useDeleteRecurringTemplate();
    await captureMutationFn()("tmpl-1");
    captureOnSuccess()(undefined, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("recurring_template_deleted");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-recurring-templates"],
    });
  });

  it("runs a recurring template", async () => {
    useRunRecurringTemplate();
    const result = await captureMutationFn()("tmpl-1");
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("recurring_template_run");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-recurring-templates"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expectBalanceViewsInvalidated();
  });
});

describe("enable accounting", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("enables accounting and invalidates org profile", async () => {
    useEnableAccounting();
    const result = await captureMutationFn()(undefined);
    expect(result).toMatchObject({ accountingEnabled: true });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("accounting_enabled");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["org-profile"] });
  });
});

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
  type QueryClient,
} from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { readResponseOrThrow, throwIfNotOk } from "../lib/http-response";
import { captureEvent } from "../lib/analytics";
import { onMutationError } from "../lib/mutation-error";
import type {
  AccountListParams,
  CreateAccountInput,
  CreateFiscalPeriodInput,
  CreateJournalEntryInput,
  JournalEntryListParams,
  LedgerQueryParams,
  ReverseJournalEntryInput,
  TrialBalanceQueryParams,
  UpdateAccountInput,
  UpdateFiscalPeriodInput,
} from "@grantpipe/shared";

const accounting = api.api.accounting;
const org = api.api.org;

// Every view whose numbers are derived from journal-entry balances. Any mutation
// that posts or reverses journal entries (create/reverse entry, run recurring
// template, seed opening balances, record/remove a grant payment) must refresh
// these or they show stale figures. Exported so the payments domain can reuse the
// canonical key list rather than duplicating it.
export function invalidateAccountingBalanceViews(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["accounting-trial-balance"] });
  void queryClient.invalidateQueries({ queryKey: ["accounting-ledger"] });
  void queryClient.invalidateQueries({ queryKey: ["accounting-report-financial-position"] });
  void queryClient.invalidateQueries({ queryKey: ["accounting-report-activities"] });
  void queryClient.invalidateQueries({ queryKey: ["accounting-report-functional-expenses"] });
}

function getCountBucket(count: number) {
  if (count <= 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  return "50+";
}

function getFailureType(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  return /required|invalid|missing|validation/i.test(error.message)
    ? "validation_error"
    : "request_error";
}

function trackAccountingOperationFailure(operation: string) {
  return (error: unknown) => {
    captureEvent("accounting_operation_failed", {
      operation,
      failure_type: getFailureType(error),
    });
  };
}

function handleJournalEntryError(error: unknown) {
  trackAccountingOperationFailure("create_journal_entry")(error);
  onMutationError(error);
}

// ---------------------------------------------------------------------------
// Derived response types from the Hono RPC client
// ---------------------------------------------------------------------------

type Awaited<T> = T extends Promise<infer U> ? U : T;
// We derive the types via the actual return type of the query functions.
// These are exported for use in route components.
export type AccountRow =
  Awaited<ReturnType<typeof accounting.accounts.$get>> extends {
    json(): Promise<infer T>;
  }
    ? T extends unknown[]
      ? T[number]
      : never
    : never;

export type FiscalPeriodRow = {
  id: string;
  orgId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed" | "locked";
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type JournalLineRow = {
  id: string;
  orgId: string;
  journalEntryId: string;
  lineNumber: number;
  accountId: string;
  fundId: string | null;
  grantId: string | null;
  contactId: string | null;
  debitCents: number;
  creditCents: number;
  memo: string | null;
  reconciliationId: string | null;
  externalSourceSystem: string | null;
  externalSourceObjectId: string | null;
  externalSourceObjectType: string | null;
  externalSourceSyncedAt: string | null;
  externalSourceStatus: string | null;
};

export type JournalEntryRow = {
  id: string;
  orgId: string;
  entryNumber: number;
  date: string;
  fiscalPeriodId: string;
  memo: string | null;
  source: string;
  postedBy: string | null;
  isAdjusting: boolean;
  reversedByEntryId: string | null;
  externalSourceSystem: string | null;
  externalSourceObjectId: string | null;
  externalSourceObjectType: string | null;
  externalSourceSyncedAt: string | null;
  externalSourceStatus: string | null;
  createdAt: string;
  lines: JournalLineRow[];
};

export type TrialBalanceRow = {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
    subtype: string | null;
    naturalRestriction: string | null;
    functionalClass: string | null;
    isActive: boolean;
  };
  debitTotal: number;
  creditTotal: number;
  balance: number;
};

export type LedgerLineEntry = {
  line: {
    id: string;
    lineNumber: number;
    accountId: string;
    fundId: string | null;
    grantId: string | null;
    contactId: string | null;
    debitCents: number;
    creditCents: number;
    memo: string | null;
  };
  journalEntry: {
    id: string;
    entryNumber: number;
    date: string;
    memo: string | null;
    source: string;
    isAdjusting: boolean;
  };
  runningBalance: number;
};

export type LedgerResult = {
  account: {
    id: string;
    orgId: string;
    code: string;
    name: string;
    type: string;
    subtype: string | null;
    naturalRestriction: string | null;
    functionalClass: string | null;
    isActive: boolean;
    parentAccountId: string | null;
    deletedAt: string | null;
    createdAt: string;
  };
  lines: LedgerLineEntry[];
};

export type SeedResult = {
  dryRun: boolean;
  donations: number;
  expenses: number;
  estimatedJEs: number;
  fiscalPeriodCreated: boolean;
  errors: string[];
};

export type PeriodCloseChecklist = {
  periodId: string;
  periodName: string;
  periodStatus: string;
  checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  readyToClose: boolean;
};

// ---------------------------------------------------------------------------
// Chart of Accounts
// ---------------------------------------------------------------------------

export function useAccounts(params: Partial<AccountListParams> = {}) {
  return useQuery({
    queryKey: [
      "accounting-accounts",
      params.search ?? "",
      params.type ?? "",
      params.isActive ?? "",
      params.page ?? 1,
      params.pageSize ?? 100,
    ],
    queryFn: async () => {
      const res = await accounting.accounts.$get({
        query: {
          ...(params.search ? { search: params.search } : {}),
          ...(params.type ? { type: params.type } : {}),
          ...(params.isActive !== undefined
            ? { isActive: String(params.isActive) as "true" | "false" }
            : {}),
          ...(params.page ? { page: String(params.page) } : {}),
          ...(params.pageSize ? { pageSize: String(params.pageSize) } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
    placeholderData: keepPreviousData,
  });
}

export function useAccount(accountId: string) {
  return useQuery({
    queryKey: ["accounting-account", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const res = await accounting.accounts[":accountId"].$get({
        param: { accountId },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateAccountInput) => {
      const res = await accounting.accounts.$post({ json: data });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      captureEvent("account_created", {
        account_type: variables.type,
        has_parent: Boolean(variables.parentAccountId),
        is_active: variables.isActive ?? true,
      });
      void queryClient.invalidateQueries({ queryKey: ["accounting-accounts"] });
    },
    onError: trackAccountingOperationFailure("create_account"),
  });
}

export function useUpdateAccount(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateAccountInput) => {
      const res = await accounting.accounts[":accountId"].$patch({
        param: { accountId },
        json: data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      captureEvent("account_updated", {
        account_type_changed: variables.type !== undefined,
        active_status_changed: variables.isActive !== undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["accounting-accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting-account", accountId] });
      // The account's name and code are denormalized into every balance view:
      // the trial balance and ledger embed account.code/account.name per row,
      // and the three FASB reports embed account names in their line items.
      // Renaming or re-coding an account must refresh those views, or they keep
      // showing the stale name/code until a full page reload.
      invalidateAccountingBalanceViews(queryClient);
    },
    onError: trackAccountingOperationFailure("update_account"),
  });
}

export function useSeedChartOfAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await accounting.accounts.seed.$post({});
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("chart_of_accounts_seeded");
      void queryClient.invalidateQueries({ queryKey: ["accounting-accounts"] });
    },
    onError: trackAccountingOperationFailure("seed_chart_of_accounts"),
  });
}

// ---------------------------------------------------------------------------
// Fiscal Periods
// ---------------------------------------------------------------------------

export function useFiscalPeriods() {
  return useQuery({
    queryKey: ["accounting-fiscal-periods"],
    queryFn: async () => {
      const res = await accounting.periods.$get({});
      return readResponseOrThrow(res);
    },
  });
}

export function useCreateFiscalPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateFiscalPeriodInput) => {
      const res = await accounting.periods.$post({ json: data });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("fiscal_period_created");
      void queryClient.invalidateQueries({ queryKey: ["accounting-fiscal-periods"] });
    },
    onError: trackAccountingOperationFailure("create_fiscal_period"),
  });
}

export function useCloseFiscalPeriod(periodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await accounting.periods[":periodId"].close.$post({
        param: { periodId },
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("fiscal_period_closed");
      void queryClient.invalidateQueries({ queryKey: ["accounting-fiscal-periods"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting-period-close-checklist"] });
    },
    onError: trackAccountingOperationFailure("close_fiscal_period"),
  });
}

export function useUpdateFiscalPeriod(periodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateFiscalPeriodInput) => {
      const res = await accounting.periods[":periodId"].$patch({
        param: { periodId },
        json: data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("fiscal_period_updated");
      void queryClient.invalidateQueries({ queryKey: ["accounting-fiscal-periods"] });
    },
    onError: trackAccountingOperationFailure("update_fiscal_period"),
  });
}

export function usePeriodCloseChecklist(periodId: string) {
  return useQuery({
    queryKey: ["accounting-period-close-checklist", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const res = await accounting["fiscal-periods"][":periodId"]["close-checklist"].$get({
        param: { periodId },
      });
      return readResponseOrThrow(res);
    },
  });
}

// ---------------------------------------------------------------------------
// Journal Entries
// ---------------------------------------------------------------------------

export function useJournalEntries(params: Partial<JournalEntryListParams> = {}) {
  return useQuery({
    queryKey: [
      "accounting-journal-entries",
      params.fiscalPeriodId ?? "",
      params.source ?? "",
      params.from ?? "",
      params.to ?? "",
      params.page ?? 1,
      params.pageSize ?? 50,
    ],
    queryFn: async () => {
      const res = await accounting.journal.$get({
        query: {
          ...(params.fiscalPeriodId ? { fiscalPeriodId: params.fiscalPeriodId } : {}),
          ...(params.source ? { source: params.source } : {}),
          ...(params.from ? { from: params.from } : {}),
          ...(params.to ? { to: params.to } : {}),
          ...(params.page ? { page: String(params.page) } : {}),
          ...(params.pageSize ? { pageSize: String(params.pageSize) } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
    placeholderData: keepPreviousData,
  });
}

export function useJournalEntry(entryId: string) {
  return useQuery({
    queryKey: ["accounting-journal-entry", entryId],
    enabled: !!entryId,
    queryFn: async () => {
      const res = await accounting.journal[":entryId"].$get({
        param: { entryId },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateJournalEntryInput) => {
      const res = await accounting.journal.$post({ json: data });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("journal_entry_created");
      void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entries"] });
      invalidateAccountingBalanceViews(queryClient);
    },
    onError: handleJournalEntryError,
  });
}

export function useReverseJournalEntry(entryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ReverseJournalEntryInput) => {
      const res = await accounting.journal[":entryId"].reverse.$post({
        param: { entryId },
        json: data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("journal_entry_reversed");
      void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entry", entryId] });
      invalidateAccountingBalanceViews(queryClient);
    },
    onError: trackAccountingOperationFailure("reverse_journal_entry"),
  });
}

// ---------------------------------------------------------------------------
// Trial Balance
// ---------------------------------------------------------------------------

export function useTrialBalance(params: TrialBalanceQueryParams) {
  return useQuery({
    queryKey: ["accounting-trial-balance", params.asOf, params.fundId ?? "", params.grantId ?? ""],
    queryFn: async () => {
      const res = await accounting.reports["trial-balance"].$get({
        query: {
          asOf: params.asOf,
          ...(params.fundId ? { fundId: params.fundId } : {}),
          ...(params.grantId ? { grantId: params.grantId } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

// ---------------------------------------------------------------------------
// Account Ledger
// ---------------------------------------------------------------------------

export function useAccountLedger(accountId: string, params: Partial<LedgerQueryParams> = {}) {
  return useQuery({
    queryKey: [
      "accounting-ledger",
      accountId,
      params.from ?? "",
      params.to ?? "",
      params.fundId ?? "",
      params.grantId ?? "",
    ],
    enabled: !!accountId,
    queryFn: async () => {
      const res = await accounting.accounts[":accountId"].ledger.$get({
        param: { accountId },
        query: {
          ...(params.from ? { from: params.from } : {}),
          ...(params.to ? { to: params.to } : {}),
          ...(params.fundId ? { fundId: params.fundId } : {}),
          ...(params.grantId ? { grantId: params.grantId } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

// ---------------------------------------------------------------------------
// Opening Balances Seed
// ---------------------------------------------------------------------------

export function useSeedOpeningBalances() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }) => {
      const res = await accounting.seed["opening-balances"].$post({
        query: { dryRun: String(dryRun) as "true" | "false" },
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      captureEvent("opening_balances_seeded", {
        dry_run: variables.dryRun,
      });
      if (!variables.dryRun) {
        void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entries"] });
        void queryClient.invalidateQueries({ queryKey: ["accounting-fiscal-periods"] });
        void queryClient.invalidateQueries({ queryKey: ["org-profile"] });
        invalidateAccountingBalanceViews(queryClient);
      }
    },
    onError: trackAccountingOperationFailure("seed_opening_balances"),
  });
}

// ---------------------------------------------------------------------------
// Bank Accounts
// ---------------------------------------------------------------------------

export type BankAccountRow = {
  id: string;
  orgId: string;
  name: string;
  accountNumber: string | null;
  glAccountId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BankTransactionRow = {
  id: string;
  orgId: string;
  bankAccountId: string;
  date: string;
  amountCents: number;
  description: string;
  referenceNumber: string | null;
  status: "unmatched" | "matched" | "ignored";
  journalEntryId: string | null;
  journalEntryNumber: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ReconciliationRow = {
  id: string;
  orgId: string;
  bankAccountId: string;
  statementDate: string;
  statementEndingBalanceCents: number;
  reconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function useBankAccounts() {
  return useQuery({
    queryKey: ["accounting-bank-accounts"],
    queryFn: async () => {
      const res = await accounting["bank-accounts"].$get({});
      return readResponseOrThrow(res);
    },
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; accountNumber?: string; glAccountId?: string }) => {
      const res = await accounting["bank-accounts"].$post({ json: data });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      captureEvent("bank_account_created", {
        has_account_number: Boolean(variables.accountNumber),
        has_gl_account: Boolean(variables.glAccountId),
      });
      void queryClient.invalidateQueries({ queryKey: ["accounting-bank-accounts"] });
    },
    onError: trackAccountingOperationFailure("create_bank_account"),
  });
}

export function useUpdateBankAccount(bankAccountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name?: string;
      accountNumber?: string | null;
      glAccountId?: string | null;
    }) => {
      const res = await accounting["bank-accounts"][":bankAccountId"].$patch({
        param: { bankAccountId },
        json: data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      captureEvent("bank_account_updated", {
        account_number_changed: variables.accountNumber !== undefined,
        gl_account_changed: variables.glAccountId !== undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["accounting-bank-accounts"] });
      void queryClient.invalidateQueries({
        queryKey: ["accounting-bank-account", bankAccountId],
      });
    },
    onError: trackAccountingOperationFailure("update_bank_account"),
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bankAccountId: string) => {
      const res = await accounting["bank-accounts"][":bankAccountId"].$delete({
        param: { bankAccountId },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to delete bank account.");
      }
    },
    onSuccess: () => {
      captureEvent("bank_account_deleted");
      void queryClient.invalidateQueries({ queryKey: ["accounting-bank-accounts"] });
    },
    onError: trackAccountingOperationFailure("delete_bank_account"),
  });
}

export function useBankTransactions(
  bankAccountId: string,
  params: { status?: "unmatched" | "matched" | "ignored"; page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: [
      "accounting-bank-transactions",
      bankAccountId,
      params.status ?? "",
      params.page ?? 1,
      params.pageSize ?? 50,
    ],
    enabled: !!bankAccountId,
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params.status) query.status = params.status;
      if (params.page) query.page = String(params.page);
      if (params.pageSize) query.pageSize = String(params.pageSize);
      const txGetArgs: { param: { bankAccountId: string }; query?: Record<string, string> } = {
        param: { bankAccountId },
      };
      if (Object.keys(query).length > 0) txGetArgs.query = query;
      const res = await accounting["bank-accounts"][":bankAccountId"].transactions.$get(txGetArgs);
      return readResponseOrThrow(res);
    },
    placeholderData: keepPreviousData,
  });
}

export function useImportBankTransactions(bankAccountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { format: "csv" | "ofx"; content: string }) => {
      const res = await accounting["bank-accounts"][":bankAccountId"].import.$post({
        param: { bankAccountId },
        json: { bankAccountId, ...data },
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      captureEvent("bank_transactions_imported", {
        import_format: variables.format,
      });
      void queryClient.invalidateQueries({
        queryKey: ["accounting-bank-transactions", bankAccountId],
      });
    },
    onError: trackAccountingOperationFailure("import_bank_transactions"),
  });
}

export function useMatchBankTransaction(bankAccountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { bankTransactionId: string; journalEntryId: string }) => {
      const res = await accounting["bank-accounts"][":bankAccountId"].match.$post({
        param: { bankAccountId },
        json: data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("bank_transaction_matched");
      void queryClient.invalidateQueries({
        queryKey: ["accounting-bank-transactions", bankAccountId],
      });
      // Matching flips a transaction's status, which the period-close
      // checklist counts for no_unmatched_transactions. Prefix-invalidate
      // (these mutations don't know the affected period id).
      void queryClient.invalidateQueries({
        queryKey: ["accounting-period-close-checklist"],
      });
    },
    onError: trackAccountingOperationFailure("match_bank_transaction"),
  });
}

export function useIgnoreBankTransaction(bankAccountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { bankTransactionId: string }) => {
      const res = await accounting["bank-accounts"][":bankAccountId"].ignore.$post({
        param: { bankAccountId },
        json: data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("bank_transaction_ignored");
      void queryClient.invalidateQueries({
        queryKey: ["accounting-bank-transactions", bankAccountId],
      });
      // Ignoring flips a transaction's status, which the period-close
      // checklist counts for no_unmatched_transactions. Prefix-invalidate
      // (these mutations don't know the affected period id).
      void queryClient.invalidateQueries({
        queryKey: ["accounting-period-close-checklist"],
      });
    },
    onError: trackAccountingOperationFailure("ignore_bank_transaction"),
  });
}

export function useUnmatchBankTransaction(bankAccountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { bankTransactionId: string }) => {
      const res = await accounting["bank-accounts"][":bankAccountId"].unmatch.$post({
        param: { bankAccountId },
        json: data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("bank_transaction_unmatched");
      void queryClient.invalidateQueries({
        queryKey: ["accounting-bank-transactions", bankAccountId],
      });
      // Unmatching flips a transaction's status, which the period-close
      // checklist counts for no_unmatched_transactions. Prefix-invalidate
      // (these mutations don't know the affected period id).
      void queryClient.invalidateQueries({
        queryKey: ["accounting-period-close-checklist"],
      });
    },
    onError: trackAccountingOperationFailure("unmatch_bank_transaction"),
  });
}

export function useCreateReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      bankAccountId: string;
      statementDate: string;
      statementEndingBalanceCents: number;
    }) => {
      const res = await accounting.reconciliations.$post({ json: data });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("reconciliation_started");
      void queryClient.invalidateQueries({ queryKey: ["accounting-bank-transactions"] });
    },
    onError: trackAccountingOperationFailure("create_reconciliation"),
  });
}

export function useCompleteReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reconId: string) => {
      const res = await accounting.reconciliations[":reconId"].complete.$post({
        param: { reconId },
        json: {},
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("reconciliation_completed");
      void queryClient.invalidateQueries({ queryKey: ["accounting-bank-transactions"] });
      // Completing a reconciliation stamps reconciliationId on the matched journal
      // entry lines, which the journal views render as a LOCKED badge.
      void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entry"] });
    },
    onError: trackAccountingOperationFailure("complete_reconciliation"),
  });
}

export function useCancelReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reconId: string) => {
      const res = await accounting.reconciliations[":reconId"].$delete({
        param: { reconId },
      });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      captureEvent("reconciliation_cancelled");
      void queryClient.invalidateQueries({ queryKey: ["accounting-bank-transactions"] });
      // Cancelling clears reconciliationId from the affected journal entry lines,
      // unlocking them in the journal views.
      void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entry"] });
    },
    onError: trackAccountingOperationFailure("cancel_reconciliation"),
  });
}

// ---------------------------------------------------------------------------
// FASB Reports
// ---------------------------------------------------------------------------

export type SFPResult = {
  assets: {
    total: number;
    items: Array<{ accountId: string; code: string; name: string; balanceCents: number }>;
  };
  liabilities: {
    total: number;
    items: Array<{ accountId: string; code: string; name: string; balanceCents: number }>;
  };
  netAssets: {
    unrestricted: number;
    temporarilyRestricted: number;
    permanentlyRestricted: number;
    total: number;
  };
  totalLiabilitiesAndNetAssets: number;
};

export type SOARow = {
  accountId: string;
  name: string;
  withoutRestrictions: number;
  withRestrictions: number;
  total: number;
};

export type SOAResult = {
  revenue: SOARow[];
  releases: { withoutRestrictions: number; withRestrictions: number };
  expenses: SOARow[];
  changeInNetAssets: { withoutRestrictions: number; withRestrictions: number; total: number };
  beginningNetAssets: { withoutRestrictions: number; withRestrictions: number; total: number };
  endingNetAssets: { withoutRestrictions: number; withRestrictions: number; total: number };
};

export type SFERow = {
  accountId: string;
  name: string;
  program: number;
  management: number;
  fundraising: number;
  total: number;
};

export type SFEResult = {
  rows: SFERow[];
  totals: { program: number; management: number; fundraising: number; total: number };
};

export function useFinancialPosition(asOf: string) {
  return useQuery({
    queryKey: ["accounting-report-financial-position", asOf],
    enabled: !!asOf,
    queryFn: async () => {
      const res = await accounting.reports["financial-position"].$get({
        query: { asOf },
      });
      return readResponseOrThrow(res) as Promise<SFPResult>;
    },
  });
}

export function useStatementOfActivities(from: string, to: string) {
  return useQuery({
    queryKey: ["accounting-report-activities", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const res = await accounting.reports.activities.$get({
        query: { from, to },
      });
      return readResponseOrThrow(res) as Promise<SOAResult>;
    },
  });
}

export function useFunctionalExpenses(from: string, to: string) {
  return useQuery({
    queryKey: ["accounting-report-functional-expenses", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const res = await accounting.reports["functional-expenses"].$get({
        query: { from, to },
      });
      return readResponseOrThrow(res) as Promise<SFEResult>;
    },
  });
}

// ---------------------------------------------------------------------------
// Recurring Templates
// ---------------------------------------------------------------------------

export type RecurringTemplateLine = {
  accountId: string;
  fundId?: string;
  grantId?: string;
  debitCents: number;
  creditCents: number;
  memo?: string;
};

export type RecurringTemplateRow = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  frequency: "monthly" | "quarterly" | "annually";
  nextRunDate: Date | string;
  isActive: boolean;
  fiscalPeriodId: string | null;
  memo: string | null;
  lines: RecurringTemplateLine[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function useRecurringTemplates(isActive?: boolean) {
  return useQuery({
    queryKey: ["accounting-recurring-templates", isActive ?? ""],
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (isActive !== undefined) query.isActive = String(isActive);
      const res = await accounting["recurring-templates"].$get({ query });
      return readResponseOrThrow(res);
    },
  });
}

export function useCreateRecurringTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      frequency: "monthly" | "quarterly" | "annually";
      nextRunDate: string;
      isActive?: boolean;
      fiscalPeriodId?: string;
      memo?: string;
      lines: RecurringTemplateLine[];
    }) => {
      const res = await accounting["recurring-templates"].$post({ json: data });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      captureEvent("recurring_template_created", {
        frequency: variables.frequency,
        is_active: variables.isActive ?? true,
        line_count_bucket: getCountBucket(variables.lines.length),
      });
      void queryClient.invalidateQueries({ queryKey: ["accounting-recurring-templates"] });
    },
    onError: trackAccountingOperationFailure("create_recurring_template"),
  });
}

export function useUpdateRecurringTemplate(templateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name?: string;
      description?: string | null;
      frequency?: "monthly" | "quarterly" | "annually";
      nextRunDate?: string;
      isActive?: boolean;
      fiscalPeriodId?: string | null;
      memo?: string | null;
      lines?: RecurringTemplateLine[];
    }) => {
      const res = await accounting["recurring-templates"][":templateId"].$patch({
        param: { templateId },
        json: data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      captureEvent("recurring_template_updated", {
        active_status_changed: variables.isActive !== undefined,
        frequency_changed: variables.frequency !== undefined,
        lines_changed: variables.lines !== undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["accounting-recurring-templates"] });
    },
    onError: trackAccountingOperationFailure("update_recurring_template"),
  });
}

export function useDeleteRecurringTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await accounting["recurring-templates"][":templateId"].$delete({
        param: { templateId },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to delete template.");
      }
    },
    onSuccess: () => {
      captureEvent("recurring_template_deleted");
      void queryClient.invalidateQueries({ queryKey: ["accounting-recurring-templates"] });
    },
    onError: trackAccountingOperationFailure("delete_recurring_template"),
  });
}

export function useRunRecurringTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await accounting["recurring-templates"][":templateId"].run.$post({
        param: { templateId },
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("recurring_template_run");
      void queryClient.invalidateQueries({ queryKey: ["accounting-recurring-templates"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entries"] });
      invalidateAccountingBalanceViews(queryClient);
    },
    onError: trackAccountingOperationFailure("run_recurring_template"),
  });
}

// ---------------------------------------------------------------------------
// Enable Accounting (PATCH /org/settings)
// ---------------------------------------------------------------------------

export function useEnableAccounting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await org.settings.$patch({ json: { accountingEnabled: true } });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("accounting_enabled");
      void queryClient.invalidateQueries({ queryKey: ["org-profile"] });
    },
    onError: trackAccountingOperationFailure("enable_accounting"),
  });
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS, type PermissionMap } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error-handler";
import { accountingRoutes } from "./routes";
import { AppError } from "../../lib/app-error";

const { mockCaptureAnalytics } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: {
      capture: mockCaptureAnalytics,
    },
  })),
}));

vi.mock("./service", () => ({
  listAccounts: vi.fn(),
  getAccount: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  seedChartOfAccounts: vi.fn(),
  listFiscalPeriods: vi.fn(),
  createFiscalPeriod: vi.fn(),
  closeFiscalPeriod: vi.fn(),
  updateFiscalPeriod: vi.fn(),
  listJournalEntries: vi.fn(),
  getJournalEntry: vi.fn(),
  createJournalEntry: vi.fn(),
  reverseJournalEntry: vi.fn(),
  getTrialBalance: vi.fn(),
  getAccountLedger: vi.fn(),
  getStatementOfFinancialPosition: vi.fn(),
  getStatementOfActivities: vi.fn(),
  getStatementOfFunctionalExpenses: vi.fn(),
  runYearEndClose: vi.fn(),
  getPeriodCloseChecklist: vi.fn(),
  sfpToCsv: vi.fn().mockReturnValue("sfp,csv"),
  soaToCsv: vi.fn().mockReturnValue("soa,csv"),
  sfeToCsv: vi.fn().mockReturnValue("sfe,csv"),
}));

vi.mock("./bankService", () => ({
  getBankAccounts: vi.fn(),
  createBankAccount: vi.fn(),
  updateBankAccount: vi.fn(),
  deleteBankAccount: vi.fn(),
  importBankTransactions: vi.fn(),
  getBankTransactions: vi.fn(),
  matchBankTransaction: vi.fn(),
  ignoreBankTransaction: vi.fn(),
  unmatchBankTransaction: vi.fn(),
  createReconciliation: vi.fn(),
  completeReconciliation: vi.fn(),
  cancelReconciliation: vi.fn(),
}));

vi.mock("./recurringService", () => ({
  listRecurringTemplates: vi.fn(),
  createRecurringTemplate: vi.fn(),
  getRecurringTemplate: vi.fn(),
  updateRecurringTemplate: vi.fn(),
  deleteRecurringTemplate: vi.fn(),
  runTemplate: vi.fn(),
}));

vi.mock("./seedService", () => ({
  seedOpeningBalances: vi.fn(),
}));

vi.mock("./anomaly.service", () => ({
  getAnomalies: vi.fn(),
}));

vi.mock("../../lib/effective-plan-tier", () => ({
  getContextEffectivePlanTier: vi.fn().mockReturnValue("audit_ready"),
}));

import {
  getBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  importBankTransactions,
  getBankTransactions,
  matchBankTransaction,
  ignoreBankTransaction,
  unmatchBankTransaction,
  createReconciliation,
  completeReconciliation,
  cancelReconciliation,
} from "./bankService";

import {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  seedChartOfAccounts,
  listFiscalPeriods,
  createFiscalPeriod,
  closeFiscalPeriod,
  updateFiscalPeriod,
  listJournalEntries,
  getJournalEntry,
  createJournalEntry,
  reverseJournalEntry,
  getTrialBalance,
  getAccountLedger,
  getStatementOfFinancialPosition,
  getStatementOfActivities,
  getStatementOfFunctionalExpenses,
  runYearEndClose,
  getPeriodCloseChecklist,
} from "./service";

import {
  listRecurringTemplates,
  createRecurringTemplate,
  getRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  runTemplate,
} from "./recurringService";

import { seedOpeningBalances } from "./seedService";
import { getAnomalies } from "./anomaly.service";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";

function makeApp(role = "admin", permissions: Partial<PermissionMap> | null = null) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("*", async (c, next) => {
      c.set("db", {} as Parameters<typeof listAccounts>[0]);
      c.set("orgId", "org-1");
      c.set("entityId", "entity-1");
      c.set("user", { id: "user-1" } as AppEnv["Variables"]["user"]);
      c.set("memberRole", role as AppEnv["Variables"]["memberRole"]);
      c.set("memberPermissions", permissions as PermissionMap | null);
      await next();
    })
    .route("/", accountingRoutes);
}

const account = {
  id: "acc-1",
  code: "1000",
  name: "Cash",
  type: "asset",
  isActive: true,
  orgId: "org-1",
  subtype: null,
  parentAccountId: null,
  naturalRestriction: null,
  functionalClass: null,
  deletedAt: null,
};
const period = {
  id: "p-1",
  name: "FY2026",
  status: "open",
  orgId: "org-1",
  startDate: new Date(),
  endDate: new Date(),
  createdAt: new Date(),
  closedBy: null,
  closedAt: null,
};
const entry = {
  id: "je-1",
  orgId: "org-1",
  entryNumber: 1,
  date: new Date(),
  fiscalPeriodId: "p-1",
  memo: null,
  source: "manual",
  sourceTable: null,
  sourceId: null,
  postedAt: new Date(),
  postedBy: "user-1",
  reversedByEntryId: null,
  isAdjusting: false,
  externalSourceSystem: null,
  externalSourceObjectId: null,
  externalSourceObjectType: null,
  externalSourceSyncedAt: null,
  externalSourceStatus: null,
  createdAt: new Date(),
  lines: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCaptureAnalytics.mockResolvedValue(undefined);
});

describe("accounting analytics capture", () => {
  it("captures privacy-safe accounting lifecycle events", async () => {
    vi.mocked(createAccount).mockResolvedValue(account);
    vi.mocked(seedChartOfAccounts).mockResolvedValue(undefined);
    vi.mocked(createFiscalPeriod).mockResolvedValue(period);
    vi.mocked(createJournalEntry).mockResolvedValue(entry);
    vi.mocked(createBankAccount).mockResolvedValue({
      id: "ba-1",
      name: "Operating Checking",
      accountType: "checking",
    } as never);
    vi.mocked(importBankTransactions).mockResolvedValue({
      imported: 2,
      duplicates: 0,
      errors: [],
    } as never);
    vi.mocked(matchBankTransaction).mockResolvedValue({ id: "txn-1" } as never);
    vi.mocked(createReconciliation).mockResolvedValue({
      id: "recon-1",
      status: "draft",
    } as never);
    vi.mocked(completeReconciliation).mockResolvedValue({
      id: "recon-1",
      status: "completed",
    } as never);
    vi.mocked(createRecurringTemplate).mockResolvedValue({ id: "tmpl-1" } as never);
    vi.mocked(runTemplate).mockResolvedValue({ journalEntry: entry } as never);
    vi.mocked(seedOpeningBalances).mockResolvedValue({ created: 2 } as never);

    const app = makeApp("admin");

    await app.request("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "1000", name: "Cash", type: "asset" }),
    });
    await app.request("/accounts/seed", { method: "POST" });
    await app.request("/periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "FY2026",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T23:59:59.999Z",
      }),
    });
    await app.request("/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    });
    await app.request("/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Operating Checking", accountId: "acc-1" }),
    });
    await app.request("/bank-accounts/ba-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: "ba-1",
        format: "csv",
        content: "date,amount\n2026-01-01,10",
      }),
    });
    await app.request("/bank-accounts/ba-1/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankTransactionId: "txn-1", journalEntryId: "je-1" }),
    });
    await app.request("/reconciliations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: "ba-1",
        statementEndingDate: "2026-01-31T00:00:00.000Z",
        statementEndingBalanceCents: 1000,
      }),
    });
    await app.request("/reconciliations/recon-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statementEndingBalanceCents: 1000 }),
    });
    await app.request("/recurring-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Monthly release",
        schedule: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    });
    await app.request("/recurring-templates/tmpl-1/run", { method: "POST" });
    await app.request("/seed/opening-balances", { method: "POST" });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.accountCreated,
      payload: {
        actorId: "user-1",
        entity_type: "account",
        account_type: "asset",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.chartOfAccountsSeeded,
      payload: { actorId: "user-1", entity_type: "chart_of_accounts" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.journalEntryCreated,
      payload: {
        actorId: "user-1",
        entity_type: "journal_entry",
        source: "manual",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.bankTransactionsImported,
      payload: {
        actorId: "user-1",
        entity_type: "bank_transaction",
        file_format: "csv",
        imported_rows_bucket: "1-10",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.reconciliationCompleted,
      payload: { actorId: "user-1", entity_type: "reconciliation" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.recurringTemplateRun,
      payload: { actorId: "user-1", entity_type: "recurring_template" },
    });

    const serializedCalls = JSON.stringify(mockCaptureAnalytics.mock.calls);
    expect(serializedCalls).not.toContain("Operating Checking");
    expect(serializedCalls).not.toContain("date,amount");
    expect(serializedCalls).not.toContain("acc-1");
    expect(serializedCalls).not.toContain("txn-1");
    expect(serializedCalls).not.toContain("recon-1");
    expect(serializedCalls).not.toContain("tmpl-1");
  });
});

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

describe("GET /accounts", () => {
  it("returns 200 for viewer", async () => {
    vi.mocked(listAccounts).mockResolvedValue([account]);
    const app = makeApp("viewer");
    const res = await app.request("/accounts", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual([account]);
  });
});

describe("POST /accounts", () => {
  it("returns 201 for admin", async () => {
    vi.mocked(createAccount).mockResolvedValue(account);
    const app = makeApp("admin");
    const res = await app.request("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "1000", name: "Cash", type: "asset" }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "1000", name: "Cash", type: "asset" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 201 for viewer with accounting manage permission override", async () => {
    vi.mocked(createAccount).mockResolvedValue(account);
    const app = makeApp("viewer", { accounting: "manage" });
    const res = await app.request("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "1000", name: "Cash", type: "asset" }),
    });
    expect(res.status).toBe(201);
    expect(createAccount).toHaveBeenCalledOnce();
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "1000", name: "Cash", type: "asset" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const app = makeApp("admin");
    const res = await app.request("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 on conflict", async () => {
    vi.mocked(createAccount).mockRejectedValue(new AppError(409, "Code already exists"));
    const app = makeApp("admin");
    const res = await app.request("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "1000", name: "Cash", type: "asset" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /accounts/seed", () => {
  it("returns 200 for admin", async () => {
    vi.mocked(seedChartOfAccounts).mockResolvedValue(undefined);
    const app = makeApp("admin");
    const res = await app.request("/accounts/seed", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true });
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/accounts/seed", { method: "POST" });
    expect(res.status).toBe(403);
  });
});

describe("GET /accounts/:accountId", () => {
  it("returns 200 with account for viewer", async () => {
    vi.mocked(getAccount).mockResolvedValue(account);
    const app = makeApp("viewer");
    const res = await app.request("/accounts/acc-1", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(getAccount).mockRejectedValue(new AppError(404, "Account not found"));
    const app = makeApp("viewer");
    const res = await app.request("/accounts/acc-999", { method: "GET" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /accounts/:accountId", () => {
  it("returns 200 for admin", async () => {
    vi.mocked(updateAccount).mockResolvedValue(account);
    const app = makeApp("admin");
    const res = await app.request("/accounts/acc-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Cash" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/accounts/acc-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Cash" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const app = makeApp("admin");
    const res = await app.request("/accounts/acc-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: "not-a-boolean" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /accounts/:accountId", () => {
  it("returns 204 for admin", async () => {
    vi.mocked(deleteAccount).mockResolvedValue(undefined);
    const app = makeApp("admin");
    const res = await app.request("/accounts/acc-1", { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/accounts/acc-1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when account not found", async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new AppError(404, "Account not found"));
    const app = makeApp("admin");
    const res = await app.request("/accounts/acc-999", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("GET /accounts/:accountId/ledger", () => {
  it("returns 200 for viewer with no filters", async () => {
    vi.mocked(getAccountLedger).mockResolvedValue({ account, lines: [] });
    const app = makeApp("viewer");
    const res = await app.request("/accounts/acc-1/ledger", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("returns 200 for viewer with date filter", async () => {
    vi.mocked(getAccountLedger).mockResolvedValue({ account, lines: [] });
    const app = makeApp("viewer");
    const res = await app.request(
      "/accounts/acc-1/ledger?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z",
      { method: "GET" },
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when account not found", async () => {
    vi.mocked(getAccountLedger).mockRejectedValue(new AppError(404, "Account not found"));
    const app = makeApp("viewer");
    const res = await app.request("/accounts/acc-999/ledger", { method: "GET" });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Fiscal Periods
// ---------------------------------------------------------------------------

describe("GET /periods", () => {
  it("returns 200 for viewer", async () => {
    vi.mocked(listFiscalPeriods).mockResolvedValue([period]);
    const app = makeApp("viewer");
    const res = await app.request("/periods", { method: "GET" });
    expect(res.status).toBe(200);
  });
});

describe("POST /periods", () => {
  it("returns 201 for admin", async () => {
    vi.mocked(createFiscalPeriod).mockResolvedValue(period);
    const app = makeApp("admin");
    const res = await app.request("/periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "FY2026",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T23:59:59.999Z",
      }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "FY2026",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T23:59:59.999Z",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const app = makeApp("admin");
    const res = await app.request("/periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /periods/:periodId", () => {
  it("returns 200 for admin with name update", async () => {
    vi.mocked(updateFiscalPeriod).mockResolvedValue({ ...period, name: "FY2026 Updated" });
    const app = makeApp("admin");
    const res = await app.request("/periods/p-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "FY2026 Updated" }),
    });
    expect(res.status).toBe(200);
    expect(updateFiscalPeriod).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodId: "p-1", data: { name: "FY2026 Updated" } }),
    );
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/periods/p-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unauthorized" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (empty name)", async () => {
    const app = makeApp("admin");
    const res = await app.request("/periods/p-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when period is locked", async () => {
    vi.mocked(updateFiscalPeriod).mockRejectedValue(
      new AppError(409, "Cannot edit a locked fiscal period"),
    );
    const app = makeApp("admin");
    const res = await app.request("/periods/p-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /periods/:periodId/close", () => {
  it("returns 200 for admin", async () => {
    vi.mocked(closeFiscalPeriod).mockResolvedValue({ ...period, status: "closed" });
    const app = makeApp("admin");
    const res = await app.request("/periods/p-1/close", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/periods/p-1/close", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("returns 409 when period is already closed", async () => {
    vi.mocked(closeFiscalPeriod).mockRejectedValue(new AppError(409, "Period is already closed"));
    const app = makeApp("admin");
    const res = await app.request("/periods/p-1/close", { method: "POST" });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Journal Entries
// ---------------------------------------------------------------------------

describe("GET /journal", () => {
  it("returns 200 for viewer", async () => {
    vi.mocked(listJournalEntries).mockResolvedValue([entry]);
    const app = makeApp("viewer");
    const res = await app.request("/journal", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("passes query params to service", async () => {
    vi.mocked(listJournalEntries).mockResolvedValue([]);
    const app = makeApp("viewer");
    const res = await app.request(
      "/journal?fiscalPeriodId=p-1&source=manual&from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z",
      { method: "GET" },
    );
    expect(res.status).toBe(200);
    expect(listJournalEntries).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fiscalPeriodId: "p-1",
        source: "manual",
      }),
    );
  });

  it("returns 400 for invalid source enum", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/journal?source=invalid_source", { method: "GET" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid from datetime", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/journal?from=not-a-date", { method: "GET" });
    expect(res.status).toBe(400);
  });
});

describe("POST /journal", () => {
  it("returns 201 for editor", async () => {
    vi.mocked(createJournalEntry).mockResolvedValue(entry);
    const app = makeApp("editor");
    const res = await app.request("/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (unbalanced)", async () => {
    const app = makeApp("editor");
    const res = await app.request("/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 50 },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when fiscal period is closed", async () => {
    vi.mocked(createJournalEntry).mockRejectedValue(new AppError(409, "Fiscal period is closed"));
    const app = makeApp("editor");
    const res = await app.request("/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    });
    expect(res.status).toBe(409);
  });
});

describe("GET /journal/:entryId", () => {
  it("returns 200 for viewer", async () => {
    vi.mocked(getJournalEntry).mockResolvedValue(entry);
    const app = makeApp("viewer");
    const res = await app.request("/journal/je-1", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(getJournalEntry).mockRejectedValue(new AppError(404, "Entry not found"));
    const app = makeApp("viewer");
    const res = await app.request("/journal/je-999", { method: "GET" });
    expect(res.status).toBe(404);
  });
});

describe("POST /journal/:entryId/reverse", () => {
  it("returns 201 for admin with empty body", async () => {
    vi.mocked(reverseJournalEntry).mockResolvedValue({ ...entry, id: "je-2", entryNumber: 2 });
    const app = makeApp("admin");
    const res = await app.request("/journal/je-1/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
  });

  it("returns 201 for admin with memo in body", async () => {
    vi.mocked(reverseJournalEntry).mockResolvedValue({ ...entry, id: "je-2", entryNumber: 2 });
    const app = makeApp("admin");
    const res = await app.request("/journal/je-1/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo: "Reversing erroneous entry" }),
    });
    expect(res.status).toBe(201);
    expect(reverseJournalEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ memo: "Reversing erroneous entry" }),
    );
  });

  it("returns 400 for invalid body (memo too long)", async () => {
    const app = makeApp("admin");
    const res = await app.request("/journal/je-1/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo: "x".repeat(1001) }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/journal/je-1/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when entry not found", async () => {
    vi.mocked(reverseJournalEntry).mockRejectedValue(new AppError(404, "Entry not found"));
    const app = makeApp("admin");
    const res = await app.request("/journal/je-999/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when period is closed", async () => {
    vi.mocked(reverseJournalEntry).mockRejectedValue(new AppError(409, "Fiscal period is closed"));
    const app = makeApp("admin");
    const res = await app.request("/journal/je-1/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it("returns 409 when entry has already been reversed", async () => {
    vi.mocked(reverseJournalEntry).mockRejectedValue(
      new AppError(409, "This entry has already been reversed"),
    );
    const app = makeApp("admin");
    const res = await app.request("/journal/je-1/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

describe("GET /reports/trial-balance", () => {
  it("returns 200 for viewer", async () => {
    vi.mocked(getTrialBalance).mockResolvedValue([]);
    const app = makeApp("viewer");
    const res = await app.request("/reports/trial-balance?asOf=2026-12-31T23:59:59.999Z", {
      method: "GET",
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 when asOf is missing", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/reports/trial-balance", { method: "GET" });
    expect(res.status).toBe(400);
  });

  it("returns 403 for viewer... wait, viewers can see reports", async () => {
    // Viewers CAN access reports — this verifies that
    vi.mocked(getTrialBalance).mockResolvedValue([]);
    const app = makeApp("viewer");
    const res = await app.request("/reports/trial-balance?asOf=2026-12-31T23:59:59.999Z", {
      method: "GET",
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 when reports permission is removed", async () => {
    const app = makeApp("viewer", { accounting: "view", reports: "none" });
    const res = await app.request("/reports/trial-balance?asOf=2026-12-31T23:59:59.999Z", {
      method: "GET",
    });

    expect(res.status).toBe(403);
    expect(getTrialBalance).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /reports/financial-position
// ---------------------------------------------------------------------------

const sfpResult = {
  assets: {
    total: 500000,
    items: [{ accountId: "a1", code: "1000", name: "Cash", balanceCents: 500000 }],
  },
  liabilities: { total: 200000, items: [] },
  netAssets: {
    unrestricted: 300000,
    temporarilyRestricted: 0,
    permanentlyRestricted: 0,
    total: 300000,
  },
  totalLiabilitiesAndNetAssets: 500000,
};

describe("GET /reports/financial-position", () => {
  it("returns 200 JSON for viewer with asOf param", async () => {
    vi.mocked(getStatementOfFinancialPosition).mockResolvedValue(sfpResult);
    const app = makeApp("viewer");
    const res = await app.request("/reports/financial-position?asOf=2026-12-31T23:59:59.999Z", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { assets: { total: number } };
    expect(body.assets.total).toBe(500000);
  });

  it("returns 200 CSV when format=csv", async () => {
    vi.mocked(getStatementOfFinancialPosition).mockResolvedValue(sfpResult);
    const app = makeApp("viewer");
    const res = await app.request(
      "/reports/financial-position?asOf=2026-12-31T23:59:59.999Z&format=csv",
      { method: "GET" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="statement-of-financial-position.csv"',
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 400 when asOf is missing", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/reports/financial-position", { method: "GET" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when asOf is not a valid ISO datetime", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/reports/financial-position?asOf=not-a-date", { method: "GET" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when format is invalid", async () => {
    const app = makeApp("viewer");
    const res = await app.request(
      "/reports/financial-position?asOf=2026-12-31T23:59:59.999Z&format=xlsx",
      { method: "GET" },
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when service throws an internal error (out of balance)", async () => {
    vi.mocked(getStatementOfFinancialPosition).mockRejectedValue(
      new AppError(
        500,
        "Statement of Financial Position is out of balance: assets=100, liabilities+netAssets=200",
      ),
    );
    const app = makeApp("viewer");
    const res = await app.request("/reports/financial-position?asOf=2026-12-31T23:59:59.999Z", {
      method: "GET",
    });
    expect(res.status).toBe(500);
  });

  it("returns 403 for null-role user", async () => {
    const app = makeApp(null as unknown as string);
    const res = await app.request("/reports/financial-position?asOf=2024-12-31T00:00:00.000Z", {
      method: "GET",
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /reports/activities
// ---------------------------------------------------------------------------

const soaResult = {
  revenue: [],
  releases: { withoutRestrictions: 0, withRestrictions: 0 },
  expenses: [],
  changeInNetAssets: { withoutRestrictions: 0, withRestrictions: 0, total: 0 },
  beginningNetAssets: { withoutRestrictions: 0, withRestrictions: 0, total: 0 },
  endingNetAssets: { withoutRestrictions: 0, withRestrictions: 0, total: 0 },
};

describe("GET /reports/activities", () => {
  it("returns 200 JSON for viewer", async () => {
    vi.mocked(getStatementOfActivities).mockResolvedValue(soaResult);
    const app = makeApp("viewer");
    const res = await app.request(
      "/reports/activities?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z",
      { method: "GET" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.revenue).toEqual([]);
  });

  it("returns 200 CSV when format=csv", async () => {
    vi.mocked(getStatementOfActivities).mockResolvedValue(soaResult);
    const app = makeApp("viewer");
    const res = await app.request(
      "/reports/activities?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z&format=csv",
      { method: "GET" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="statement-of-activities.csv"',
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 400 when from is missing", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/reports/activities?to=2026-12-31T23:59:59.999Z", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when to is missing", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/reports/activities?from=2026-01-01T00:00:00.000Z", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when from is invalid", async () => {
    const app = makeApp("viewer");
    const res = await app.request(
      "/reports/activities?from=not-a-date&to=2026-12-31T23:59:59.999Z",
      { method: "GET" },
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for null-role user", async () => {
    const app = makeApp(null as unknown as string);
    const res = await app.request(
      "/reports/activities?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z",
      { method: "GET" },
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /reports/functional-expenses
// ---------------------------------------------------------------------------

const sfeResult = {
  rows: [],
  totals: { program: 0, management: 0, fundraising: 0, total: 0 },
};

describe("GET /reports/functional-expenses", () => {
  it("returns 200 JSON for viewer", async () => {
    vi.mocked(getStatementOfFunctionalExpenses).mockResolvedValue(sfeResult);
    const app = makeApp("viewer");
    const res = await app.request(
      "/reports/functional-expenses?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z",
      { method: "GET" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; totals: Record<string, unknown> };
    expect(body.rows).toEqual([]);
    expect(body.totals["total"]).toBe(0);
  });

  it("returns 200 CSV when format=csv", async () => {
    vi.mocked(getStatementOfFunctionalExpenses).mockResolvedValue(sfeResult);
    const app = makeApp("viewer");
    const res = await app.request(
      "/reports/functional-expenses?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z&format=csv",
      { method: "GET" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="statement-of-functional-expenses.csv"',
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 400 when from is missing", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/reports/functional-expenses?to=2026-12-31T23:59:59.999Z", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when to is missing", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/reports/functional-expenses?from=2026-01-01T00:00:00.000Z", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when format is invalid", async () => {
    const app = makeApp("viewer");
    const res = await app.request(
      "/reports/functional-expenses?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z&format=pdf",
      { method: "GET" },
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for null-role user", async () => {
    const app = makeApp(null as unknown as string);
    const res = await app.request(
      "/reports/functional-expenses?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z",
      { method: "GET" },
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Bank Accounts
// ---------------------------------------------------------------------------

const bankAccount = {
  id: "ba-1",
  orgId: "org-1",
  name: "Checking",
  accountNumber: "1234",
  glAccountId: "acc-cash",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const bankTxn = {
  id: "btxn-1",
  orgId: "org-1",
  bankAccountId: "ba-1",
  date: new Date(),
  amountCents: 10000,
  description: "Deposit",
  referenceNumber: "REF001",
  status: "unmatched",
  journalEntryId: null,
  journalEntryNumber: null,
  externalSourceSystem: null,
  externalSourceObjectId: null,
  externalSourceObjectType: null,
  externalSourceSyncedAt: null,
  externalSourceStatus: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const recon = {
  id: "recon-1",
  orgId: "org-1",
  bankAccountId: "ba-1",
  statementDate: new Date(),
  statementEndingBalanceCents: 10000,
  reconciledAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /bank-accounts", () => {
  it("returns 200 for viewer", async () => {
    vi.mocked(getBankAccounts).mockResolvedValue([bankAccount]);
    const app = makeApp("viewer");
    const res = await app.request("/bank-accounts", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    // Dates are serialized as ISO strings in JSON responses
    expect(body).toHaveLength(1);
    expect(body[0]!.id).toBe("ba-1");
    expect(body[0]!.name).toBe("Checking");
  });

  it("returns 403 for null-role user", async () => {
    const app = makeApp(null as unknown as string);
    const res = await app.request("/bank-accounts", { method: "GET" });
    expect(res.status).toBe(403);
  });
});

describe("POST /bank-accounts", () => {
  it("returns 201 for admin", async () => {
    vi.mocked(createBankAccount).mockResolvedValue(bankAccount);
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Checking" }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Checking" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Checking" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (empty name)", async () => {
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when service throws not found", async () => {
    vi.mocked(createBankAccount).mockRejectedValue(new AppError(404, "Not found"));
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Savings" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /bank-accounts/:bankAccountId", () => {
  it("returns 200 for admin", async () => {
    vi.mocked(updateBankAccount).mockResolvedValue({ ...bankAccount, name: "Updated" });
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (empty name)", async () => {
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(updateBankAccount).mockRejectedValue(new AppError(404, "Bank account not found"));
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /bank-accounts/:bankAccountId", () => {
  it("returns 204 for admin", async () => {
    vi.mocked(deleteBankAccount).mockResolvedValue(undefined);
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-1", { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(deleteBankAccount).mockRejectedValue(new AppError(404, "Bank account not found"));
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-999", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("POST /bank-accounts/:bankAccountId/import", () => {
  it("returns 200 for editor", async () => {
    vi.mocked(importBankTransactions).mockResolvedValue({ imported: 3, duplicates: 1 });
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: "ba-1",
        format: "csv",
        content: "Date,Amount,Description\n2026-01-01,100.00,Test",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ imported: 3, duplicates: 1 });
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/bank-accounts/ba-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankAccountId: "ba-1", format: "csv", content: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid format", async () => {
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankAccountId: "ba-1", format: "xlsx", content: "x" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /bank-accounts/:bankAccountId/transactions", () => {
  it("returns 200 for viewer", async () => {
    vi.mocked(getBankTransactions).mockResolvedValue([bankTxn]);
    const app = makeApp("viewer");
    const res = await app.request("/bank-accounts/ba-1/transactions", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("returns 403 for null-role user", async () => {
    const app = makeApp(null as unknown as string);
    const res = await app.request("/bank-accounts/ba-1/transactions", { method: "GET" });
    expect(res.status).toBe(403);
  });
});

describe("POST /bank-accounts/:bankAccountId/match", () => {
  it("returns 200 for editor", async () => {
    vi.mocked(matchBankTransaction).mockResolvedValue({
      ...bankTxn,
      status: "matched",
      journalEntryId: "je-1",
    });
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankTransactionId: "btxn-1", journalEntryId: "je-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/bank-accounts/ba-1/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankTransactionId: "btxn-1", journalEntryId: "je-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (missing journalEntryId)", async () => {
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankTransactionId: "btxn-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when transaction not found", async () => {
    vi.mocked(matchBankTransaction).mockRejectedValue(
      new AppError(404, "Bank transaction not found"),
    );
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankTransactionId: "btxn-999", journalEntryId: "je-1" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /bank-accounts/:bankAccountId/ignore", () => {
  it("returns 200 for editor", async () => {
    vi.mocked(ignoreBankTransaction).mockResolvedValue({ ...bankTxn, status: "ignored" });
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1/ignore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankTransactionId: "btxn-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/bank-accounts/ba-1/ignore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankTransactionId: "btxn-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing bankTransactionId", async () => {
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1/ignore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /bank-accounts/:bankAccountId/unmatch", () => {
  it("returns 200 for editor", async () => {
    vi.mocked(unmatchBankTransaction).mockResolvedValue({
      ...bankTxn,
      status: "unmatched",
      journalEntryId: null,
    });
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1/unmatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankTransactionId: "btxn-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/bank-accounts/ba-1/unmatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankTransactionId: "btxn-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when bankTransactionId is missing", async () => {
    const app = makeApp("editor");
    const res = await app.request("/bank-accounts/ba-1/unmatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /reconciliations", () => {
  it("returns 201 for editor", async () => {
    vi.mocked(createReconciliation).mockResolvedValue(recon);
    const app = makeApp("editor");
    const res = await app.request("/reconciliations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: "ba-1",
        statementDate: "2026-01-31T00:00:00.000Z",
        statementEndingBalanceCents: 10000,
      }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/reconciliations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: "ba-1",
        statementDate: "2026-01-31T00:00:00.000Z",
        statementEndingBalanceCents: 10000,
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (missing statementDate)", async () => {
    const app = makeApp("editor");
    const res = await app.request("/reconciliations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankAccountId: "ba-1", statementEndingBalanceCents: 10000 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body (non-integer balance)", async () => {
    const app = makeApp("editor");
    const res = await app.request("/reconciliations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: "ba-1",
        statementDate: "2026-01-31T00:00:00.000Z",
        statementEndingBalanceCents: 10000.5,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when bank account not found", async () => {
    vi.mocked(createReconciliation).mockRejectedValue(new AppError(404, "Bank account not found"));
    const app = makeApp("editor");
    const res = await app.request("/reconciliations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: "ba-missing",
        statementDate: "2026-01-31T00:00:00.000Z",
        statementEndingBalanceCents: 10000,
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /reconciliations/:reconId/complete", () => {
  it("returns 200 for admin", async () => {
    vi.mocked(completeReconciliation).mockResolvedValue({ ...recon, reconciledAt: new Date() });
    const app = makeApp("admin");
    const res = await app.request("/reconciliations/recon-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/reconciliations/recon-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/reconciliations/recon-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when balance is out of balance", async () => {
    vi.mocked(completeReconciliation).mockRejectedValue(
      new AppError(400, "Reconciliation out of balance"),
    );
    const app = makeApp("admin");
    const res = await app.request("/reconciliations/recon-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when reconciliation not found", async () => {
    vi.mocked(completeReconciliation).mockRejectedValue(
      new AppError(404, "Reconciliation not found"),
    );
    const app = makeApp("admin");
    const res = await app.request("/reconciliations/recon-999/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /reconciliations/:reconId", () => {
  it("returns 204 for admin cancelling an in-progress reconciliation", async () => {
    vi.mocked(cancelReconciliation).mockResolvedValue(undefined);
    const app = makeApp("admin");
    const res = await app.request("/reconciliations/recon-1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(cancelReconciliation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        reconId: "recon-1",
        actorId: "user-1",
      }),
    );
  });

  it("returns 403 for editor cancelling an in-progress reconciliation", async () => {
    vi.mocked(cancelReconciliation).mockResolvedValue(undefined);
    const app = makeApp("editor");
    const res = await app.request("/reconciliations/recon-1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/reconciliations/recon-1", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(cancelReconciliation).not.toHaveBeenCalled();
  });

  it("returns 400 when trying to cancel a completed reconciliation", async () => {
    vi.mocked(cancelReconciliation).mockRejectedValue(
      new AppError(400, "Cannot cancel a completed reconciliation."),
    );
    const app = makeApp("admin");
    const res = await app.request("/reconciliations/recon-1", { method: "DELETE" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when reconciliation not found", async () => {
    vi.mocked(cancelReconciliation).mockRejectedValue(
      new AppError(404, "Reconciliation not found"),
    );
    const app = makeApp("admin");
    const res = await app.request("/reconciliations/recon-missing", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Year-end close
// ---------------------------------------------------------------------------

describe("POST /fiscal-periods/:periodId/year-end-close", () => {
  it("returns 200 for admin", async () => {
    vi.mocked(runYearEndClose).mockResolvedValue({ closingEntryId: "je-close-1" });
    const app = makeApp("admin");
    const res = await app.request("/fiscal-periods/p-1/year-end-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ closingEntryId: "je-close-1" });
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/fiscal-periods/p-1/year-end-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/fiscal-periods/p-1/year-end-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when period is already closed", async () => {
    vi.mocked(runYearEndClose).mockRejectedValue(
      new AppError(400, "Fiscal period is already closed"),
    );
    const app = makeApp("admin");
    const res = await app.request("/fiscal-periods/p-1/year-end-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when period not found", async () => {
    vi.mocked(runYearEndClose).mockRejectedValue(new AppError(404, "Fiscal period not found"));
    const app = makeApp("admin");
    const res = await app.request("/fiscal-periods/p-999/year-end-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Close checklist
// ---------------------------------------------------------------------------

describe("GET /fiscal-periods/:periodId/close-checklist", () => {
  const checklist = {
    periodId: "p-1",
    periodName: "FY2026",
    periodStatus: "open",
    checks: [
      {
        id: "journal_balanced",
        label: "All journal entries are balanced",
        passed: true,
        detail: "OK",
      },
      {
        id: "no_unmatched_transactions",
        label: "No unmatched bank transactions for the period",
        passed: true,
        detail: "OK",
      },
      {
        id: "trial_balance_zero",
        label: "Trial balance debits equal credits as of period end",
        passed: true,
        detail: "OK",
      },
      { id: "period_not_already_closed", label: "Period is open", passed: true, detail: "OK" },
    ],
    readyToClose: true,
  };

  it("returns 200 for viewer", async () => {
    vi.mocked(getPeriodCloseChecklist).mockResolvedValue(checklist);
    const app = makeApp("viewer");
    const res = await app.request("/fiscal-periods/p-1/close-checklist", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual(checklist);
  });

  it("returns 200 for editor", async () => {
    vi.mocked(getPeriodCloseChecklist).mockResolvedValue(checklist);
    const app = makeApp("editor");
    const res = await app.request("/fiscal-periods/p-1/close-checklist", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("returns 200 for admin", async () => {
    vi.mocked(getPeriodCloseChecklist).mockResolvedValue(checklist);
    const app = makeApp("admin");
    const res = await app.request("/fiscal-periods/p-1/close-checklist", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("returns 404 when period not found", async () => {
    vi.mocked(getPeriodCloseChecklist).mockRejectedValue(
      new AppError(404, "Fiscal period not found"),
    );
    const app = makeApp("viewer");
    const res = await app.request("/fiscal-periods/p-999/close-checklist", { method: "GET" });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Recurring Templates
// ---------------------------------------------------------------------------

const recurringTemplate = {
  id: "tmpl-1",
  orgId: "org-1",
  name: "Monthly Rent",
  description: null as string | null,
  frequency: "monthly" as "monthly" | "quarterly" | "annually",
  nextRunDate: new Date("2026-02-01"),
  isActive: true,
  fiscalPeriodId: null as string | null,
  memo: "Monthly rent expense" as string | null,
  lines: [
    { accountId: "acc-1", debitCents: 10000, creditCents: 0 },
    { accountId: "acc-2", debitCents: 0, creditCents: 10000 },
  ],
  createdBy: "user-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  deletedAt: null,
};

const validTemplateBody = {
  name: "Monthly Rent",
  frequency: "monthly",
  nextRunDate: "2026-02-01T00:00:00.000Z",
  isActive: true,
  lines: [
    { accountId: "acc-1", debitCents: 10000, creditCents: 0 },
    { accountId: "acc-2", debitCents: 0, creditCents: 10000 },
  ],
};

describe("GET /recurring-templates", () => {
  it("returns 200 for viewer", async () => {
    vi.mocked(listRecurringTemplates).mockResolvedValue([recurringTemplate]);
    const app = makeApp("viewer");
    const res = await app.request("/recurring-templates", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.id).toBe("tmpl-1");
  });

  it("returns 200 for editor", async () => {
    vi.mocked(listRecurringTemplates).mockResolvedValue([]);
    const app = makeApp("editor");
    const res = await app.request("/recurring-templates", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("returns 403 for null-role user", async () => {
    const app = makeApp(null as unknown as string);
    const res = await app.request("/recurring-templates", { method: "GET" });
    expect(res.status).toBe(403);
  });

  it("passes isActive=true filter", async () => {
    vi.mocked(listRecurringTemplates).mockResolvedValue([recurringTemplate]);
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates?isActive=true", { method: "GET" });
    expect(res.status).toBe(200);
    expect(listRecurringTemplates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isActive: true }),
    );
  });

  it("passes isActive=false filter", async () => {
    vi.mocked(listRecurringTemplates).mockResolvedValue([]);
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates?isActive=false", { method: "GET" });
    expect(res.status).toBe(200);
    expect(listRecurringTemplates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isActive: false }),
    );
  });
});

describe("POST /recurring-templates", () => {
  it("returns 201 for admin with valid body", async () => {
    vi.mocked(createRecurringTemplate).mockResolvedValue(recurringTemplate);
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTemplateBody),
    });
    expect(res.status).toBe(201);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/recurring-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTemplateBody),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/recurring-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTemplateBody),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (unbalanced lines)", async () => {
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validTemplateBody,
        lines: [
          { accountId: "acc-1", debitCents: 10000, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 5000 },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty name", async () => {
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validTemplateBody, name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid frequency", async () => {
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validTemplateBody, frequency: "weekly" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /recurring-templates/:templateId", () => {
  it("returns 200 for viewer", async () => {
    vi.mocked(getRecurringTemplate).mockResolvedValue(recurringTemplate);
    const app = makeApp("viewer");
    const res = await app.request("/recurring-templates/tmpl-1", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("tmpl-1");
  });

  it("returns 403 for null-role user", async () => {
    const app = makeApp(null as unknown as string);
    const res = await app.request("/recurring-templates/tmpl-1", { method: "GET" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(getRecurringTemplate).mockRejectedValue(
      new AppError(404, "Recurring template not found"),
    );
    const app = makeApp("viewer");
    const res = await app.request("/recurring-templates/missing", { method: "GET" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /recurring-templates/:templateId", () => {
  it("returns 200 for admin", async () => {
    vi.mocked(updateRecurringTemplate).mockResolvedValue({
      ...recurringTemplate,
      name: "Updated Rent",
    });
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates/tmpl-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Rent" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/recurring-templates/tmpl-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/recurring-templates/tmpl-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty name", async () => {
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates/tmpl-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(updateRecurringTemplate).mockRejectedValue(
      new AppError(404, "Recurring template not found"),
    );
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /recurring-templates/:templateId", () => {
  it("returns 204 for admin", async () => {
    vi.mocked(deleteRecurringTemplate).mockResolvedValue(undefined);
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates/tmpl-1", { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/recurring-templates/tmpl-1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/recurring-templates/tmpl-1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(deleteRecurringTemplate).mockRejectedValue(
      new AppError(404, "Recurring template not found"),
    );
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("POST /recurring-templates/:templateId/run", () => {
  it("returns 200 for admin", async () => {
    vi.mocked(runTemplate).mockResolvedValue({
      journalEntryId: "je-new",
      nextRunDate: new Date("2026-03-01"),
    });
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates/tmpl-1/run", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { journalEntryId: string };
    expect(body.journalEntryId).toBe("je-new");
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/recurring-templates/tmpl-1/run", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/recurring-templates/tmpl-1/run", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when template not found", async () => {
    vi.mocked(runTemplate).mockRejectedValue(new AppError(404, "Recurring template not found"));
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates/missing/run", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when no open fiscal period", async () => {
    vi.mocked(runTemplate).mockRejectedValue(
      new AppError(400, "No open fiscal period for current date"),
    );
    const app = makeApp("admin");
    const res = await app.request("/recurring-templates/tmpl-1/run", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Opening balances seeder
// ---------------------------------------------------------------------------

const seedResult = {
  dryRun: false,
  donations: 3,
  expenses: 2,
  estimatedJEs: 7,
  fiscalPeriodCreated: true,
  errors: [],
};

describe("POST /seed/opening-balances", () => {
  it("returns 200 for admin — dry run", async () => {
    vi.mocked(seedOpeningBalances).mockResolvedValue({
      ...seedResult,
      dryRun: true,
      fiscalPeriodCreated: false,
    });
    const app = makeApp("admin");
    const res = await app.request("/seed/opening-balances?dryRun=true", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.dryRun).toBe(true);
    expect(seedOpeningBalances).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dryRun: true, orgId: "org-1", actorId: "user-1" }),
    );
  });

  it("returns 200 for admin — commit", async () => {
    vi.mocked(seedOpeningBalances).mockResolvedValue(seedResult);
    const app = makeApp("admin");
    const res = await app.request("/seed/opening-balances", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.fiscalPeriodCreated).toBe(true);
    expect(seedOpeningBalances).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dryRun: false }),
    );
  });

  it("returns 403 for editor", async () => {
    const app = makeApp("editor");
    const res = await app.request("/seed/opening-balances", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    const app = makeApp("viewer");
    const res = await app.request("/seed/opening-balances", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when already seeded", async () => {
    vi.mocked(seedOpeningBalances).mockRejectedValue(
      new AppError(400, "Opening balances have already been seeded for this organization"),
    );
    const app = makeApp("admin");
    const res = await app.request("/seed/opening-balances", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when accounting is not enabled", async () => {
    vi.mocked(seedOpeningBalances).mockRejectedValue(
      new AppError(400, "Accounting must be enabled"),
    );
    const app = makeApp("admin");
    const res = await app.request("/seed/opening-balances", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Analytics helper branch coverage
// ---------------------------------------------------------------------------

describe("captureAccountingEvent — skips when orgId is absent", () => {
  it("does not call capture and still returns a successful response when orgId is missing", async () => {
    vi.mocked(createAccount).mockResolvedValue(account);

    const appNoOrg = new Hono<AppEnv>()
      .onError(errorHandler)
      .use("*", async (c, next) => {
        c.set("db", {} as Parameters<typeof listAccounts>[0]);
        // orgId intentionally absent to hit the !orgId guard in captureAccountingEvent
        c.set("user", { id: "user-1" } as AppEnv["Variables"]["user"]);
        c.set("memberRole", "admin" as AppEnv["Variables"]["memberRole"]);
        c.set("memberPermissions", null);
        await next();
      })
      .route("/", accountingRoutes);

    const res = await appNoOrg.request("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "1000", name: "Cash", type: "asset" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
  });
});

describe("countBucket — row-count bucket boundaries", () => {
  it("captures imported_rows_bucket 11-100 when 11 rows are imported", async () => {
    vi.mocked(importBankTransactions).mockResolvedValue({
      imported: 11,
      duplicates: 0,
      errors: [],
    } as never);
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankAccountId: "ba-1", format: "csv", content: "date,amount" }),
    });
    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ imported_rows_bucket: "11-100" }),
      }),
    );
  });

  it("captures imported_rows_bucket 101-1000 when 101 rows are imported", async () => {
    vi.mocked(importBankTransactions).mockResolvedValue({
      imported: 101,
      duplicates: 0,
      errors: [],
    } as never);
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankAccountId: "ba-1", format: "csv", content: "date,amount" }),
    });
    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ imported_rows_bucket: "101-1000" }),
      }),
    );
  });

  it("captures imported_rows_bucket 1000+ when 1001 rows are imported", async () => {
    vi.mocked(importBankTransactions).mockResolvedValue({
      imported: 1001,
      duplicates: 0,
      errors: [],
    } as never);
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankAccountId: "ba-1", format: "csv", content: "date,amount" }),
    });
    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ imported_rows_bucket: "1000+" }),
      }),
    );
  });

  it("captures imported_rows_bucket 0 when import result has no recognized count field", async () => {
    vi.mocked(importBankTransactions).mockResolvedValue({ duplicates: 0, errors: [] } as never);
    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankAccountId: "ba-1", format: "csv", content: "date,amount" }),
    });
    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ imported_rows_bucket: "0" }),
      }),
    );
  });
});

describe("opening-balances dryRun=true skips capture", () => {
  it("does not emit openingBalancesSeeded event when dryRun is true", async () => {
    const seedResult = { fiscalPeriodCreated: false, balancesInserted: 0 };
    vi.mocked(seedOpeningBalances).mockResolvedValue(seedResult as never);
    const app = makeApp("admin");
    const res = await app.request("/seed/opening-balances?dryRun=true", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.openingBalancesSeeded }),
    );
  });
});

// ---------------------------------------------------------------------------
// accounting_operation_failed capture on write handler errors
// ---------------------------------------------------------------------------

describe("accounting_operation_failed capture", () => {
  it("emits accountingOperationFailed and rethrows on bank import failure", async () => {
    const importError = new TypeError("parse_error");
    vi.mocked(importBankTransactions).mockRejectedValue(importError);

    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: "ba-1",
        format: "csv",
        content: "date,amount\n2026-01-01,10",
      }),
    });

    // error is rethrown so the error handler returns a 500
    expect(res.status).toBe(500);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.accountingOperationFailed,
        payload: expect.objectContaining({
          operation: "bank_import",
          failure_type: "TypeError",
        }),
      }),
    );
    // must NOT include PII or raw request bodies
    const payloadStr = JSON.stringify(mockCaptureAnalytics.mock.calls);
    expect(payloadStr).not.toContain("date,amount");
  });

  it("emits accountingOperationFailed and rethrows on journal entry create failure", async () => {
    const jeError = new Error("balance_error");
    vi.mocked(createJournalEntry).mockRejectedValue(jeError);

    const app = makeApp("admin");
    const res = await app.request("/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-15T00:00:00.000Z",
        fiscalPeriodId: "p-1",
        lines: [
          { accountId: "acc-1", debitCents: 100, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 100 },
        ],
      }),
    });

    expect(res.status).toBe(500);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.accountingOperationFailed,
        payload: expect.objectContaining({
          operation: "journal_entry_create",
          failure_type: "Error",
        }),
      }),
    );
  });

  it("emits accountingOperationFailed and rethrows on reconciliation create failure", async () => {
    const reconError = new RangeError("period_closed");
    vi.mocked(createReconciliation).mockRejectedValue(reconError);

    const app = makeApp("admin");
    const res = await app.request("/reconciliations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: "ba-1",
        statementDate: "2026-01-31T00:00:00.000Z",
        statementEndingBalanceCents: 1000,
      }),
    });

    expect(res.status).toBe(500);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.accountingOperationFailed,
        payload: expect.objectContaining({
          operation: "reconciliation_create",
          failure_type: "RangeError",
        }),
      }),
    );
  });

  it("does NOT emit accountingOperationFailed when a write handler succeeds", async () => {
    vi.mocked(importBankTransactions).mockResolvedValue({
      imported: 1,
      duplicates: 0,
      errors: [],
    } as never);

    const app = makeApp("admin");
    const res = await app.request("/bank-accounts/ba-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: "ba-1",
        format: "csv",
        content: "date,amount\n2026-01-01,10",
      }),
    });

    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.accountingOperationFailed }),
    );
  });
});

// ---------------------------------------------------------------------------
// GET /anomalies
// ---------------------------------------------------------------------------

const anomalyResult = {
  asOf: new Date("2026-06-16T00:00:00Z").toISOString(),
  items: [],
  totals: {
    category_misallocation: 0,
    release_over_balance: 0,
    duplicate_donation: 2,
    indirect_rate_mismatch: 0,
  },
};

describe("GET /anomalies", () => {
  it("returns 200 with anomaly result for audit_ready plan", async () => {
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("audit_ready");
    vi.mocked(getAnomalies).mockResolvedValue({
      asOf: new Date("2026-06-16T00:00:00Z"),
      items: [],
      totals: {
        category_misallocation: 0,
        release_over_balance: 0,
        duplicate_donation: 2,
        indirect_rate_mismatch: 0,
      },
    });
    const app = makeApp("admin");
    const res = await app.request("/anomalies", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ totals: anomalyResult.totals, items: [] });
    expect(body.asOf).toBeDefined();
    expect(getAnomalies).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", entityId: "entity-1" }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.accountingAnomalyFeedLoaded,
      payload: {
        actorId: "user-1",
        entity_type: "accounting_anomaly_feed",
        has_class_filter: false,
        visible_items_bucket: "0",
        total_items_bucket: "1-10",
      },
    });
  });

  it("returns 200 for enterprise plan", async () => {
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("enterprise");
    vi.mocked(getAnomalies).mockResolvedValue({
      asOf: new Date(),
      items: [],
      totals: {
        category_misallocation: 0,
        release_over_balance: 0,
        duplicate_donation: 0,
        indirect_rate_mismatch: 0,
      },
    });
    const app = makeApp("admin");
    const res = await app.request("/anomalies", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("returns 402 for starter plan", async () => {
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("starter");
    const app = makeApp("admin");
    const res = await app.request("/anomalies", { method: "GET" });
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("insufficient_plan");
    expect(body.required).toBe("audit_ready");
    expect(getAnomalies).not.toHaveBeenCalled();
  });

  it("returns 402 for growth plan", async () => {
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("growth");
    const app = makeApp("admin");
    const res = await app.request("/anomalies", { method: "GET" });
    expect(res.status).toBe(402);
  });

  it("returns 403 for unauthenticated / no permissions", async () => {
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("audit_ready");
    // viewer role has accounting view — so use null role to simulate no permissions
    const app = makeApp(null as unknown as string);
    const res = await app.request("/anomalies", { method: "GET" });
    expect(res.status).toBe(403);
  });

  it("accepts classes query param", async () => {
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("audit_ready");
    vi.mocked(getAnomalies).mockResolvedValue({
      asOf: new Date(),
      items: [],
      totals: {
        category_misallocation: 0,
        release_over_balance: 0,
        duplicate_donation: 0,
        indirect_rate_mismatch: 0,
      },
    });
    const app = makeApp("admin");
    const res = await app.request("/anomalies?classes=duplicate_donation,indirect_rate_mismatch", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    expect(getAnomalies).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ classes: ["duplicate_donation", "indirect_rate_mismatch"] }),
    );
  });

  it("accepts limit query param", async () => {
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("audit_ready");
    vi.mocked(getAnomalies).mockResolvedValue({
      asOf: new Date(),
      items: [],
      totals: {
        category_misallocation: 0,
        release_over_balance: 0,
        duplicate_donation: 0,
        indirect_rate_mismatch: 0,
      },
    });
    const app = makeApp("admin");
    const res = await app.request("/anomalies?limit=10", { method: "GET" });
    expect(res.status).toBe(200);
    expect(getAnomalies).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 10 }),
    );
  });

  it("returns 400 for invalid classes value", async () => {
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("audit_ready");
    const app = makeApp("admin");
    const res = await app.request("/anomalies?classes=invalid_class", { method: "GET" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("invalid_query");
  });

  it("returns 400 for invalid limit value", async () => {
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("audit_ready");
    const app = makeApp("admin");
    const res = await app.request("/anomalies?limit=0", { method: "GET" });
    expect(res.status).toBe(400);
  });

  it("viewer role can access anomalies", async () => {
    vi.mocked(getContextEffectivePlanTier).mockReturnValue("audit_ready");
    vi.mocked(getAnomalies).mockResolvedValue({
      asOf: new Date(),
      items: [],
      totals: {
        category_misallocation: 0,
        release_over_balance: 0,
        duplicate_donation: 0,
        indirect_rate_mismatch: 0,
      },
    });
    const app = makeApp("viewer");
    const res = await app.request("/anomalies", { method: "GET" });
    expect(res.status).toBe(200);
  });
});

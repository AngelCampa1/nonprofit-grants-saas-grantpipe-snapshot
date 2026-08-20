import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../types";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { getIntegrations } from "../../lib/integrations";
import {
  requireAllEntityPermissions,
  requireEntityPermission,
} from "../../middleware/require-role";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";
import {
  ANALYTICS_EVENTS,
  accountListSchema,
  activitiesQuerySchema,
  bankIgnoreSchema,
  bankImportSchema,
  bankMatchSchema,
  bankUnmatchSchema,
  completeReconciliationSchema,
  createAccountSchema,
  createBankAccountSchema,
  createFiscalPeriodSchema,
  createJournalEntrySchema,
  createReconciliationSchema,
  createRecurringTemplateSchema,
  financialPositionQuerySchema,
  functionalExpensesQuerySchema,
  journalEntryListSchema,
  ledgerQuerySchema,
  reverseJournalEntrySchema,
  trialBalanceQuerySchema,
  updateAccountSchema,
  updateBankAccountSchema,
  updateFiscalPeriodSchema,
  updateRecurringTemplateSchema,
  yearEndCloseSchema,
  anomalyQuerySchema,
  canUseAccountingAnomalyDetector,
} from "@grantpipe/shared";
import {
  closeFiscalPeriod,
  createAccount,
  createFiscalPeriod,
  createJournalEntry,
  deleteAccount,
  getAccount,
  getAccountLedger,
  getJournalEntry,
  getPeriodCloseChecklist,
  getStatementOfActivities,
  getStatementOfFinancialPosition,
  getStatementOfFunctionalExpenses,
  getTrialBalance,
  listAccounts,
  listFiscalPeriods,
  listJournalEntries,
  reverseJournalEntry,
  runYearEndClose,
  seedChartOfAccounts,
  sfeToCsv,
  sfpToCsv,
  soaToCsv,
  updateAccount,
  updateFiscalPeriod,
} from "./service";
import {
  cancelReconciliation,
  completeReconciliation,
  createBankAccount,
  createReconciliation,
  deleteBankAccount,
  getBankAccounts,
  getBankTransactions,
  ignoreBankTransaction,
  importBankTransactions,
  matchBankTransaction,
  unmatchBankTransaction,
  updateBankAccount,
} from "./bankService";
import {
  createRecurringTemplate,
  deleteRecurringTemplate,
  getRecurringTemplate,
  listRecurringTemplates,
  runTemplate,
  updateRecurringTemplate,
} from "./recurringService";
import { seedOpeningBalances } from "./seedService";
import { getAnomalies } from "./anomaly.service";

function csvResponse(c: Context<AppEnv>, csv: string, filename: string) {
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  });
}

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function captureAccountingEvent(
  c: Context<AppEnv>,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  const orgId = c.get("orgId");
  const user = c.get("user");

  if (!orgId || !user) {
    return;
  }

  captureApiAnalyticsSafely(
    analyticsForContext(c).capture({
      orgId,
      eventName,
      payload: {
        actorId: user.id,
        ...payload,
      },
    }),
    { c, eventName },
  );
}

function changedFields(data: Record<string, unknown>): string[] {
  return Object.keys(data);
}

function countBucket(count: number): string {
  if (count <= 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 100) return "11-100";
  if (count <= 1000) return "101-1000";
  return "1000+";
}

function importedCount(result: unknown): number {
  if (typeof result !== "object" || result === null) {
    return 0;
  }

  const row = result as Record<string, unknown>;
  const imported = row.imported ?? row.importedCount ?? row.created ?? row.inserted;
  return typeof imported === "number" ? imported : 0;
}

function totalAnomalyCount(totals: Record<string, number>): number {
  return Object.values(totals).reduce((sum, count) => sum + count, 0);
}

// Chart of accounts is structural configuration — admin-only like custom field management.
// Editors can create/edit most records but not COA (changing account codes breaks the ledger).
export const accountingRoutes = new Hono<AppEnv>()
  // COA
  .get(
    "/accounts",
    requireEntityPermission("accounting", "view"),
    zValidator("query", accountListSchema),
    async (c) => {
      const result = await listAccounts(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .post(
    "/accounts",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", createAccountSchema),
    async (c) => {
      const account = await createAccount(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.accountCreated, {
        entity_type: "account",
        account_type: c.req.valid("json").type,
      });
      return c.json(account, 201);
    },
  )
  .post("/accounts/seed", requireEntityPermission("accounting", "manage"), async (c) => {
    await seedChartOfAccounts(c.get("db"), {
      orgId: c.get("orgId")!,
      actorId: c.get("user")!.id,
    });
    captureAccountingEvent(c, ANALYTICS_EVENTS.chartOfAccountsSeeded, {
      entity_type: "chart_of_accounts",
    });
    return c.json({ ok: true });
  })
  .get("/accounts/:accountId", requireEntityPermission("accounting", "view"), async (c) => {
    const account = await getAccount(c.get("db"), {
      orgId: c.get("orgId")!,
      accountId: c.req.param("accountId"),
    });
    return c.json(account);
  })
  .patch(
    "/accounts/:accountId",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", updateAccountSchema),
    async (c) => {
      const account = await updateAccount(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        accountId: c.req.param("accountId"),
        data: c.req.valid("json"),
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.accountUpdated, {
        entity_type: "account",
        changed_fields: changedFields(c.req.valid("json")),
      });
      return c.json(account);
    },
  )
  .delete("/accounts/:accountId", requireEntityPermission("accounting", "manage"), async (c) => {
    await deleteAccount(c.get("db"), {
      orgId: c.get("orgId")!,
      actorId: c.get("user")!.id,
      accountId: c.req.param("accountId"),
    });
    return c.body(null, 204);
  })
  .get(
    "/accounts/:accountId/ledger",
    requireEntityPermission("accounting", "view"),
    zValidator("query", ledgerQuerySchema),
    async (c) => {
      const result = await getAccountLedger(c.get("db"), {
        orgId: c.get("orgId")!,
        accountId: c.req.param("accountId"),
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  // Fiscal periods
  .get("/periods", requireEntityPermission("accounting", "view"), async (c) => {
    const result = await listFiscalPeriods(c.get("db"), { orgId: c.get("orgId")! });
    return c.json(result);
  })
  .post(
    "/periods",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", createFiscalPeriodSchema),
    async (c) => {
      const period = await createFiscalPeriod(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.fiscalPeriodCreated, {
        entity_type: "fiscal_period",
      });
      return c.json(period, 201);
    },
  )
  .patch(
    "/periods/:periodId",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", updateFiscalPeriodSchema),
    async (c) => {
      const period = await updateFiscalPeriod(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        periodId: c.req.param("periodId"),
        data: c.req.valid("json"),
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.fiscalPeriodUpdated, {
        entity_type: "fiscal_period",
        changed_fields: changedFields(c.req.valid("json")),
      });
      return c.json(period);
    },
  )
  .post("/periods/:periodId/close", requireEntityPermission("accounting", "manage"), async (c) => {
    const period = await closeFiscalPeriod(c.get("db"), {
      orgId: c.get("orgId")!,
      actorId: c.get("user")!.id,
      periodId: c.req.param("periodId"),
    });
    captureAccountingEvent(c, ANALYTICS_EVENTS.fiscalPeriodClosed, {
      entity_type: "fiscal_period",
    });
    return c.json(period);
  })
  .post(
    "/fiscal-periods/:periodId/year-end-close",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", yearEndCloseSchema),
    async (c) => {
      const result = await runYearEndClose(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        periodId: c.req.param("periodId"),
      });
      return c.json(result);
    },
  )
  .get(
    "/fiscal-periods/:periodId/close-checklist",
    requireEntityPermission("accounting", "view"),
    async (c) => {
      const result = await getPeriodCloseChecklist(c.get("db"), {
        orgId: c.get("orgId")!,
        periodId: c.req.param("periodId"),
      });
      return c.json(result);
    },
  )
  // Journal entries
  .get(
    "/journal",
    requireEntityPermission("accounting", "view"),
    zValidator("query", journalEntryListSchema),
    async (c) => {
      const { fiscalPeriodId, source, from, to, page, pageSize } = c.req.valid("query");
      const result = await listJournalEntries(c.get("db"), {
        orgId: c.get("orgId")!,
        fiscalPeriodId,
        source,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        page,
        pageSize,
      });
      return c.json(result);
    },
  )
  .post(
    "/journal",
    requireEntityPermission("accounting", "edit"),
    zValidator("json", createJournalEntrySchema),
    async (c) => {
      let entry: Awaited<ReturnType<typeof createJournalEntry>>;
      try {
        entry = await createJournalEntry(c.get("db"), {
          orgId: c.get("orgId")!,
          actorId: c.get("user")!.id,
          ...c.req.valid("json"),
        });
      } catch (error) {
        captureAccountingEvent(c, ANALYTICS_EVENTS.accountingOperationFailed, {
          operation: "journal_entry_create",
          failure_type: error instanceof Error ? error.name : "UnknownError",
        });
        throw error;
      }
      captureAccountingEvent(c, ANALYTICS_EVENTS.journalEntryCreated, {
        entity_type: "journal_entry",
        source: "manual",
      });
      return c.json(entry, 201);
    },
  )
  .get("/journal/:entryId", requireEntityPermission("accounting", "view"), async (c) => {
    const entry = await getJournalEntry(c.get("db"), {
      orgId: c.get("orgId")!,
      entryId: c.req.param("entryId"),
    });
    return c.json(entry);
  })
  .post(
    "/journal/:entryId/reverse",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", reverseJournalEntrySchema),
    async (c) => {
      const { memo, targetFiscalPeriodId, date } = c.req.valid("json");
      const entry = await reverseJournalEntry(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        entryId: c.req.param("entryId"),
        memo,
        targetFiscalPeriodId,
        date,
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.journalEntryReversed, {
        entity_type: "journal_entry",
      });
      return c.json(entry, 201);
    },
  )
  // Reports
  .get(
    "/reports/trial-balance",
    requireAllEntityPermissions([
      ["accounting", "view"],
      ["reports", "view"],
    ]),
    zValidator("query", trialBalanceQuerySchema),
    async (c) => {
      const result = await getTrialBalance(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .get(
    "/reports/financial-position",
    requireAllEntityPermissions([
      ["accounting", "view"],
      ["reports", "view"],
    ]),
    zValidator("query", financialPositionQuerySchema),
    async (c) => {
      const { asOf, format } = c.req.valid("query");
      const result = await getStatementOfFinancialPosition(c.get("db"), {
        orgId: c.get("orgId")!,
        asOf: new Date(asOf),
      });
      if (format === "csv") {
        return csvResponse(c, sfpToCsv(result), "statement-of-financial-position.csv");
      }
      return c.json(result);
    },
  )
  .get(
    "/reports/activities",
    requireAllEntityPermissions([
      ["accounting", "view"],
      ["reports", "view"],
    ]),
    zValidator("query", activitiesQuerySchema),
    async (c) => {
      const { from, to, format } = c.req.valid("query");
      const result = await getStatementOfActivities(c.get("db"), {
        orgId: c.get("orgId")!,
        startDate: new Date(from),
        endDate: new Date(to),
      });
      if (format === "csv") {
        return csvResponse(c, soaToCsv(result), "statement-of-activities.csv");
      }
      return c.json(result);
    },
  )
  .get(
    "/reports/functional-expenses",
    requireAllEntityPermissions([
      ["accounting", "view"],
      ["reports", "view"],
    ]),
    zValidator("query", functionalExpensesQuerySchema),
    async (c) => {
      const { from, to, format } = c.req.valid("query");
      const result = await getStatementOfFunctionalExpenses(c.get("db"), {
        orgId: c.get("orgId")!,
        startDate: new Date(from),
        endDate: new Date(to),
      });
      if (format === "csv") {
        return csvResponse(c, sfeToCsv(result), "statement-of-functional-expenses.csv");
      }
      return c.json(result);
    },
  )
  // ---------------------------------------------------------------------------
  // Bank accounts
  // ---------------------------------------------------------------------------
  .get("/bank-accounts", requireEntityPermission("accounting", "view"), async (c) => {
    const result = await getBankAccounts(c.get("db"), { orgId: c.get("orgId")! });
    return c.json(result);
  })
  .post(
    "/bank-accounts",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", createBankAccountSchema),
    async (c) => {
      const data = c.req.valid("json");
      const result = await createBankAccount(c.get("db"), {
        orgId: c.get("orgId")!,
        ...data,
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.bankAccountCreated, {
        entity_type: "bank_account",
      });
      return c.json(result, 201);
    },
  )
  .patch(
    "/bank-accounts/:bankAccountId",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", updateBankAccountSchema),
    async (c) => {
      const data = c.req.valid("json");
      const result = await updateBankAccount(c.get("db"), {
        orgId: c.get("orgId")!,
        bankAccountId: c.req.param("bankAccountId"),
        ...data,
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.bankAccountUpdated, {
        entity_type: "bank_account",
        changed_fields: changedFields(data),
      });
      return c.json(result);
    },
  )
  .delete(
    "/bank-accounts/:bankAccountId",
    requireEntityPermission("accounting", "manage"),
    async (c) => {
      await deleteBankAccount(c.get("db"), {
        orgId: c.get("orgId")!,
        bankAccountId: c.req.param("bankAccountId"),
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.bankAccountDeleted, {
        entity_type: "bank_account",
      });
      return c.body(null, 204);
    },
  )
  // ---------------------------------------------------------------------------
  // Bank transactions
  // ---------------------------------------------------------------------------
  .post(
    "/bank-accounts/:bankAccountId/import",
    requireEntityPermission("accounting", "edit"),
    zValidator("json", bankImportSchema),
    async (c) => {
      const { format, content } = c.req.valid("json");
      let result: Awaited<ReturnType<typeof importBankTransactions>>;
      try {
        result = await importBankTransactions(c.get("db"), {
          orgId: c.get("orgId")!,
          bankAccountId: c.req.param("bankAccountId"),
          format,
          content,
        });
      } catch (error) {
        captureAccountingEvent(c, ANALYTICS_EVENTS.accountingOperationFailed, {
          operation: "bank_import",
          failure_type: error instanceof Error ? error.name : "UnknownError",
        });
        throw error;
      }
      captureAccountingEvent(c, ANALYTICS_EVENTS.bankTransactionsImported, {
        entity_type: "bank_transaction",
        file_format: format,
        imported_rows_bucket: countBucket(importedCount(result)),
      });
      return c.json(result);
    },
  )
  .get(
    "/bank-accounts/:bankAccountId/transactions",
    requireEntityPermission("accounting", "view"),
    async (c) => {
      const statusRaw = c.req.query("status") as "unmatched" | "matched" | "ignored" | undefined;
      const result = await getBankTransactions(c.get("db"), {
        orgId: c.get("orgId")!,
        bankAccountId: c.req.param("bankAccountId"),
        status: statusRaw,
      });
      return c.json(result);
    },
  )
  .post(
    "/bank-accounts/:bankAccountId/match",
    requireEntityPermission("accounting", "edit"),
    zValidator("json", bankMatchSchema),
    async (c) => {
      const { bankTransactionId, journalEntryId } = c.req.valid("json");
      const result = await matchBankTransaction(c.get("db"), {
        orgId: c.get("orgId")!,
        bankTransactionId,
        journalEntryId,
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.bankTransactionMatched, {
        entity_type: "bank_transaction",
      });
      return c.json(result);
    },
  )
  .post(
    "/bank-accounts/:bankAccountId/ignore",
    requireEntityPermission("accounting", "edit"),
    zValidator("json", bankIgnoreSchema),
    async (c) => {
      const { bankTransactionId } = c.req.valid("json");
      const result = await ignoreBankTransaction(c.get("db"), {
        orgId: c.get("orgId")!,
        bankTransactionId,
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.bankTransactionIgnored, {
        entity_type: "bank_transaction",
      });
      return c.json(result);
    },
  )
  .post(
    "/bank-accounts/:bankAccountId/unmatch",
    requireEntityPermission("accounting", "edit"),
    zValidator("json", bankUnmatchSchema),
    async (c) => {
      const { bankTransactionId } = c.req.valid("json");
      const result = await unmatchBankTransaction(c.get("db"), {
        orgId: c.get("orgId")!,
        bankTransactionId,
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.bankTransactionUnmatched, {
        entity_type: "bank_transaction",
      });
      return c.json(result);
    },
  )
  // ---------------------------------------------------------------------------
  // Reconciliations
  // ---------------------------------------------------------------------------
  .post(
    "/reconciliations",
    requireEntityPermission("accounting", "edit"),
    zValidator("json", createReconciliationSchema),
    async (c) => {
      const data = c.req.valid("json");
      let result: Awaited<ReturnType<typeof createReconciliation>>;
      try {
        result = await createReconciliation(c.get("db"), {
          orgId: c.get("orgId")!,
          ...data,
        });
      } catch (error) {
        captureAccountingEvent(c, ANALYTICS_EVENTS.accountingOperationFailed, {
          operation: "reconciliation_create",
          failure_type: error instanceof Error ? error.name : "UnknownError",
        });
        throw error;
      }
      captureAccountingEvent(c, ANALYTICS_EVENTS.reconciliationStarted, {
        entity_type: "reconciliation",
      });
      return c.json(result, 201);
    },
  )
  .post(
    "/reconciliations/:reconId/complete",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", completeReconciliationSchema),
    async (c) => {
      const result = await completeReconciliation(c.get("db"), {
        orgId: c.get("orgId")!,
        reconId: c.req.param("reconId"),
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.reconciliationCompleted, {
        entity_type: "reconciliation",
      });
      return c.json(result);
    },
  )
  .delete(
    "/reconciliations/:reconId",
    requireEntityPermission("accounting", "manage"),
    async (c) => {
      await cancelReconciliation(c.get("db"), {
        orgId: c.get("orgId")!,
        reconId: c.req.param("reconId"),
        actorId: c.get("user")!.id,
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.reconciliationCancelled, {
        entity_type: "reconciliation",
      });
      return c.body(null, 204);
    },
  )
  // ---------------------------------------------------------------------------
  // Recurring journal templates
  // ---------------------------------------------------------------------------
  .get("/recurring-templates", requireEntityPermission("accounting", "view"), async (c) => {
    const isActiveRaw = c.req.query("isActive");
    const isActive = isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : undefined;
    const result = await listRecurringTemplates(c.get("db"), {
      orgId: c.get("orgId")!,
      isActive,
    });
    return c.json(result);
  })
  .post(
    "/recurring-templates",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", createRecurringTemplateSchema),
    async (c) => {
      const result = await createRecurringTemplate(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.recurringTemplateCreated, {
        entity_type: "recurring_template",
      });
      return c.json(result, 201);
    },
  )
  .get(
    "/recurring-templates/:templateId",
    requireEntityPermission("accounting", "view"),
    async (c) => {
      const result = await getRecurringTemplate(c.get("db"), {
        orgId: c.get("orgId")!,
        templateId: c.req.param("templateId"),
      });
      return c.json(result);
    },
  )
  .patch(
    "/recurring-templates/:templateId",
    requireEntityPermission("accounting", "manage"),
    zValidator("json", updateRecurringTemplateSchema),
    async (c) => {
      const result = await updateRecurringTemplate(c.get("db"), {
        orgId: c.get("orgId")!,
        templateId: c.req.param("templateId"),
        ...c.req.valid("json"),
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.recurringTemplateUpdated, {
        entity_type: "recurring_template",
        changed_fields: changedFields(c.req.valid("json")),
      });
      return c.json(result);
    },
  )
  .delete(
    "/recurring-templates/:templateId",
    requireEntityPermission("accounting", "manage"),
    async (c) => {
      await deleteRecurringTemplate(c.get("db"), {
        orgId: c.get("orgId")!,
        templateId: c.req.param("templateId"),
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.recurringTemplateDeleted, {
        entity_type: "recurring_template",
      });
      return c.body(null, 204);
    },
  )
  .post(
    "/recurring-templates/:templateId/run",
    requireEntityPermission("accounting", "manage"),
    async (c) => {
      const result = await runTemplate(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        templateId: c.req.param("templateId"),
      });
      captureAccountingEvent(c, ANALYTICS_EVENTS.recurringTemplateRun, {
        entity_type: "recurring_template",
      });
      return c.json(result);
    },
  )
  // ---------------------------------------------------------------------------
  // Anomaly & Misallocation Detector (Audit-Ready+ plan gate)
  // ---------------------------------------------------------------------------
  .get("/anomalies", requireEntityPermission("accounting", "view"), async (c) => {
    const planTier = getContextEffectivePlanTier(c);
    if (!canUseAccountingAnomalyDetector(planTier)) {
      return c.json(
        { error: "insufficient_plan", required: "audit_ready", current: planTier },
        402,
      );
    }

    const rawClasses = c.req.query("classes");
    const rawLimit = c.req.query("limit");

    const parsed = anomalyQuerySchema.safeParse({
      classes: rawClasses
        ? rawClasses
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : undefined,
      limit: rawLimit,
    });

    if (!parsed.success) {
      return c.json({ error: "invalid_query", details: parsed.error.flatten() }, 400);
    }

    const { classes, limit } = parsed.data;
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const now = new Date();

    const result = await getAnomalies(db, {
      orgId,
      entityId: c.get("entityId")!,
      now,
      classes,
      limit,
    });

    captureAccountingEvent(c, ANALYTICS_EVENTS.accountingAnomalyFeedLoaded, {
      entity_type: "accounting_anomaly_feed",
      has_class_filter: Boolean(classes?.length),
      visible_items_bucket: countBucket(result.items.length),
      total_items_bucket: countBucket(totalAnomalyCount(result.totals)),
    });

    return c.json({ asOf: result.asOf.toISOString(), items: result.items, totals: result.totals });
  })
  // ---------------------------------------------------------------------------
  // Opening balances seeder
  // ---------------------------------------------------------------------------
  .post("/seed/opening-balances", requireEntityPermission("accounting", "manage"), async (c) => {
    const dryRun = c.req.query("dryRun") === "true";
    const result = await seedOpeningBalances(c.get("db"), {
      orgId: c.get("orgId")!,
      actorId: c.get("user")!.id,
      dryRun,
    });
    if (!dryRun) {
      captureAccountingEvent(c, ANALYTICS_EVENTS.openingBalancesSeeded, {
        entity_type: "opening_balances",
      });
    }
    return c.json(result);
  });

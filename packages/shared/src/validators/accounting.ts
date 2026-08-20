import { z } from "zod";

// ---------------------------------------------------------------------------
// Enum constants
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = ["asset", "liability", "net_assets", "revenue", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_NATURAL_RESTRICTIONS = [
  "unrestricted",
  "temporarily_restricted",
  "permanently_restricted",
] as const;
export type AccountNaturalRestriction = (typeof ACCOUNT_NATURAL_RESTRICTIONS)[number];

export const ACCOUNT_FUNCTIONAL_CLASSES = ["program", "management", "fundraising"] as const;
export type AccountFunctionalClass = (typeof ACCOUNT_FUNCTIONAL_CLASSES)[number];

export const FISCAL_PERIOD_STATUSES = ["open", "closed", "locked"] as const;
export type FiscalPeriodStatus = (typeof FISCAL_PERIOD_STATUSES)[number];

export const JOURNAL_ENTRY_SOURCES = [
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
] as const;
export type JournalEntrySource = (typeof JOURNAL_ENTRY_SOURCES)[number];

export const RECURRING_TEMPLATE_FREQUENCIES = ["monthly", "quarterly", "annually"] as const;
export type RecurringTemplateFrequency = (typeof RECURRING_TEMPLATE_FREQUENCIES)[number];
export const RECURRING_TEMPLATE_FREQUENCY_LABELS: Record<RecurringTemplateFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

import { paginationSchema } from "./pagination";

const isoDatetimeSchema = z.string().datetime();
const trimmedMinOneSchema = z.string().trim().min(1);

// ---------------------------------------------------------------------------
// Chart of accounts validators
// ---------------------------------------------------------------------------

export const createAccountSchema = z.object({
  code: trimmedMinOneSchema.max(20),
  name: trimmedMinOneSchema.max(200),
  type: z.enum(ACCOUNT_TYPES),
  subtype: z.string().trim().min(1).max(100).optional(),
  parentAccountId: z.string().min(1).optional(),
  naturalRestriction: z.enum(ACCOUNT_NATURAL_RESTRICTIONS).optional(),
  functionalClass: z.enum(ACCOUNT_FUNCTIONAL_CLASSES).optional(),
  isActive: z.boolean().default(true),
});
export type CreateAccountInput = z.input<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  code: trimmedMinOneSchema.max(20).optional(),
  name: trimmedMinOneSchema.max(200).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  subtype: z.string().trim().min(1).max(100).nullable().optional(),
  parentAccountId: z.string().min(1).nullable().optional(),
  naturalRestriction: z.enum(ACCOUNT_NATURAL_RESTRICTIONS).nullable().optional(),
  functionalClass: z.enum(ACCOUNT_FUNCTIONAL_CLASSES).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAccountInput = z.input<typeof updateAccountSchema>;

export const accountListSchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .optional(),
});
export type AccountListParams = z.infer<typeof accountListSchema>;

// ---------------------------------------------------------------------------
// Fiscal period validators
// ---------------------------------------------------------------------------

export const createFiscalPeriodSchema = z
  .object({
    name: trimmedMinOneSchema.max(100),
    startDate: isoDatetimeSchema,
    endDate: isoDatetimeSchema,
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });
export type CreateFiscalPeriodInput = z.input<typeof createFiscalPeriodSchema>;

export const updateFiscalPeriodSchema = z
  .object({
    name: trimmedMinOneSchema.max(100).optional(),
    startDate: isoDatetimeSchema.optional(),
    endDate: isoDatetimeSchema.optional(),
    status: z.enum(FISCAL_PERIOD_STATUSES).optional(),
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) return new Date(d.endDate) > new Date(d.startDate);
      return true;
    },
    { message: "endDate must be after startDate", path: ["endDate"] },
  );
export type UpdateFiscalPeriodInput = z.input<typeof updateFiscalPeriodSchema>;

// ---------------------------------------------------------------------------
// Journal entry + lines validators
// ---------------------------------------------------------------------------

export const journalLineInputSchema = z.object({
  accountId: z.string().min(1),
  fundId: z.string().min(1).optional(),
  grantId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  debitCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  creditCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  memo: z.string().trim().max(1000).optional(),
});
export type JournalLineInput = z.infer<typeof journalLineInputSchema>;

export const createJournalEntrySchema = z
  .object({
    date: isoDatetimeSchema,
    fiscalPeriodId: z.string().min(1),
    memo: z.string().trim().max(1000).optional(),
    isAdjusting: z.boolean().default(false),
    lines: z.array(journalLineInputSchema).min(2).max(1000),
  })
  .superRefine((data, ctx) => {
    let totalDebits = 0;
    let totalCredits = 0;

    for (const [i, line] of data.lines.entries()) {
      const debit = line.debitCents;
      const credit = line.creditCents;

      if (debit > 0 && credit > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Line ${i + 1}: a journal line cannot have both debit and credit amounts`,
          path: ["lines", i],
        });
      }

      if (debit === 0 && credit === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Line ${i + 1}: a journal line must have either a debit or credit amount (not zero for both)`,
          path: ["lines", i],
        });
      }

      totalDebits += debit;
      totalCredits += credit;
    }

    if (!Number.isSafeInteger(totalDebits) || !Number.isSafeInteger(totalCredits)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Journal entry totals exceed the maximum supported amount",
        path: ["lines"],
      });
      return;
    }

    if (totalDebits !== totalCredits) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Journal entry is not balanced: total debits (${totalDebits}) must equal total credits (${totalCredits})`,
        path: ["lines"],
      });
    }
  });
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;

// ---------------------------------------------------------------------------
// Journal entry list query
// ---------------------------------------------------------------------------

export const journalEntryListSchema = paginationSchema
  .extend({
    fiscalPeriodId: z.string().min(1).optional(),
    source: z.enum(JOURNAL_ENTRY_SOURCES).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: "from must be before or equal to to",
    path: ["from"],
  });
export type JournalEntryListParams = z.infer<typeof journalEntryListSchema>;

// ---------------------------------------------------------------------------
// Reverse journal entry body
// ---------------------------------------------------------------------------

export const reverseJournalEntrySchema = z.object({
  memo: z.string().trim().max(1000).optional(),
  targetFiscalPeriodId: z.string().min(1).optional(),
  date: z.string().datetime().optional(),
});
export type ReverseJournalEntryInput = z.infer<typeof reverseJournalEntrySchema>;

// ---------------------------------------------------------------------------
// Trial balance query
// ---------------------------------------------------------------------------

export const trialBalanceQuerySchema = z.object({
  asOf: isoDatetimeSchema,
  fundId: z.string().optional(),
  grantId: z.string().optional(),
});
export type TrialBalanceQueryParams = z.infer<typeof trialBalanceQuerySchema>;

// ---------------------------------------------------------------------------
// Ledger query
// ---------------------------------------------------------------------------

export const ledgerQuerySchema = z
  .object({
    from: isoDatetimeSchema.optional(),
    to: isoDatetimeSchema.optional(),
    fundId: z.string().optional(),
    grantId: z.string().optional(),
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: "from must be before or equal to to",
    path: ["from"],
  });
export type LedgerQueryParams = z.infer<typeof ledgerQuerySchema>;

// ---------------------------------------------------------------------------
// Financial statement query validators
// ---------------------------------------------------------------------------

export const financialPositionQuerySchema = z.object({
  asOf: isoDatetimeSchema,
  format: z.enum(["json", "csv"]).optional().default("json"),
});
export type FinancialPositionQuery = z.infer<typeof financialPositionQuerySchema>;

export const activitiesQuerySchema = z
  .object({
    from: isoDatetimeSchema,
    to: isoDatetimeSchema,
    format: z.enum(["json", "csv"]).optional().default("json"),
  })
  .refine((q) => Date.parse(q.from) <= Date.parse(q.to), {
    message: "from must be before or equal to to",
    path: ["from"],
  });
export type ActivitiesQuery = z.infer<typeof activitiesQuerySchema>;

export const functionalExpensesQuerySchema = z
  .object({
    from: isoDatetimeSchema,
    to: isoDatetimeSchema,
    format: z.enum(["json", "csv"]).optional().default("json"),
  })
  .refine((q) => Date.parse(q.from) <= Date.parse(q.to), {
    message: "from must be before or equal to to",
    path: ["from"],
  });
export type FunctionalExpensesQuery = z.infer<typeof functionalExpensesQuerySchema>;

// ---------------------------------------------------------------------------
// Bank account validators
// ---------------------------------------------------------------------------

export const createBankAccountSchema = z.object({
  name: z.string().trim().min(1).max(200),
  accountNumber: z.string().trim().min(1).max(20).optional(),
  glAccountId: z.string().min(1).optional(),
});
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;

export const updateBankAccountSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  accountNumber: z.string().trim().min(1).max(20).nullable().optional(),
  glAccountId: z.string().min(1).nullable().optional(),
});
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;

// ---------------------------------------------------------------------------
// Bank import/match/reconciliation validators
// ---------------------------------------------------------------------------

export const bankImportSchema = z.object({
  bankAccountId: z.string().min(1),
  format: z.enum(["csv", "ofx"]),
  content: z.string().min(1),
});
export type BankImportInput = z.infer<typeof bankImportSchema>;

export const bankMatchSchema = z.object({
  bankTransactionId: z.string().min(1),
  journalEntryId: z.string().min(1),
});
export type BankMatchInput = z.infer<typeof bankMatchSchema>;

export const bankIgnoreSchema = z.object({
  bankTransactionId: z.string().min(1),
});
export type BankIgnoreInput = z.infer<typeof bankIgnoreSchema>;

export const bankUnmatchSchema = z.object({
  bankTransactionId: z.string().min(1),
});
export type BankUnmatchInput = z.infer<typeof bankUnmatchSchema>;

export const createReconciliationSchema = z.object({
  bankAccountId: z.string().min(1),
  statementDate: z.string().datetime(),
  statementEndingBalanceCents: z.number().int(),
});
export type CreateReconciliationInput = z.infer<typeof createReconciliationSchema>;

export const completeReconciliationSchema = z.object({});
export type CompleteReconciliationInput = z.infer<typeof completeReconciliationSchema>;

// ---------------------------------------------------------------------------
// Year-end close
// ---------------------------------------------------------------------------

export const yearEndCloseSchema = z.object({});
export type YearEndCloseInput = z.infer<typeof yearEndCloseSchema>;

// ---------------------------------------------------------------------------
// Opening balances seeder
// ---------------------------------------------------------------------------

export const seedOpeningBalancesSchema = z.object({
  dryRun: z.boolean().default(false),
});
export type SeedOpeningBalancesInput = z.infer<typeof seedOpeningBalancesSchema>;

// ---------------------------------------------------------------------------
// Recurring journal template validators
// ---------------------------------------------------------------------------

const recurringLineBalanceRefinement = (
  data: { lines: Array<{ debitCents: number; creditCents: number }> },
  ctx: z.RefinementCtx,
) => {
  let totalDebits = 0;
  let totalCredits = 0;

  for (const [i, line] of data.lines.entries()) {
    const debit = line.debitCents;
    const credit = line.creditCents;

    if (debit > 0 && credit > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Line ${i + 1}: a journal line cannot have both debit and credit amounts`,
        path: ["lines", i],
      });
    }

    if (debit === 0 && credit === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Line ${i + 1}: a journal line must have either a debit or credit amount (not zero for both)`,
        path: ["lines", i],
      });
    }

    totalDebits += debit;
    totalCredits += credit;
  }

  if (!Number.isSafeInteger(totalDebits) || !Number.isSafeInteger(totalCredits)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Journal entry totals exceed the maximum supported amount",
      path: ["lines"],
    });
    return;
  }

  if (totalDebits !== totalCredits) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Journal entry is not balanced: total debits (${totalDebits}) must equal total credits (${totalCredits})`,
      path: ["lines"],
    });
  }
};

export const createRecurringTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(1000).optional(),
    frequency: z.enum(RECURRING_TEMPLATE_FREQUENCIES),
    nextRunDate: z.string().datetime(),
    isActive: z.boolean().default(true),
    fiscalPeriodId: z.string().min(1).optional(),
    memo: z.string().trim().max(1000).optional(),
    lines: z.array(journalLineInputSchema).min(2).max(1000),
  })
  .superRefine(recurringLineBalanceRefinement);
export type CreateRecurringTemplateInput = z.infer<typeof createRecurringTemplateSchema>;

export const updateRecurringTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(1000).nullable().optional(),
    frequency: z.enum(RECURRING_TEMPLATE_FREQUENCIES).optional(),
    nextRunDate: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
    fiscalPeriodId: z.string().min(1).nullable().optional(),
    memo: z.string().trim().max(1000).nullable().optional(),
    lines: z.array(journalLineInputSchema).min(2).max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lines !== undefined) {
      recurringLineBalanceRefinement({ lines: data.lines }, ctx);
    }
  });
export type UpdateRecurringTemplateInput = z.infer<typeof updateRecurringTemplateSchema>;

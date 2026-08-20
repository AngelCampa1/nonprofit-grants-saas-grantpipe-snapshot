import { and, eq, isNull, lte, gte, or, sql, sum } from "drizzle-orm";
import {
  chartOfAccounts,
  contacts,
  donations,
  expenses,
  fiscalPeriods,
  funds,
  journalEntries,
  journalLines,
  organizations,
  pledgePayments,
  pledges,
  restrictionAdditions,
  restrictionAllowedCategories,
  restrictionReleases,
  restrictionTerms,
} from "@grantpipe/db";
import type { TransactionDatabase } from "@grantpipe/db";
import { recordActivityLog } from "../../lib/activity-log";
import { badRequest, conflict } from "../../lib/app-error";
import { captureBackgroundException } from "../../lib/sentry";
import { insertJournalEntryWithNextNumber } from "./journalEntryNumber";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function isAccountingEnabled(tx: TransactionDatabase, orgId: string): Promise<boolean> {
  const [org] = await tx
    .select({ accountingEnabled: organizations.accountingEnabled })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return org?.accountingEnabled ?? false;
}

async function findAccountByCode(tx: TransactionDatabase, orgId: string, code: string) {
  const [account] = await tx
    .select()
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.orgId, orgId),
        eq(chartOfAccounts.code, code),
        eq(chartOfAccounts.isActive, true),
        isNull(chartOfAccounts.deletedAt),
      ),
    );
  return account ?? null;
}

type ChartAccountRecord = NonNullable<Awaited<ReturnType<typeof findAccountByCode>>>;

function requirePledgeAccount(
  account: Awaited<ReturnType<typeof findAccountByCode>>,
  operation: string,
  code: string,
): ChartAccountRecord {
  if (!account) {
    throw conflict(
      `${operation} requires chart of accounts code ${code}. Add an active account with that code before posting pledge accounting entries.`,
    );
  }

  return account;
}

function requirePostingAccount(
  account: Awaited<ReturnType<typeof findAccountByCode>>,
  operation: string,
  code: string,
): ChartAccountRecord {
  if (!account) {
    throw conflict(
      `${operation} requires chart of accounts code ${code}. Add an active account with that code before posting accounting entries.`,
    );
  }

  return account;
}

async function findOpenFiscalPeriod(tx: TransactionDatabase, orgId: string, date: Date) {
  const [period] = await tx
    .select()
    .from(fiscalPeriods)
    .where(
      and(
        eq(fiscalPeriods.orgId, orgId),
        eq(fiscalPeriods.status, "open"),
        lte(fiscalPeriods.startDate, date),
        gte(fiscalPeriods.endDate, date),
      ),
    );

  if (!period) {
    const dateStr = date.toISOString().slice(0, 10);
    throw conflict(
      `No open fiscal period covers ${dateStr}. Create or open a fiscal period that includes this date.`,
    );
  }

  return period;
}

type ExpenseRecord = typeof expenses.$inferSelect;
type RestrictionTermRecord = typeof restrictionTerms.$inferSelect;

const AUTOMATIC_RESTRICTION_RELEASE_SOURCE = "accounting_posting";

function sortRestrictionTerms(terms: RestrictionTermRecord[]) {
  return [...terms].sort((left, right) => {
    const leftTime = left.createdAt?.getTime() ?? 0;
    const rightTime = right.createdAt?.getTime() ?? 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.id.localeCompare(right.id);
  });
}

async function expenseMatchesAllowedCategory(
  tx: TransactionDatabase,
  orgId: string,
  termId: string,
  expense: ExpenseRecord,
) {
  if (!expense.category && !expense.accountId) return true;

  const allowedCategories = await tx
    .select({
      category: restrictionAllowedCategories.category,
      accountId: restrictionAllowedCategories.accountId,
    })
    .from(restrictionAllowedCategories)
    .where(
      and(
        eq(restrictionAllowedCategories.orgId, orgId),
        eq(restrictionAllowedCategories.restrictionTermId, termId),
        isNull(restrictionAllowedCategories.deletedAt),
      ),
    );

  if (allowedCategories.length === 0) return true;

  return allowedCategories.some(
    (row) =>
      (!expense.category || row.category === expense.category) &&
      (!expense.accountId || row.accountId === expense.accountId),
  );
}

async function firstAllowedRestrictionTerm(
  tx: TransactionDatabase,
  orgId: string,
  expense: ExpenseRecord,
  candidates: RestrictionTermRecord[],
) {
  for (const term of sortRestrictionTerms(candidates)) {
    if (await expenseMatchesAllowedCategory(tx, orgId, term.id, expense)) {
      return term;
    }
  }
  return null;
}

async function findRestrictionTermForExpense(
  tx: TransactionDatabase,
  orgId: string,
  expense: ExpenseRecord,
  expenseDate: Date,
) {
  if (!expense.fundId) return null;

  const baseConditions = [
    eq(restrictionTerms.orgId, orgId),
    eq(restrictionTerms.fundId, expense.fundId),
    isNull(restrictionTerms.deletedAt),
    or(isNull(restrictionTerms.startDate), lte(restrictionTerms.startDate, expenseDate)),
    or(isNull(restrictionTerms.endDate), gte(restrictionTerms.endDate, expenseDate)),
  ];

  if (expense.grantId) {
    const grantTerms = await tx
      .select()
      .from(restrictionTerms)
      .where(and(...baseConditions, eq(restrictionTerms.grantId, expense.grantId)));
    if (grantTerms.length > 0) {
      return firstAllowedRestrictionTerm(tx, orgId, expense, grantTerms);
    }
  }

  const fundTerms = await tx
    .select()
    .from(restrictionTerms)
    .where(and(...baseConditions, isNull(restrictionTerms.grantId)));
  return firstAllowedRestrictionTerm(tx, orgId, expense, fundTerms);
}

async function availableRestrictionBalanceCents(
  tx: TransactionDatabase,
  orgId: string,
  term: RestrictionTermRecord,
) {
  const [additionTotals] = await tx
    .select({ total: sum(restrictionAdditions.amountCents) })
    .from(restrictionAdditions)
    .where(
      and(
        eq(restrictionAdditions.orgId, orgId),
        eq(restrictionAdditions.restrictionTermId, term.id),
        isNull(restrictionAdditions.deletedAt),
      ),
    );
  const [releaseTotals] = await tx
    .select({ total: sum(restrictionReleases.amountCents) })
    .from(restrictionReleases)
    .where(
      and(
        eq(restrictionReleases.orgId, orgId),
        eq(restrictionReleases.restrictionTermId, term.id),
        isNull(restrictionReleases.deletedAt),
      ),
    );

  return (
    term.beginningBalanceCents +
    Number(additionTotals?.total ?? 0) -
    Number(releaseTotals?.total ?? 0)
  );
}

async function softDeleteRestrictionReleasesForExpense(
  tx: TransactionDatabase,
  orgId: string,
  expenseId: string,
  actorId: string,
) {
  const deletedAt = new Date();
  const deletedReleases = await tx
    .update(restrictionReleases)
    .set({ deletedAt })
    .where(
      and(
        eq(restrictionReleases.orgId, orgId),
        eq(restrictionReleases.expenseId, expenseId),
        eq(restrictionReleases.source, AUTOMATIC_RESTRICTION_RELEASE_SOURCE),
        isNull(restrictionReleases.deletedAt),
      ),
    )
    .returning();

  for (const release of deletedReleases) {
    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "deleted",
      entityType: "restriction_release",
      entityId: release.id,
      changes: {
        before: { ...release, deletedAt: null },
        after: release,
      },
    });
  }
}

/**
 * Find unreversed source-linked journal entries and reverse them inline.
 * If no prior entries are found, silently returns (safe no-op).
 */
async function reverseSourceLinkedEntries(
  tx: TransactionDatabase,
  orgId: string,
  source: string,
  sourceId: string,
  reversalDate: Date,
  actorId: string,
): Promise<void> {
  const originals = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, orgId),
        eq(journalEntries.source, source),
        eq(journalEntries.sourceId, sourceId),
        isNull(journalEntries.reversedByEntryId),
      ),
    );

  for (const original of originals) {
    // Get its lines
    const lines = await tx
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, original.id));

    // Determine the fiscal period for the reversal
    // Prefer original period if it's still open, otherwise find current open period
    const [originalPeriod] = await tx
      .select()
      .from(fiscalPeriods)
      .where(
        and(
          eq(fiscalPeriods.id, original.fiscalPeriodId),
          eq(fiscalPeriods.orgId, orgId),
          eq(fiscalPeriods.status, "open"),
        ),
      );

    const reversalPeriodId = originalPeriod
      ? original.fiscalPeriodId
      : (await findOpenFiscalPeriod(tx, orgId, reversalDate)).id;

    const reversalEntry = await insertJournalEntryWithNextNumber(tx, {
      orgId,
      values: {
        date: reversalDate,
        fiscalPeriodId: reversalPeriodId,
        memo: `Reversal of entry #${original.entryNumber}`,
        source: "adjustment",
        postedBy: actorId,
        isAdjusting: true,
      },
    });

    if (lines.length > 0) {
      await tx.insert(journalLines).values(
        lines.map((line, idx) => ({
          orgId,
          journalEntryId: reversalEntry.id,
          lineNumber: idx + 1,
          accountId: line.accountId,
          fundId: line.fundId ?? undefined,
          grantId: line.grantId ?? undefined,
          contactId: line.contactId ?? undefined,
          debitCents: line.creditCents,
          creditCents: line.debitCents,
          memo: line.memo ?? undefined,
        })),
      );
    }

    // Mark original as reversed
    await tx
      .update(journalEntries)
      .set({ reversedByEntryId: reversalEntry.id })
      .where(and(eq(journalEntries.id, original.id), eq(journalEntries.orgId, orgId)));
  }
}

// ---------------------------------------------------------------------------
// postDonation
// ---------------------------------------------------------------------------

export async function postDonation(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    donationId: string;
    action: "create" | "update" | "delete";
  },
): Promise<void> {
  const enabled = await isAccountingEnabled(tx, params.orgId);
  if (!enabled) return;

  // Look up the donation — for delete action the record is already soft-deleted, so omit the deletedAt filter
  const [donation] = await tx
    .select()
    .from(donations)
    .where(
      and(
        eq(donations.id, params.donationId),
        eq(donations.orgId, params.orgId),
        params.action === "delete" ? undefined : isNull(donations.deletedAt),
      ),
    );

  if (!donation) return;

  // Look up donor name for the JE memo
  const [contact] = await tx
    .select({
      type: contacts.type,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      organizationName: contacts.organizationName,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, donation.contactId),
        eq(contacts.orgId, params.orgId),
        isNull(contacts.deletedAt),
      ),
    );

  const donorName = contact
    ? contact.type === "organization"
      ? (contact.organizationName ?? "Unknown Donor")
      : [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown Donor"
    : "Unknown Donor";

  const donationDate = donation.date instanceof Date ? donation.date : new Date(donation.date);

  // Step 1: Reverse prior JE if this is update or delete
  if (params.action === "update" || params.action === "delete") {
    await reverseSourceLinkedEntries(
      tx,
      params.orgId,
      "donation",
      params.donationId,
      donationDate,
      params.actorId,
    );
  }

  // Step 2: Post new JE if this is create or update
  if (params.action === "create" || params.action === "update") {
    const cashAccount = requirePostingAccount(
      await findAccountByCode(tx, params.orgId, "1010"),
      "Donation posting",
      "1010",
    );

    // Net-asset class drives the revenue account so the entry reflects the
    // classification resolved at gift entry: permanently restricted gifts post
    // to 4200, temporarily restricted to 4100, unrestricted to 4000. Fall back
    // to the binary `restriction` flag for rows predating the net-asset column.
    const netAssetClass =
      donation.netAssetClass ??
      (donation.restriction === "restricted" ? "temporarily_restricted" : "unrestricted");
    const isRestricted = netAssetClass !== "unrestricted";
    const crAccountCode =
      netAssetClass === "permanently_restricted"
        ? "4200"
        : netAssetClass === "temporarily_restricted"
          ? "4100"
          : "4000";
    const crAccount = requirePostingAccount(
      await findAccountByCode(tx, params.orgId, crAccountCode),
      "Donation posting",
      crAccountCode,
    );

    const fiscalPeriod = await findOpenFiscalPeriod(tx, params.orgId, donationDate);
    const entry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: donationDate,
        fiscalPeriodId: fiscalPeriod.id,
        memo: `Donation — ${donorName}`,
        source: "donation",
        sourceId: params.donationId,
        postedBy: params.actorId,
        isAdjusting: false,
      },
    });

    const lineValues = [
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 1,
        accountId: cashAccount.id,
        debitCents: donation.amountCents,
        creditCents: 0,
        fundId: null as string | null | undefined,
        grantId: null as string | null | undefined,
      },
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 2,
        accountId: crAccount.id,
        debitCents: 0,
        creditCents: donation.amountCents,
        fundId: isRestricted ? (donation.fundId ?? null) : (null as string | null | undefined),
        grantId: null as string | null | undefined,
      },
    ];

    await tx.insert(journalLines).values(lineValues);
  }
}

// ---------------------------------------------------------------------------
// postExpense
// ---------------------------------------------------------------------------

export async function postExpense(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    expenseId: string;
    action: "create" | "update" | "delete";
  },
): Promise<void> {
  const enabled = await isAccountingEnabled(tx, params.orgId);
  if (!enabled) return;

  // Look up the expense — for delete action the record is already soft-deleted, so omit the deletedAt filter
  const [expense] = await tx
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.id, params.expenseId),
        eq(expenses.orgId, params.orgId),
        params.action === "delete" ? undefined : isNull(expenses.deletedAt),
      ),
    );

  if (!expense) return;

  const expenseDate = expense.date instanceof Date ? expense.date : new Date(expense.date);

  // Step 1: Reverse prior JE if this is update or delete
  if (params.action === "update" || params.action === "delete") {
    await reverseSourceLinkedEntries(
      tx,
      params.orgId,
      "expense",
      params.expenseId,
      expenseDate,
      params.actorId,
    );
    await softDeleteRestrictionReleasesForExpense(
      tx,
      params.orgId,
      params.expenseId,
      params.actorId,
    );
  }

  // Step 2: Post new JE if this is create or update
  if (params.action === "create" || params.action === "update") {
    if (expense.accountId === null || expense.accountId === undefined) {
      captureBackgroundException(
        new Error("Expense posting skipped because no expense account is selected"),
        "accounting-posting",
        {
          operation: "expense_posting_missing_account",
          action: params.action,
          org_id: params.orgId,
        },
      );
      return;
    }

    const cashAccount = requirePostingAccount(
      await findAccountByCode(tx, params.orgId, "1010"),
      "Expense posting",
      "1010",
    );

    // Look up the expense account directly by ID (not by code)
    const [expenseAccount] = await tx
      .select()
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.id, expense.accountId),
          eq(chartOfAccounts.orgId, params.orgId),
          eq(chartOfAccounts.isActive, true),
          isNull(chartOfAccounts.deletedAt),
        ),
      );

    if (!expenseAccount) {
      throw conflict(
        "Expense posting requires an active expense account. Choose an active expense account before posting accounting entries.",
      );
    }

    const fiscalPeriod = await findOpenFiscalPeriod(tx, params.orgId, expenseDate);
    let releaseAccounts: {
      from: ChartAccountRecord;
      to: ChartAccountRecord;
    } | null = null;

    if (expense.fundId) {
      const [fund] = await tx
        .select()
        .from(funds)
        .where(and(eq(funds.id, expense.fundId), eq(funds.orgId, params.orgId)));

      const isRestricted = fund && fund.type !== "unrestricted";
      if (isRestricted) {
        const releaseFromAccount = await findAccountByCode(tx, params.orgId, "3100");
        const releaseToAccount = await findAccountByCode(tx, params.orgId, "3000");

        if (!releaseFromAccount || !releaseToAccount) {
          const missingCodes = [
            releaseFromAccount ? null : "3100",
            releaseToAccount ? null : "3000",
          ].filter((code): code is string => Boolean(code));
          throw conflict(
            `Expense posting requires release-of-restriction chart of accounts code${missingCodes.length === 1 ? "" : "s"} ${missingCodes.join("/")}. Add active accounts before posting restricted-fund accounting entries.`,
          );
        }

        releaseAccounts = {
          from: releaseFromAccount,
          to: releaseToAccount,
        };
      }
    }

    const entry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: expenseDate,
        fiscalPeriodId: fiscalPeriod.id,
        memo:
          expense.description ??
          (expense.vendor ? `Expense — ${expense.vendor}` : `Expense — ${expenseAccount.name}`),
        source: "expense",
        sourceId: params.expenseId,
        postedBy: params.actorId,
        isAdjusting: false,
      },
    });

    await tx.insert(journalLines).values([
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 1,
        accountId: expenseAccount.id,
        debitCents: expense.amountCents,
        creditCents: 0,
        fundId: expense.fundId ?? null,
        grantId: expense.grantId ?? null,
      },
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 2,
        accountId: cashAccount.id,
        debitCents: 0,
        creditCents: expense.amountCents,
        fundId: null as string | null,
        grantId: null as string | null,
      },
    ]);

    if (releaseAccounts) {
      const releaseEntry = await insertJournalEntryWithNextNumber(tx, {
        orgId: params.orgId,
        values: {
          date: expenseDate,
          fiscalPeriodId: fiscalPeriod.id,
          memo: `Release of restriction — expense ${params.expenseId}`,
          source: "expense",
          sourceId: params.expenseId,
          postedBy: params.actorId,
          isAdjusting: false,
        },
      });

      await tx.insert(journalLines).values([
        {
          orgId: params.orgId,
          journalEntryId: releaseEntry.id,
          lineNumber: 1,
          accountId: releaseAccounts.from.id,
          debitCents: expense.amountCents,
          creditCents: 0,
          fundId: expense.fundId,
          grantId: expense.grantId ?? null,
        },
        {
          orgId: params.orgId,
          journalEntryId: releaseEntry.id,
          lineNumber: 2,
          accountId: releaseAccounts.to.id,
          debitCents: 0,
          creditCents: expense.amountCents,
          fundId: expense.fundId,
          grantId: expense.grantId ?? null,
        },
      ]);

      const restrictionTerm = await findRestrictionTermForExpense(
        tx,
        params.orgId,
        expense,
        expenseDate,
      );
      if (restrictionTerm) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${params.orgId}:${restrictionTerm.id}`}))`,
        );
        const available = await availableRestrictionBalanceCents(tx, params.orgId, restrictionTerm);
        if (expense.amountCents > available) {
          throw badRequest("Release exceeds available restricted balance");
        }

        const [release] = await tx
          .insert(restrictionReleases)
          .values({
            orgId: params.orgId,
            restrictionTermId: restrictionTerm.id,
            expenseId: params.expenseId,
            amountCents: expense.amountCents,
            date: expenseDate,
            reason: `Release of restriction - expense ${params.expenseId}`,
            source: AUTOMATIC_RESTRICTION_RELEASE_SOURCE,
            createdBy: params.actorId,
          })
          .returning();
        if (release) {
          await recordActivityLog(tx, {
            orgId: params.orgId,
            actorId: params.actorId,
            action: "created",
            entityType: "restriction_release",
            entityId: release.id,
            changes: { after: release },
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// postGrantCloseout
// ---------------------------------------------------------------------------

export async function postGrantCloseout(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    grantId: string;
    closeoutDisposition: "release" | "return";
  },
): Promise<void> {
  const enabled = await isAccountingEnabled(tx, params.orgId);
  if (!enabled) return;

  // Determine remaining restricted balance by summing journal lines tagged with this grantId
  // on net_assets accounts where naturalRestriction = 'temporarily_restricted'
  const balanceRows = await tx
    .select({
      totalCredit: sql<number>`COALESCE(SUM(${journalLines.creditCents}), 0)`,
      totalDebit: sql<number>`COALESCE(SUM(${journalLines.debitCents}), 0)`,
    })
    .from(journalLines)
    .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
    .where(
      and(
        eq(journalLines.orgId, params.orgId),
        eq(journalLines.grantId, params.grantId),
        eq(chartOfAccounts.type, "net_assets"),
        eq(chartOfAccounts.naturalRestriction, "temporarily_restricted"),
      ),
    );

  const row = balanceRows[0];
  const remainingBalance = Number(row?.totalCredit ?? 0) - Number(row?.totalDebit ?? 0);

  if (remainingBalance <= 0) return;

  const today = new Date();
  const fiscalPeriod = await findOpenFiscalPeriod(tx, params.orgId, today);

  // Dr 3100, Cr 4000 (release) or Cr 5000 (return)
  const drAccount = requirePostingAccount(
    await findAccountByCode(tx, params.orgId, "3100"),
    "Grant closeout",
    "3100",
  );

  const crAccountCode = params.closeoutDisposition === "release" ? "4000" : "5000";
  const crAccount = requirePostingAccount(
    await findAccountByCode(tx, params.orgId, crAccountCode),
    "Grant closeout",
    crAccountCode,
  );

  const entry = await insertJournalEntryWithNextNumber(tx, {
    orgId: params.orgId,
    values: {
      date: today,
      fiscalPeriodId: fiscalPeriod.id,
      memo: `Grant closeout — ${params.closeoutDisposition} — grant ${params.grantId}`,
      source: "grant_closeout",
      sourceId: params.grantId,
      postedBy: params.actorId,
      isAdjusting: true,
    },
  });

  await tx.insert(journalLines).values([
    {
      orgId: params.orgId,
      journalEntryId: entry.id,
      lineNumber: 1,
      accountId: drAccount.id,
      debitCents: remainingBalance,
      creditCents: 0,
      grantId: params.grantId,
      fundId: null as string | null,
    },
    {
      orgId: params.orgId,
      journalEntryId: entry.id,
      lineNumber: 2,
      accountId: crAccount.id,
      debitCents: 0,
      creditCents: remainingBalance,
      grantId: params.grantId,
      fundId: null as string | null,
    },
  ]);
}

// ---------------------------------------------------------------------------
// postGrantPayment
// ---------------------------------------------------------------------------

export async function postGrantPayment(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    paymentId: string;
    requestId: string;
    grantId: string;
    receivedDate: Date;
    amountCents: number;
  },
): Promise<string | null> {
  const enabled = await isAccountingEnabled(tx, params.orgId);
  if (!enabled) return null;

  // Debit 1010 (cash), Credit 4100 (grant revenue — restricted)
  const cashAccount = requirePostingAccount(
    await findAccountByCode(tx, params.orgId, "1010"),
    "Grant payment posting",
    "1010",
  );

  const revenueAccount = requirePostingAccount(
    await findAccountByCode(tx, params.orgId, "4100"),
    "Grant payment posting",
    "4100",
  );

  const fiscalPeriod = await findOpenFiscalPeriod(tx, params.orgId, params.receivedDate);

  const entry = await insertJournalEntryWithNextNumber(tx, {
    orgId: params.orgId,
    values: {
      date: params.receivedDate,
      fiscalPeriodId: fiscalPeriod.id,
      memo: `Grant payment received — request ${params.requestId}`,
      source: "grant_payment",
      sourceId: params.paymentId,
      postedBy: params.actorId,
      isAdjusting: false,
    },
  });

  await tx.insert(journalLines).values([
    {
      orgId: params.orgId,
      journalEntryId: entry.id,
      lineNumber: 1,
      accountId: cashAccount.id,
      debitCents: params.amountCents,
      creditCents: 0,
      grantId: params.grantId,
      fundId: null as string | null,
    },
    {
      orgId: params.orgId,
      journalEntryId: entry.id,
      lineNumber: 2,
      accountId: revenueAccount.id,
      debitCents: 0,
      creditCents: params.amountCents,
      grantId: params.grantId,
      fundId: null as string | null,
    },
  ]);

  return entry.id;
}

// ---------------------------------------------------------------------------
// postPledgeRecognition
// ---------------------------------------------------------------------------

/**
 * Posts the initial recognition entry for a pledge under FASB ASC 958-605.
 *
 * Journal entry:
 *   Dr 1100  faceAmountCents         (Pledges Receivable)
 *   Cr 1150  discountCents           (Discount on Pledges Receivable) — omitted if zero
 *   Cr 4000/4100  presentValueCents  (Contributions revenue — by net-asset class)
 *
 * The revenue line carries fundId when the pledge is restricted.
 */
export async function postPledgeRecognition(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    pledgeId: string;
    action: "create" | "update" | "delete";
  },
): Promise<void> {
  const enabled = await isAccountingEnabled(tx, params.orgId);
  if (!enabled) return;

  const [pledge] = await tx
    .select()
    .from(pledges)
    .where(
      and(
        eq(pledges.id, params.pledgeId),
        eq(pledges.orgId, params.orgId),
        params.action === "delete" ? undefined : isNull(pledges.deletedAt),
      ),
    );

  if (!pledge) return;

  const pledgeDate =
    pledge.pledgeDate instanceof Date ? pledge.pledgeDate : new Date(pledge.pledgeDate);

  if (params.action === "update" || params.action === "delete") {
    await reverseSourceLinkedEntries(
      tx,
      params.orgId,
      "pledge",
      params.pledgeId,
      pledgeDate,
      params.actorId,
    );
  }

  if (params.action === "create" || params.action === "update") {
    const receivableAccount = requirePledgeAccount(
      await findAccountByCode(tx, params.orgId, "1100"),
      "Pledge recognition",
      "1100",
    );

    const hasDiscount = pledge.discountCents > 0;
    let discountAccount: ChartAccountRecord | null = null;
    if (hasDiscount) {
      discountAccount = requirePledgeAccount(
        await findAccountByCode(tx, params.orgId, "1150"),
        "Pledge recognition",
        "1150",
      );
    }

    const isRestricted = pledge.netAssetClass !== "unrestricted";
    const crAccountCode = isRestricted ? "4100" : "4000";
    const crAccount = requirePledgeAccount(
      await findAccountByCode(tx, params.orgId, crAccountCode),
      "Pledge recognition",
      crAccountCode,
    );

    const fiscalPeriod = await findOpenFiscalPeriod(tx, params.orgId, pledgeDate);
    const entry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: pledgeDate,
        fiscalPeriodId: fiscalPeriod.id,
        memo: `Pledge recognition — pledge ${params.pledgeId}`,
        source: "pledge",
        sourceId: params.pledgeId,
        postedBy: params.actorId,
        isAdjusting: false,
      },
    });

    const lineValues: {
      orgId: string;
      journalEntryId: string;
      lineNumber: number;
      accountId: string;
      debitCents: number;
      creditCents: number;
      fundId: string | null;
    }[] = [
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 1,
        accountId: receivableAccount.id,
        debitCents: pledge.faceAmountCents,
        creditCents: 0,
        fundId: null,
      },
    ];

    let nextLine = 2;
    if (hasDiscount && discountAccount) {
      lineValues.push({
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: nextLine,
        accountId: discountAccount.id,
        debitCents: 0,
        creditCents: pledge.discountCents,
        fundId: null,
      });
      nextLine++;
    }

    lineValues.push({
      orgId: params.orgId,
      journalEntryId: entry.id,
      lineNumber: nextLine,
      accountId: crAccount.id,
      debitCents: 0,
      creditCents: pledge.presentValueCents,
      fundId: isRestricted ? (pledge.fundId ?? null) : null,
    });

    await tx.insert(journalLines).values(lineValues);
  }
}

// ---------------------------------------------------------------------------
// postPledgeAccretion
// ---------------------------------------------------------------------------

/**
 * Posts interest accretion on a discounted pledge (NPV unwind).
 *
 * Journal entry:
 *   Dr 1150  accretionCents  (reduce Discount on Pledges Receivable)
 *   Cr 4000/4100  accretionCents  (Contributions revenue — by net-asset class)
 *
 * sourceId is `${pledgeId}:accretion:${asOf}` so multiple accretion entries
 * per pledge do not collide and are individually reversible.
 *
 * If accretionCents <= 0, this function is a no-op.
 */
export async function postPledgeAccretion(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    pledgeId: string;
    accretionCents: number;
    asOfDate: Date;
    action: "create" | "update" | "delete";
  },
): Promise<void> {
  const enabled = await isAccountingEnabled(tx, params.orgId);
  if (!enabled) return;

  if (params.accretionCents <= 0) return;

  const [pledge] = await tx
    .select()
    .from(pledges)
    .where(
      and(
        eq(pledges.id, params.pledgeId),
        eq(pledges.orgId, params.orgId),
        params.action === "delete" ? undefined : isNull(pledges.deletedAt),
      ),
    );

  if (!pledge) return;

  const asOf = params.asOfDate.toISOString().slice(0, 10);
  const compoundSourceId = `${params.pledgeId}:accretion:${asOf}`;

  if (params.action === "update" || params.action === "delete") {
    await reverseSourceLinkedEntries(
      tx,
      params.orgId,
      "pledge",
      compoundSourceId,
      params.asOfDate,
      params.actorId,
    );
  }

  if (params.action === "create" || params.action === "update") {
    const discountAccount = requirePledgeAccount(
      await findAccountByCode(tx, params.orgId, "1150"),
      "Pledge accretion",
      "1150",
    );

    const isRestricted = pledge.netAssetClass !== "unrestricted";
    const crAccountCode = isRestricted ? "4100" : "4000";
    const crAccount = requirePledgeAccount(
      await findAccountByCode(tx, params.orgId, crAccountCode),
      "Pledge accretion",
      crAccountCode,
    );

    const fiscalPeriod = await findOpenFiscalPeriod(tx, params.orgId, params.asOfDate);
    const entry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: params.asOfDate,
        fiscalPeriodId: fiscalPeriod.id,
        memo: `Pledge accretion — pledge ${params.pledgeId} as of ${asOf}`,
        source: "pledge",
        sourceId: compoundSourceId,
        postedBy: params.actorId,
        isAdjusting: false,
      },
    });

    await tx.insert(journalLines).values([
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 1,
        accountId: discountAccount.id,
        debitCents: params.accretionCents,
        creditCents: 0,
        fundId: null as string | null,
      },
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 2,
        accountId: crAccount.id,
        debitCents: 0,
        creditCents: params.accretionCents,
        fundId: null as string | null,
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// postPledgePayment
// ---------------------------------------------------------------------------

/**
 * Posts a cash collection against a pledge.
 *
 * Journal entry:
 *   Dr 1010  amountCents  (Cash)
 *   Cr 1100  amountCents  (Pledges Receivable)
 *
 * sourceId = paymentId so each payment gets its own reversible JE.
 */
export async function postPledgePayment(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    pledgeId: string;
    paymentId: string;
    amountCents: number;
    paymentDate: Date;
    action: "create" | "update" | "delete";
  },
): Promise<void> {
  const enabled = await isAccountingEnabled(tx, params.orgId);
  if (!enabled) return;

  const [payment] = await tx
    .select()
    .from(pledgePayments)
    .where(
      and(
        eq(pledgePayments.id, params.paymentId),
        eq(pledgePayments.orgId, params.orgId),
        params.action === "delete" ? undefined : isNull(pledgePayments.deletedAt),
      ),
    );

  if (!payment) return;

  const paymentDate =
    params.paymentDate instanceof Date ? params.paymentDate : new Date(params.paymentDate);

  if (params.action === "update" || params.action === "delete") {
    await reverseSourceLinkedEntries(
      tx,
      params.orgId,
      "pledge",
      params.paymentId,
      paymentDate,
      params.actorId,
    );
  }

  if (params.action === "create" || params.action === "update") {
    const cashAccount = requirePledgeAccount(
      await findAccountByCode(tx, params.orgId, "1010"),
      "Pledge payment",
      "1010",
    );

    const receivableAccount = requirePledgeAccount(
      await findAccountByCode(tx, params.orgId, "1100"),
      "Pledge payment",
      "1100",
    );

    const fiscalPeriod = await findOpenFiscalPeriod(tx, params.orgId, paymentDate);
    const entry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: paymentDate,
        fiscalPeriodId: fiscalPeriod.id,
        memo: `Pledge payment received — payment ${params.paymentId}`,
        source: "pledge",
        sourceId: params.paymentId,
        postedBy: params.actorId,
        isAdjusting: false,
      },
    });

    await tx.insert(journalLines).values([
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 1,
        accountId: cashAccount.id,
        debitCents: params.amountCents,
        creditCents: 0,
        fundId: null as string | null,
      },
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 2,
        accountId: receivableAccount.id,
        debitCents: 0,
        creditCents: params.amountCents,
        fundId: null as string | null,
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// postPledgeWriteOff
// ---------------------------------------------------------------------------

/**
 * Posts the write-off of an uncollectible pledge balance.
 *
 * Journal entry (core):
 *   Dr 1190  writeOffCents  (Allowance for Uncollectible Pledges)
 *   Cr 1100  writeOffCents  (Pledges Receivable)
 *
 * If remainingDiscountCents > 0, appends two additional lines to close the
 * residual contra balance that is no longer needed:
 *   Dr 1150  remainingDiscountCents  (Discount on Pledges Receivable)
 *   Cr 1190  remainingDiscountCents  (Allowance for Uncollectible Pledges)
 *
 * sourceId = `${pledgeId}:writeoff` so the single write-off per pledge is
 * reversible without colliding with recognition or accretion entries.
 */
export async function postPledgeWriteOff(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    pledgeId: string;
    writeOffCents: number;
    remainingDiscountCents: number;
    action: "create" | "update" | "delete";
  },
): Promise<void> {
  const enabled = await isAccountingEnabled(tx, params.orgId);
  if (!enabled) return;

  const [pledge] = await tx
    .select()
    .from(pledges)
    .where(
      and(
        eq(pledges.id, params.pledgeId),
        eq(pledges.orgId, params.orgId),
        params.action === "delete" ? undefined : isNull(pledges.deletedAt),
      ),
    );

  if (!pledge) return;

  const writeOffSourceId = `${params.pledgeId}:writeoff`;
  const today = new Date();

  if (params.action === "update" || params.action === "delete") {
    await reverseSourceLinkedEntries(
      tx,
      params.orgId,
      "pledge",
      writeOffSourceId,
      today,
      params.actorId,
    );
  }

  if (params.action === "create" || params.action === "update") {
    const allowanceAccount = requirePledgeAccount(
      await findAccountByCode(tx, params.orgId, "1190"),
      "Pledge write-off",
      "1190",
    );

    const receivableAccount = requirePledgeAccount(
      await findAccountByCode(tx, params.orgId, "1100"),
      "Pledge write-off",
      "1100",
    );

    const hasResidualDiscount = params.remainingDiscountCents > 0;
    let discountAccount: ChartAccountRecord | null = null;
    if (hasResidualDiscount) {
      discountAccount = requirePledgeAccount(
        await findAccountByCode(tx, params.orgId, "1150"),
        "Pledge write-off",
        "1150",
      );
    }

    const fiscalPeriod = await findOpenFiscalPeriod(tx, params.orgId, today);
    const entry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: today,
        fiscalPeriodId: fiscalPeriod.id,
        memo: `Pledge write-off — pledge ${params.pledgeId}`,
        source: "pledge",
        sourceId: writeOffSourceId,
        postedBy: params.actorId,
        isAdjusting: true,
      },
    });

    const lineValues: {
      orgId: string;
      journalEntryId: string;
      lineNumber: number;
      accountId: string;
      debitCents: number;
      creditCents: number;
      fundId: string | null;
    }[] = [
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 1,
        accountId: allowanceAccount.id,
        debitCents: params.writeOffCents,
        creditCents: 0,
        fundId: null,
      },
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 2,
        accountId: receivableAccount.id,
        debitCents: 0,
        creditCents: params.writeOffCents,
        fundId: null,
      },
    ];

    if (hasResidualDiscount && discountAccount) {
      lineValues.push(
        {
          orgId: params.orgId,
          journalEntryId: entry.id,
          lineNumber: 3,
          accountId: discountAccount.id,
          debitCents: params.remainingDiscountCents,
          creditCents: 0,
          fundId: null,
        },
        {
          orgId: params.orgId,
          journalEntryId: entry.id,
          lineNumber: 4,
          accountId: allowanceAccount.id,
          debitCents: 0,
          creditCents: params.remainingDiscountCents,
          fundId: null,
        },
      );
    }

    await tx.insert(journalLines).values(lineValues);
  }
}

// ---------------------------------------------------------------------------
// reverseGrantPayment
// ---------------------------------------------------------------------------

export async function reverseGrantPayment(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    paymentId: string;
    reversalDate: Date;
  },
): Promise<void> {
  const enabled = await isAccountingEnabled(tx, params.orgId);
  if (!enabled) return;

  await reverseSourceLinkedEntries(
    tx,
    params.orgId,
    "grant_payment",
    params.paymentId,
    params.reversalDate,
    params.actorId,
  );
}

// ---------------------------------------------------------------------------
// postPledgeAllowance
// ---------------------------------------------------------------------------

/**
 * Posts a change in the allowance for uncollectible pledges.
 *
 * When increasing the allowance (deltaCents > 0):
 *   Dr 6500  deltaCents  (Bad Debt Expense)
 *   Cr 1190  deltaCents  (Allowance for Uncollectible Pledges)
 *
 * When decreasing the allowance (deltaCents < 0, i.e. releasing allowance):
 *   Dr 1190  |deltaCents|  (Allowance for Uncollectible Pledges)
 *   Cr 6500  |deltaCents|  (Bad Debt Expense)
 *
 * If deltaCents === 0 this function is a no-op.
 *
 * sourceId = `${pledgeId}:allowance:${asOf}` so each allowance adjustment
 * is individually identifiable.
 */
export async function postPledgeAllowance(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    actorId: string;
    pledgeId: string;
    deltaCents: number;
    asOfDate: Date;
    action: "create" | "update" | "delete";
  },
): Promise<void> {
  const enabled = await isAccountingEnabled(tx, params.orgId);
  if (!enabled) return;

  if (params.deltaCents === 0) return;

  const [pledge] = await tx
    .select()
    .from(pledges)
    .where(
      and(
        eq(pledges.id, params.pledgeId),
        eq(pledges.orgId, params.orgId),
        params.action === "delete" ? undefined : isNull(pledges.deletedAt),
      ),
    );

  if (!pledge) return;

  const asOf = params.asOfDate.toISOString().slice(0, 10);
  const compoundSourceId = `${params.pledgeId}:allowance:${asOf}`;

  if (params.action === "update" || params.action === "delete") {
    await reverseSourceLinkedEntries(
      tx,
      params.orgId,
      "pledge",
      compoundSourceId,
      params.asOfDate,
      params.actorId,
    );
  }

  if (params.action === "create" || params.action === "update") {
    const allowanceAccount = requirePledgeAccount(
      await findAccountByCode(tx, params.orgId, "1190"),
      "Pledge allowance adjustment",
      "1190",
    );

    const badDebtAccount = requirePledgeAccount(
      await findAccountByCode(tx, params.orgId, "6500"),
      "Pledge allowance adjustment",
      "6500",
    );

    const fiscalPeriod = await findOpenFiscalPeriod(tx, params.orgId, params.asOfDate);
    const entry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: params.asOfDate,
        fiscalPeriodId: fiscalPeriod.id,
        memo: `Pledge allowance adjustment — pledge ${params.pledgeId} as of ${asOf}`,
        source: "pledge",
        sourceId: compoundSourceId,
        postedBy: params.actorId,
        isAdjusting: true,
      },
    });

    const absDelta = Math.abs(params.deltaCents);
    const isIncrease = params.deltaCents > 0;

    await tx.insert(journalLines).values([
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 1,
        accountId: isIncrease ? badDebtAccount.id : allowanceAccount.id,
        debitCents: absDelta,
        creditCents: 0,
        fundId: null as string | null,
      },
      {
        orgId: params.orgId,
        journalEntryId: entry.id,
        lineNumber: 2,
        accountId: isIncrease ? allowanceAccount.id : badDebtAccount.id,
        debitCents: 0,
        creditCents: absDelta,
        fundId: null as string | null,
      },
    ]);
  }
}

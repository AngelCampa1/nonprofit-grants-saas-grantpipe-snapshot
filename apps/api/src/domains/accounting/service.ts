import { escapeCsvCell } from "../../lib/csv";
import {
  and,
  asc,
  count as drizzleCount,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  sum,
} from "drizzle-orm";
import {
  bankTransactions,
  chartOfAccounts,
  contacts,
  fiscalPeriods,
  funds,
  grants,
  journalEntries,
  journalLines,
} from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import {
  createAccountSchema,
  createJournalEntrySchema,
  updateAccountSchema,
} from "@grantpipe/shared";
import type {
  AccountListParams,
  CreateAccountInput,
  CreateFiscalPeriodInput,
  CreateJournalEntryInput,
  LedgerQueryParams,
  TrialBalanceQueryParams,
  UpdateAccountInput,
  UpdateFiscalPeriodInput,
} from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { badRequest, conflict, forbidden, internalError, notFound } from "../../lib/app-error";
import { getNonprofitCoaSeed } from "./coaSeed";
import { insertJournalEntryWithNextNumber } from "./journalEntryNumber";

// ---------------------------------------------------------------------------
// Chart of Accounts
// ---------------------------------------------------------------------------

export async function listAccounts(
  db: Database,
  params: {
    orgId: string;
    search?: string;
    type?: AccountListParams["type"];
    isActive?: boolean;
    page?: number;
    pageSize?: number;
  },
) {
  const conditions = [eq(chartOfAccounts.orgId, params.orgId), isNull(chartOfAccounts.deletedAt)];

  if (params.search) {
    const pattern = `%${params.search}%`;
    conditions.push(
      or(ilike(chartOfAccounts.name, pattern), ilike(chartOfAccounts.code, pattern))!,
    );
  }
  if (params.type !== undefined) {
    conditions.push(eq(chartOfAccounts.type, params.type));
  }
  if (params.isActive !== undefined) {
    conditions.push(eq(chartOfAccounts.isActive, params.isActive));
  }

  const pageSize = params.pageSize ?? 100;
  const page = params.page ?? 1;

  return db
    .select()
    .from(chartOfAccounts)
    .where(and(...conditions))
    .orderBy(asc(chartOfAccounts.code))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

export async function getAccount(db: Database, params: { orgId: string; accountId: string }) {
  const account = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.id, params.accountId),
      eq(chartOfAccounts.orgId, params.orgId),
      isNull(chartOfAccounts.deletedAt),
    ),
  });
  if (!account) throw notFound("Account not found");
  return account;
}

// parentAccountId is a client-supplied foreign key. The database FK only
// guarantees the referenced account exists somewhere — not that it belongs to
// the caller's org. Without this check a tenant could nest their account under
// another org's account, leaking that org's id into the hierarchy and into any
// read that traverses parentAccountId. Always scope the parent by orgId.
async function assertParentAccountInOrg(db: Database, orgId: string, parentAccountId: string) {
  const parent = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.id, parentAccountId),
      eq(chartOfAccounts.orgId, orgId),
      isNull(chartOfAccounts.deletedAt),
    ),
  });
  if (!parent) throw notFound("Parent account not found");
}

export async function createAccount(
  db: Database,
  params: { orgId: string; actorId: string } & CreateAccountInput,
) {
  const data = createAccountSchema.parse(params);

  const existing = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.code, data.code),
      eq(chartOfAccounts.orgId, params.orgId),
      isNull(chartOfAccounts.deletedAt),
    ),
  });
  if (existing) throw conflict("An account with this code already exists");

  if (data.parentAccountId) {
    await assertParentAccountInOrg(db, params.orgId, data.parentAccountId);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(chartOfAccounts)
      .values({
        orgId: params.orgId,
        code: data.code,
        name: data.name,
        type: data.type,
        subtype: data.subtype,
        parentAccountId: data.parentAccountId,
        naturalRestriction: data.naturalRestriction,
        functionalClass: data.functionalClass,
        isActive: data.isActive,
      })
      .returning();

    if (!row) throw internalError("Failed to create account");

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "account",
      entityId: row.id,
      changes: { code: data.code, name: data.name, type: data.type },
    });

    return row;
  });
}

export async function updateAccount(
  db: Database,
  params: {
    orgId: string;
    actorId: string;
    accountId: string;
    data: UpdateAccountInput;
  },
) {
  const data = updateAccountSchema.parse(params.data);

  const account = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.id, params.accountId),
      eq(chartOfAccounts.orgId, params.orgId),
      isNull(chartOfAccounts.deletedAt),
    ),
  });
  if (!account) throw notFound("Account not found");

  if (data.code !== undefined && data.code !== account.code) {
    const collision = await db.query.chartOfAccounts.findFirst({
      where: and(
        eq(chartOfAccounts.code, data.code),
        eq(chartOfAccounts.orgId, params.orgId),
        isNull(chartOfAccounts.deletedAt),
      ),
    });
    if (collision) throw conflict("An account with this code already exists");
  }

  // Prevent account type change after transactions have been posted to it
  if (data.type !== undefined && data.type !== account.type) {
    const [typeLineCount] = await db
      .select({ count: drizzleCount() })
      .from(journalLines)
      .where(
        and(eq(journalLines.accountId, params.accountId), eq(journalLines.orgId, params.orgId)),
      );

    if ((typeLineCount?.count ?? 0) > 0) {
      throw conflict("Cannot change account type after transactions have been posted to it.");
    }
  }

  if (data.parentAccountId) {
    if (data.parentAccountId === params.accountId) {
      throw badRequest("An account cannot be its own parent.");
    }
    await assertParentAccountInOrg(db, params.orgId, data.parentAccountId);
  }

  const payload: Partial<typeof chartOfAccounts.$inferInsert> = {};
  if (data.code !== undefined) payload.code = data.code;
  if (data.name !== undefined) payload.name = data.name;
  if (data.type !== undefined) payload.type = data.type;
  if ("subtype" in data) payload.subtype = data.subtype ?? null;
  if ("parentAccountId" in data) payload.parentAccountId = data.parentAccountId ?? null;
  if ("naturalRestriction" in data) payload.naturalRestriction = data.naturalRestriction ?? null;
  if ("functionalClass" in data) payload.functionalClass = data.functionalClass ?? null;
  if (data.isActive !== undefined) payload.isActive = data.isActive;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(chartOfAccounts)
      .set(payload)
      .where(
        and(
          eq(chartOfAccounts.id, params.accountId),
          eq(chartOfAccounts.orgId, params.orgId),
          isNull(chartOfAccounts.deletedAt),
        ),
      )
      .returning();

    if (!row) throw notFound("Account not found");

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "account",
      entityId: params.accountId,
      changes: data,
    });

    return row;
  });
}

export async function deleteAccount(
  db: Database,
  params: { orgId: string; actorId: string; accountId: string },
) {
  // Prevent deletion of accounts with posted transactions — deactivate instead
  const [lineCount] = await db
    .select({ count: drizzleCount() })
    .from(journalLines)
    .where(and(eq(journalLines.accountId, params.accountId), eq(journalLines.orgId, params.orgId)));

  if ((lineCount?.count ?? 0) > 0) {
    throw conflict(
      "Account has posted transactions and cannot be deleted. Set isActive: false to deactivate it instead.",
    );
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(chartOfAccounts)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(chartOfAccounts.id, params.accountId),
          eq(chartOfAccounts.orgId, params.orgId),
          isNull(chartOfAccounts.deletedAt),
        ),
      )
      .returning();

    if (!row) throw notFound("Account not found");

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "deleted",
      entityType: "account",
      entityId: params.accountId,
      changes: null,
    });
  });
}

// ---------------------------------------------------------------------------
// COA Seed
// ---------------------------------------------------------------------------

export async function seedChartOfAccounts(
  db: Database,
  params: { orgId: string; actorId: string },
) {
  return db.transaction(async (tx) => {
    const [countRow] = await tx
      .select({ count: drizzleCount() })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.orgId, params.orgId), isNull(chartOfAccounts.deletedAt)));

    if ((countRow?.count ?? 0) > 0) return;

    const seedEntries = getNonprofitCoaSeed();

    // First pass: insert all entries without parentAccountId
    const codeToId = new Map<string, string>();
    const withoutParent = seedEntries.filter((e) => !e.parentCode);

    for (const entry of withoutParent) {
      const [row] = await tx
        .insert(chartOfAccounts)
        .values({
          orgId: params.orgId,
          code: entry.code,
          name: entry.name,
          type: entry.type,
          subtype: entry.subtype,
          naturalRestriction: entry.naturalRestriction,
          functionalClass: entry.functionalClass,
          isActive: true,
        })
        .returning();
      if (row) codeToId.set(entry.code, row.id);
    }

    // Second pass: insert entries with parentCode, resolving parentAccountId
    const withParent = seedEntries.filter((e) => e.parentCode);
    for (const entry of withParent) {
      const parentAccountId = codeToId.get(entry.parentCode!);
      const [row] = await tx
        .insert(chartOfAccounts)
        .values({
          orgId: params.orgId,
          code: entry.code,
          name: entry.name,
          type: entry.type,
          subtype: entry.subtype,
          naturalRestriction: entry.naturalRestriction,
          functionalClass: entry.functionalClass,
          parentAccountId: parentAccountId ?? null,
          isActive: true,
        })
        .returning();
      if (row) codeToId.set(entry.code, row.id);
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "seeded",
      entityType: "account",
      entityId: params.orgId,
      changes: { count: seedEntries.length },
    });
  });
}

// ---------------------------------------------------------------------------
// Fiscal Periods
// ---------------------------------------------------------------------------

export async function listFiscalPeriods(db: Database, params: { orgId: string }) {
  return db
    .select()
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.orgId, params.orgId))
    .orderBy(desc(fiscalPeriods.startDate))
    .limit(500)
    .offset(0);
}

export async function createFiscalPeriod(
  db: Database,
  params: { orgId: string; actorId: string } & CreateFiscalPeriodInput,
) {
  const start = new Date(params.startDate);
  const end = new Date(params.endDate);

  // Check for overlapping fiscal periods for the same org
  const overlapping = await db.query.fiscalPeriods.findFirst({
    where: and(
      eq(fiscalPeriods.orgId, params.orgId),
      lte(fiscalPeriods.startDate, end),
      gte(fiscalPeriods.endDate, start),
    ),
  });

  if (overlapping) {
    throw conflict(
      `Fiscal period overlaps with existing period "${overlapping.name}" (${overlapping.startDate.toISOString()} – ${overlapping.endDate.toISOString()})`,
    );
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(fiscalPeriods)
      .values({
        orgId: params.orgId,
        name: params.name,
        startDate: start,
        endDate: end,
        status: "open",
      })
      .returning();

    if (!row) throw internalError("Failed to create fiscal period");

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "fiscal_period",
      entityId: row.id,
      changes: { name: params.name, startDate: params.startDate, endDate: params.endDate },
    });

    return row;
  });
}

export async function closeFiscalPeriod(
  db: Database,
  params: { orgId: string; actorId: string; periodId: string },
) {
  const period = await db.query.fiscalPeriods.findFirst({
    where: and(eq(fiscalPeriods.id, params.periodId), eq(fiscalPeriods.orgId, params.orgId)),
  });

  if (!period) throw notFound("Fiscal period not found");
  if (period.status === "closed" || period.status === "locked") {
    throw conflict(`Fiscal period is already ${period.status}`);
  }

  return db.transaction(async (tx) => {
    // Atomic claim: gate the close on status='open' so two concurrent close
    // requests cannot both pass the stale findFirst check above and both write
    // (double-close overwriting closedBy/closedAt + duplicate audit entry).
    const [row] = await tx
      .update(fiscalPeriods)
      .set({
        status: "closed",
        closedBy: params.actorId,
        closedAt: new Date(),
      })
      .where(
        and(
          eq(fiscalPeriods.id, params.periodId),
          eq(fiscalPeriods.orgId, params.orgId),
          eq(fiscalPeriods.status, "open"),
        ),
      )
      .returning();

    // Found at read time but the guarded UPDATE matched nothing -> a concurrent
    // close/lock already moved the status. This caller is the TOCTOU loser.
    if (!row) throw conflict("Fiscal period status changed concurrently; expected status 'open'");

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "closed",
      entityType: "fiscal_period",
      entityId: params.periodId,
      changes: null,
    });

    return row;
  });
}

export async function updateFiscalPeriod(
  db: Database,
  params: { orgId: string; actorId: string; periodId: string; data: UpdateFiscalPeriodInput },
) {
  const period = await db.query.fiscalPeriods.findFirst({
    where: and(eq(fiscalPeriods.id, params.periodId), eq(fiscalPeriods.orgId, params.orgId)),
  });

  if (!period) throw notFound("Fiscal period not found");
  if (period.status === "locked") throw conflict("Cannot edit a locked fiscal period");

  const newStart = params.data.startDate ? new Date(params.data.startDate) : period.startDate;
  const newEnd = params.data.endDate ? new Date(params.data.endDate) : period.endDate;

  if (newEnd <= newStart) {
    throw conflict("endDate must be after startDate");
  }

  if (params.data.startDate || params.data.endDate) {
    const overlapping = await db.query.fiscalPeriods.findFirst({
      where: and(
        eq(fiscalPeriods.orgId, params.orgId),
        lte(fiscalPeriods.startDate, newEnd),
        gte(fiscalPeriods.endDate, newStart),
      ),
    });
    if (overlapping && overlapping.id !== params.periodId) {
      throw conflict(
        `Updated dates overlap with existing period "${overlapping.name}" (${overlapping.startDate.toISOString()} – ${overlapping.endDate.toISOString()})`,
      );
    }
  }

  const payload: Partial<typeof fiscalPeriods.$inferInsert> = {};
  if (params.data.name !== undefined) payload.name = params.data.name;
  if (params.data.startDate !== undefined) payload.startDate = new Date(params.data.startDate);
  if (params.data.endDate !== undefined) payload.endDate = new Date(params.data.endDate);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(fiscalPeriods)
      .set(payload)
      .where(and(eq(fiscalPeriods.id, params.periodId), eq(fiscalPeriods.orgId, params.orgId)))
      .returning();

    if (!row) throw notFound("Fiscal period not found");

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "fiscal_period",
      entityId: params.periodId,
      changes: params.data,
    });

    return row;
  });
}

// ---------------------------------------------------------------------------
// Journal Entries
// ---------------------------------------------------------------------------

export async function listJournalEntries(
  db: Database,
  params: {
    orgId: string;
    fiscalPeriodId?: string;
    source?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  },
) {
  const conditions: Parameters<typeof and>[0][] = [eq(journalEntries.orgId, params.orgId)];

  if (params.fiscalPeriodId) {
    conditions.push(eq(journalEntries.fiscalPeriodId, params.fiscalPeriodId));
  }
  if (params.source) {
    conditions.push(eq(journalEntries.source, params.source));
  }
  if (params.from) {
    conditions.push(gte(journalEntries.date, params.from));
  }
  if (params.to) {
    conditions.push(lte(journalEntries.date, params.to));
  }

  const pageSize = params.pageSize ?? 50;
  const page = params.page ?? 1;

  return db.query.journalEntries.findMany({
    where: and(...conditions),
    with: { lines: true },
    orderBy: [desc(journalEntries.date), desc(journalEntries.entryNumber)],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
}

export async function getJournalEntry(db: Database, params: { orgId: string; entryId: string }) {
  const entry = await db.query.journalEntries.findFirst({
    where: and(eq(journalEntries.id, params.entryId), eq(journalEntries.orgId, params.orgId)),
    with: { lines: true },
  });
  if (!entry) throw notFound("Journal entry not found");
  return entry;
}

async function assertJournalLineReferences(
  db: TransactionDatabase,
  params: { orgId: string; lines: CreateJournalEntryInput["lines"] },
) {
  for (const [index, line] of params.lines.entries()) {
    const lineNumber = index + 1;
    const account = await db.query.chartOfAccounts.findFirst({
      where: and(
        eq(chartOfAccounts.id, line.accountId),
        eq(chartOfAccounts.orgId, params.orgId),
        eq(chartOfAccounts.isActive, true),
        isNull(chartOfAccounts.deletedAt),
      ),
    });
    if (!account) throw notFound(`Line ${lineNumber}: Account not found`);

    if (line.fundId) {
      const fund = await db.query.funds.findFirst({
        where: and(
          eq(funds.id, line.fundId),
          eq(funds.orgId, params.orgId),
          isNull(funds.deletedAt),
        ),
      });
      if (!fund) throw notFound(`Line ${lineNumber}: Fund not found`);
    }

    if (line.grantId) {
      const grant = await db.query.grants.findFirst({
        where: and(
          eq(grants.id, line.grantId),
          eq(grants.orgId, params.orgId),
          isNull(grants.deletedAt),
        ),
      });
      if (!grant) throw notFound(`Line ${lineNumber}: Grant not found`);
    }

    if (line.contactId) {
      const contact = await db.query.contacts.findFirst({
        where: and(
          eq(contacts.id, line.contactId),
          eq(contacts.orgId, params.orgId),
          isNull(contacts.deletedAt),
        ),
      });
      if (!contact) throw notFound(`Line ${lineNumber}: Contact not found`);
    }
  }
}

export async function createJournalEntry(
  db: Database,
  params: { orgId: string; actorId: string } & CreateJournalEntryInput,
) {
  const data = createJournalEntrySchema.parse({
    date: params.date,
    fiscalPeriodId: params.fiscalPeriodId,
    memo: params.memo,
    isAdjusting: params.isAdjusting,
    lines: params.lines,
  });

  // Period validation + insert run inside a single transaction so the status
  // check and the insert cannot be split by a concurrent period-close operation.
  return db.transaction(async (tx) => {
    const period = await tx.query.fiscalPeriods.findFirst({
      where: and(eq(fiscalPeriods.id, data.fiscalPeriodId), eq(fiscalPeriods.orgId, params.orgId)),
    });

    if (!period) throw notFound("Fiscal period not found");
    if (period.status === "closed" || period.status === "locked") {
      throw conflict(`Cannot post to a ${period.status} fiscal period`);
    }

    const entryDate = new Date(data.date);
    if (entryDate < period.startDate || entryDate > period.endDate) {
      throw conflict(
        `Entry date must be within the fiscal period "${period.name}" (${period.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} – ${period.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })})`,
      );
    }

    await assertJournalLineReferences(tx, { orgId: params.orgId, lines: data.lines });

    const entry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: new Date(data.date),
        fiscalPeriodId: data.fiscalPeriodId,
        memo: data.memo,
        source: "manual",
        postedBy: params.actorId,
        isAdjusting: data.isAdjusting,
      },
    });

    const lineValues = data.lines.map((line, idx) => ({
      orgId: params.orgId,
      journalEntryId: entry.id,
      lineNumber: idx + 1,
      accountId: line.accountId,
      fundId: line.fundId,
      grantId: line.grantId,
      contactId: line.contactId,
      debitCents: line.debitCents,
      creditCents: line.creditCents,
      memo: line.memo,
    }));

    await tx.insert(journalLines).values(lineValues);

    const totalDebitCents = data.lines.reduce((sum, l) => sum + l.debitCents, 0);

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "posted",
      entityType: "journal_entry",
      entityId: entry.id,
      changes: { lineCount: data.lines.length, totalDebitCents },
    });

    return tx.query.journalEntries.findFirst({
      where: eq(journalEntries.id, entry.id),
      with: { lines: true },
    });
  });
}

export async function reverseJournalEntry(
  db: Database,
  params: {
    orgId: string;
    actorId: string;
    entryId: string;
    memo?: string;
    targetFiscalPeriodId?: string;
    date?: string;
    force?: boolean;
  },
) {
  const original = await db.query.journalEntries.findFirst({
    where: and(eq(journalEntries.id, params.entryId), eq(journalEntries.orgId, params.orgId)),
    with: { lines: true },
  });

  if (!original) throw notFound("Journal entry not found");

  if (original.reversedByEntryId !== null && original.reversedByEntryId !== undefined) {
    throw conflict("This entry has already been reversed");
  }

  // Lock guard: check if any journal lines are locked to a bank reconciliation
  if (!params.force) {
    type JournalLineRow = typeof journalLines.$inferSelect;
    const lockedLine = (original.lines as JournalLineRow[]).find(
      (l) => l.reconciliationId !== null && l.reconciliationId !== undefined,
    );
    if (lockedLine) {
      throw forbidden("Journal entry is locked by a bank reconciliation");
    }
  }

  const targetPeriodId = params.targetFiscalPeriodId ?? original.fiscalPeriodId;

  const period = await db.query.fiscalPeriods.findFirst({
    where: and(eq(fiscalPeriods.id, targetPeriodId), eq(fiscalPeriods.orgId, params.orgId)),
  });

  if (!period) throw notFound("Fiscal period not found");
  if (period.status === "closed" || period.status === "locked") {
    throw conflict(`Cannot post reversal to a ${period.status} fiscal period`);
  }

  let reversalDate = params.date ? new Date(params.date) : new Date();
  // Clamp the reversal date to be within the target period so it never falls outside its own period.
  if (period.startDate && reversalDate < new Date(period.startDate)) {
    reversalDate = new Date(period.startDate);
  }
  if (period.endDate && reversalDate > new Date(period.endDate)) {
    reversalDate = new Date(period.endDate);
  }
  const reversalMemo = params.memo ?? `Reversal of entry #${original.entryNumber}`;

  // Wrap entry number generation + reversal insert in a transaction
  return db.transaction(async (tx) => {
    const newEntry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: reversalDate,
        fiscalPeriodId: targetPeriodId,
        memo: reversalMemo,
        source: "adjustment",
        postedBy: params.actorId,
        isAdjusting: true,
      },
    });

    type JournalLineRow = typeof journalLines.$inferSelect;
    const reversedLines = (original.lines as JournalLineRow[]).map((line, idx) => ({
      orgId: params.orgId,
      journalEntryId: newEntry.id,
      lineNumber: idx + 1,
      accountId: line.accountId,
      fundId: line.fundId ?? undefined,
      grantId: line.grantId ?? undefined,
      contactId: line.contactId ?? undefined,
      debitCents: line.creditCents,
      creditCents: line.debitCents,
      memo: line.memo ?? undefined,
    }));

    if (reversedLines.length > 0) {
      await tx.insert(journalLines).values(reversedLines);
    }

    // Mark original as reversed via an atomic guarded claim. The reversedByEntryId
    // null-check at the top of this function runs OUTSIDE this transaction, and
    // Postgres READ COMMITTED does not hold that read snapshot — so two concurrent
    // reversals could both pass the stale check and both post a reversal, doubling
    // the ledger. Guarding the UPDATE on `reversedByEntryId IS NULL` makes only one
    // win; the loser's empty result throws and rolls back its inserted reversal.
    const [claimed] = await tx
      .update(journalEntries)
      .set({ reversedByEntryId: newEntry.id })
      .where(
        and(
          eq(journalEntries.id, params.entryId),
          eq(journalEntries.orgId, params.orgId),
          isNull(journalEntries.reversedByEntryId),
        ),
      )
      .returning();
    if (!claimed) {
      throw conflict("This entry has already been reversed");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "reversed",
      entityType: "journal_entry",
      entityId: params.entryId,
      changes: { reversedByEntryId: newEntry.id },
    });

    return tx.query.journalEntries.findFirst({
      where: eq(journalEntries.id, newEntry.id),
      with: { lines: true },
    });
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function computeBalance(type: string, debitTotal: number, creditTotal: number): number {
  // Debit-normal: asset, expense
  if (type === "asset" || type === "expense") {
    return debitTotal - creditTotal;
  }
  // Credit-normal: liability, net_assets, revenue
  return creditTotal - debitTotal;
}

export async function getTrialBalance(
  db: Database,
  params: { orgId: string } & TrialBalanceQueryParams,
) {
  // Build the line join conditions — lines scoped to org + optional fund/grant filter.
  // Lines are joined FIRST (before entries), preventing a Cartesian product between
  // chartOfAccounts and journalEntries. Accounts with no matching lines still appear
  // via the outer LEFT JOINs with zero COALESCE balances.
  const lineJoinConditions: Parameters<typeof and>[0][] = [
    eq(journalLines.accountId, chartOfAccounts.id),
    eq(journalLines.orgId, params.orgId),
  ];

  if (params.fundId) {
    lineJoinConditions.push(eq(journalLines.fundId, params.fundId));
  }
  if (params.grantId) {
    lineJoinConditions.push(eq(journalLines.grantId, params.grantId));
  }

  // Join order: chartOfAccounts → journalLines → journalEntries (with asOf filter).
  // journalLines joins on accountId so we only aggregate lines for each account.
  // journalEntries then filters those lines to only entries on or before asOf.
  const rows = await db
    .select({
      account: {
        id: chartOfAccounts.id,
        code: chartOfAccounts.code,
        name: chartOfAccounts.name,
        type: chartOfAccounts.type,
        subtype: chartOfAccounts.subtype,
        naturalRestriction: chartOfAccounts.naturalRestriction,
        functionalClass: chartOfAccounts.functionalClass,
        isActive: chartOfAccounts.isActive,
      },
      debitTotal: sql<number>`COALESCE(SUM(${journalLines.debitCents}), 0)`,
      creditTotal: sql<number>`COALESCE(SUM(${journalLines.creditCents}), 0)`,
    })
    .from(chartOfAccounts)
    .leftJoin(journalLines, and(...lineJoinConditions))
    .leftJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, params.orgId),
        lte(journalEntries.date, new Date(params.asOf)),
      ),
    )
    .groupBy(
      chartOfAccounts.id,
      chartOfAccounts.code,
      chartOfAccounts.name,
      chartOfAccounts.type,
      chartOfAccounts.subtype,
      chartOfAccounts.naturalRestriction,
      chartOfAccounts.functionalClass,
      chartOfAccounts.isActive,
    )
    .where(
      and(
        eq(chartOfAccounts.orgId, params.orgId),
        isNull(chartOfAccounts.deletedAt),
        eq(chartOfAccounts.isActive, true),
        // Exclude lines from entries after asOf: keep rows where either no
        // journal line exists (zero-balance account) or the entry matched the
        // date filter (entry date ≤ asOf). Without this, lines from future
        // entries participate in the SUM because the LEFT JOIN returns them
        // with NULL journalEntries columns but non-NULL line amounts.
        or(isNull(journalLines.id), isNotNull(journalEntries.id)),
      ),
    )
    .orderBy(asc(chartOfAccounts.code));

  return rows
    .filter(
      (row): row is typeof row & { account: NonNullable<typeof row.account> } =>
        row.account !== null,
    )
    .map((row) => ({
      account: row.account,
      debitTotal: Number(row.debitTotal),
      creditTotal: Number(row.creditTotal),
      balance: computeBalance(row.account.type, Number(row.debitTotal), Number(row.creditTotal)),
    }));
}

export async function getAccountLedger(
  db: Database,
  params: { orgId: string; accountId: string } & LedgerQueryParams,
) {
  const account = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.id, params.accountId),
      eq(chartOfAccounts.orgId, params.orgId),
      isNull(chartOfAccounts.deletedAt),
    ),
  });
  if (!account) throw notFound("Account not found");

  const lineConditions = [
    eq(journalLines.accountId, params.accountId),
    eq(journalLines.orgId, params.orgId),
  ];

  if (params.from) {
    lineConditions.push(gte(journalEntries.date, new Date(params.from)));
  }
  if (params.to) {
    lineConditions.push(lte(journalEntries.date, new Date(params.to)));
  }
  if (params.fundId) {
    lineConditions.push(eq(journalLines.fundId, params.fundId));
  }
  if (params.grantId) {
    lineConditions.push(eq(journalLines.grantId, params.grantId));
  }

  const rawLines = await db
    .select({
      line: {
        id: journalLines.id,
        lineNumber: journalLines.lineNumber,
        accountId: journalLines.accountId,
        fundId: journalLines.fundId,
        grantId: journalLines.grantId,
        contactId: journalLines.contactId,
        debitCents: journalLines.debitCents,
        creditCents: journalLines.creditCents,
        memo: journalLines.memo,
      },
      journalEntry: {
        id: journalEntries.id,
        entryNumber: journalEntries.entryNumber,
        date: journalEntries.date,
        memo: journalEntries.memo,
        source: journalEntries.source,
        isAdjusting: journalEntries.isAdjusting,
      },
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .where(and(...lineConditions))
    .orderBy(asc(journalEntries.date), asc(journalEntries.entryNumber));

  let runningBalance = 0;
  const lines = rawLines.map((row) => {
    const debit = Number(row.line.debitCents);
    const credit = Number(row.line.creditCents);
    if (account.type === "asset" || account.type === "expense") {
      runningBalance += debit - credit;
    } else {
      runningBalance += credit - debit;
    }
    return {
      line: row.line,
      journalEntry: row.journalEntry,
      runningBalance,
    };
  });

  return { account, lines };
}

// ---------------------------------------------------------------------------
// FASB ASC 958 Financial Statements
// ---------------------------------------------------------------------------

// --- Types ------------------------------------------------------------------

export type SFPLineItem = {
  accountId: string;
  code: string;
  name: string;
  balanceCents: number;
};

export type SFPResult = {
  assets: { total: number; items: SFPLineItem[] };
  liabilities: { total: number; items: SFPLineItem[] };
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

// --- Statement of Financial Position ----------------------------------------

export async function getStatementOfFinancialPosition(
  db: Database,
  params: { orgId: string; asOf: Date },
): Promise<SFPResult> {
  const rows = await db
    .select({
      id: chartOfAccounts.id,
      code: chartOfAccounts.code,
      name: chartOfAccounts.name,
      type: chartOfAccounts.type,
      naturalRestriction: chartOfAccounts.naturalRestriction,
      debitTotal: sql<number>`COALESCE(${sum(journalLines.debitCents)}, 0)`,
      creditTotal: sql<number>`COALESCE(${sum(journalLines.creditCents)}, 0)`,
    })
    .from(chartOfAccounts)
    .leftJoin(
      journalLines,
      and(eq(journalLines.accountId, chartOfAccounts.id), eq(journalLines.orgId, params.orgId)),
    )
    .leftJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, params.orgId),
        lte(journalEntries.date, params.asOf),
      ),
    )
    .where(
      and(
        eq(chartOfAccounts.orgId, params.orgId),
        isNull(chartOfAccounts.deletedAt),
        eq(chartOfAccounts.isActive, true),
        or(isNull(journalLines.id), isNotNull(journalEntries.id)),
      ),
    )
    .groupBy(
      chartOfAccounts.id,
      chartOfAccounts.code,
      chartOfAccounts.name,
      chartOfAccounts.type,
      chartOfAccounts.naturalRestriction,
    )
    .orderBy(asc(chartOfAccounts.code));

  const assetItems: SFPLineItem[] = [];
  const liabilityItems: SFPLineItem[] = [];
  let unrestricted = 0;
  let temporarilyRestricted = 0;
  let permanentlyRestricted = 0;

  for (const row of rows) {
    const debit = Number(row.debitTotal);
    const credit = Number(row.creditTotal);

    if (row.type === "asset") {
      const balance = debit - credit;
      if (balance !== 0) {
        assetItems.push({
          accountId: row.id,
          code: row.code,
          name: row.name,
          balanceCents: balance,
        });
      }
    } else if (row.type === "liability") {
      const balance = credit - debit;
      if (balance !== 0) {
        liabilityItems.push({
          accountId: row.id,
          code: row.code,
          name: row.name,
          balanceCents: balance,
        });
      }
    } else if (row.type === "net_assets") {
      const balance = credit - debit;
      const restriction = row.naturalRestriction ?? "unrestricted";
      if (restriction === "temporarily_restricted") {
        temporarilyRestricted += balance;
      } else if (restriction === "permanently_restricted") {
        permanentlyRestricted += balance;
      } else {
        unrestricted += balance;
      }
    } else if (row.type === "revenue") {
      // Current-period revenues increase net assets (credit-normal)
      const balance = credit - debit;
      const restriction = row.naturalRestriction ?? "unrestricted";
      if (restriction === "temporarily_restricted") {
        temporarilyRestricted += balance;
      } else if (restriction === "permanently_restricted") {
        permanentlyRestricted += balance;
      } else {
        unrestricted += balance;
      }
    } else if (row.type === "expense") {
      // Current-period expenses reduce unrestricted net assets (debit-normal)
      unrestricted -= debit - credit;
    }
  }

  const assetsTotal = assetItems.reduce((sum, item) => sum + item.balanceCents, 0);
  const liabilitiesTotal = liabilityItems.reduce((sum, item) => sum + item.balanceCents, 0);
  const netAssetsTotal = unrestricted + temporarilyRestricted + permanentlyRestricted;
  const totalLiabilitiesAndNetAssets = liabilitiesTotal + netAssetsTotal;

  if (Math.abs(assetsTotal - totalLiabilitiesAndNetAssets) > 1) {
    throw internalError(
      `Statement of Financial Position is out of balance: assets=${assetsTotal}, liabilities+netAssets=${totalLiabilitiesAndNetAssets}`,
    );
  }

  return {
    assets: { total: assetsTotal, items: assetItems },
    liabilities: { total: liabilitiesTotal, items: liabilityItems },
    netAssets: {
      unrestricted,
      temporarilyRestricted,
      permanentlyRestricted,
      total: netAssetsTotal,
    },
    totalLiabilitiesAndNetAssets,
  };
}

// --- Statement of Activities -------------------------------------------------

async function getNetAssetsBalance(
  db: Database,
  params: { orgId: string; asOf: Date },
): Promise<{ withoutRestrictions: number; withRestrictions: number }> {
  const rows = await db
    .select({
      naturalRestriction: chartOfAccounts.naturalRestriction,
      debitTotal: sql<number>`COALESCE(${sum(journalLines.debitCents)}, 0)`,
      creditTotal: sql<number>`COALESCE(${sum(journalLines.creditCents)}, 0)`,
    })
    .from(chartOfAccounts)
    .leftJoin(
      journalLines,
      and(eq(journalLines.accountId, chartOfAccounts.id), eq(journalLines.orgId, params.orgId)),
    )
    .leftJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, params.orgId),
        lte(journalEntries.date, params.asOf),
      ),
    )
    .where(
      and(
        eq(chartOfAccounts.orgId, params.orgId),
        isNull(chartOfAccounts.deletedAt),
        eq(chartOfAccounts.type, "net_assets"),
        or(isNull(journalLines.id), isNotNull(journalEntries.id)),
      ),
    )
    .groupBy(chartOfAccounts.naturalRestriction);

  let withoutRestrictions = 0;
  let withRestrictions = 0;

  for (const row of rows) {
    const balance = Number(row.creditTotal) - Number(row.debitTotal);
    if (row.naturalRestriction === "unrestricted" || row.naturalRestriction === null) {
      withoutRestrictions += balance;
    } else {
      withRestrictions += balance;
    }
  }

  return { withoutRestrictions, withRestrictions };
}

export async function getStatementOfActivities(
  db: Database,
  params: { orgId: string; startDate: Date; endDate: Date },
): Promise<SOAResult> {
  // Fetch revenue rows AND temporarily-restricted net_assets rows (releases) in date range,
  // split by fundId presence. Releases are identified by account type "net_assets" with
  // naturalRestriction "temporarily_restricted" — a debit to these accounts reduces restriction.
  const revenueRows = await db
    .select({
      id: chartOfAccounts.id,
      code: chartOfAccounts.code,
      name: chartOfAccounts.name,
      type: chartOfAccounts.type,
      naturalRestriction: chartOfAccounts.naturalRestriction,
      hasFund: sql<boolean | string>`(${journalLines.fundId} IS NOT NULL)`,
      debitTotal: sql<number>`COALESCE(${sum(journalLines.debitCents)}, 0)`,
      creditTotal: sql<number>`COALESCE(${sum(journalLines.creditCents)}, 0)`,
    })
    .from(chartOfAccounts)
    .innerJoin(
      journalLines,
      and(eq(journalLines.accountId, chartOfAccounts.id), eq(journalLines.orgId, params.orgId)),
    )
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, params.orgId),
        gte(journalEntries.date, params.startDate),
        lte(journalEntries.date, params.endDate),
      ),
    )
    .where(
      and(
        eq(chartOfAccounts.orgId, params.orgId),
        isNull(chartOfAccounts.deletedAt),
        or(
          eq(chartOfAccounts.type, "revenue"),
          and(
            eq(chartOfAccounts.type, "net_assets"),
            eq(chartOfAccounts.naturalRestriction, "temporarily_restricted"),
          ),
        ),
      ),
    )
    .groupBy(
      chartOfAccounts.id,
      chartOfAccounts.code,
      chartOfAccounts.name,
      chartOfAccounts.type,
      chartOfAccounts.naturalRestriction,
      sql`(${journalLines.fundId} IS NOT NULL)`,
    )
    .orderBy(asc(chartOfAccounts.code));

  // Aggregate revenue by account, split into with/without restrictions.
  // Releases-of-restriction are identified by account type "net_assets" with
  // naturalRestriction "temporarily_restricted": a net debit to such an account
  // represents funds being released FROM restricted to unrestricted.
  const revenueMap = new Map<
    string,
    { id: string; name: string; withoutRestrictions: number; withRestrictions: number }
  >();
  let releasesWithout = 0;
  let releasesWith = 0;

  for (const row of revenueRows) {
    // Detect releases: net_assets account with temporarily_restricted naturalRestriction.
    // A debit (Dr) to this account signals release from restriction.
    if (row.type === "net_assets" && row.naturalRestriction === "temporarily_restricted") {
      // Release amount = net debit to restricted net assets (positive = funds released)
      const releaseAmount = Number(row.debitTotal) - Number(row.creditTotal);
      const rawHasFund = row.hasFund;
      // Postgres returns boolean as string in some drivers — normalise
      const hasFund = rawHasFund === true || rawHasFund === "true";
      if (hasFund) {
        // Release FROM restricted fund: reduce restricted column, increase unrestricted
        releasesWith -= releaseAmount;
        releasesWithout += releaseAmount;
      } else {
        releasesWithout += releaseAmount;
      }
      continue;
    }

    const balance = Number(row.creditTotal) - Number(row.debitTotal);
    const existing = revenueMap.get(row.id);
    const rawHasFund = row.hasFund;
    const hasFund = rawHasFund === true || rawHasFund === "true";
    if (existing) {
      if (hasFund) {
        existing.withRestrictions += balance;
      } else {
        existing.withoutRestrictions += balance;
      }
    } else {
      revenueMap.set(row.id, {
        id: row.id,
        name: row.name,
        withoutRestrictions: hasFund ? 0 : balance,
        withRestrictions: hasFund ? balance : 0,
      });
    }
  }

  const revenueResult: SOARow[] = Array.from(revenueMap.values()).map((r) => ({
    accountId: r.id,
    name: r.name,
    withoutRestrictions: r.withoutRestrictions,
    withRestrictions: r.withRestrictions,
    total: r.withoutRestrictions + r.withRestrictions,
  }));

  // Fetch expense rows in date range
  const expenseRows = await db
    .select({
      id: chartOfAccounts.id,
      name: chartOfAccounts.name,
      debitTotal: sql<number>`COALESCE(${sum(journalLines.debitCents)}, 0)`,
      creditTotal: sql<number>`COALESCE(${sum(journalLines.creditCents)}, 0)`,
    })
    .from(chartOfAccounts)
    .innerJoin(
      journalLines,
      and(eq(journalLines.accountId, chartOfAccounts.id), eq(journalLines.orgId, params.orgId)),
    )
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, params.orgId),
        gte(journalEntries.date, params.startDate),
        lte(journalEntries.date, params.endDate),
      ),
    )
    .where(
      and(
        eq(chartOfAccounts.orgId, params.orgId),
        isNull(chartOfAccounts.deletedAt),
        eq(chartOfAccounts.type, "expense"),
      ),
    )
    .groupBy(chartOfAccounts.id, chartOfAccounts.name)
    .orderBy(asc(chartOfAccounts.name));

  const expensesResult: SOARow[] = expenseRows
    .map((row) => {
      const balance = Number(row.debitTotal) - Number(row.creditTotal);
      return {
        accountId: row.id,
        name: row.name,
        withoutRestrictions: balance,
        withRestrictions: 0,
        total: balance,
      };
    })
    .filter((r) => r.total > 0);

  // Totals
  const totalRevWithout = revenueResult.reduce((s, r) => s + r.withoutRestrictions, 0);
  const totalRevWith = revenueResult.reduce((s, r) => s + r.withRestrictions, 0);
  const totalExpWithout = expensesResult.reduce((s, r) => s + r.withoutRestrictions, 0);

  const changeWithout = totalRevWithout + releasesWithout - totalExpWithout;
  const changeWith = totalRevWith + releasesWith;
  const changeTotal = changeWithout + changeWith;

  // Beginning net assets = everything strictly before the period start. The
  // as-of bound is the instant before startDate (startDate - 1ms). Subtracting a
  // full day instead would leave a gap: entries dated on the day before the period
  // start (after its first instant) fall into neither the beginning balance nor the
  // period revenue/expense window (which use gte(startDate)), silently vanishing
  // from the statement and corrupting ending net assets.
  const instantBeforeStart = new Date(params.startDate.getTime() - 1);
  const beginning = await getNetAssetsBalance(db, {
    orgId: params.orgId,
    asOf: instantBeforeStart,
  });

  const endingWithout = beginning.withoutRestrictions + changeWithout;
  const endingWith = beginning.withRestrictions + changeWith;

  return {
    revenue: revenueResult,
    releases: { withoutRestrictions: releasesWithout, withRestrictions: releasesWith },
    expenses: expensesResult,
    changeInNetAssets: {
      withoutRestrictions: changeWithout,
      withRestrictions: changeWith,
      total: changeTotal,
    },
    beginningNetAssets: {
      withoutRestrictions: beginning.withoutRestrictions,
      withRestrictions: beginning.withRestrictions,
      total: beginning.withoutRestrictions + beginning.withRestrictions,
    },
    endingNetAssets: {
      withoutRestrictions: endingWithout,
      withRestrictions: endingWith,
      total: endingWithout + endingWith,
    },
  };
}

// --- Statement of Functional Expenses ----------------------------------------

export async function getStatementOfFunctionalExpenses(
  db: Database,
  params: { orgId: string; startDate: Date; endDate: Date },
): Promise<SFEResult> {
  const rows = await db
    .select({
      id: chartOfAccounts.id,
      name: chartOfAccounts.name,
      functionalClass: chartOfAccounts.functionalClass,
      debitTotal: sql<number>`COALESCE(${sum(journalLines.debitCents)}, 0)`,
      creditTotal: sql<number>`COALESCE(${sum(journalLines.creditCents)}, 0)`,
    })
    .from(chartOfAccounts)
    .innerJoin(
      journalLines,
      and(eq(journalLines.accountId, chartOfAccounts.id), eq(journalLines.orgId, params.orgId)),
    )
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, params.orgId),
        gte(journalEntries.date, params.startDate),
        lte(journalEntries.date, params.endDate),
      ),
    )
    .where(
      and(
        eq(chartOfAccounts.orgId, params.orgId),
        isNull(chartOfAccounts.deletedAt),
        eq(chartOfAccounts.type, "expense"),
      ),
    )
    .groupBy(chartOfAccounts.id, chartOfAccounts.name, chartOfAccounts.functionalClass)
    .orderBy(asc(chartOfAccounts.name));

  const sfeRows: SFERow[] = rows.map((row) => {
    const balance = Number(row.debitTotal) - Number(row.creditTotal);
    const fc = row.functionalClass;
    return {
      accountId: row.id,
      name: row.name,
      program: fc === "program" ? balance : 0,
      management: fc === "management" ? balance : 0,
      fundraising: fc === "fundraising" ? balance : 0,
      total: balance,
    };
  });

  const totals = sfeRows.reduce(
    (acc, row) => ({
      program: acc.program + row.program,
      management: acc.management + row.management,
      fundraising: acc.fundraising + row.fundraising,
      total: acc.total + row.total,
    }),
    { program: 0, management: 0, fundraising: 0, total: 0 },
  );

  return { rows: sfeRows, totals };
}

// ---------------------------------------------------------------------------
// Year-end close
// ---------------------------------------------------------------------------

export async function runYearEndClose(
  db: Database,
  params: { orgId: string; actorId: string; periodId: string },
): Promise<{ closingEntryId: string }> {
  // 1. Fetch the fiscal period
  const period = await db.query.fiscalPeriods.findFirst({
    where: and(eq(fiscalPeriods.id, params.periodId), eq(fiscalPeriods.orgId, params.orgId)),
  });

  if (!period) throw notFound("Fiscal period not found");
  if (period.status === "closed" || period.status === "locked") {
    throw badRequest(`Fiscal period is already ${period.status}`);
  }

  // 2. Idempotency check
  const existing = await db.query.journalEntries.findFirst({
    where: and(
      eq(journalEntries.orgId, params.orgId),
      eq(journalEntries.fiscalPeriodId, params.periodId),
      eq(journalEntries.source, "year_end_close"),
    ),
  });

  if (existing) {
    return { closingEntryId: existing.id };
  }

  // 3. Look up the net assets account (code "3000")
  const netAssetsAccount = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.orgId, params.orgId),
      eq(chartOfAccounts.code, "3000"),
      isNull(chartOfAccounts.deletedAt),
    ),
  });

  if (!netAssetsAccount) {
    throw badRequest("Net assets account (code 3000) not found in chart of accounts");
  }

  // 4. Run the closing transaction
  return db.transaction(async (tx) => {
    // Fetch revenue account net balances (credit-normal: net = creditCents - debitCents)
    const revenueRows = await tx
      .select({
        accountId: chartOfAccounts.id,
        debitTotal: sql<number>`COALESCE(SUM(${journalLines.debitCents}), 0)`,
        creditTotal: sql<number>`COALESCE(SUM(${journalLines.creditCents}), 0)`,
      })
      .from(chartOfAccounts)
      .innerJoin(
        journalLines,
        and(eq(journalLines.accountId, chartOfAccounts.id), eq(journalLines.orgId, params.orgId)),
      )
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.id, journalLines.journalEntryId),
          eq(journalEntries.orgId, params.orgId),
          eq(journalEntries.fiscalPeriodId, params.periodId),
        ),
      )
      .where(
        and(
          eq(chartOfAccounts.orgId, params.orgId),
          isNull(chartOfAccounts.deletedAt),
          eq(chartOfAccounts.type, "revenue"),
        ),
      )
      .groupBy(chartOfAccounts.id);

    // Fetch expense account net balances (debit-normal: net = debitCents - creditCents)
    const expenseRows = await tx
      .select({
        accountId: chartOfAccounts.id,
        debitTotal: sql<number>`COALESCE(SUM(${journalLines.debitCents}), 0)`,
        creditTotal: sql<number>`COALESCE(SUM(${journalLines.creditCents}), 0)`,
      })
      .from(chartOfAccounts)
      .innerJoin(
        journalLines,
        and(eq(journalLines.accountId, chartOfAccounts.id), eq(journalLines.orgId, params.orgId)),
      )
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.id, journalLines.journalEntryId),
          eq(journalEntries.orgId, params.orgId),
          eq(journalEntries.fiscalPeriodId, params.periodId),
        ),
      )
      .where(
        and(
          eq(chartOfAccounts.orgId, params.orgId),
          isNull(chartOfAccounts.deletedAt),
          eq(chartOfAccounts.type, "expense"),
        ),
      )
      .groupBy(chartOfAccounts.id);

    // Calculate net income
    let totalRevenueCreditBalance = 0;
    for (const row of revenueRows) {
      const netCredit = Number(row.creditTotal) - Number(row.debitTotal);
      if (netCredit > 0) totalRevenueCreditBalance += netCredit;
    }

    let totalExpenseDebitBalance = 0;
    for (const row of expenseRows) {
      const netDebit = Number(row.debitTotal) - Number(row.creditTotal);
      if (netDebit > 0) totalExpenseDebitBalance += netDebit;
    }

    const netIncome = totalRevenueCreditBalance - totalExpenseDebitBalance;

    // Build closing journal entry lines
    const closingLines: Array<{
      accountId: string;
      debitCents: number;
      creditCents: number;
    }> = [];

    // Zero out revenue accounts (Dr each revenue account by its net credit balance)
    for (const row of revenueRows) {
      const netCredit = Number(row.creditTotal) - Number(row.debitTotal);
      if (netCredit > 0) {
        closingLines.push({ accountId: row.accountId, debitCents: netCredit, creditCents: 0 });
      }
    }

    // Zero out expense accounts (Cr each expense account by its net debit balance)
    for (const row of expenseRows) {
      const netDebit = Number(row.debitTotal) - Number(row.creditTotal);
      if (netDebit > 0) {
        closingLines.push({ accountId: row.accountId, debitCents: 0, creditCents: netDebit });
      }
    }

    // Net assets entry (code 3000)
    if (netIncome > 0) {
      // Profit: Cr net assets
      closingLines.push({
        accountId: netAssetsAccount.id,
        debitCents: 0,
        creditCents: netIncome,
      });
    } else if (netIncome < 0) {
      // Loss: Dr net assets
      closingLines.push({
        accountId: netAssetsAccount.id,
        debitCents: Math.abs(netIncome),
        creditCents: 0,
      });
    }

    // Insert the closing journal entry
    const newEntry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: period.endDate,
        fiscalPeriodId: params.periodId,
        memo: "Year-end closing entry",
        source: "year_end_close",
        postedBy: params.actorId,
        isAdjusting: false,
      },
    });

    if (closingLines.length > 0) {
      await tx.insert(journalLines).values(
        closingLines.map((line, idx) => ({
          orgId: params.orgId,
          journalEntryId: newEntry.id,
          lineNumber: idx + 1,
          accountId: line.accountId,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
        })),
      );
    }

    // Close the period
    await tx
      .update(fiscalPeriods)
      .set({ status: "closed", closedBy: params.actorId, closedAt: new Date() })
      .where(and(eq(fiscalPeriods.id, params.periodId), eq(fiscalPeriods.orgId, params.orgId)));

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "year_end_closed",
      entityType: "fiscal_period",
      entityId: params.periodId,
      changes: { closingEntryId: newEntry.id, netIncome },
    });

    return { closingEntryId: newEntry.id };
  });
}

// ---------------------------------------------------------------------------
// Period close checklist
// ---------------------------------------------------------------------------

export interface CloseChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface CloseChecklist {
  periodId: string;
  periodName: string;
  periodStatus: string;
  checks: CloseChecklistItem[];
  readyToClose: boolean;
}

export async function getPeriodCloseChecklist(
  db: Database,
  params: { orgId: string; periodId: string },
): Promise<CloseChecklist> {
  const period = await db.query.fiscalPeriods.findFirst({
    where: and(eq(fiscalPeriods.id, params.periodId), eq(fiscalPeriods.orgId, params.orgId)),
  });

  if (!period) throw notFound("Fiscal period not found");

  const checks: CloseChecklistItem[] = [];

  // 1. journal_balanced — all JEs in this period should have balanced lines
  const unbalancedRows = await db
    .select({
      entryId: journalEntries.id,
      totalDebit: sql<number>`SUM(${journalLines.debitCents})`,
      totalCredit: sql<number>`SUM(${journalLines.creditCents})`,
    })
    .from(journalEntries)
    .innerJoin(journalLines, eq(journalLines.journalEntryId, journalEntries.id))
    .where(
      and(
        eq(journalEntries.orgId, params.orgId),
        eq(journalEntries.fiscalPeriodId, params.periodId),
      ),
    )
    .groupBy(journalEntries.id)
    .having(sql`SUM(${journalLines.debitCents}) != SUM(${journalLines.creditCents})`);

  const journalBalanced = unbalancedRows.length === 0;
  checks.push({
    id: "journal_balanced",
    label: "All journal entries are balanced",
    passed: journalBalanced,
    detail: journalBalanced
      ? "All journal entries have matching debits and credits."
      : `${unbalancedRows.length} unbalanced journal entr${unbalancedRows.length === 1 ? "y" : "ies"} found.`,
  });

  // 2. no_unmatched_transactions — count bank transactions with status "unmatched" in period
  const [unmatchedRow] = await db
    .select({ count: drizzleCount() })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.orgId, params.orgId),
        eq(bankTransactions.status, "unmatched"),
        gte(bankTransactions.date, period.startDate),
        lte(bankTransactions.date, period.endDate),
      ),
    );

  const unmatchedCount = unmatchedRow?.count ?? 0;
  const noUnmatched = unmatchedCount === 0;
  checks.push({
    id: "no_unmatched_transactions",
    label: "No unmatched bank transactions for the period",
    passed: noUnmatched,
    detail: noUnmatched
      ? "All bank transactions are matched or ignored."
      : `${unmatchedCount} unmatched bank transaction${unmatchedCount === 1 ? "" : "s"} found.`,
  });

  // 3. trial_balance_zero — total debits = total credits for the period
  const [tbRow] = await db
    .select({
      totalDebit: sql<number>`COALESCE(SUM(${journalLines.debitCents}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalLines.creditCents}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .where(
      and(
        eq(journalEntries.orgId, params.orgId),
        eq(journalEntries.fiscalPeriodId, params.periodId),
      ),
    );

  const tbDebit = Number(tbRow?.totalDebit ?? 0);
  const tbCredit = Number(tbRow?.totalCredit ?? 0);
  const trialBalanceZero = tbDebit === tbCredit;
  checks.push({
    id: "trial_balance_zero",
    label: "Trial balance debits equal credits as of period end",
    passed: trialBalanceZero,
    detail: trialBalanceZero
      ? `Debits and credits both equal ${tbDebit} cents.`
      : `Debits (${tbDebit}) do not equal credits (${tbCredit}).`,
  });

  // 4. period_not_already_closed — period must be open
  const periodOpen = period.status === "open";
  checks.push({
    id: "period_not_already_closed",
    label: "Period is open",
    passed: periodOpen,
    detail: periodOpen
      ? "Period is open and ready to close."
      : `Period is already ${period.status}.`,
  });

  const readyToClose = checks.every((c) => c.passed);

  return {
    periodId: period.id,
    periodName: period.name,
    periodStatus: period.status,
    checks,
    readyToClose,
  };
}

// --- CSV helpers -------------------------------------------------------------

/**
 * Wraps a string cell in double-quotes if it contains commas, double-quotes,
 * or newlines; escapes embedded double-quotes per RFC 4180.
 * Numbers are returned as-is (no quoting needed).
 */
function csvCell(v: string | number): string {
  return escapeCsvCell(v);
}

export function sfpToCsv(result: SFPResult): string {
  const lines: string[] = ["Section,Account Code,Account Name,Balance (cents)"];
  for (const item of result.assets.items) {
    lines.push(`Assets,${csvCell(item.code)},${csvCell(item.name)},${item.balanceCents}`);
  }
  lines.push(`Assets Total,,,${result.assets.total}`);
  for (const item of result.liabilities.items) {
    lines.push(`Liabilities,${csvCell(item.code)},${csvCell(item.name)},${item.balanceCents}`);
  }
  lines.push(`Liabilities Total,,,${result.liabilities.total}`);
  lines.push(`Net Assets - Unrestricted,,,${result.netAssets.unrestricted}`);
  lines.push(`Net Assets - Temporarily Restricted,,,${result.netAssets.temporarilyRestricted}`);
  lines.push(`Net Assets - Permanently Restricted,,,${result.netAssets.permanentlyRestricted}`);
  lines.push(`Net Assets Total,,,${result.netAssets.total}`);
  lines.push(`Total Liabilities and Net Assets,,,${result.totalLiabilitiesAndNetAssets}`);
  return lines.join("\n");
}

export function soaToCsv(result: SOAResult): string {
  const lines: string[] = [
    "Section,Account Name,Without Restrictions (cents),With Restrictions (cents),Total (cents)",
  ];
  for (const row of result.revenue) {
    lines.push(
      `Revenue,${csvCell(row.name)},${row.withoutRestrictions},${row.withRestrictions},${row.total}`,
    );
  }
  lines.push(
    `Releases from Restrictions,,${result.releases.withoutRestrictions},${result.releases.withRestrictions},${result.releases.withoutRestrictions + result.releases.withRestrictions}`,
  );
  for (const row of result.expenses) {
    lines.push(
      `Expenses,${csvCell(row.name)},${row.withoutRestrictions},${row.withRestrictions},${row.total}`,
    );
  }
  lines.push(
    `Change in Net Assets,,${result.changeInNetAssets.withoutRestrictions},${result.changeInNetAssets.withRestrictions},${result.changeInNetAssets.total}`,
  );
  lines.push(
    `Beginning Net Assets,,${result.beginningNetAssets.withoutRestrictions},${result.beginningNetAssets.withRestrictions},${result.beginningNetAssets.total}`,
  );
  lines.push(
    `Ending Net Assets,,${result.endingNetAssets.withoutRestrictions},${result.endingNetAssets.withRestrictions},${result.endingNetAssets.total}`,
  );
  return lines.join("\n");
}

export function sfeToCsv(result: SFEResult): string {
  const lines: string[] = [
    "Account Name,Program (cents),Management (cents),Fundraising (cents),Total (cents)",
  ];
  for (const row of result.rows) {
    lines.push(
      `${csvCell(row.name)},${row.program},${row.management},${row.fundraising},${row.total}`,
    );
  }
  lines.push(
    `Totals,${result.totals.program},${result.totals.management},${result.totals.fundraising},${result.totals.total}`,
  );
  return lines.join("\n");
}

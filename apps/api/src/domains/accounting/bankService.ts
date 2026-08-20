import { and, desc, eq, isNotNull, isNull, lte, sum } from "drizzle-orm";
import {
  bankAccounts,
  bankReconciliations,
  bankTransactions,
  chartOfAccounts,
  journalEntries,
  journalLines,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import {
  createBankAccountSchema,
  createReconciliationSchema,
  updateBankAccountSchema,
} from "@grantpipe/shared";
import { badRequest, conflict, notFound } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";
import { parseCentsFromString } from "../../lib/parse-cents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BankTransactionStatus = "unmatched" | "matched" | "ignored";

interface ParsedRow {
  date: Date;
  amountCents: number;
  description: string;
  referenceNumber: string | null;
}

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  // Try ISO first
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }
  // Try MM/DD/YYYY
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (mmddyyyy) {
    const [, m, d2, y] = mmddyyyy;
    const d = new Date(`${y}-${m!.padStart(2, "0")}-${d2!.padStart(2, "0")}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function parseCsv(content: string): ParsedRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0]!;
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));

  const idxDate = headers.findIndex((h) => h === "date");
  const idxDescription = headers.findIndex((h) => h === "description");
  const idxReference = headers.findIndex((h) => h === "reference");
  const idxAmount = headers.findIndex((h) => h === "amount");
  const idxDebit = headers.findIndex((h) => h === "debit");
  const idxCredit = headers.findIndex((h) => h === "credit");

  const useDebitCredit = idxDebit !== -1 && idxCredit !== -1;

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    // Simple CSV split respecting quoted fields
    const cells = splitCsvLine(line);

    const rawDate = idxDate !== -1 ? (cells[idxDate] ?? "").trim() : "";
    const parsedDate = parseDate(rawDate);
    if (!parsedDate) continue;

    let amountCents: number;
    if (useDebitCredit) {
      const debitRaw = (cells[idxDebit] ?? "").trim();
      const creditRaw = (cells[idxCredit] ?? "").trim();
      // Credit = deposit (positive), debit = withdrawal (negative)
      // Subtract using integer cents to avoid float drift
      amountCents = parseCentsFromString(creditRaw) - parseCentsFromString(debitRaw);
    } else {
      const amountRaw = idxAmount !== -1 ? (cells[idxAmount] ?? "").trim() : "";
      amountCents = parseCentsFromString(amountRaw);
    }

    const description = idxDescription !== -1 ? (cells[idxDescription] ?? "").trim() : "";
    const referenceNumber = idxReference !== -1 ? (cells[idxReference] ?? "").trim() || null : null;

    rows.push({ date: parsedDate, amountCents, description, referenceNumber });
  }

  return rows;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

// ---------------------------------------------------------------------------
// OFX Parsing
// ---------------------------------------------------------------------------

function parseOfxDate(raw: string): Date | null {
  const trimmed = raw.trim().replace(/\[.*\]/, "");
  // YYYYMMDDHHMMSS or YYYYMMDD
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(trimmed);
  if (!match) return null;
  const year = match[1]!;
  const month = match[2]!;
  const day = match[3]!;
  const d = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return d;
}

function parseOfx(content: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const blockRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(content)) !== null) {
    const block = match[1]!;

    const dtposted = /<DTPOSTED>(.*?)(?:<|\n|$)/i.exec(block)?.[1]?.trim() ?? "";
    const trnamt = /<TRNAMT>(.*?)(?:<|\n|$)/i.exec(block)?.[1]?.trim() ?? "";
    const memo = /<MEMO>(.*?)(?:<|\n|$)/i.exec(block)?.[1]?.trim() ?? "";
    const name = /<NAME>(.*?)(?:<|\n|$)/i.exec(block)?.[1]?.trim() ?? "";
    const fitid = /<FITID>(.*?)(?:<|\n|$)/i.exec(block)?.[1]?.trim() ?? null;

    const date = parseOfxDate(dtposted);
    if (!date) continue;

    const amountCents = parseCentsFromString(trnamt);
    const description = memo || name || "";
    const referenceNumber = fitid || null;

    rows.push({ date, amountCents, description, referenceNumber });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// importBankTransactions
// ---------------------------------------------------------------------------

export async function importBankTransactions(
  db: Database,
  params: {
    orgId: string;
    bankAccountId: string;
    format: "csv" | "ofx";
    content: string;
  },
): Promise<{ imported: number; duplicates: number }> {
  const account = await db.query.bankAccounts.findFirst({
    where: and(
      eq(bankAccounts.id, params.bankAccountId),
      eq(bankAccounts.orgId, params.orgId),
      isNull(bankAccounts.deletedAt),
    ),
  });
  if (!account) throw notFound("Bank account not found");

  const rows = params.format === "csv" ? parseCsv(params.content) : parseOfx(params.content);

  let imported = 0;
  let duplicates = 0;

  for (const row of rows) {
    // Dedup check: (bankAccountId, date, amountCents, referenceNumber)
    const existing = await db.query.bankTransactions.findFirst({
      where: and(
        eq(bankTransactions.bankAccountId, params.bankAccountId),
        eq(bankTransactions.date, row.date),
        eq(bankTransactions.amountCents, row.amountCents),
        row.referenceNumber !== null
          ? eq(bankTransactions.referenceNumber, row.referenceNumber)
          : isNull(bankTransactions.referenceNumber),
      ),
    });

    if (existing) {
      duplicates++;
      continue;
    }

    await db.insert(bankTransactions).values({
      orgId: params.orgId,
      bankAccountId: params.bankAccountId,
      date: row.date,
      amountCents: row.amountCents,
      description: row.description || "(no description)",
      referenceNumber: row.referenceNumber,
      status: "unmatched",
    });
    imported++;
  }

  return { imported, duplicates };
}

// ---------------------------------------------------------------------------
// getBankTransactions
// ---------------------------------------------------------------------------

export async function getBankTransactions(
  db: Database,
  params: {
    orgId: string;
    bankAccountId: string;
    status?: BankTransactionStatus;
    page?: number;
    pageSize?: number;
  },
) {
  const conditions = [
    eq(bankTransactions.orgId, params.orgId),
    eq(bankTransactions.bankAccountId, params.bankAccountId),
  ];

  if (params.status) {
    conditions.push(eq(bankTransactions.status, params.status));
  }

  const pageSize = params.pageSize ?? 50;
  const page = params.page ?? 1;

  const rows = await db
    .select({
      id: bankTransactions.id,
      orgId: bankTransactions.orgId,
      bankAccountId: bankTransactions.bankAccountId,
      date: bankTransactions.date,
      amountCents: bankTransactions.amountCents,
      description: bankTransactions.description,
      referenceNumber: bankTransactions.referenceNumber,
      status: bankTransactions.status,
      journalEntryId: bankTransactions.journalEntryId,
      journalEntryNumber: journalEntries.entryNumber,
      createdAt: bankTransactions.createdAt,
      updatedAt: bankTransactions.updatedAt,
    })
    .from(bankTransactions)
    .leftJoin(
      journalEntries,
      and(
        eq(journalEntries.id, bankTransactions.journalEntryId),
        eq(journalEntries.orgId, params.orgId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(bankTransactions.date))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return rows;
}

// ---------------------------------------------------------------------------
// matchBankTransaction
// ---------------------------------------------------------------------------

export async function matchBankTransaction(
  db: Database,
  params: {
    orgId: string;
    bankTransactionId: string;
    journalEntryId: string;
  },
) {
  return db.transaction(async (tx) => {
    const txn = await tx.query.bankTransactions.findFirst({
      where: and(
        eq(bankTransactions.id, params.bankTransactionId),
        eq(bankTransactions.orgId, params.orgId),
      ),
    });
    if (!txn) throw notFound("Bank transaction not found");

    const entry = await tx.query.journalEntries.findFirst({
      where: and(
        eq(journalEntries.id, params.journalEntryId),
        eq(journalEntries.orgId, params.orgId),
      ),
    });
    if (!entry) throw notFound("Journal entry not found");

    const [updated] = await tx
      .update(bankTransactions)
      .set({ status: "matched", journalEntryId: params.journalEntryId, updatedAt: new Date() })
      .where(
        and(
          eq(bankTransactions.id, params.bankTransactionId),
          eq(bankTransactions.orgId, params.orgId),
        ),
      )
      .returning();

    return updated!;
  });
}

// ---------------------------------------------------------------------------
// ignoreBankTransaction
// ---------------------------------------------------------------------------

export async function ignoreBankTransaction(
  db: Database,
  params: { orgId: string; bankTransactionId: string },
) {
  const [updated] = await db
    .update(bankTransactions)
    .set({ status: "ignored", updatedAt: new Date() })
    .where(
      and(
        eq(bankTransactions.id, params.bankTransactionId),
        eq(bankTransactions.orgId, params.orgId),
      ),
    )
    .returning();

  if (!updated) throw notFound("Bank transaction not found");
  return updated;
}

// ---------------------------------------------------------------------------
// unmatchBankTransaction
// ---------------------------------------------------------------------------

export async function unmatchBankTransaction(
  db: Database,
  params: { orgId: string; bankTransactionId: string },
) {
  const [updated] = await db
    .update(bankTransactions)
    .set({ status: "unmatched", journalEntryId: null, updatedAt: new Date() })
    .where(
      and(
        eq(bankTransactions.id, params.bankTransactionId),
        eq(bankTransactions.orgId, params.orgId),
      ),
    )
    .returning();

  if (!updated) throw notFound("Bank transaction not found");
  return updated;
}

// ---------------------------------------------------------------------------
// createReconciliation
// ---------------------------------------------------------------------------

export async function createReconciliation(
  db: Database,
  params: {
    orgId: string;
    bankAccountId: string;
    statementDate: string;
    statementEndingBalanceCents: number;
  },
) {
  const data = createReconciliationSchema.parse(params);

  const account = await db.query.bankAccounts.findFirst({
    where: and(
      eq(bankAccounts.id, data.bankAccountId),
      eq(bankAccounts.orgId, params.orgId),
      isNull(bankAccounts.deletedAt),
    ),
  });
  if (!account) throw notFound("Bank account not found");

  const [recon] = await db
    .insert(bankReconciliations)
    .values({
      orgId: params.orgId,
      bankAccountId: data.bankAccountId,
      statementDate: new Date(data.statementDate),
      statementEndingBalanceCents: data.statementEndingBalanceCents,
    })
    .returning();

  return recon!;
}

// ---------------------------------------------------------------------------
// completeReconciliation
// ---------------------------------------------------------------------------

export async function completeReconciliation(
  db: Database,
  params: { orgId: string; reconId: string },
) {
  return db.transaction(async (tx) => {
    const recon = await tx.query.bankReconciliations.findFirst({
      where: and(
        eq(bankReconciliations.id, params.reconId),
        eq(bankReconciliations.orgId, params.orgId),
        isNull(bankReconciliations.deletedAt),
      ),
      with: { bankAccount: true },
    });

    if (!recon) throw notFound("Reconciliation not found");

    if (recon.reconciledAt) {
      throw badRequest("Reconciliation is already completed.");
    }

    const bankAccount = recon.bankAccount;
    const statementDate = recon.statementDate;

    // Compute GL balance for the cash account up to statementDate
    let glBalanceCents = 0;
    if (bankAccount.glAccountId) {
      const [balRow] = await tx
        .select({
          totalDebit: sum(journalLines.debitCents),
          totalCredit: sum(journalLines.creditCents),
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
        .where(
          and(
            eq(journalLines.accountId, bankAccount.glAccountId),
            eq(journalLines.orgId, params.orgId),
            lte(journalEntries.date, statementDate),
          ),
        );

      const totalDebit = Number(balRow?.totalDebit ?? 0);
      const totalCredit = Number(balRow?.totalCredit ?? 0);
      // Cash is an asset (debit-normal)
      glBalanceCents = totalDebit - totalCredit;
    }

    // Uncleared transactions = unmatched bank transactions for this account up to statementDate
    const unclearedRows = await tx
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.bankAccountId, recon.bankAccountId),
          eq(bankTransactions.orgId, params.orgId),
          eq(bankTransactions.status, "unmatched"),
          lte(bankTransactions.date, statementDate),
        ),
      );

    // Sum uncleared: positive = credit/deposit, negative = debit/withdrawal
    let unclearedSum = 0;
    for (const row of unclearedRows) {
      unclearedSum += row.amountCents;
    }

    // Adjusted book balance = GL balance + uncleared transactions
    // (uncleared = items in bank but not yet in books, or vice versa)
    // Standard bank rec formula: GL balance + uncleared credits - uncleared debits = bank balance
    // Since amountCents = positive for credits, negative for debits, unclearedSum already handles both
    const adjustedBalance = glBalanceCents + unclearedSum;
    const diff = Math.abs(adjustedBalance - recon.statementEndingBalanceCents);

    if (diff > 1) {
      const fmt = (c: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
      throw badRequest(
        `Reconciliation out of balance: book balance is ${fmt(adjustedBalance)} but statement ending balance is ${fmt(recon.statementEndingBalanceCents)} (difference: ${fmt(adjustedBalance - recon.statementEndingBalanceCents)}).`,
      );
    }

    // Mark reconciliation as complete. The reconciledAt-null predicate makes
    // this an atomic claim: under READ COMMITTED two concurrent callers can
    // both pass the findFirst check above, but only one guarded UPDATE matches
    // an unreconciled row. The loser gets an empty result and must fail with a
    // conflict rather than double-stamping reconciledAt and re-marking journal
    // lines (check-then-act TOCTOU).
    const [completed] = await tx
      .update(bankReconciliations)
      .set({ reconciledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(bankReconciliations.id, params.reconId),
          eq(bankReconciliations.orgId, params.orgId),
          isNull(bankReconciliations.deletedAt),
          isNull(bankReconciliations.reconciledAt),
        ),
      )
      .returning();

    if (!completed) {
      throw conflict("Reconciliation was completed concurrently.");
    }

    // Write reconciliationId onto all journal lines linked to matched bank transactions
    // for this reconciliation's bank account
    const matchedTransactions = await tx
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.bankAccountId, recon.bankAccountId),
          eq(bankTransactions.orgId, params.orgId),
          eq(bankTransactions.status, "matched"),
          isNotNull(bankTransactions.journalEntryId),
          lte(bankTransactions.date, statementDate),
        ),
      );

    for (const txn of matchedTransactions) {
      if (txn.journalEntryId) {
        await tx
          .update(journalLines)
          .set({ reconciliationId: params.reconId })
          .where(
            and(
              eq(journalLines.journalEntryId, txn.journalEntryId),
              eq(journalLines.orgId, params.orgId),
              isNull(journalLines.reconciliationId),
            ),
          );
      }
    }

    return completed!;
  });
}

// ---------------------------------------------------------------------------
// cancelReconciliation — discards an in-progress (not-yet-completed) reconciliation
// ---------------------------------------------------------------------------

export async function cancelReconciliation(
  db: Database,
  params: { orgId: string; reconId: string; actorId: string },
) {
  await db.transaction(async (tx) => {
    const recon = await tx.query.bankReconciliations.findFirst({
      where: and(
        eq(bankReconciliations.id, params.reconId),
        eq(bankReconciliations.orgId, params.orgId),
        isNull(bankReconciliations.deletedAt),
      ),
    });

    if (!recon) throw notFound("Reconciliation not found");
    if (recon.reconciledAt) {
      throw badRequest("Cannot cancel a completed reconciliation.");
    }

    const deletedAt = new Date();
    const [deleted] = await tx
      .update(bankReconciliations)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(
        and(
          eq(bankReconciliations.id, params.reconId),
          eq(bankReconciliations.orgId, params.orgId),
          isNull(bankReconciliations.deletedAt),
        ),
      )
      .returning();

    if (!deleted) throw notFound("Reconciliation not found");

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "deleted",
      entityType: "bank_reconciliation",
      entityId: params.reconId,
      changes: {
        bankAccountId: recon.bankAccountId,
        statementDate: recon.statementDate,
        statementEndingBalanceCents: recon.statementEndingBalanceCents,
        deletedAt,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// getBankAccounts
// ---------------------------------------------------------------------------

export async function getBankAccounts(db: Database, params: { orgId: string }) {
  return db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.orgId, params.orgId), isNull(bankAccounts.deletedAt)))
    .orderBy(bankAccounts.name);
}

// ---------------------------------------------------------------------------
// createBankAccount
// ---------------------------------------------------------------------------

async function assertChartAccountBelongsToOrg(
  db: Database,
  params: { orgId: string; glAccountId: string },
) {
  const account = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.id, params.glAccountId),
      eq(chartOfAccounts.orgId, params.orgId),
      isNull(chartOfAccounts.deletedAt),
    ),
  });

  if (!account) {
    throw badRequest("GL account not found for this organization.");
  }
}

export async function createBankAccount(
  db: Database,
  params: {
    orgId: string;
    name: string;
    accountNumber?: string;
    glAccountId?: string;
  },
) {
  const data = createBankAccountSchema.parse(params);

  if (data.glAccountId) {
    await assertChartAccountBelongsToOrg(db, {
      orgId: params.orgId,
      glAccountId: data.glAccountId,
    });
  }

  const [row] = await db
    .insert(bankAccounts)
    .values({
      orgId: params.orgId,
      name: data.name,
      accountNumber: data.accountNumber ?? null,
      glAccountId: data.glAccountId ?? null,
    })
    .returning();

  return row!;
}

// ---------------------------------------------------------------------------
// updateBankAccount
// ---------------------------------------------------------------------------

export async function updateBankAccount(
  db: Database,
  params: {
    orgId: string;
    bankAccountId: string;
    name?: string;
    accountNumber?: string | null;
    glAccountId?: string | null;
  },
) {
  const data = updateBankAccountSchema.parse(params);

  const existing = await db.query.bankAccounts.findFirst({
    where: and(
      eq(bankAccounts.id, params.bankAccountId),
      eq(bankAccounts.orgId, params.orgId),
      isNull(bankAccounts.deletedAt),
    ),
  });
  if (!existing) throw notFound("Bank account not found");

  const payload: Partial<typeof bankAccounts.$inferInsert> = { updatedAt: new Date() };
  if (data.name !== undefined) payload.name = data.name;
  if ("accountNumber" in params) payload.accountNumber = data.accountNumber ?? null;
  if ("glAccountId" in params) {
    if (data.glAccountId) {
      await assertChartAccountBelongsToOrg(db, {
        orgId: params.orgId,
        glAccountId: data.glAccountId,
      });
    }
    payload.glAccountId = data.glAccountId ?? null;
  }

  const [row] = await db
    .update(bankAccounts)
    .set(payload)
    .where(
      and(
        eq(bankAccounts.id, params.bankAccountId),
        eq(bankAccounts.orgId, params.orgId),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .returning();

  return row!;
}

// ---------------------------------------------------------------------------
// deleteBankAccount
// ---------------------------------------------------------------------------

export async function deleteBankAccount(
  db: Database,
  params: { orgId: string; bankAccountId: string },
) {
  const deleted = await db
    .update(bankAccounts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(bankAccounts.id, params.bankAccountId),
        eq(bankAccounts.orgId, params.orgId),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .returning();

  if (deleted.length === 0) throw notFound("Bank account not found");
}

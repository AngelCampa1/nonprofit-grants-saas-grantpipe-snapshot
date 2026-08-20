import { eq, max } from "drizzle-orm";
import { journalEntries } from "@grantpipe/db";
import type { TransactionDatabase } from "@grantpipe/db";
import { conflict } from "../../lib/app-error";

export const JOURNAL_ENTRY_NUMBER_MAX_ATTEMPTS = 5;

type JournalEntryRow = typeof journalEntries.$inferSelect;
type JournalEntryInsertValues = Omit<typeof journalEntries.$inferInsert, "orgId" | "entryNumber">;

type ReturningBuilder = {
  returning: () => Promise<JournalEntryRow[]>;
};

type ConflictAwareBuilder = ReturningBuilder & {
  onConflictDoNothing: (config: {
    target: [typeof journalEntries.orgId, typeof journalEntries.entryNumber];
  }) => ReturningBuilder;
};

export async function getNextJournalEntryNumber(
  tx: TransactionDatabase,
  orgId: string,
): Promise<number> {
  const [row] = await tx
    .select({ max: max(journalEntries.entryNumber) })
    .from(journalEntries)
    .where(eq(journalEntries.orgId, orgId));
  return (row?.max ?? 0) + 1;
}

export async function insertJournalEntryWithNextNumber(
  tx: TransactionDatabase,
  params: {
    orgId: string;
    values: JournalEntryInsertValues;
  },
): Promise<JournalEntryRow> {
  for (let attempt = 1; attempt <= JOURNAL_ENTRY_NUMBER_MAX_ATTEMPTS; attempt += 1) {
    const entryNumber = await getNextJournalEntryNumber(tx, params.orgId);
    const insertBuilder = tx.insert(journalEntries).values({
      ...params.values,
      orgId: params.orgId,
      entryNumber,
    }) as unknown as ConflictAwareBuilder;

    const returningBuilder = insertBuilder.onConflictDoNothing({
      target: [journalEntries.orgId, journalEntries.entryNumber],
    });

    const [entry] = await returningBuilder.returning();
    if (entry) return entry;
  }

  throw conflict("Could not allocate a journal entry number. Please retry.");
}

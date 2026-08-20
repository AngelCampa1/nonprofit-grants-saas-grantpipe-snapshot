import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { fiscalPeriods, journalLines, recurringJournalTemplates } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { CreateRecurringTemplateInput, UpdateRecurringTemplateInput } from "@grantpipe/shared";
import { badRequest, notFound } from "../../lib/app-error";
import { captureBackgroundException } from "../../lib/sentry";
import { insertJournalEntryWithNextNumber } from "./journalEntryNumber";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateLinesBalance(lines: Array<{ debitCents: number; creditCents: number }>): void {
  const totalDebits = lines.reduce((s, l) => s + l.debitCents, 0);
  const totalCredits = lines.reduce((s, l) => s + l.creditCents, 0);
  if (totalDebits !== totalCredits) {
    throw badRequest(
      `Template lines are not balanced: total debits (${totalDebits}) must equal total credits (${totalCredits})`,
    );
  }
}

/**
 * Advances a date by a given number of months, clamping to the last day of the
 * target month when the original day overflows (e.g. Jan 31 + 1 month → Feb 28/29,
 * Feb 29 + 12 months → Feb 28 in a non-leap year).
 */
function advanceByMonths(date: Date, months: number): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const target = new Date(y, m + months, d);
  // JS auto-wraps day overflows into the next month (e.g. new Date(2025, 1, 29) → Mar 1).
  // Detect overflow: expected month is (m + months) mod 12, normalised to [0, 11].
  const expectedMonth = (((m + months) % 12) + 12) % 12;
  if (target.getMonth() !== expectedMonth) {
    // Back up to the last day of the correct target month.
    return new Date(y, m + months + 1, 0);
  }
  return target;
}

function advanceDate(date: Date, frequency: "monthly" | "quarterly" | "annually"): Date {
  switch (frequency) {
    case "monthly":
      return advanceByMonths(date, 1);
    case "quarterly":
      return advanceByMonths(date, 3);
    case "annually":
      return advanceByMonths(date, 12);
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createRecurringTemplate(
  db: Database,
  params: { orgId: string; actorId: string } & CreateRecurringTemplateInput,
) {
  validateLinesBalance(params.lines);

  const [row] = await db
    .insert(recurringJournalTemplates)
    .values({
      orgId: params.orgId,
      name: params.name,
      description: params.description,
      frequency: params.frequency,
      nextRunDate: new Date(params.nextRunDate),
      isActive: params.isActive ?? true,
      fiscalPeriodId: params.fiscalPeriodId ?? null,
      memo: params.memo ?? null,
      lines: params.lines,
      createdBy: params.actorId,
    })
    .returning();

  return row!;
}

export async function updateRecurringTemplate(
  db: Database,
  params: { orgId: string; templateId: string } & UpdateRecurringTemplateInput,
) {
  const existing = await db.query.recurringJournalTemplates.findFirst({
    where: and(
      eq(recurringJournalTemplates.id, params.templateId),
      eq(recurringJournalTemplates.orgId, params.orgId),
      isNull(recurringJournalTemplates.deletedAt),
    ),
  });
  if (!existing) throw notFound("Recurring template not found");

  if (params.lines !== undefined) {
    validateLinesBalance(params.lines);
  }

  const payload: Partial<typeof recurringJournalTemplates.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (params.name !== undefined) payload.name = params.name;
  if ("description" in params) payload.description = params.description ?? null;
  if (params.frequency !== undefined) payload.frequency = params.frequency;
  if (params.nextRunDate !== undefined) payload.nextRunDate = new Date(params.nextRunDate);
  if (params.isActive !== undefined) payload.isActive = params.isActive;
  if ("fiscalPeriodId" in params) payload.fiscalPeriodId = params.fiscalPeriodId ?? null;
  if ("memo" in params) payload.memo = params.memo ?? null;
  if (params.lines !== undefined) payload.lines = params.lines;

  const [row] = await db
    .update(recurringJournalTemplates)
    .set(payload)
    .where(
      and(
        eq(recurringJournalTemplates.id, params.templateId),
        eq(recurringJournalTemplates.orgId, params.orgId),
        isNull(recurringJournalTemplates.deletedAt),
      ),
    )
    .returning();

  return row!;
}

export async function deleteRecurringTemplate(
  db: Database,
  params: { orgId: string; templateId: string },
) {
  const existing = await db.query.recurringJournalTemplates.findFirst({
    where: and(
      eq(recurringJournalTemplates.id, params.templateId),
      eq(recurringJournalTemplates.orgId, params.orgId),
      isNull(recurringJournalTemplates.deletedAt),
    ),
  });
  if (!existing) throw notFound("Recurring template not found");

  await db
    .update(recurringJournalTemplates)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(recurringJournalTemplates.id, params.templateId),
        eq(recurringJournalTemplates.orgId, params.orgId),
        isNull(recurringJournalTemplates.deletedAt),
      ),
    );
}

export async function getRecurringTemplate(
  db: Database,
  params: { orgId: string; templateId: string },
) {
  const template = await db.query.recurringJournalTemplates.findFirst({
    where: and(
      eq(recurringJournalTemplates.id, params.templateId),
      eq(recurringJournalTemplates.orgId, params.orgId),
      isNull(recurringJournalTemplates.deletedAt),
    ),
  });
  if (!template) throw notFound("Recurring template not found");
  return template;
}

export async function listRecurringTemplates(
  db: Database,
  params: { orgId: string; isActive?: boolean },
) {
  const conditions = [
    eq(recurringJournalTemplates.orgId, params.orgId),
    isNull(recurringJournalTemplates.deletedAt),
  ];
  if (params.isActive !== undefined) {
    conditions.push(eq(recurringJournalTemplates.isActive, params.isActive));
  }
  return db
    .select()
    .from(recurringJournalTemplates)
    .where(and(...conditions))
    .orderBy(asc(recurringJournalTemplates.name));
}

// ---------------------------------------------------------------------------
// runTemplate — executes a single template, generating a JE
// ---------------------------------------------------------------------------

export async function runTemplate(
  db: Database,
  params: { orgId: string; actorId: string; templateId: string },
): Promise<{ journalEntryId: string; nextRunDate: Date }> {
  const template = await db.query.recurringJournalTemplates.findFirst({
    where: and(
      eq(recurringJournalTemplates.id, params.templateId),
      eq(recurringJournalTemplates.orgId, params.orgId),
      isNull(recurringJournalTemplates.deletedAt),
    ),
  });
  if (!template) throw notFound("Recurring template not found");

  const now = new Date();

  // Resolve the fiscal period: use template's override if set, otherwise find the current open period
  let resolvedPeriodId: string;

  if (template.fiscalPeriodId) {
    resolvedPeriodId = template.fiscalPeriodId;
  } else {
    const period = await db.query.fiscalPeriods.findFirst({
      where: and(
        eq(fiscalPeriods.orgId, params.orgId),
        eq(fiscalPeriods.status, "open"),
        lte(fiscalPeriods.startDate, now),
        gte(fiscalPeriods.endDate, now),
      ),
    });
    if (!period) {
      throw badRequest("No open fiscal period for current date");
    }
    resolvedPeriodId = period.id;
  }

  const nextRunDate = advanceDate(template.nextRunDate, template.frequency);

  const journalEntryId = await db.transaction(async (tx) => {
    const entry = await insertJournalEntryWithNextNumber(tx, {
      orgId: params.orgId,
      values: {
        date: now,
        fiscalPeriodId: resolvedPeriodId,
        memo: template.memo ?? null,
        source: "recurring",
        sourceTable: "recurring_journal_templates",
        sourceId: template.id,
        postedBy: params.actorId,
        isAdjusting: false,
      },
    });

    const lineValues = template.lines.map((line, idx) => ({
      orgId: params.orgId,
      journalEntryId: entry.id,
      lineNumber: idx + 1,
      accountId: line.accountId,
      fundId: line.fundId ?? null,
      grantId: line.grantId ?? null,
      debitCents: line.debitCents,
      creditCents: line.creditCents,
      memo: line.memo ?? null,
    }));

    await tx.insert(journalLines).values(lineValues);

    await tx
      .update(recurringJournalTemplates)
      .set({ nextRunDate, updatedAt: new Date() })
      .where(eq(recurringJournalTemplates.id, template.id));

    return entry.id;
  });

  return { journalEntryId, nextRunDate };
}

// ---------------------------------------------------------------------------
// tickRecurring — scheduled worker handler
// ---------------------------------------------------------------------------

export async function tickRecurring(db: Database): Promise<{ ran: number; errors: number }> {
  const now = new Date();

  const dueTemplates = await db
    .select()
    .from(recurringJournalTemplates)
    .where(
      and(
        eq(recurringJournalTemplates.isActive, true),
        lte(recurringJournalTemplates.nextRunDate, now),
        isNull(recurringJournalTemplates.deletedAt),
      ),
    );

  let ran = 0;
  let errors = 0;

  for (const template of dueTemplates) {
    try {
      await runTemplate(db, {
        orgId: template.orgId,
        actorId: template.createdBy,
        templateId: template.id,
      });
      ran++;
    } catch (err) {
      console.error(`tickRecurring: failed for template ${template.id}:`, err);
      // Per-template failures are counted but not rethrown, so the scheduled-job
      // wrapper never sees them — capture each one explicitly or it is lost.
      captureBackgroundException(err, "accounting-recurring", {
        template_id: template.id,
        org_id: template.orgId,
      });
      errors++;
    }
  }

  return { ran, errors };
}

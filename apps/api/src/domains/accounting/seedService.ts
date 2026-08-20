import { and, asc, count as drizzleCount, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { donations, expenses, fiscalPeriods, organizations } from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import { AppError, badRequest } from "../../lib/app-error";
import { captureBackgroundException } from "../../lib/sentry";
import { postDonation, postExpense } from "./postingEngine";

/**
 * Builds a client-safe per-record error string for the seed result. Only
 * intentional AppError messages (application-defined, e.g. "Donation already
 * posted") are surfaced. Raw errors — Drizzle/Postgres failures that can carry
 * SQL fragments, table/column/constraint names, or connection detail — are
 * logged server-side and reduced to a generic message so nothing internal
 * leaks through the seeder's response body.
 */
function describeSeedError(kind: string, id: string, err: unknown, orgId: string): string {
  if (err instanceof AppError) {
    return `${kind} ${id}: ${err.message}`;
  }
  console.error("[seedOpeningBalances] posting failed", {
    kind,
    id,
    errorType: err instanceof Error ? err.name : typeof err,
  });
  captureBackgroundException(new Error("Opening balance posting failed"), "opening_balances", {
    org_id: orgId,
    kind,
    operation: "seed_posting",
  });
  return `${kind} ${id}: posting failed`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeedResult {
  dryRun: boolean;
  donations: number;
  expenses: number;
  estimatedJEs: number;
  fiscalPeriodCreated: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveOpeningRange(
  db: Database | TransactionDatabase,
  orgId: string,
): Promise<{ orgCreatedAt: Date; openingEnd: Date; accountingEnabled: boolean }> {
  // 1. Fetch org (need createdAt and accountingEnabled)
  const [org] = await db
    .select({
      createdAt: organizations.createdAt,
      accountingEnabled: organizations.accountingEnabled,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId));

  if (!org) {
    throw badRequest("Organization not found");
  }

  // 2. Find first real fiscal period (earliest startDate)
  const firstPeriods = await db
    .select({ startDate: fiscalPeriods.startDate })
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.orgId, orgId))
    .orderBy(asc(fiscalPeriods.startDate))
    .limit(1)
    .offset(0);

  let openingEnd: Date;
  if (firstPeriods.length > 0) {
    // Opening end = one millisecond before first real period starts, keeping periods contiguous.
    const firstStart = firstPeriods[0]!.startDate;
    openingEnd = new Date(firstStart.getTime() - 1);
  } else {
    // No fiscal periods yet — close through end of today (UTC) so that any future period
    // starting tomorrow does not overlap and the full current day is covered.
    const now = new Date();
    openingEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    );
  }

  return {
    orgCreatedAt: org.createdAt,
    openingEnd,
    accountingEnabled: org.accountingEnabled,
  };
}

async function countDonationsInRange(
  db: Database | TransactionDatabase,
  orgId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: drizzleCount() })
    .from(donations)
    .where(
      and(
        eq(donations.orgId, orgId),
        isNull(donations.deletedAt),
        gte(donations.createdAt, from),
        lte(donations.createdAt, to),
      ),
    );
  return row?.count ?? 0;
}

async function countExpensesInRange(
  db: Database | TransactionDatabase,
  orgId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: drizzleCount() })
    .from(expenses)
    .where(
      and(
        eq(expenses.orgId, orgId),
        isNull(expenses.deletedAt),
        isNotNull(expenses.accountId),
        gte(expenses.createdAt, from),
        lte(expenses.createdAt, to),
      ),
    );
  return row?.count ?? 0;
}

async function fetchDonationsInRange(
  db: Database | TransactionDatabase,
  orgId: string,
  from: Date,
  to: Date,
): Promise<Array<{ id: string }>> {
  return db
    .select({ id: donations.id })
    .from(donations)
    .where(
      and(
        eq(donations.orgId, orgId),
        isNull(donations.deletedAt),
        gte(donations.createdAt, from),
        lte(donations.createdAt, to),
      ),
    );
}

async function fetchExpensesInRange(
  db: Database | TransactionDatabase,
  orgId: string,
  from: Date,
  to: Date,
): Promise<Array<{ id: string }>> {
  return db
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      and(
        eq(expenses.orgId, orgId),
        isNull(expenses.deletedAt),
        isNotNull(expenses.accountId),
        gte(expenses.createdAt, from),
        lte(expenses.createdAt, to),
      ),
    );
}

// ---------------------------------------------------------------------------
// seedOpeningBalances
// ---------------------------------------------------------------------------

export async function seedOpeningBalances(
  db: Database,
  params: { orgId: string; actorId: string; dryRun: boolean },
): Promise<SeedResult> {
  const { orgId, actorId, dryRun } = params;

  // Step 1: Resolve date range (and check accounting enabled for writes)
  const { orgCreatedAt, openingEnd, accountingEnabled } = await resolveOpeningRange(db, orgId);

  // Dry-run is read-only, so it works before accounting is enabled (used for preview).
  // Actual seeding requires accounting to be enabled first.
  if (!dryRun && !accountingEnabled) {
    throw badRequest("Accounting must be enabled before seeding opening balances");
  }

  const openingStart = orgCreatedAt;

  if (openingEnd <= openingStart) {
    throw badRequest(
      "No pre-accounting period exists: all historical data falls within existing fiscal periods",
    );
  }

  // Step 2: Dry run — count only, no writes
  if (dryRun) {
    const donationCount = await countDonationsInRange(db, orgId, openingStart, openingEnd);
    const expenseCount = await countExpensesInRange(db, orgId, openingStart, openingEnd);
    const estimatedJEs = donationCount + expenseCount * 2;

    return {
      dryRun: true,
      donations: donationCount,
      expenses: expenseCount,
      estimatedJEs,
      fiscalPeriodCreated: false,
      errors: [],
    };
  }

  // Step 3: Full commit — run inside transaction
  return db.transaction(async (tx) => {
    // Check for existing opening period (idempotency guard)
    const [existing] = await tx
      .select({ id: fiscalPeriods.id })
      .from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.name, "Opening Balances")));

    if (existing) {
      throw badRequest("Opening balances have already been seeded for this organization");
    }

    // Create the opening balances fiscal period.
    // Use epoch as startDate so it covers all possible historical donation/expense dates,
    // regardless of when the organization record was created.
    const EPOCH = new Date(0);
    const [period] = await tx
      .insert(fiscalPeriods)
      .values({
        orgId,
        name: "Opening Balances",
        startDate: EPOCH,
        endDate: openingEnd,
        status: "open",
      })
      .returning();

    const periodId = period!.id;

    // Fetch all donations in range
    const donationRows = await fetchDonationsInRange(
      tx as TransactionDatabase,
      orgId,
      openingStart,
      openingEnd,
    );

    // Fetch all expenses in range (with accountId)
    const expenseRows = await fetchExpensesInRange(
      tx as TransactionDatabase,
      orgId,
      openingStart,
      openingEnd,
    );

    const errors: string[] = [];

    // Post donations
    for (const donation of donationRows) {
      try {
        await postDonation(tx as TransactionDatabase, {
          orgId,
          actorId,
          donationId: donation.id,
          action: "create",
        });
      } catch (err) {
        errors.push(describeSeedError("donation", donation.id, err, orgId));
      }
    }

    // Post expenses
    for (const expense of expenseRows) {
      try {
        await postExpense(tx as TransactionDatabase, {
          orgId,
          actorId,
          expenseId: expense.id,
          action: "create",
        });
      } catch (err) {
        errors.push(describeSeedError("expense", expense.id, err, orgId));
      }
    }

    // Close the opening period
    await tx
      .update(fiscalPeriods)
      .set({ status: "closed" })
      .where(and(eq(fiscalPeriods.id, periodId), eq(fiscalPeriods.orgId, orgId)));

    return {
      dryRun: false,
      donations: donationRows.length,
      expenses: expenseRows.length,
      estimatedJEs: donationRows.length + expenseRows.length * 2,
      fiscalPeriodCreated: true,
      errors,
    };
  });
}

// ---------------------------------------------------------------------------
// getOpeningBalancePreview
// ---------------------------------------------------------------------------

export async function getOpeningBalancePreview(
  db: Database,
  params: { orgId: string },
): Promise<SeedResult> {
  const { orgId } = params;

  const { orgCreatedAt, openingEnd } = await resolveOpeningRange(db, orgId);

  const openingStart = orgCreatedAt;
  const donationCount = await countDonationsInRange(db, orgId, openingStart, openingEnd);
  const expenseCount = await countExpensesInRange(db, orgId, openingStart, openingEnd);
  const estimatedJEs = donationCount + expenseCount * 2;

  return {
    dryRun: true,
    donations: donationCount,
    expenses: expenseCount,
    estimatedJEs,
    fiscalPeriodCreated: false,
    errors: [],
  };
}

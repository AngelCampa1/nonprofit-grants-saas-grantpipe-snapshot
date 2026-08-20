import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { expenses, funds, grantFundAllocations, grants, type Database } from "@grantpipe/db";
import { notFound } from "../../lib/app-error";
import { calculateGrantBurnRate } from "./summary";

type ThresholdState = "80" | "90" | "100" | null;

function deriveThresholdState(ratio: number): ThresholdState {
  if (ratio >= 1) return "100";
  if (ratio >= 0.9) return "90";
  if (ratio >= 0.8) return "80";
  return null;
}

export async function getGrantSpendDown(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    grantId: string;
    from?: Date;
    to?: Date;
    now?: Date;
  },
) {
  const now = params.now ?? new Date();

  // 1. Fetch grant
  const grant = await db.query.grants.findFirst({
    where: and(
      eq(grants.id, params.grantId),
      params.entityId ? eq(grants.entityId, params.entityId) : undefined,
      isNull(grants.deletedAt),
    ),
    columns: {
      id: true,
      orgId: true,
      name: true,
      amountCents: true,
      startDate: true,
    },
  });

  if (!grant || grant.orgId !== params.orgId) {
    throw notFound("Grant not found");
  }

  // 2. Fetch live allocations with fund names (filter fund soft-deletes)
  const allocationRows = await db
    .select({
      id: grantFundAllocations.id,
      grantId: grantFundAllocations.grantId,
      fundId: grantFundAllocations.fundId,
      deletedAt: grantFundAllocations.deletedAt,
      allocatedAmountCents: grantFundAllocations.allocatedAmountCents,
      fund_id: funds.id,
      fund_name: funds.name,
      fund_deletedAt: funds.deletedAt,
    })
    .from(grantFundAllocations)
    .leftJoin(
      funds,
      and(
        eq(grantFundAllocations.fundId, funds.id),
        eq(funds.orgId, params.orgId),
        params.entityId ? eq(funds.entityId, params.entityId) : undefined,
      ),
    )
    // Allocations are tenant-scoped through their grant (already org-verified
    // above); grant_fund_allocations has no org_id column. Filter soft-deletes
    // at the DB level rather than relying solely on the in-memory filter below.
    .where(
      and(
        eq(grantFundAllocations.grantId, params.grantId),
        params.entityId ? eq(grantFundAllocations.entityId, params.entityId) : undefined,
        isNull(grantFundAllocations.deletedAt),
      ),
    );

  const liveAllocations = allocationRows.filter(
    (row) => row.deletedAt == null && row.fund_id != null && row.fund_deletedAt == null,
  );

  // 3. Fetch live expenses for this grant filtered by date range
  const expenseFilters = [
    eq(expenses.orgId, params.orgId),
    params.entityId ? eq(expenses.entityId, params.entityId) : undefined,
    eq(expenses.grantId, params.grantId),
    isNull(expenses.deletedAt),
  ];
  if (params.from) {
    expenseFilters.push(gte(expenses.date, params.from));
  }
  if (params.to) {
    expenseFilters.push(lte(expenses.date, params.to));
  }

  const expenseRows = await db.query.expenses.findMany({
    where: and(...expenseFilters),
    columns: {
      id: true,
      fundId: true,
      amountCents: true,
      date: true,
      category: true,
      deletedAt: true,
    },
  });

  const liveExpenses = expenseRows.filter((e) => e.deletedAt == null);

  // 4. Compute totals
  const expensesCents = liveExpenses.reduce((sum, e) => sum + e.amountCents, 0);
  const budgetCents = grant.amountCents ?? null;
  const remainingCents = budgetCents != null ? budgetCents - expensesCents : null;
  const thresholdState =
    budgetCents != null && budgetCents > 0
      ? deriveThresholdState(expensesCents / budgetCents)
      : null;

  const burnRateCentsPerMonth = calculateGrantBurnRate({
    expenseTotalCents: expensesCents,
    startDate: grant.startDate,
    now,
  });

  let projectedExhaustionDate: string | null = null;
  if (
    remainingCents != null &&
    remainingCents > 0 &&
    burnRateCentsPerMonth != null &&
    burnRateCentsPerMonth > 0
  ) {
    const monthsRemaining = remainingCents / burnRateCentsPerMonth;
    const exhaustionMs = now.getTime() + monthsRemaining * 30 * 24 * 60 * 60 * 1000;
    projectedExhaustionDate = new Date(exhaustionMs).toISOString();
  }

  // 5. byCategory
  const categoryMap = new Map<string, number>();
  for (const expense of liveExpenses) {
    const cat = expense.category ?? "Uncategorized";
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + expense.amountCents);
  }
  const byCategory = [...categoryMap.entries()]
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);

  // 6. byFund
  const byFund = liveAllocations.map((alloc) => {
    const fundExpenses = liveExpenses.filter((e) => e.fundId === alloc.fundId);
    const fundExpensesCents = fundExpenses.reduce((sum, e) => sum + e.amountCents, 0);
    return {
      fundId: alloc.fundId,
      fundName: alloc.fund_name ?? alloc.fundId,
      allocatedAmountCents: alloc.allocatedAmountCents,
      expensesCents: fundExpensesCents,
    };
  });

  // 7. byMonth
  const monthMap = new Map<string, number>();
  for (const expense of liveExpenses) {
    const month = expense.date.toISOString().substring(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + expense.amountCents);
  }
  const byMonth = [...monthMap.entries()]
    .map(([month, amountCents]) => ({ month, amountCents }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    budgetCents,
    expensesCents,
    remainingCents,
    burnRateCentsPerMonth,
    projectedExhaustionDate,
    thresholdState,
    byCategory,
    byFund,
    byMonth,
  };
}

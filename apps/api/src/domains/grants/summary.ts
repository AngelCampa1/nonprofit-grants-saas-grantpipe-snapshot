import type { ReportStatus } from "@grantpipe/shared";

type ThresholdState = "80" | "90" | "100" | null;

function deriveThresholdState(ratio: number): ThresholdState {
  if (ratio >= 1) return "100";
  if (ratio >= 0.9) return "90";
  if (ratio >= 0.8) return "80";
  return null;
}

export function normalizeMetricValue(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function deriveRequirementStatus(
  requirement: {
    status: ReportStatus;
    dueDate: string | Date;
  },
  now = new Date(),
): ReportStatus {
  if (requirement.status === "submitted") return "submitted";

  const dueDate =
    requirement.dueDate instanceof Date ? requirement.dueDate : new Date(requirement.dueDate);

  if (dueDate < now) {
    return "overdue";
  }

  return requirement.status;
}

export function buildGrantSummary(input: {
  grantAmountCents: number | null;
  allocationTotalCents: number;
  expenseTotalCents: number;
}) {
  const budget = input.grantAmountCents;
  const budgetCents = budget ?? 0;
  // Postgres SUM() returns strings through the node-postgres driver, and raw
  // sql<number> aggregates do not get drizzle's .mapWith(Number). Coerce here
  // so the pass-through totals never leak to the client as strings.
  const allocationTotalCents = Number(input.allocationTotalCents);
  const expenseTotalCents = Number(input.expenseTotalCents);
  const expenseRatio = budget != null && budget > 0 ? expenseTotalCents / budget : 0;
  const allocationCoverageRatio = budget != null && budget > 0 ? allocationTotalCents / budget : 0;

  return {
    allocationCoverageRatio,
    allocatedTotalCents: allocationTotalCents,
    expenseRatio,
    remainingBalanceCents: budget == null ? null : budgetCents - expenseTotalCents,
    unallocatedBalanceCents: budget == null ? null : budgetCents - allocationTotalCents,
    thresholdState: budget != null && budget > 0 ? deriveThresholdState(expenseRatio) : null,
  };
}

export function calculateGrantBurnRate(input: {
  expenseTotalCents: number;
  startDate: string | Date | null | undefined;
  now?: Date;
}) {
  if (!input.startDate) return null;

  const startDate = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
  const now = input.now ?? new Date();
  const elapsedMs = now.getTime() - startDate.getTime();

  if (elapsedMs <= 0) return null;

  const elapsedMonths = elapsedMs / (1000 * 60 * 60 * 24 * 30);
  if (elapsedMonths <= 0) return null;

  return Math.round(input.expenseTotalCents / elapsedMonths);
}

export function buildFundSummary(input: {
  allocatedTotalCents: number;
  expenseTotalCents: number;
}) {
  // Coerce pg-driver string aggregates (see buildGrantSummary) so the cents
  // totals are real numbers, not strings, when returned to the client.
  const allocatedTotalCents = Number(input.allocatedTotalCents);
  const expenseTotalCents = Number(input.expenseTotalCents);
  const expenseRatio = allocatedTotalCents > 0 ? expenseTotalCents / allocatedTotalCents : 0;

  return {
    allocatedTotalCents,
    expenseTotalCents,
    currentBalanceCents: allocatedTotalCents - expenseTotalCents,
    expenseRatio,
    thresholdState: allocatedTotalCents > 0 ? deriveThresholdState(expenseRatio) : null,
  };
}

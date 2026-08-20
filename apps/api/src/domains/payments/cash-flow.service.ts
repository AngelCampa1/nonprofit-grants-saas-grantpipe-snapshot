import { sql } from "drizzle-orm";
import type { Database } from "@grantpipe/db";
import type { PaymentEntityScope } from "./entity-scope";

export type CashFlowRiskLevel = "critical" | "warning" | "watch";

export type CashFlowRadarRow = {
  grantId: string;
  grantName: string;
  grantStatus: string;
  grantAmountCents: number | null;
  grantEndDate: Date | string | null;
  eligibleExpenseCents: number | string | null;
  oldestUnrequestedExpenseDate: Date | string | null;
  claimedCents: number | string | null;
  submittedCents: number | string | null;
  approvedOutstandingCents: number | string | null;
  paidCents: number | string | null;
};

export type CashFlowRadarWorkItem = {
  grantId: string;
  grantName: string;
  grantStatus: string;
  grantAmountCents: number | null;
  grantEndDate: string | null;
  eligibleExpenseCents: number;
  unrequestedExpenseCents: number;
  submittedCents: number;
  approvedOutstandingCents: number;
  paidCents: number;
  totalCashGapCents: number;
  oldestUnrequestedExpenseDate: string | null;
  daysSinceOldestUnrequestedExpense: number | null;
  riskLevel: CashFlowRiskLevel;
  recommendedAction: string;
};

export type CashFlowRadarSummary = {
  totals: {
    eligibleExpenseCents: number;
    unrequestedExpenseCents: number;
    submittedCents: number;
    approvedOutstandingCents: number;
    totalCashGapCents: number;
    criticalCount: number;
    warningCount: number;
  };
  worklist: CashFlowRadarWorkItem[];
};

function getResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result === "object" && result !== null) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIsoDate(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function daysBetween(start: Date | string | null, end: Date): number | null {
  if (!start) return null;
  const startDate = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const ms = end.getTime() - startDate.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function riskLevelFor(params: {
  totalCashGapCents: number;
  grantAmountCents: number | null;
  daysSinceOldestUnrequestedExpense: number | null;
  approvedOutstandingCents: number;
}): CashFlowRiskLevel {
  const grantShare =
    params.grantAmountCents && params.grantAmountCents > 0
      ? params.totalCashGapCents / params.grantAmountCents
      : 0;

  if (
    params.approvedOutstandingCents >= 25_000 ||
    (params.daysSinceOldestUnrequestedExpense !== null &&
      params.daysSinceOldestUnrequestedExpense >= 30) ||
    grantShare >= 0.25
  ) {
    return "critical";
  }

  if (
    params.totalCashGapCents >= 10_000 ||
    (params.daysSinceOldestUnrequestedExpense !== null &&
      params.daysSinceOldestUnrequestedExpense >= 14)
  ) {
    return "warning";
  }

  return "watch";
}

function recommendedActionFor(params: {
  unrequestedExpenseCents: number;
  approvedOutstandingCents: number;
  submittedCents: number;
}): string {
  if (params.unrequestedExpenseCents > 0) {
    return "Create a reimbursement request for posted eligible expenses.";
  }
  if (params.approvedOutstandingCents > 0) {
    return "Record cash when the funder payment arrives.";
  }
  return "Follow up on submitted requests.";
}

export function summarizeCashFlowRadarRows(
  rows: CashFlowRadarRow[],
  options?: { asOf?: Date },
): CashFlowRadarSummary {
  const asOf = options?.asOf ?? new Date();
  const worklist = rows
    .map((row): CashFlowRadarWorkItem | null => {
      const eligibleExpenseCents = toNumber(row.eligibleExpenseCents);
      const claimedCents = toNumber(row.claimedCents);
      const submittedCents = toNumber(row.submittedCents);
      const approvedOutstandingCents = toNumber(row.approvedOutstandingCents);
      const paidCents = toNumber(row.paidCents);
      const unrequestedExpenseCents = Math.max(0, eligibleExpenseCents - claimedCents);
      const totalCashGapCents = unrequestedExpenseCents + submittedCents + approvedOutstandingCents;

      if (totalCashGapCents <= 0) return null;

      const grantAmountCents =
        row.grantAmountCents === null || row.grantAmountCents === undefined
          ? null
          : toNumber(row.grantAmountCents);
      const daysSinceOldestUnrequestedExpense = daysBetween(row.oldestUnrequestedExpenseDate, asOf);
      const riskLevel = riskLevelFor({
        totalCashGapCents,
        grantAmountCents,
        daysSinceOldestUnrequestedExpense,
        approvedOutstandingCents,
      });

      return {
        grantId: row.grantId,
        grantName: row.grantName,
        grantStatus: row.grantStatus,
        grantAmountCents,
        grantEndDate: toIsoDate(row.grantEndDate),
        eligibleExpenseCents,
        unrequestedExpenseCents,
        submittedCents,
        approvedOutstandingCents,
        paidCents,
        totalCashGapCents,
        oldestUnrequestedExpenseDate: toIsoDate(row.oldestUnrequestedExpenseDate),
        daysSinceOldestUnrequestedExpense,
        riskLevel,
        recommendedAction: recommendedActionFor({
          unrequestedExpenseCents,
          approvedOutstandingCents,
          submittedCents,
        }),
      };
    })
    .filter((item): item is CashFlowRadarWorkItem => item !== null)
    .sort((a, b) => b.totalCashGapCents - a.totalCashGapCents);

  return {
    totals: {
      eligibleExpenseCents: worklist.reduce((sum, row) => sum + row.eligibleExpenseCents, 0),
      unrequestedExpenseCents: worklist.reduce((sum, row) => sum + row.unrequestedExpenseCents, 0),
      submittedCents: worklist.reduce((sum, row) => sum + row.submittedCents, 0),
      approvedOutstandingCents: worklist.reduce(
        (sum, row) => sum + row.approvedOutstandingCents,
        0,
      ),
      totalCashGapCents: worklist.reduce((sum, row) => sum + row.totalCashGapCents, 0),
      criticalCount: worklist.filter((row) => row.riskLevel === "critical").length,
      warningCount: worklist.filter((row) => row.riskLevel === "warning").length,
    },
    worklist,
  };
}

export async function getReimbursementCashFlowRadar(
  db: Pick<Database, "execute">,
  params: PaymentEntityScope & { asOf?: Date },
): Promise<CashFlowRadarSummary> {
  const result = await db.execute(sql<CashFlowRadarRow>`
    with request_line_rollups as (
      select
        r.grant_id,
        coalesce(sum(l.amount_cents) filter (
          where r.status <> 'rejected'
            and l.deleted_at is null
        ), 0) as claimed_cents,
        coalesce(sum(l.amount_cents) filter (
          where r.status = 'submitted'
            and l.deleted_at is null
        ), 0) as submitted_cents
      from grant_payment_requests r
      left join grant_payment_request_lines l
        on l.request_id = r.id
        and l.org_id = r.org_id
        and l.deleted_at is null
      where r.org_id = ${params.orgId}
        and r.deleted_at is null
      group by r.grant_id
    ),
    payment_rollups as (
      select
        request_id,
        org_id,
        sum(amount_cents) as paid_cents
      from grant_payments
      where org_id = ${params.orgId}
        and deleted_at is null
      group by request_id, org_id
    ),
    request_status_rollups as (
      select
        r.grant_id,
        coalesce(sum(greatest(0, coalesce(r.approved_amount_cents, 0) - coalesce(p.paid_cents, 0))) filter (
          where r.status in ('approved', 'partially_approved')
        ), 0) as approved_outstanding_cents,
        coalesce(sum(coalesce(p.paid_cents, 0)), 0) as paid_cents
      from grant_payment_requests r
      left join payment_rollups p
        on p.request_id = r.id
        and p.org_id = r.org_id
      where r.org_id = ${params.orgId}
        and r.deleted_at is null
      group by r.grant_id
    ),
    eligible_expenses as (
      select
        e.grant_id,
        coalesce(sum(e.amount_cents), 0) as eligible_expense_cents,
        min(e.date) filter (
          where not exists (
            select 1
            from grant_payment_request_lines existing_line
            inner join grant_payment_requests existing_request
              on existing_request.id = existing_line.request_id
            where existing_line.expense_id = e.id
              and existing_line.org_id = e.org_id
              and existing_line.deleted_at is null
              and existing_request.org_id = e.org_id
              and existing_request.deleted_at is null
              and existing_request.status <> 'rejected'
          )
        ) as oldest_unrequested_expense_date
      from expenses e
      where e.org_id = ${params.orgId}
        and e.entity_id = ${params.entityId ?? ""}
        and e.grant_id is not null
        and e.reimbursable = true
        and e.deleted_at is null
      group by e.grant_id
    )
    select
      g.id as "grantId",
      g.name as "grantName",
      g.status as "grantStatus",
      g.amount_cents as "grantAmountCents",
      g.end_date as "grantEndDate",
      coalesce(ee.eligible_expense_cents, 0) as "eligibleExpenseCents",
      ee.oldest_unrequested_expense_date as "oldestUnrequestedExpenseDate",
      coalesce(lr.claimed_cents, 0) as "claimedCents",
      coalesce(lr.submitted_cents, 0) as "submittedCents",
      coalesce(sr.approved_outstanding_cents, 0) as "approvedOutstandingCents",
      coalesce(sr.paid_cents, 0) as "paidCents"
    from grants g
    left join eligible_expenses ee on ee.grant_id = g.id
    left join request_line_rollups lr on lr.grant_id = g.id
    left join request_status_rollups sr on sr.grant_id = g.id
    where g.org_id = ${params.orgId}
      and g.entity_id = ${params.entityId ?? ""}
      and g.deleted_at is null
      and g.status in ('awarded', 'active', 'reporting', 'closeout', 'renewal')
    order by g.end_date nulls last, g.name asc
  `);

  return summarizeCashFlowRadarRows(getResultRows<CashFlowRadarRow>(result), {
    asOf: params.asOf,
  });
}

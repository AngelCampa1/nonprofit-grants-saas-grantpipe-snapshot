import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  expenses,
  grantBudgetLines,
  grantFederalAwardMetadata,
  grantIndirectCostRules,
  grantPaymentRequests,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import {
  uniformGuidanceGuardrailPreviewSchema,
  type UniformGuidanceGuardrailFinding,
  type UniformGuidanceGuardrailPreviewInput,
  type UniformGuidanceGuardrailResult,
} from "@grantpipe/shared";
import { badRequest, notFound } from "../../lib/app-error";
import { computeIndirectLine } from "./indirect.service";
import { paymentRequestEntityScope, type PaymentEntityScope } from "./entity-scope";

const DE_MINIMIS_RATE_PERCENT = 15;
const MTDC_SUBAWARD_CAP_CENTS = 5_000_000;
const EQUIPMENT_THRESHOLD_CENTS = 1_000_000;

const regulatoryFacts = {
  deMinimisRatePercent: DE_MINIMIS_RATE_PERCENT,
  mtdcSubawardCapCents: MTDC_SUBAWARD_CAP_CENTS,
  equipmentThresholdCents: EQUIPMENT_THRESHOLD_CENTS,
} as const;

function isSubawardExpense(expense: { category?: string | null; description?: string | null }) {
  const text = `${expense.category ?? ""} ${expense.description ?? ""}`.toLowerCase();
  return ["subaward", "subrecipient", "sub-recipient"].some((term) => text.includes(term));
}

function isEquipmentExpense(expense: { category?: string | null; description?: string | null }) {
  const text = `${expense.category ?? ""} ${expense.description ?? ""}`.toLowerCase();
  return ["equipment", "capital"].some((term) => text.includes(term));
}

function result(applicable: boolean, findings: UniformGuidanceGuardrailFinding[]) {
  const hasBlock = findings.some((finding) => finding.severity === "block");
  const hasWarning = findings.some((finding) => finding.severity === "warning");
  return {
    applicable,
    status: hasBlock ? "blocked" : hasWarning ? "warning" : "clear",
    findingCount: findings.length,
    findings,
    regulatoryFacts,
  } satisfies UniformGuidanceGuardrailResult;
}

async function loadActiveIndirectRule(db: Database, params: { orgId: string; grantId: string }) {
  const now = new Date();
  const rules = await db
    .select()
    .from(grantIndirectCostRules)
    .where(
      and(
        eq(grantIndirectCostRules.orgId, params.orgId),
        isNull(grantIndirectCostRules.deletedAt),
        lte(grantIndirectCostRules.effectiveFrom, now),
        or(
          isNull(grantIndirectCostRules.effectiveTo),
          sql`${grantIndirectCostRules.effectiveTo} > ${now}`,
        )!,
        or(
          eq(grantIndirectCostRules.grantId, params.grantId),
          isNull(grantIndirectCostRules.grantId),
        )!,
      ),
    );

  return [...rules].sort((a, b) => {
    const aSpecific = a.grantId === params.grantId ? 1 : 0;
    const bSpecific = b.grantId === params.grantId ? 1 : 0;
    if (aSpecific !== bSpecific) return bSpecific - aSpecific;
    return new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
  })[0];
}

export async function evaluateUniformGuidanceCostGuardrails(
  db: Database,
  params: PaymentEntityScope & {
    requestId: string;
    data: UniformGuidanceGuardrailPreviewInput;
  },
): Promise<UniformGuidanceGuardrailResult> {
  const data = uniformGuidanceGuardrailPreviewSchema.parse(params.data);
  const request = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, params.requestId),
      eq(grantPaymentRequests.orgId, params.orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!request) throw notFound("Payment request not found");

  const federalMetadata = await db.query.grantFederalAwardMetadata.findFirst({
    where: and(
      eq(grantFederalAwardMetadata.orgId, params.orgId),
      eq(grantFederalAwardMetadata.entityId, params.entityId ?? ""),
      eq(grantFederalAwardMetadata.grantId, request.grantId),
      isNull(grantFederalAwardMetadata.deletedAt),
    ),
  });

  if (!federalMetadata) return result(false, []);

  const findings: UniformGuidanceGuardrailFinding[] = [];

  if (data.budgetLineId) {
    const budgetLine = await db.query.grantBudgetLines.findFirst({
      where: and(
        eq(grantBudgetLines.id, data.budgetLineId),
        eq(grantBudgetLines.orgId, params.orgId),
        eq(grantBudgetLines.entityId, params.entityId ?? ""),
        isNull(grantBudgetLines.deletedAt),
      ),
      with: { budgetVersion: true },
    });

    if (
      !budgetLine ||
      budgetLine.budgetVersion?.orgId !== params.orgId ||
      budgetLine.budgetVersion.grantId !== request.grantId ||
      budgetLine.budgetVersion.deletedAt != null
    ) {
      throw notFound("Budget line not found");
    }

    if (budgetLine.allowable === false) {
      findings.push({
        code: "unallowable_budget_line",
        severity: "block",
        title: "Unallowable budget line",
        message: "This budget line is marked unallowable for the award.",
        source: "budget_line",
      });
    }
  }

  if (data.expenseId) {
    const expense = await db.query.expenses.findFirst({
      where: and(
        eq(expenses.id, data.expenseId),
        eq(expenses.orgId, params.orgId),
        eq(expenses.entityId, params.entityId ?? ""),
        isNull(expenses.deletedAt),
      ),
    });

    if (!expense) throw notFound("Expense not found");
    if (expense.grantId !== request.grantId) {
      throw badRequest("Expense does not belong to the same grant as this request");
    }

    const amountCents = data.amountCents;

    if (isSubawardExpense(expense) && amountCents > MTDC_SUBAWARD_CAP_CENTS) {
      findings.push({
        code: "mtdc_subaward_cap",
        severity: "warning",
        title: "MTDC subaward cap",
        message: "Only the first $50,000 of each subaward can be included in MTDC.",
        source: "expense",
      });
    }

    if (isEquipmentExpense(expense)) {
      findings.push({
        code: "equipment_threshold_exclusion",
        severity: "warning",
        title: "Equipment policy review",
        message:
          "Check your equipment policy. Federal rules cap equipment at $10,000. Your org may use a lower limit.",
        source: "expense",
      });
    }
  }

  if (data.category === "indirect") {
    const activeRule = await loadActiveIndirectRule(db, {
      orgId: params.orgId,
      grantId: request.grantId,
    });

    if (!activeRule) {
      findings.push({
        code: "missing_indirect_cost_rule",
        severity: "block",
        title: "Missing indirect cost rule",
        message: "Set an indirect cost rule before adding indirect cost to a federal request.",
        source: "indirect_rule",
      });
    } else {
      const expected = await computeIndirectLine(db, {
        orgId: params.orgId,
        entityId: params.entityId,
        requestId: params.requestId,
      });

      if (expected && data.amountCents !== expected.indirectAmountCents) {
        findings.push({
          code: "indirect_rate_mismatch",
          severity: "block",
          title: "Indirect cost mismatch",
          message: "This indirect line does not match the active indirect cost rule.",
          source: "indirect_rule",
        });
      }
    }
  }

  return result(true, findings);
}

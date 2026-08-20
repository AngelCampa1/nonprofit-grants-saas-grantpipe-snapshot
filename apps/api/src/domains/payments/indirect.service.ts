import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  grantPaymentRequests,
  grantPaymentRequestLines,
  grantIndirectCostRules,
  grants,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { CreateIndirectCostRuleInput, UpdateIndirectCostRuleInput } from "@grantpipe/shared";
import { createIndirectCostRuleSchema, updateIndirectCostRuleSchema } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { internalError, notFound } from "../../lib/app-error";
import {
  paymentOptionalGrantEntityScope,
  paymentRequestEntityScope,
  type PaymentEntityScope,
} from "./entity-scope";

// ---------------------------------------------------------------------------
// listIndirectCostRules
// ---------------------------------------------------------------------------

export async function listIndirectCostRules(
  db: Database,
  params: PaymentEntityScope & { grantId?: string },
) {
  const { orgId, grantId } = params;

  const conditions = [
    eq(grantIndirectCostRules.orgId, orgId),
    isNull(grantIndirectCostRules.deletedAt),
    paymentOptionalGrantEntityScope(grantIndirectCostRules.grantId, params),
  ];

  if (grantId) {
    // Return both grant-specific and org-wide (null grantId) rules
    conditions.push(
      or(eq(grantIndirectCostRules.grantId, grantId), isNull(grantIndirectCostRules.grantId))!,
    );
  }

  return db
    .select()
    .from(grantIndirectCostRules)
    .where(and(...conditions));
}

// ---------------------------------------------------------------------------
// createIndirectCostRule
// ---------------------------------------------------------------------------

export async function createIndirectCostRule(
  db: Database,
  params: PaymentEntityScope & { actorId: string; data: CreateIndirectCostRuleInput },
) {
  const { orgId, actorId } = params;
  const data = createIndirectCostRuleSchema.parse(params.data);

  if (data.grantId) {
    const grant = await db.query.grants.findFirst({
      where: and(
        eq(grants.id, data.grantId),
        eq(grants.orgId, orgId),
        eq(grants.entityId, params.entityId ?? ""),
        isNull(grants.deletedAt),
      ),
    });
    if (!grant) throw notFound("Grant not found");
  }

  return db.transaction(async (tx) => {
    const [rule] = await tx
      .insert(grantIndirectCostRules)
      .values({
        orgId,
        grantId: data.grantId ?? null,
        base: data.base,
        rateBasisPoints: data.rateBasisPoints,
        effectiveFrom: new Date(data.effectiveFrom),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      })
      .returning();

    if (!rule) throw internalError("Failed to create indirect cost rule");

    await recordActivityLog(tx, {
      orgId,
      activeEntityId: params.entityId,
      actorId,
      action: "created",
      entityType: "indirect_cost_rule",
      entityId: rule.id,
      entityLabel: null,
      changes: { base: data.base, rateBasisPoints: data.rateBasisPoints, grantId: data.grantId },
    });

    return rule;
  });
}

// ---------------------------------------------------------------------------
// updateIndirectCostRule
// ---------------------------------------------------------------------------

export async function updateIndirectCostRule(
  db: Database,
  params: PaymentEntityScope & {
    actorId: string;
    ruleId: string;
    data: UpdateIndirectCostRuleInput;
  },
) {
  const { orgId, actorId, ruleId } = params;
  const data = updateIndirectCostRuleSchema.parse(params.data);

  const existing = await db.query.grantIndirectCostRules.findFirst({
    where: and(
      eq(grantIndirectCostRules.id, ruleId),
      eq(grantIndirectCostRules.orgId, orgId),
      isNull(grantIndirectCostRules.deletedAt),
      paymentOptionalGrantEntityScope(grantIndirectCostRules.grantId, params),
    ),
  });

  if (!existing) throw notFound("Indirect cost rule not found");

  const payload: Partial<typeof grantIndirectCostRules.$inferInsert> = {};
  if (data.base !== undefined) payload.base = data.base;
  if (data.rateBasisPoints !== undefined) payload.rateBasisPoints = data.rateBasisPoints;
  if (data.effectiveFrom !== undefined) payload.effectiveFrom = new Date(data.effectiveFrom);
  if (data.effectiveTo !== undefined) {
    payload.effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null;
  }

  if (data.grantId !== undefined) {
    if (data.grantId !== null) {
      const grant = await db.query.grants.findFirst({
        where: and(
          eq(grants.id, data.grantId),
          eq(grants.orgId, orgId),
          eq(grants.entityId, params.entityId ?? ""),
          isNull(grants.deletedAt),
        ),
      });
      if (!grant) throw notFound("Grant not found");
    }
    payload.grantId = data.grantId;
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(grantIndirectCostRules)
      .set(payload)
      .where(
        and(
          eq(grantIndirectCostRules.id, ruleId),
          eq(grantIndirectCostRules.orgId, orgId),
          isNull(grantIndirectCostRules.deletedAt),
          paymentOptionalGrantEntityScope(grantIndirectCostRules.grantId, params),
        ),
      )
      .returning();

    if (!updated) throw notFound("Indirect cost rule not found");

    await recordActivityLog(tx, {
      orgId,
      activeEntityId: params.entityId,
      actorId,
      action: "updated",
      entityType: "indirect_cost_rule",
      entityId: ruleId,
      entityLabel: null,
      changes: data,
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// deleteIndirectCostRule
// ---------------------------------------------------------------------------

export async function deleteIndirectCostRule(
  db: Database,
  params: PaymentEntityScope & { actorId: string; ruleId: string },
) {
  const { orgId, actorId, ruleId } = params;

  const existing = await db.query.grantIndirectCostRules.findFirst({
    where: and(
      eq(grantIndirectCostRules.id, ruleId),
      eq(grantIndirectCostRules.orgId, orgId),
      isNull(grantIndirectCostRules.deletedAt),
      paymentOptionalGrantEntityScope(grantIndirectCostRules.grantId, params),
    ),
  });

  if (!existing) throw notFound("Indirect cost rule not found");

  await db.transaction(async (tx) => {
    await tx
      .update(grantIndirectCostRules)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(grantIndirectCostRules.id, ruleId),
          eq(grantIndirectCostRules.orgId, orgId),
          isNull(grantIndirectCostRules.deletedAt),
          paymentOptionalGrantEntityScope(grantIndirectCostRules.grantId, params),
        ),
      );

    await recordActivityLog(tx, {
      orgId,
      activeEntityId: params.entityId,
      actorId,
      action: "deleted",
      entityType: "indirect_cost_rule",
      entityId: ruleId,
      entityLabel: null,
      changes: null,
    });
  });
}

// ---------------------------------------------------------------------------
// computeIndirectLine
// ---------------------------------------------------------------------------

export async function computeIndirectLine(
  db: Database,
  params: PaymentEntityScope & { requestId: string },
) {
  const { orgId, requestId } = params;

  const request = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, requestId),
      eq(grantPaymentRequests.orgId, orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
  });

  if (!request) throw notFound("Payment request not found");

  // Find the best active rule: prefer grant-specific over org-wide.
  // Among peers, prefer most recent effectiveFrom <= now with effectiveTo IS NULL or > now.
  const now = new Date();

  const rules = await db
    .select()
    .from(grantIndirectCostRules)
    .where(
      and(
        eq(grantIndirectCostRules.orgId, orgId),
        isNull(grantIndirectCostRules.deletedAt),
        lte(grantIndirectCostRules.effectiveFrom, now),
        or(
          isNull(grantIndirectCostRules.effectiveTo),
          sql`${grantIndirectCostRules.effectiveTo} > ${now}`,
        )!,
        or(
          eq(grantIndirectCostRules.grantId, request.grantId),
          isNull(grantIndirectCostRules.grantId),
        )!,
      ),
    );

  if (rules.length === 0) return null;

  // Prefer grant-specific rules, then most recent effectiveFrom
  const sorted = [...rules].sort((a, b) => {
    // Grant-specific first
    const aIsSpecific = a.grantId !== null ? 1 : 0;
    const bIsSpecific = b.grantId !== null ? 1 : 0;
    if (aIsSpecific !== bIsSpecific) return bIsSpecific - aIsSpecific;

    // Most recent effectiveFrom
    const aDate = a.effectiveFrom instanceof Date ? a.effectiveFrom : new Date(a.effectiveFrom);
    const bDate = b.effectiveFrom instanceof Date ? b.effectiveFrom : new Date(b.effectiveFrom);
    return bDate.getTime() - aDate.getTime();
  });

  // sorted is non-empty (checked above), so activeRule is always defined
  const activeRule = sorted[0]!;

  // Load direct lines for this request
  const directLines = await db
    .select({
      amountCents: grantPaymentRequestLines.amountCents,
      description: grantPaymentRequestLines.description,
    })
    .from(grantPaymentRequestLines)
    .where(
      and(
        eq(grantPaymentRequestLines.requestId, requestId),
        eq(grantPaymentRequestLines.orgId, orgId),
        eq(grantPaymentRequestLines.category, "direct"),
        isNull(grantPaymentRequestLines.deletedAt),
      ),
    );

  // Compute base amount per rule.base
  let baseAmountCents = 0;

  // V1 heuristic: basis classification uses description keyword matching.
  // This is a known limitation — accurate results require a structured
  // costCategory field on expense lines (planned for V2). Teams using
  // salaries_only or modified_total_direct bases should set line
  // descriptions consistently to "salary", "payroll", "compensation",
  // "equipment", or "capital" as appropriate.
  if (activeRule.base === "direct_costs") {
    baseAmountCents = directLines.reduce((sum, l) => sum + l.amountCents, 0);
  } else if (activeRule.base === "salaries_only") {
    baseAmountCents = directLines
      .filter((l) => {
        const desc = (l.description ?? "").toLowerCase();
        return desc.includes("salary") || desc.includes("payroll") || desc.includes("compensation");
      })
      .reduce((sum, l) => sum + l.amountCents, 0);
  } else if (activeRule.base === "modified_total_direct") {
    baseAmountCents = directLines
      .filter((l) => {
        const desc = (l.description ?? "").toLowerCase();
        return !desc.includes("equipment") && !desc.includes("capital");
      })
      .reduce((sum, l) => sum + l.amountCents, 0);
  }

  const indirectAmountCents = Math.round((baseAmountCents * activeRule.rateBasisPoints) / 10000);

  return {
    ruleId: activeRule.id,
    base: activeRule.base,
    rateBasisPoints: activeRule.rateBasisPoints,
    baseAmountCents,
    indirectAmountCents,
  };
}

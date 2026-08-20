import {
  and,
  asc,
  count as drizzleCount,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { Column } from "drizzle-orm";
import {
  expenses,
  grantFederalAwardMetadata,
  grantCloseoutItems,
  grantFundAllocations,
  grantImpactMetrics,
  grantReportingRequirements,
  grants,
  funds,
  funders,
  impactMetricEntries,
  organizations,
} from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import type {
  CreateAllocationInput,
  CreateGrantInput,
  CreateImpactMetricEntryInput,
  CreateImpactMetricInput,
  FederalAwardMetadataInput,
  GrantListParams,
  UpdateAllocationInput,
  UpdateGrantInput,
  UpdateImpactMetricEntryInput,
  UpdateImpactMetricInput,
} from "@grantpipe/shared";
import {
  GRANT_ACTIVE_STATUSES,
  GRANT_BILLING_CAP_STATUSES,
  GRANT_CAP_OVERAGE_COPY,
  GRANT_CAP_OVERAGE_MONTHLY_CENTS,
  GRANT_CAP_SOFT_HEADROOM,
  GRANT_STATUSES,
  getActiveGrantCap,
  getGrantCapWithSoftHeadroom,
  isBillingCapGrantStatus,
  normalizePlanTier,
} from "@grantpipe/shared";
import type { PlanTier } from "@grantpipe/shared";
import { HTTPException } from "hono/http-exception";
import {
  buildGrantSummary,
  calculateGrantBurnRate,
  deriveRequirementStatus,
  normalizeMetricValue,
} from "./summary";
import { recordActivityLog } from "../../lib/activity-log";
import { badRequest, conflict, internalError, notFound } from "../../lib/app-error";
import { postGrantCloseout } from "../accounting/postingEngine";
import { getEffectiveOrgPlanTier } from "../../lib/effective-plan-tier";
import { lockGrantAllocationCap, lockGrantBillingCap } from "./allocation-lock";

function parseDateValue(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

function parseNumericValue(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return value ?? null;
  return String(value);
}

type FederalAwardMetadataPayload = Omit<FederalAwardMetadataInput, "grantId">;

type GrantAllocationRecord = {
  allocatedAmountCents: number;
  deletedAt?: Date | null;
  fund?: {
    deletedAt?: Date | null;
  } | null;
};

type GrantExpenseRecord = {
  amountCents: number;
  deletedAt?: Date | null;
  programAllocations?: GrantProgramAllocationRecord[] | null;
};

type GrantProgramAllocationRecord = {
  deletedAt?: Date | null;
  program?: {
    deletedAt?: Date | null;
  } | null;
};

type GrantCapacityMetadata = {
  planTier: PlanTier;
  billingCapGrantCount: number;
  includedCap: number;
  softHeadroomCap: number;
  overageCount: number;
  overageCopy: string;
  overageMonthlyCents: number;
};

type EntityScopedParams = { entityId?: string };

function entityScopeCondition(table: { entityId: Column }, entityId: string | undefined) {
  return entityId ? eq(table.entityId, entityId) : undefined;
}

async function assertFunderInOrg(db: Database, orgId: string, funderId: string, entityId?: string) {
  if (!db.query?.funders?.findFirst) return undefined;
  const funder = await db.query.funders.findFirst({
    where: and(
      eq(funders.id, funderId),
      eq(funders.orgId, orgId),
      entityScopeCondition(funders, entityId),
      isNull(funders.deletedAt),
    ),
  });

  if (!funder) throw notFound("Funder not found");
  return funder;
}

async function resolveDefaultEntityId(db: Database | TransactionDatabase, orgId: string) {
  const org = await db.query?.organizations?.findFirst?.({
    where: eq(organizations.id, orgId),
    columns: { defaultEntityId: true },
  });
  if (org?.defaultEntityId) return org.defaultEntityId;
  return "entity-1";
}

async function assertFundInOrg(
  db: TransactionDatabase,
  orgId: string,
  fundId: string,
  entityId?: string,
) {
  if (!db.query?.funds?.findFirst) return;
  const fund = await db.query.funds.findFirst({
    where: and(
      eq(funds.id, fundId),
      eq(funds.orgId, orgId),
      entityScopeCondition(funds, entityId),
      isNull(funds.deletedAt),
    ),
  });

  if (!fund) throw notFound("Fund not found");
}

async function assertGrantInOrg(
  db: TransactionDatabase,
  orgId: string,
  grantId: string,
  entityId?: string,
) {
  if (!db.query?.grants?.findFirst) return undefined;
  const grant = await db.query.grants.findFirst({
    where: and(
      eq(grants.id, grantId),
      eq(grants.orgId, orgId),
      entityScopeCondition(grants, entityId),
      isNull(grants.deletedAt),
    ),
  });

  if (!grant) throw notFound("Grant not found");
  return grant;
}

function toFederalAwardMetadataResponse(row: typeof grantFederalAwardMetadata.$inferSelect) {
  return {
    id: row.id,
    grantId: row.grantId,
    assistanceListingNumber: row.assistanceListingNumber,
    assistanceListingTitle: row.assistanceListingTitle,
    federalAgency: row.federalAgency,
    fain: row.fain,
    passThroughEntityName: row.passThroughEntityName,
    passThroughIdentifyingNumber: row.passThroughIdentifyingNumber,
    programName: row.programName,
    clusterName: row.clusterName,
    sefaInclusionType: row.sefaInclusionType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertAllocationInOrg(
  db: TransactionDatabase,
  orgId: string,
  allocationId: string,
  grantId?: string,
  entityId?: string,
) {
  if (!db.query?.grantFundAllocations?.findFirst) return;
  const allocation = await db.query.grantFundAllocations.findFirst({
    where: and(eq(grantFundAllocations.id, allocationId), isNull(grantFundAllocations.deletedAt)),
    with: {
      grant: true,
      fund: true,
    },
  });

  if (
    !allocation ||
    (grantId !== undefined && allocation.grant.id !== grantId) ||
    allocation.grant.orgId !== orgId ||
    (entityId !== undefined && allocation.grant.entityId !== entityId) ||
    allocation.grant.deletedAt !== null ||
    allocation.fund.orgId !== orgId ||
    (entityId !== undefined && allocation.fund.entityId !== entityId) ||
    allocation.fund.deletedAt !== null
  ) {
    throw notFound("Allocation not found");
  }
}

function activeAllocationWritePredicate(params: {
  allocationId: string;
  grantId?: string;
  entityId?: string;
}) {
  return and(
    eq(grantFundAllocations.id, params.allocationId),
    entityScopeCondition(grantFundAllocations, params.entityId),
    isNull(grantFundAllocations.deletedAt),
    params.grantId ? eq(grantFundAllocations.grantId, params.grantId) : undefined,
  );
}

async function assertImpactMetricInOrg(
  db: Database,
  orgId: string,
  metricId: string,
  entityId?: string,
) {
  if (!db.query?.grantImpactMetrics?.findFirst) return undefined;
  const metric = await db.query.grantImpactMetrics.findFirst({
    where: and(
      eq(grantImpactMetrics.id, metricId),
      eq(grantImpactMetrics.orgId, orgId),
      entityScopeCondition(grantImpactMetrics, entityId),
    ),
  });

  if (!metric) throw notFound("Impact metric not found");
  return metric;
}

async function assertMetricInGrant(
  db: Database,
  orgId: string,
  grantId: string,
  metricId: string,
  entityId?: string,
) {
  const metric = await db.query.grantImpactMetrics.findFirst({
    where: and(
      eq(grantImpactMetrics.id, metricId),
      eq(grantImpactMetrics.orgId, orgId),
      entityScopeCondition(grantImpactMetrics, entityId),
      eq(grantImpactMetrics.grantId, grantId),
      isNull(grantImpactMetrics.deletedAt),
    ),
  });

  if (!metric) throw notFound("Impact metric not found");
  return metric;
}

function thresholdSqlExpression(threshold: NonNullable<GrantListParams["threshold"]>) {
  if (threshold === "100") {
    return sql`CASE WHEN ${grants.amountCents} > 0 THEN COALESCE(expense_totals.expense_total_cents, 0)::float / ${grants.amountCents} ELSE 0 END >= 1`;
  }

  if (threshold === "90") {
    return sql`CASE WHEN ${grants.amountCents} > 0 THEN COALESCE(expense_totals.expense_total_cents, 0)::float / ${grants.amountCents} ELSE 0 END >= 0.9`;
  }

  return sql`CASE WHEN ${grants.amountCents} > 0 THEN COALESCE(expense_totals.expense_total_cents, 0)::float / ${grants.amountCents} ELSE 0 END >= 0.8`;
}

function listGrantFunder(row: { funderId: string | null; funderName: string | null }) {
  if (!row.funderId || !row.funderName) return null;
  return { id: row.funderId, name: row.funderName };
}

async function getGrantCapacityMetadata(
  db: Database,
  orgId: string,
): Promise<GrantCapacityMetadata> {
  const planTier = await resolvePlanTier(db, orgId);
  const includedCap = getActiveGrantCap(planTier);
  const billingCapGrantCount = await countBillingCapGrants(db, orgId);
  const softHeadroomCap = getGrantCapWithSoftHeadroom(includedCap);
  return {
    planTier,
    billingCapGrantCount,
    includedCap,
    softHeadroomCap,
    overageCount: Number.isFinite(includedCap)
      ? Math.max(0, billingCapGrantCount - includedCap)
      : 0,
    overageCopy: GRANT_CAP_OVERAGE_COPY,
    overageMonthlyCents: GRANT_CAP_OVERAGE_MONTHLY_CENTS,
  };
}

function activeGrantLimitMessage(planTier: PlanTier, limit: number, softLimit: number) {
  return `Your ${planTier} plan includes ${limit} active grants plus ${GRANT_CAP_SOFT_HEADROOM} grant headroom. Additional active grants are pending ${GRANT_CAP_OVERAGE_COPY} overage, but this workspace is hard-capped at ${softLimit} active grants. Upgrade to add more.`;
}

export async function listGrants(
  db: Database,
  params: { orgId: string } & EntityScopedParams & GrantListParams,
) {
  const { orgId, page, pageSize, search, status, funderId, fundId, threshold, sortBy, sortOrder } =
    params;
  const conditions = [
    eq(grants.orgId, orgId),
    entityScopeCondition(grants, params.entityId),
    isNull(grants.deletedAt),
  ];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(grants.name, pattern), ilike(grants.description, pattern))!);
  }
  if (status) conditions.push(eq(grants.status, status));
  if (funderId) conditions.push(eq(grants.funderId, funderId));

  const where = and(...conditions);
  const sortFn = sortOrder === "desc" ? desc : asc;
  const sortColumn =
    sortBy === "name"
      ? grants.name
      : sortBy === "status"
        ? grants.status
        : sortBy === "amountCents"
          ? grants.amountCents
          : sortBy === "applicationDeadline"
            ? grants.applicationDeadline
            : sortBy === "createdAt"
              ? grants.createdAt
              : grants.updatedAt;

  if (fundId || threshold) {
    const allocationTotals = db
      .select({
        grantId: grantFundAllocations.grantId,
        allocationTotalCents:
          sql<number>`COALESCE(SUM(${grantFundAllocations.allocatedAmountCents}), 0)`.as(
            "allocation_total_cents",
          ),
      })
      .from(grantFundAllocations)
      .innerJoin(
        funds,
        and(
          eq(funds.id, grantFundAllocations.fundId),
          eq(funds.orgId, orgId),
          entityScopeCondition(funds, params.entityId),
        ),
      )
      .where(
        and(
          entityScopeCondition(grantFundAllocations, params.entityId),
          isNull(grantFundAllocations.deletedAt),
          isNull(funds.deletedAt),
        ),
      )
      .groupBy(grantFundAllocations.grantId)
      .as("allocation_totals");

    const expenseTotals = db
      .select({
        grantId: expenses.grantId,
        expenseTotalCents: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)`.as(
          "expense_total_cents",
        ),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.orgId, orgId),
          entityScopeCondition(expenses, params.entityId),
          isNull(expenses.deletedAt),
        ),
      )
      .groupBy(expenses.grantId)
      .as("expense_totals");

    const filteredConditions = [...conditions];

    if (fundId) {
      filteredConditions.push(
        sql`EXISTS (
          SELECT 1
          FROM ${grantFundAllocations}
          INNER JOIN ${funds}
            ON ${funds.id} = ${grantFundAllocations.fundId}
            AND ${funds.orgId} = ${orgId}
          WHERE ${grantFundAllocations.grantId} = ${grants.id}
            AND ${grantFundAllocations.fundId} = ${fundId}
            AND (${params.entityId} IS NULL OR ${grantFundAllocations.entityId} = ${params.entityId})
            AND (${params.entityId} IS NULL OR ${funds.entityId} = ${params.entityId})
            AND ${grantFundAllocations.deletedAt} IS NULL
            AND ${funds.deletedAt} IS NULL
        )`,
      );
    }

    const filteredWhere = and(...filteredConditions);
    const joinedQuery = db
      .select({
        id: grants.id,
        orgId: grants.orgId,
        funderId: grants.funderId,
        name: grants.name,
        status: grants.status,
        amountCents: grants.amountCents,
        startDate: grants.startDate,
        endDate: grants.endDate,
        applicationDeadline: grants.applicationDeadline,
        description: grants.description,
        notes: grants.notes,
        createdAt: grants.createdAt,
        updatedAt: grants.updatedAt,
        deletedAt: grants.deletedAt,
        funderName: funders.name,
        allocationTotalCents: sql<number>`COALESCE(${allocationTotals.allocationTotalCents}, 0)`.as(
          "allocation_total_cents",
        ),
        expenseTotalCents: sql<number>`COALESCE(${expenseTotals.expenseTotalCents}, 0)`.as(
          "expense_total_cents",
        ),
      })
      .from(grants)
      .leftJoin(allocationTotals, eq(allocationTotals.grantId, grants.id))
      .leftJoin(expenseTotals, eq(expenseTotals.grantId, grants.id))
      .leftJoin(
        funders,
        and(
          eq(funders.id, grants.funderId),
          eq(funders.orgId, orgId),
          entityScopeCondition(funders, params.entityId),
          isNull(funders.deletedAt),
        ),
      );

    const thresholdedWhere = threshold
      ? and(filteredWhere, thresholdSqlExpression(threshold))
      : filteredWhere;

    const summaryRows = await joinedQuery
      .where(thresholdedWhere)
      .orderBy(sortFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const countQuery = db
      .select({ count: drizzleCount() })
      .from(grants)
      .leftJoin(allocationTotals, eq(allocationTotals.grantId, grants.id))
      .leftJoin(expenseTotals, eq(expenseTotals.grantId, grants.id))
      .where(thresholdedWhere);

    const [countResult] = await countQuery;

    return {
      data: summaryRows.map((grant) => ({
        id: grant.id,
        orgId: grant.orgId,
        funderId: grant.funderId,
        name: grant.name,
        status: grant.status,
        amountCents: grant.amountCents,
        startDate: grant.startDate,
        endDate: grant.endDate,
        applicationDeadline: grant.applicationDeadline,
        description: grant.description,
        notes: grant.notes,
        createdAt: grant.createdAt,
        updatedAt: grant.updatedAt,
        deletedAt: grant.deletedAt,
        funder: listGrantFunder(grant),
        summary: buildGrantSummary({
          grantAmountCents: grant.amountCents,
          allocationTotalCents: grant.allocationTotalCents,
          expenseTotalCents: grant.expenseTotalCents,
        }),
      })),
      total: countResult?.count ?? 0,
      page,
      pageSize,
      capacity: await getGrantCapacityMetadata(db, orgId),
    };
  }

  const data = await db
    .select({
      id: grants.id,
      orgId: grants.orgId,
      funderId: grants.funderId,
      name: grants.name,
      status: grants.status,
      amountCents: grants.amountCents,
      startDate: grants.startDate,
      endDate: grants.endDate,
      applicationDeadline: grants.applicationDeadline,
      description: grants.description,
      notes: grants.notes,
      createdAt: grants.createdAt,
      updatedAt: grants.updatedAt,
      deletedAt: grants.deletedAt,
      funderName: funders.name,
    })
    .from(grants)
    .leftJoin(
      funders,
      and(
        eq(funders.id, grants.funderId),
        eq(funders.orgId, orgId),
        entityScopeCondition(funders, params.entityId),
        isNull(funders.deletedAt),
      ),
    )
    .where(where)
    .orderBy(sortFn(sortColumn))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [countResult] = await db.select({ count: drizzleCount() }).from(grants).where(where);

  return {
    data: data.map((grant) => ({
      id: grant.id,
      orgId: grant.orgId,
      funderId: grant.funderId,
      name: grant.name,
      status: grant.status,
      amountCents: grant.amountCents,
      startDate: grant.startDate,
      endDate: grant.endDate,
      applicationDeadline: grant.applicationDeadline,
      description: grant.description,
      notes: grant.notes,
      createdAt: grant.createdAt,
      updatedAt: grant.updatedAt,
      deletedAt: grant.deletedAt,
      funder: listGrantFunder(grant),
    })),
    total: countResult?.count ?? 0,
    page,
    pageSize,
    capacity: await getGrantCapacityMetadata(db, orgId),
  };
}

export async function listGrantPipeline(
  db: Database,
  params: { orgId: string } & EntityScopedParams,
) {
  const grantRows = await db.query.grants.findMany({
    where: and(
      eq(grants.orgId, params.orgId),
      entityScopeCondition(grants, params.entityId),
      isNull(grants.deletedAt),
    ),
  });

  const grouped = Object.fromEntries(
    GRANT_STATUSES.map((status) => {
      const items = grantRows.filter((grant) => grant.status === status);
      return [status, { grants: items, count: items.length }];
    }),
  );

  return grouped as Record<
    (typeof GRANT_STATUSES)[number],
    { grants: typeof grantRows; count: number }
  >;
}

export async function getGrant(
  db: Database,
  params: { orgId: string; grantId: string; now?: Date } & EntityScopedParams,
) {
  const grant = await db.query.grants.findFirst({
    where: and(
      eq(grants.id, params.grantId),
      eq(grants.orgId, params.orgId),
      entityScopeCondition(grants, params.entityId),
      isNull(grants.deletedAt),
    ),
    with: {
      funder: true,
      fundAllocations: { with: { fund: true } },
      expenses: { with: { programAllocations: { with: { program: true } } } },
      impactMetrics: {
        where: isNull(grantImpactMetrics.deletedAt),
        with: { entries: { where: isNull(impactMetricEntries.deletedAt) } },
      },
      reportingRequirements: { where: isNull(grantReportingRequirements.deletedAt) },
      closeoutItems: {
        where: isNull(grantCloseoutItems.deletedAt),
        with: { completedByUser: { columns: { name: true } } },
      },
      programAllocations: { with: { program: true } },
    },
  });

  if (!grant) throw notFound("Grant not found");

  const liveFundAllocations = (grant.fundAllocations as GrantAllocationRecord[]).filter(
    (allocation) =>
      (allocation.deletedAt === undefined || allocation.deletedAt === null) &&
      (allocation.fund?.deletedAt === undefined || allocation.fund?.deletedAt === null),
  );
  const liveExpenses = (grant.expenses ?? [])
    .filter(
      (expense: GrantExpenseRecord) =>
        expense.deletedAt === undefined || expense.deletedAt === null,
    )
    .map((expense) => ({
      ...expense,
      programAllocations: (expense.programAllocations ?? []).filter(
        (allocation: GrantProgramAllocationRecord) =>
          (allocation.deletedAt === undefined || allocation.deletedAt === null) &&
          (allocation.program?.deletedAt === undefined || allocation.program?.deletedAt === null),
      ),
    }));
  const liveProgramAllocations = (grant.programAllocations ?? []).filter(
    (allocation: GrantProgramAllocationRecord) =>
      (allocation.deletedAt === undefined || allocation.deletedAt === null) &&
      (allocation.program?.deletedAt === undefined || allocation.program?.deletedAt === null),
  );

  const allocationTotalCents = liveFundAllocations.reduce(
    (sum, allocation) => sum + allocation.allocatedAmountCents,
    0,
  );
  const expenseTotalCents = liveExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const summary = {
    ...buildGrantSummary({
      grantAmountCents: grant.amountCents,
      allocationTotalCents,
      expenseTotalCents,
    }),
    burnRateCentsPerMonth: calculateGrantBurnRate({
      expenseTotalCents,
      startDate: grant.startDate,
      now: params.now,
    }),
  };

  const impactMetrics = grant.impactMetrics.map((metric) => ({
    ...metric,
    actualValue: metric.entries.reduce((sum, entry) => sum + normalizeMetricValue(entry.value), 0),
  }));

  const reportingRequirements = grant.reportingRequirements.map((requirement) => ({
    ...requirement,
    derivedStatus: deriveRequirementStatus(
      requirement as {
        status: "upcoming" | "in_progress" | "submitted" | "overdue";
        dueDate: string | Date;
      },
      params.now,
    ),
  }));

  return {
    ...grant,
    fundAllocations: liveFundAllocations,
    expenses: liveExpenses,
    programAllocations: liveProgramAllocations,
    summary,
    impactMetrics,
    reportingRequirements,
  };
}

export async function createGrant(
  db: Database,
  params: { orgId: string; actorId?: string } & EntityScopedParams & CreateGrantInput,
) {
  const funder = await assertFunderInOrg(db, params.orgId, params.funderId, params.entityId);
  const activeEntityId =
    params.entityId ?? funder?.entityId ?? (await resolveDefaultEntityId(db, params.orgId));
  const nextStatus = params.status ?? "discovery";
  const values = {
    orgId: params.orgId,
    entityId: activeEntityId,
    funderId: params.funderId,
    name: params.name,
    status: nextStatus,
    amountCents: params.amountCents,
    startDate: parseDateValue(params.startDate),
    endDate: parseDateValue(params.endDate),
    applicationDeadline: parseDateValue(params.applicationDeadline),
    description: params.description,
    notes: params.notes,
  };
  return db.transaction(async (tx) => {
    // Cap gate inside the transaction under an org-wide advisory lock so the
    // count and the insert are serialized; otherwise two concurrent creates can
    // both pass a stale count and both exceed the plan cap (TOCTOU bypass).
    if (isBillingCapGrantStatus(nextStatus)) {
      await lockGrantBillingCap(tx, { orgId: params.orgId });
      const planTier = await resolvePlanTier(tx, params.orgId);
      await assertActiveGrantLimit(tx, params.orgId, nextStatus, planTier);
    }
    const [grant] = await tx.insert(grants).values(values).returning();
    if (!grant) throw internalError("Failed to create grant");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId,
        actorId: params.actorId,
        action: "created",
        entityType: "grant",
        entityId: grant.id,
        entityLabel: grant.name,
        changes: values,
      });
    }
    return grant;
  });
}

export async function resolvePlanTier(
  db: Database | TransactionDatabase,
  orgId: string,
): Promise<PlanTier> {
  if (!db.query?.organizations?.findFirst) return "starter";
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { planTier: true, subscriptionStatus: true, trialEndsAt: true },
  });
  return org ? getEffectiveOrgPlanTier(org) : normalizePlanTier(null);
}

export async function countActiveGrants(db: Database, orgId: string): Promise<number> {
  const countQuery = db.select({ count: drizzleCount() });
  if (!countQuery || typeof countQuery !== "object" || !("from" in countQuery)) return 0;
  const [row] = await countQuery
    .from(grants)
    .where(
      and(
        eq(grants.orgId, orgId),
        inArray(grants.status, GRANT_ACTIVE_STATUSES),
        isNull(grants.deletedAt),
      ),
    );
  return row?.count ?? 0;
}

export async function countBillingCapGrants(
  db: Database | TransactionDatabase,
  orgId: string,
): Promise<number> {
  const countQuery = db.select({ count: drizzleCount() });
  if (!countQuery || typeof countQuery !== "object" || !("from" in countQuery)) return 0;
  const [row] = await countQuery
    .from(grants)
    .where(
      and(
        eq(grants.orgId, orgId),
        inArray(grants.status, GRANT_BILLING_CAP_STATUSES),
        isNull(grants.deletedAt),
      ),
    );
  return row?.count ?? 0;
}

export async function assertActiveGrantLimit(
  db: Database | TransactionDatabase,
  orgId: string,
  status: string,
  planTier: PlanTier,
): Promise<void> {
  if (!isBillingCapGrantStatus(status)) return;
  const limit = getActiveGrantCap(planTier);
  if (!isFinite(limit)) return;
  const softLimit = getGrantCapWithSoftHeadroom(limit);
  const current = await countBillingCapGrants(db, orgId);
  if (current >= softLimit) {
    throw new HTTPException(402, {
      message: activeGrantLimitMessage(planTier, limit, softLimit),
    });
  }
}

export async function updateGrant(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    grantId: string;
    data: UpdateGrantInput;
  } & EntityScopedParams,
) {
  const payload: Partial<typeof grants.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (params.data.funderId !== undefined) {
    await assertFunderInOrg(db, params.orgId, params.data.funderId, params.entityId);
    payload.funderId = params.data.funderId;
  }
  if (params.data.name !== undefined) payload.name = params.data.name;
  if (params.data.status !== undefined) payload.status = params.data.status;
  if (params.data.amountCents !== undefined) payload.amountCents = params.data.amountCents;
  if (params.data.startDate !== undefined)
    payload.startDate = parseDateValue(params.data.startDate);
  if (params.data.endDate !== undefined) payload.endDate = parseDateValue(params.data.endDate);
  if (params.data.applicationDeadline !== undefined) {
    payload.applicationDeadline = parseDateValue(params.data.applicationDeadline);
  }
  if (params.data.description !== undefined) payload.description = params.data.description;
  if (params.data.notes !== undefined) payload.notes = params.data.notes;

  return db.transaction(async (tx) => {
    // Cap gate inside the transaction under an org-wide advisory lock. Only a
    // transition INTO a billing-cap status from a non-billing-cap status counts
    // toward the cap, and the count must be serialized with the write so two
    // concurrent activations cannot both pass a stale count (TOCTOU bypass).
    if (
      params.data.status !== undefined &&
      isBillingCapGrantStatus(params.data.status) &&
      tx.query?.grants
    ) {
      const existingGrant = await tx.query?.grants?.findFirst?.({
        where: and(
          eq(grants.id, params.grantId),
          eq(grants.orgId, params.orgId),
          entityScopeCondition(grants, params.entityId),
          isNull(grants.deletedAt),
        ),
      });
      if (tx.query?.grants && !existingGrant) throw notFound("Grant not found");
      if (!(existingGrant?.status && isBillingCapGrantStatus(existingGrant.status))) {
        await lockGrantBillingCap(tx, { orgId: params.orgId });
        const planTier = await resolvePlanTier(tx, params.orgId);
        await assertActiveGrantLimit(tx, params.orgId, params.data.status, planTier);
      }
    }
    const [grant] = await tx
      .update(grants)
      .set(payload)
      .where(
        and(
          eq(grants.id, params.grantId),
          eq(grants.orgId, params.orgId),
          entityScopeCondition(grants, params.entityId),
          isNull(grants.deletedAt),
        ),
      )
      .returning();
    if (!grant) throw notFound("Grant not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "updated",
        entityType: "grant",
        entityId: grant.id,
        entityLabel: grant.name,
        changes: params.data,
      });
    }
    return grant;
  });
}

export async function upsertGrantFederalAwardMetadata(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    actorId: string;
    grantId: string;
    data: FederalAwardMetadataPayload;
  },
) {
  const grant = await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  const entityId =
    params.entityId ?? grant?.entityId ?? (await resolveDefaultEntityId(db, params.orgId));
  const now = new Date();
  const values = {
    orgId: params.orgId,
    entityId,
    grantId: params.grantId,
    assistanceListingNumber: params.data.assistanceListingNumber ?? null,
    assistanceListingTitle: params.data.assistanceListingTitle ?? null,
    federalAgency: params.data.federalAgency ?? null,
    fain: params.data.fain ?? null,
    passThroughEntityName: params.data.passThroughEntityName ?? null,
    passThroughIdentifyingNumber: params.data.passThroughIdentifyingNumber ?? null,
    programName: params.data.programName ?? null,
    clusterName: params.data.clusterName ?? null,
    sefaInclusionType: params.data.sefaInclusionType,
    updatedAt: now,
    deletedAt: null,
  };
  const [row] = await db
    .insert(grantFederalAwardMetadata)
    .values(values)
    .onConflictDoUpdate({
      target: grantFederalAwardMetadata.grantId,
      set: values,
    })
    .returning();

  if (!row) {
    throw internalError("Failed to save federal award metadata");
  }

  await recordActivityLog(db, {
    orgId: params.orgId,
    activeEntityId: entityId,
    actorId: params.actorId,
    action: "updated",
    entityType: "grant",
    entityId: params.grantId,
    changes: { federalAwardMetadata: Object.keys(params.data) },
  });

  return toFederalAwardMetadataResponse(row);
}

export async function deleteGrant(
  db: Database,
  params: { orgId: string; actorId?: string; grantId: string } & EntityScopedParams,
) {
  return db.transaction(async (tx) => {
    const [grant] = await tx
      .update(grants)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(grants.id, params.grantId),
          eq(grants.orgId, params.orgId),
          entityScopeCondition(grants, params.entityId),
          isNull(grants.deletedAt),
        ),
      )
      .returning();
    if (!grant) throw notFound("Grant not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "grant",
        entityId: params.grantId,
        entityLabel: grant.name,
        changes: null,
      });
    }
  });
}

async function getExistingAllocationSum(
  db: TransactionDatabase,
  grantId: string,
  excludeAllocationId?: string,
): Promise<number> {
  const conditions = [
    eq(grantFundAllocations.grantId, grantId),
    isNull(grantFundAllocations.deletedAt),
  ];
  if (excludeAllocationId) {
    conditions.push(ne(grantFundAllocations.id, excludeAllocationId));
  }
  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(${grantFundAllocations.allocatedAmountCents}), 0)` })
    .from(grantFundAllocations)
    .where(and(...conditions));
  return Number(rows[0]?.total ?? 0);
}

export async function createAllocation(
  db: Database,
  params: { grantId: string; actorId?: string; orgId?: string } & EntityScopedParams &
    CreateAllocationInput,
) {
  if (params.orgId) {
    return db.transaction(async (tx) => {
      await assertGrantInOrg(tx, params.orgId!, params.grantId, params.entityId);
      await assertFundInOrg(tx, params.orgId!, params.fundId, params.entityId);

      // Cap check: fetch grant amountCents and existing allocation sum atomically.
      const grant = await (tx.query?.grants?.findFirst
        ? tx.query.grants.findFirst({
            where: and(
              eq(grants.id, params.grantId),
              eq(grants.orgId, params.orgId!),
              entityScopeCondition(grants, params.entityId),
              isNull(grants.deletedAt),
            ),
          })
        : Promise.resolve(null));

      if (grant?.amountCents != null) {
        await lockGrantAllocationCap(tx, {
          orgId: params.orgId!,
          grantId: params.grantId,
        });
        const existingSum = await getExistingAllocationSum(tx, params.grantId);
        if (existingSum + params.allocatedAmountCents > grant.amountCents) {
          throw conflict("Allocation would exceed grant amount");
        }
      }

      const activeEntityId =
        params.entityId ?? grant?.entityId ?? (await resolveDefaultEntityId(tx, params.orgId!));
      const [allocation] = await tx
        .insert(grantFundAllocations)
        .values({
          grantId: params.grantId,
          entityId: activeEntityId,
          fundId: params.fundId,
          allocatedAmountCents: params.allocatedAmountCents,
        })
        .returning();
      if (!allocation) throw internalError("Failed to create allocation");
      if (params.actorId) {
        await recordActivityLog(tx, {
          orgId: params.orgId!,
          activeEntityId,
          actorId: params.actorId,
          action: "created",
          entityType: "allocation",
          entityId: allocation.id,
          changes: {
            grantId: params.grantId,
            fundId: params.fundId,
            allocatedAmountCents: params.allocatedAmountCents,
          },
        });
      }
      return allocation;
    });
  }

  // No orgId provided — skip ownership checks, activity log, and cap check.
  const [allocation] = await db
    .insert(grantFundAllocations)
    .values({
      grantId: params.grantId,
      entityId: params.entityId ?? "entity-1",
      fundId: params.fundId,
      allocatedAmountCents: params.allocatedAmountCents,
    })
    .returning();
  if (!allocation) throw internalError("Failed to create allocation");
  return allocation;
}

export async function updateAllocation(
  db: Database,
  params: {
    allocationId: string;
    grantId?: string;
    actorId?: string;
    orgId?: string;
    data: UpdateAllocationInput;
  } & EntityScopedParams,
) {
  if (params.orgId && params.data.allocatedAmountCents !== undefined) {
    return db.transaction(async (tx) => {
      await assertAllocationInOrg(
        tx,
        params.orgId!,
        params.allocationId,
        params.grantId,
        params.entityId,
      );
      if (params.data.fundId !== undefined) {
        await assertFundInOrg(tx, params.orgId!, params.data.fundId, params.entityId);
      }

      // Cap check: fetch the grant directly for amountCents, then sum all other
      // allocations for this grant. If the new amount would exceed the cap, throw.
      const resolvedGrantId = params.grantId;
      if (!resolvedGrantId) {
        throw internalError("grantId required for allocation cap check");
      }
      const grant = await (tx.query?.grants?.findFirst
        ? tx.query.grants.findFirst({
            where: and(
              eq(grants.id, resolvedGrantId),
              eq(grants.orgId, params.orgId!),
              entityScopeCondition(grants, params.entityId),
              isNull(grants.deletedAt),
            ),
          })
        : Promise.resolve(null));

      if (grant?.amountCents != null && params.data.allocatedAmountCents != null) {
        await lockGrantAllocationCap(tx, {
          orgId: params.orgId!,
          grantId: resolvedGrantId,
        });
        const existingSum = await getExistingAllocationSum(
          tx,
          resolvedGrantId,
          params.allocationId,
        );
        if (existingSum + params.data.allocatedAmountCents! > grant.amountCents) {
          throw conflict("Allocation would exceed grant amount");
        }
      }

      const [allocation] = await tx
        .update(grantFundAllocations)
        .set(params.data)
        .where(
          activeAllocationWritePredicate({
            allocationId: params.allocationId,
            grantId: params.grantId,
            entityId: params.entityId,
          }),
        )
        .returning();
      if (!allocation) throw notFound("Allocation not found");
      if (params.actorId) {
        await recordActivityLog(tx, {
          orgId: params.orgId!,
          activeEntityId: params.entityId,
          actorId: params.actorId,
          action: "updated",
          entityType: "allocation",
          entityId: allocation.id,
          changes: params.data,
        });
      }
      return allocation;
    });
  }

  if (params.orgId) {
    await assertAllocationInOrg(
      db,
      params.orgId,
      params.allocationId,
      params.grantId,
      params.entityId,
    );
    if (params.data.fundId !== undefined) {
      await assertFundInOrg(db, params.orgId, params.data.fundId, params.entityId);
    }
  }
  return db.transaction(async (tx) => {
    const [allocation] = await tx
      .update(grantFundAllocations)
      .set(params.data)
      .where(
        activeAllocationWritePredicate({
          allocationId: params.allocationId,
          grantId: params.grantId,
          entityId: params.entityId,
        }),
      )
      .returning();
    if (!allocation) throw notFound("Allocation not found");
    if (params.actorId && params.orgId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "updated",
        entityType: "allocation",
        entityId: allocation.id,
        changes: params.data,
      });
    }
    return allocation;
  });
}

export async function deleteAllocation(
  db: Database,
  params: {
    allocationId: string;
    grantId?: string;
    actorId?: string;
    orgId?: string;
  } & EntityScopedParams,
) {
  if (params.orgId) {
    await assertAllocationInOrg(
      db,
      params.orgId,
      params.allocationId,
      params.grantId,
      params.entityId,
    );
  }
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(grantFundAllocations)
      .set({ deletedAt: new Date() })
      .where(
        activeAllocationWritePredicate({
          allocationId: params.allocationId,
          grantId: params.grantId,
          entityId: params.entityId,
        }),
      )
      .returning();
    if (!deleted) throw notFound("Allocation not found");
    if (params.actorId && params.orgId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "allocation",
        entityId: params.allocationId,
        changes: null,
      });
    }
  });
}

export async function createImpactMetric(
  db: Database,
  params: { orgId: string; actorId?: string; grantId: string } & EntityScopedParams &
    CreateImpactMetricInput,
) {
  const grant = await assertGrantInOrg(db, params.orgId, params.grantId, params.entityId);
  const activeEntityId =
    params.entityId ?? grant?.entityId ?? (await resolveDefaultEntityId(db, params.orgId));
  const values = {
    orgId: params.orgId,
    entityId: activeEntityId,
    grantId: params.grantId,
    name: params.name,
    targetValue: parseNumericValue(params.targetValue),
    unit: params.unit,
  };
  return db.transaction(async (tx) => {
    const [metric] = await tx.insert(grantImpactMetrics).values(values).returning();
    if (!metric) throw internalError("Failed to create impact metric");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId,
        actorId: params.actorId,
        action: "created",
        entityType: "impact_metric",
        entityId: metric.id,
        changes: { grantId: params.grantId, name: params.name, unit: params.unit },
      });
    }
    return metric;
  });
}

export async function updateImpactMetric(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    grantId: string;
    metricId: string;
    data: UpdateImpactMetricInput;
  } & EntityScopedParams,
) {
  await assertMetricInGrant(db, params.orgId, params.grantId, params.metricId, params.entityId);
  const payload: Partial<typeof grantImpactMetrics.$inferInsert> = {};
  if (params.data.name !== undefined) payload.name = params.data.name;
  if (params.data.targetValue !== undefined) {
    payload.targetValue = parseNumericValue(params.data.targetValue);
  }
  if (params.data.unit !== undefined) payload.unit = params.data.unit;

  return db.transaction(async (tx) => {
    const [metric] = await tx
      .update(grantImpactMetrics)
      .set(payload)
      .where(
        and(
          eq(grantImpactMetrics.id, params.metricId),
          eq(grantImpactMetrics.orgId, params.orgId),
          entityScopeCondition(grantImpactMetrics, params.entityId),
        ),
      )
      .returning();
    if (!metric) throw notFound("Impact metric not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "updated",
        entityType: "impact_metric",
        entityId: metric.id,
        changes: params.data,
      });
    }
    return metric;
  });
}

export async function deleteImpactMetric(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    grantId: string;
    metricId: string;
  } & EntityScopedParams,
) {
  await assertMetricInGrant(db, params.orgId, params.grantId, params.metricId, params.entityId);
  return db.transaction(async (tx) => {
    const [metric] = await tx
      .update(grantImpactMetrics)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(grantImpactMetrics.id, params.metricId),
          eq(grantImpactMetrics.orgId, params.orgId),
          entityScopeCondition(grantImpactMetrics, params.entityId),
          isNull(grantImpactMetrics.deletedAt),
        ),
      )
      .returning();
    if (!metric) throw notFound("Impact metric not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "impact_metric",
        entityId: params.metricId,
        changes: null,
      });
    }
  });
}

export async function createImpactMetricEntry(
  db: Database,
  params: {
    metricId: string;
    grantId?: string;
    actorId?: string;
    orgId?: string;
  } & EntityScopedParams &
    CreateImpactMetricEntryInput,
) {
  if (params.orgId && params.grantId) {
    const metric = await assertMetricInGrant(
      db,
      params.orgId,
      params.grantId,
      params.metricId,
      params.entityId,
    );
    params.entityId = params.entityId ?? metric?.entityId;
  } else if (params.orgId) {
    const metric = await assertImpactMetricInOrg(
      db,
      params.orgId,
      params.metricId,
      params.entityId,
    );
    params.entityId = params.entityId ?? metric?.entityId;
  }
  const activeEntityId =
    params.entityId ?? (params.orgId ? await resolveDefaultEntityId(db, params.orgId) : "entity-1");
  const values = {
    metricId: params.metricId,
    entityId: activeEntityId,
    value: parseNumericValue(params.value) ?? "0",
    periodStart: new Date(params.periodStart),
    periodEnd: new Date(params.periodEnd),
    notes: params.notes,
  };
  return db.transaction(async (tx) => {
    const [entry] = await tx.insert(impactMetricEntries).values(values).returning();
    if (!entry) throw internalError("Failed to create impact metric entry");
    if (params.actorId && params.orgId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId,
        actorId: params.actorId,
        action: "created",
        entityType: "impact_metric_entry",
        entityId: entry.id,
        changes: { metricId: params.metricId, value: params.value },
      });
    }
    return entry;
  });
}

export async function updateImpactMetricEntry(
  db: Database,
  params: {
    metricId: string;
    entryId: string;
    actorId?: string;
    orgId?: string;
    grantId: string;
    data: UpdateImpactMetricEntryInput;
  } & EntityScopedParams,
) {
  if (params.orgId) {
    await assertMetricInGrant(db, params.orgId, params.grantId, params.metricId, params.entityId);
  }
  const payload: Partial<typeof impactMetricEntries.$inferInsert> = {};
  if (params.data.value !== undefined)
    payload.value = parseNumericValue(params.data.value) ?? undefined;
  if (params.data.periodStart !== undefined)
    payload.periodStart = new Date(params.data.periodStart);
  if (params.data.periodEnd !== undefined) payload.periodEnd = new Date(params.data.periodEnd);
  if (params.data.notes !== undefined) payload.notes = params.data.notes;

  return db.transaction(async (tx) => {
    const [entry] = await tx
      .update(impactMetricEntries)
      .set(payload)
      .where(
        and(
          eq(impactMetricEntries.id, params.entryId),
          eq(impactMetricEntries.metricId, params.metricId),
          entityScopeCondition(impactMetricEntries, params.entityId),
          isNull(impactMetricEntries.deletedAt),
        ),
      )
      .returning();
    if (!entry) throw notFound("Impact metric entry not found");
    if (params.actorId && params.orgId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "updated",
        entityType: "impact_metric_entry",
        entityId: entry.id,
        changes: params.data,
      });
    }
    return entry;
  });
}

export async function deleteImpactMetricEntry(
  db: Database,
  params: {
    metricId: string;
    entryId: string;
    actorId?: string;
    orgId?: string;
    grantId: string;
  } & EntityScopedParams,
) {
  if (params.orgId) {
    await assertMetricInGrant(db, params.orgId, params.grantId, params.metricId, params.entityId);
  }
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .update(impactMetricEntries)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(impactMetricEntries.id, params.entryId),
          eq(impactMetricEntries.metricId, params.metricId),
          entityScopeCondition(impactMetricEntries, params.entityId),
          isNull(impactMetricEntries.deletedAt),
        ),
      )
      .returning();
    if (!entry) throw notFound("Impact metric entry not found");
    if (params.actorId && params.orgId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "impact_metric_entry",
        entityId: params.entryId,
        changes: null,
      });
    }
  });
}

export async function closeoutGrant(
  db: Database,
  params: {
    orgId: string;
    actorId: string;
    grantId: string;
    closeoutDisposition: "release" | "return";
  } & EntityScopedParams,
): Promise<void> {
  const grant = await db.query.grants.findFirst({
    where: and(
      eq(grants.id, params.grantId),
      eq(grants.orgId, params.orgId),
      entityScopeCondition(grants, params.entityId),
      isNull(grants.deletedAt),
    ),
  });

  if (!grant) throw notFound("Grant not found");

  if (grant.status === "closeout") {
    throw badRequest("Grant is already closed out.");
  }

  await db.transaction(async (tx) => {
    const txDb = tx as TransactionDatabase;

    // Re-check status atomically inside the transaction: the conditional
    // update only flips a grant that is not already closed out, so two
    // concurrent callers cannot both proceed to post the closeout twice.
    const transitioned = await txDb
      .update(grants)
      .set({ status: "closeout", updatedAt: new Date() })
      .where(
        and(
          eq(grants.id, params.grantId),
          eq(grants.orgId, params.orgId),
          entityScopeCondition(grants, params.entityId),
          isNull(grants.deletedAt),
          ne(grants.status, "closeout"),
        ),
      )
      .returning({ id: grants.id });

    if (transitioned.length === 0) {
      throw badRequest("Grant is already closed out.");
    }

    await postGrantCloseout(txDb, {
      orgId: params.orgId,
      actorId: params.actorId,
      grantId: params.grantId,
      closeoutDisposition: params.closeoutDisposition,
    });

    await recordActivityLog(txDb, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "closed",
      entityType: "grant",
      entityId: params.grantId,
      changes: { closeoutDisposition: params.closeoutDisposition },
    });
  });
}

import { neutralizeCsvFormula } from "../../lib/csv";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  sum,
} from "drizzle-orm";
import {
  chartOfAccounts,
  documents,
  donations,
  expenses,
  funds,
  generatedReports,
  grants,
  journalLines,
  organizations,
  restrictionAdditions,
  restrictionAllowedCategories,
  restrictionAllowedPrograms,
  restrictionBalances,
  restrictionEvidenceLinks,
  restrictionReleases,
  restrictionTerms,
  type Database,
} from "@grantpipe/db";
import {
  createRestrictionAdditionSchema,
  createRestrictionEvidenceLinkSchema,
  createRestrictionReleaseSchema,
  createRestrictionTermSchema,
  formatMinimumPlanLabelForFeatures,
  hasRestrictionEvidencePackage,
  hasRestrictionLifecycle,
  restrictedRollforwardExportSchema,
  restrictionAlertFilterSchema,
  RESTRICTION_ALERT_TYPES,
  updateRestrictionTermSchema,
  type CreateRestrictionAdditionInput,
  type CreateRestrictionEvidenceLinkInput,
  type CreateRestrictionReleaseInput,
  type CreateRestrictionTermInput,
  type RestrictedRollforwardExportInput,
  type RestrictionAlertFilterParams,
  type RestrictionAlertType,
  type RestrictionTermListParams,
  type UpdateRestrictionTermInput,
} from "@grantpipe/shared";
import { badRequest, notFound, paymentRequired } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";
import { captureBackgroundException } from "../../lib/sentry";
import type { Bindings } from "../../types";
import { deliverReportReadyEffects } from "../report-builder/ready-effects";

async function resolveReportEntityId(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    fundId?: string | null;
    grantId?: string | null;
  },
) {
  if (params.entityId) return params.entityId;
  if (params.grantId) {
    if (!db.query?.grants?.findFirst) return "entity-1";
    const grant = await db.query.grants.findFirst({
      where: and(eq(grants.id, params.grantId), eq(grants.orgId, params.orgId)),
      columns: { entityId: true },
    });
    if (grant) return grant.entityId;
  }
  if (params.fundId) {
    if (!db.query?.funds?.findFirst) return "entity-1";
    const fund = await db.query.funds.findFirst({
      where: and(eq(funds.id, params.fundId), eq(funds.orgId, params.orgId)),
      columns: { entityId: true },
    });
    if (fund) return fund.entityId;
  }
  if (!db.query?.organizations?.findFirst) return "entity-1";
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, params.orgId),
    columns: { defaultEntityId: true },
  });
  if (!org?.defaultEntityId) throw badRequest("Organization default entity is required.");
  return org.defaultEntityId;
}

type ActorParams = {
  orgId: string;
  entityId?: string;
  actorId: string;
  planTier: string | null | undefined;
};

type RestrictionEnv = {
  APP_URL?: string;
  INTEGRATION_MODE?: Bindings["INTEGRATION_MODE"];
  R2?: {
    put(
      key: string,
      value: string,
      options?: { httpMetadata?: { contentType?: string } },
    ): Promise<unknown>;
  };
};

type TransactionDb = Parameters<Parameters<Database["transaction"]>[0]>[0];

const RESTRICTION_LIFECYCLE_PLAN_LABEL = formatMinimumPlanLabelForFeatures([
  "hasRestrictionLifecycle",
]);
const RESTRICTION_EVIDENCE_PACKAGE_PLAN_LABEL = formatMinimumPlanLabelForFeatures([
  "hasRestrictionEvidencePackage",
]);

function assertLifecycle(planTier: string | null | undefined) {
  if (!hasRestrictionLifecycle(planTier)) {
    throw paymentRequired(
      `Restriction lifecycle requires the ${RESTRICTION_LIFECYCLE_PLAN_LABEL} plan.`,
    );
  }
}

function assertEvidencePackage(planTier: string | null | undefined) {
  if (!hasRestrictionEvidencePackage(planTier)) {
    throw paymentRequired(
      `Restriction evidence packages require the ${RESTRICTION_EVIDENCE_PACKAGE_PLAN_LABEL} plan.`,
    );
  }
}

async function getActiveTerm(
  db: Database | TransactionDb,
  orgId: string,
  termId: string,
  entityId?: string,
) {
  // Core query builder, not the relational query API — restrictionTermEntityScope
  // embeds raw `sql` fragments referencing OTHER tables' columns (funds, grants,
  // donations, organizations). The relational compiler re-qualifies every bare
  // Column reference in `where` with the base table's own alias, which would
  // corrupt those cross-table fragments and 500 in Postgres. getTableColumns
  // preserves the "select every column" behavior of the original findFirst
  // call (no `columns` option was set).
  const [term] = await db
    .select(getTableColumns(restrictionTerms))
    .from(restrictionTerms)
    .where(
      and(
        eq(restrictionTerms.id, termId),
        eq(restrictionTerms.orgId, orgId),
        entityId ? restrictionTermEntityScope(orgId, entityId) : undefined,
        isNull(restrictionTerms.deletedAt),
      ),
    )
    .limit(1);
  if (!term) {
    throw notFound("Restriction term not found");
  }
  return term;
}

async function assertLinkedRecordsInOrg(
  db: Database,
  orgId: string,
  links: {
    fundId?: string | null;
    grantId?: string | null;
    donationId?: string | null;
    documentId?: string | null;
    sourceDocumentId?: string | null;
    expenseId?: string | null;
    journalLineId?: string | null;
    generatedReportId?: string | null;
    allowedCategories?: Array<{ accountId?: string | null }>;
  },
  entityId?: string,
) {
  const checks: Array<Promise<unknown>> = [];
  if (links.fundId) {
    checks.push(
      db.query.funds.findFirst({
        where: and(
          eq(funds.id, links.fundId),
          eq(funds.orgId, orgId),
          entityId ? eq(funds.entityId, entityId) : undefined,
          isNull(funds.deletedAt),
        ),
        columns: { id: true },
      }),
    );
  }
  if (links.grantId) {
    checks.push(
      db.query.grants.findFirst({
        where: and(
          eq(grants.id, links.grantId),
          eq(grants.orgId, orgId),
          entityId ? eq(grants.entityId, entityId) : undefined,
          isNull(grants.deletedAt),
        ),
        columns: { id: true },
      }),
    );
  }
  if (links.donationId) {
    checks.push(
      // Core query builder, not the relational query API — the inline entity
      // scope embeds raw `sql` fragments referencing funds/grants/organizations
      // columns. See the note on getActiveTerm above for the re-qualification
      // hazard this avoids.
      db
        .select({ id: donations.id })
        .from(donations)
        .where(
          and(
            eq(donations.id, links.donationId),
            eq(donations.orgId, orgId),
            entityId
              ? and(
                  or(
                    isNull(donations.fundId),
                    sql`EXISTS (
                      SELECT 1 FROM ${funds}
                      WHERE ${funds.id} = ${donations.fundId}
                        AND ${funds.orgId} = ${orgId}
                        AND ${funds.entityId} = ${entityId}
                    )`,
                  ),
                  or(
                    isNull(donations.grantId),
                    sql`EXISTS (
                      SELECT 1 FROM ${grants}
                      WHERE ${grants.id} = ${donations.grantId}
                        AND ${grants.orgId} = ${orgId}
                        AND ${grants.entityId} = ${entityId}
                    )`,
                  ),
                  or(
                    isNotNull(donations.fundId),
                    isNotNull(donations.grantId),
                    sql`EXISTS (
                      SELECT 1 FROM ${organizations}
                      WHERE ${organizations.id} = ${orgId}
                        AND ${organizations.defaultEntityId} = ${entityId}
                    )`,
                  ),
                )
              : undefined,
            isNull(donations.deletedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );
  }
  const documentId = links.sourceDocumentId ?? links.documentId;
  if (documentId) {
    checks.push(
      // Core query builder, not the relational query API — restrictionDocumentEntityScope
      // embeds raw `sql` fragments referencing funds/grants/donations/generatedReports/
      // organizations columns. See the note on getActiveTerm above.
      db
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.id, documentId),
            eq(documents.orgId, orgId),
            entityId ? restrictionDocumentEntityScope(orgId, entityId) : undefined,
            isNull(documents.deletedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );
  }
  if (links.expenseId) {
    checks.push(
      db.query.expenses.findFirst({
        where: and(
          eq(expenses.id, links.expenseId),
          eq(expenses.orgId, orgId),
          entityId ? eq(expenses.entityId, entityId) : undefined,
          isNull(expenses.deletedAt),
        ),
        columns: { id: true },
      }),
    );
  }
  if (links.journalLineId) {
    checks.push(
      // Core query builder, not the relational query API — the inline entity
      // scope embeds raw `sql` fragments referencing funds/grants/organizations
      // columns. See the note on getActiveTerm above for the re-qualification
      // hazard this avoids.
      db
        .select({ id: journalLines.id })
        .from(journalLines)
        .where(
          and(
            eq(journalLines.id, links.journalLineId),
            eq(journalLines.orgId, orgId),
            entityId
              ? and(
                  or(
                    isNull(journalLines.fundId),
                    sql`EXISTS (
                      SELECT 1 FROM ${funds}
                      WHERE ${funds.id} = ${journalLines.fundId}
                        AND ${funds.orgId} = ${orgId}
                        AND ${funds.entityId} = ${entityId}
                    )`,
                  ),
                  or(
                    isNull(journalLines.grantId),
                    sql`EXISTS (
                      SELECT 1 FROM ${grants}
                      WHERE ${grants.id} = ${journalLines.grantId}
                        AND ${grants.orgId} = ${orgId}
                        AND ${grants.entityId} = ${entityId}
                    )`,
                  ),
                  or(
                    isNotNull(journalLines.fundId),
                    isNotNull(journalLines.grantId),
                    sql`EXISTS (
                      SELECT 1 FROM ${organizations}
                      WHERE ${organizations.id} = ${orgId}
                        AND ${organizations.defaultEntityId} = ${entityId}
                    )`,
                  ),
                )
              : undefined,
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );
  }
  if (links.generatedReportId) {
    checks.push(
      db.query.generatedReports.findFirst({
        where: and(
          eq(generatedReports.id, links.generatedReportId),
          eq(generatedReports.orgId, orgId),
          entityId ? eq(generatedReports.entityId, entityId) : undefined,
          eq(generatedReports.status, "ready"),
        ),
        columns: { id: true },
      }),
    );
  }
  for (const category of links.allowedCategories ?? []) {
    if (category.accountId) {
      checks.push(
        db.query.chartOfAccounts.findFirst({
          where: and(
            eq(chartOfAccounts.id, category.accountId),
            eq(chartOfAccounts.orgId, orgId),
            isNull(chartOfAccounts.deletedAt),
          ),
          columns: { id: true },
        }),
      );
    }
  }

  const results = await Promise.all(checks);
  if (results.some((result) => !result)) {
    throw badRequest("Linked restriction record does not belong to this organization");
  }
}

async function assertRollforwardLinksInEntity(
  db: Database,
  params: {
    orgId: string;
    entityId: string;
    fundId?: string | null;
    grantId?: string | null;
  },
) {
  const checks: Array<Promise<unknown>> = [];
  if (params.fundId) {
    checks.push(
      db.query.funds.findFirst({
        where: and(
          eq(funds.id, params.fundId),
          eq(funds.orgId, params.orgId),
          eq(funds.entityId, params.entityId),
        ),
        columns: { id: true, entityId: true },
      }),
    );
  }
  if (params.grantId) {
    checks.push(
      db.query.grants.findFirst({
        where: and(
          eq(grants.id, params.grantId),
          eq(grants.orgId, params.orgId),
          eq(grants.entityId, params.entityId),
        ),
        columns: { id: true, entityId: true },
      }),
    );
  }
  const records = await Promise.all(checks);
  if (
    records.some(
      (record) =>
        !record ||
        (typeof record === "object" && "entityId" in record && record.entityId !== params.entityId),
    )
  ) {
    throw badRequest("Linked restriction record does not belong to this organization");
  }
}

async function assertUnlinkedTermUsesDefaultEntity(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    fundId?: string | null;
    grantId?: string | null;
    donationId?: string | null;
  },
) {
  if (!params.entityId || params.fundId || params.grantId || params.donationId) return;
  const organization = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.id, params.orgId),
      eq(organizations.defaultEntityId, params.entityId),
    ),
    columns: { id: true },
  });
  if (!organization) {
    throw badRequest("Linked restriction record does not belong to this organization");
  }
}

function restrictionTermEntityScope(orgId: string, entityId: string) {
  const isDefaultEntity = sql`EXISTS (
    SELECT 1 FROM ${organizations}
    WHERE ${organizations.id} = ${orgId}
      AND ${organizations.defaultEntityId} = ${entityId}
  )`;
  const fundIsInEntity = sql`EXISTS (
    SELECT 1 FROM ${funds}
    WHERE ${funds.id} = ${restrictionTerms.fundId}
      AND ${funds.orgId} = ${orgId}
      AND ${funds.entityId} = ${entityId}
  )`;
  const grantIsInEntity = sql`EXISTS (
    SELECT 1 FROM ${grants}
    WHERE ${grants.id} = ${restrictionTerms.grantId}
      AND ${grants.orgId} = ${orgId}
      AND ${grants.entityId} = ${entityId}
  )`;
  const donationIsInEntity = sql`EXISTS (
    SELECT 1 FROM ${donations}
    WHERE ${donations.id} = ${restrictionTerms.donationId}
      AND ${donations.orgId} = ${orgId}
      AND (
        ${donations.fundId} IS NULL
        OR EXISTS (
          SELECT 1 FROM ${funds}
          WHERE ${funds.id} = ${donations.fundId}
            AND ${funds.orgId} = ${orgId}
            AND ${funds.entityId} = ${entityId}
        )
      )
      AND (
        ${donations.grantId} IS NULL
        OR EXISTS (
          SELECT 1 FROM ${grants}
          WHERE ${grants.id} = ${donations.grantId}
            AND ${grants.orgId} = ${orgId}
            AND ${grants.entityId} = ${entityId}
        )
      )
      AND (
        ${donations.fundId} IS NOT NULL
        OR ${donations.grantId} IS NOT NULL
        OR ${isDefaultEntity}
      )
  )`;

  return and(
    or(isNull(restrictionTerms.fundId), fundIsInEntity),
    or(isNull(restrictionTerms.grantId), grantIsInEntity),
    or(isNull(restrictionTerms.donationId), donationIsInEntity),
    or(
      isNotNull(restrictionTerms.fundId),
      isNotNull(restrictionTerms.grantId),
      isNotNull(restrictionTerms.donationId),
      isDefaultEntity,
    ),
  )!;
}

function restrictionReleaseEntityScope(orgId: string, entityId: string) {
  return sql`EXISTS (
    SELECT 1 FROM ${restrictionTerms}
    WHERE ${restrictionTerms.id} = ${restrictionReleases.restrictionTermId}
      AND ${restrictionTerms.orgId} = ${orgId}
      AND ${restrictionTerms.deletedAt} IS NULL
      AND ${restrictionTermEntityScope(orgId, entityId)}
  )`;
}

function restrictionDocumentEntityScope(orgId: string, entityId: string) {
  return sql`CASE ${documents.entityType}
    WHEN 'fund' THEN EXISTS (
      SELECT 1 FROM ${funds}
      WHERE ${funds.id} = ${documents.entityId}
        AND ${funds.orgId} = ${orgId}
        AND ${funds.entityId} = ${entityId}
    )
    WHEN 'grant' THEN EXISTS (
      SELECT 1 FROM ${grants}
      WHERE ${grants.id} = ${documents.entityId}
        AND ${grants.orgId} = ${orgId}
        AND ${grants.entityId} = ${entityId}
    )
    WHEN 'donation' THEN EXISTS (
      SELECT 1 FROM ${donations}
      WHERE ${donations.id} = ${documents.entityId}
        AND ${donations.orgId} = ${orgId}
        AND (
          (${donations.fundId} IS NULL OR EXISTS (
            SELECT 1 FROM ${funds}
            WHERE ${funds.id} = ${donations.fundId}
              AND ${funds.orgId} = ${orgId}
              AND ${funds.entityId} = ${entityId}
          ))
          AND (${donations.grantId} IS NULL OR EXISTS (
            SELECT 1 FROM ${grants}
            WHERE ${grants.id} = ${donations.grantId}
              AND ${grants.orgId} = ${orgId}
              AND ${grants.entityId} = ${entityId}
          ))
        )
        AND (
          ${donations.fundId} IS NOT NULL
          OR ${donations.grantId} IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM ${organizations}
            WHERE ${organizations.id} = ${orgId}
              AND ${organizations.defaultEntityId} = ${entityId}
          )
        )
    )
    WHEN 'generated_report' THEN EXISTS (
      SELECT 1 FROM ${generatedReports}
      WHERE ${generatedReports.id} = ${documents.entityId}
        AND ${generatedReports.orgId} = ${orgId}
        AND ${generatedReports.entityId} = ${entityId}
    )
    ELSE EXISTS (
      SELECT 1 FROM ${organizations}
      WHERE ${organizations.id} = ${orgId}
        AND ${organizations.defaultEntityId} = ${entityId}
    )
  END`;
}

export async function listRestrictionTerms(
  db: Database,
  params: ActorParams & RestrictionTermListParams,
) {
  assertLifecycle(params.planTier);
  const filters = params;
  const conditions = [eq(restrictionTerms.orgId, params.orgId), isNull(restrictionTerms.deletedAt)];
  if (params.entityId) {
    conditions.push(restrictionTermEntityScope(params.orgId, params.entityId));
  }
  if (filters.fundId) conditions.push(eq(restrictionTerms.fundId, filters.fundId));
  if (filters.grantId) conditions.push(eq(restrictionTerms.grantId, filters.grantId));
  if (filters.donationId) conditions.push(eq(restrictionTerms.donationId, filters.donationId));
  if (filters.sourceDocumentId) {
    conditions.push(eq(restrictionTerms.sourceDocumentId, filters.sourceDocumentId));
  }
  if (filters.restrictionType) {
    conditions.push(eq(restrictionTerms.restrictionType, filters.restrictionType));
  }

  const terms = await db
    .select()
    .from(restrictionTerms)
    .where(and(...conditions))
    .orderBy(desc(restrictionTerms.createdAt))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return Promise.all(
    terms.map(async (term) => {
      const [additionTotals] = await db
        .select({ total: sum(restrictionAdditions.amountCents) })
        .from(restrictionAdditions)
        .where(
          and(
            eq(restrictionAdditions.orgId, params.orgId),
            eq(restrictionAdditions.restrictionTermId, term.id),
            isNull(restrictionAdditions.deletedAt),
          ),
        );
      const [releaseTotals] = await db
        .select({ total: sum(restrictionReleases.amountCents) })
        .from(restrictionReleases)
        .where(
          and(
            eq(restrictionReleases.orgId, params.orgId),
            eq(restrictionReleases.restrictionTermId, term.id),
            isNull(restrictionReleases.deletedAt),
          ),
        );
      const additionsCents = Number(additionTotals?.total ?? 0);
      const releasesCents = Number(releaseTotals?.total ?? 0);
      return {
        ...term,
        additionsCents,
        releasesCents,
        endingBalanceCents: term.beginningBalanceCents + additionsCents - releasesCents,
      };
    }),
  );
}

export async function createRestrictionTerm(
  db: Database,
  params: ActorParams & { data: CreateRestrictionTermInput },
) {
  assertLifecycle(params.planTier);
  const data = createRestrictionTermSchema.parse(params.data);
  await assertLinkedRecordsInOrg(db, params.orgId, data, params.entityId);
  await assertUnlinkedTermUsesDefaultEntity(db, { ...params, ...data });
  return db.transaction(async (tx) => {
    const [term] = await tx
      .insert(restrictionTerms)
      .values({
        orgId: params.orgId,
        createdBy: params.actorId,
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      })
      .returning();
    if (!term) throw badRequest("Failed to create restriction term");

    await replaceRestrictionTermAllowLists(tx, params.orgId, term.id, data);

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "restriction_term",
      entityId: term.id,
      entityLabel: term.title,
      changes: { after: term },
    });
    return term;
  });
}

export async function updateRestrictionTerm(
  db: Database,
  params: ActorParams & { termId: string; data: UpdateRestrictionTermInput },
) {
  assertLifecycle(params.planTier);
  const before = await getActiveTerm(db, params.orgId, params.termId, params.entityId);
  const data = updateRestrictionTermSchema.parse(params.data);
  await assertLinkedRecordsInOrg(db, params.orgId, data, params.entityId);
  const fallback = <T>(value: T | null | undefined): T | undefined => value ?? undefined;
  const merged = {
    fundId: data.fundId ?? fallback(before.fundId),
    grantId: data.grantId ?? fallback(before.grantId),
    donationId: data.donationId ?? fallback(before.donationId),
    sourceDocumentId: data.sourceDocumentId ?? fallback(before.sourceDocumentId),
    restrictionType: data.restrictionType ?? before.restrictionType,
    source: data.source ?? before.source,
    title: data.title ?? before.title,
    purposeStatement: data.purposeStatement ?? fallback(before.purposeStatement),
    releaseRule: data.releaseRule ?? fallback(before.releaseRule),
    startDate: data.startDate ?? before.startDate?.toISOString(),
    endDate: data.endDate ?? before.endDate?.toISOString(),
    beginningBalanceCents: data.beginningBalanceCents ?? before.beginningBalanceCents,
    currency: data.currency ?? before.currency,
    evidenceRequirement: data.evidenceRequirement ?? fallback(before.evidenceRequirement),
  };
  createRestrictionTermSchema.parse(merged);
  const changesIdentity = "fundId" in data || "grantId" in data || "donationId" in data;
  if (changesIdentity) {
    await assertLinkedRecordsInOrg(db, params.orgId, merged, params.entityId);
    await assertUnlinkedTermUsesDefaultEntity(db, { ...params, ...merged });
  }
  return db.transaction(async (tx) => {
    const { allowedPrograms, allowedCategories, ...termPatch } = data;
    const [term] = await tx
      .update(restrictionTerms)
      .set({
        ...termPatch,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(restrictionTerms.id, params.termId),
          eq(restrictionTerms.orgId, params.orgId),
          params.entityId ? restrictionTermEntityScope(params.orgId, params.entityId) : undefined,
          // Guard against a concurrent soft-delete between getActiveTerm (read
          // outside the tx) and this write — never mutate a deleted term.
          isNull(restrictionTerms.deletedAt),
        ),
      )
      .returning();
    if (!term) throw notFound("Restriction term not found");

    if (allowedPrograms || allowedCategories) {
      await replaceRestrictionTermAllowLists(tx, params.orgId, term.id, {
        allowedPrograms,
        allowedCategories,
      });
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "updated",
      entityType: "restriction_term",
      entityId: term.id,
      entityLabel: term.title,
      changes: { before, after: term },
    });
    return term;
  });
}

async function replaceRestrictionTermAllowLists(
  db: Database | TransactionDb,
  orgId: string,
  termId: string,
  data: Pick<CreateRestrictionTermInput, "allowedPrograms" | "allowedCategories">,
) {
  if (data.allowedPrograms) {
    await db
      .update(restrictionAllowedPrograms)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(restrictionAllowedPrograms.orgId, orgId),
          eq(restrictionAllowedPrograms.restrictionTermId, termId),
          isNull(restrictionAllowedPrograms.deletedAt),
        ),
      );
    if (data.allowedPrograms.length) {
      await db.insert(restrictionAllowedPrograms).values(
        data.allowedPrograms.map((program) => ({
          orgId,
          restrictionTermId: termId,
          program,
        })),
      );
    }
  }
  if (data.allowedCategories) {
    await db
      .update(restrictionAllowedCategories)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(restrictionAllowedCategories.orgId, orgId),
          eq(restrictionAllowedCategories.restrictionTermId, termId),
          isNull(restrictionAllowedCategories.deletedAt),
        ),
      );
    if (data.allowedCategories.length) {
      await db.insert(restrictionAllowedCategories).values(
        data.allowedCategories.map((row) => ({
          orgId,
          restrictionTermId: termId,
          category: row.category,
          accountId: row.accountId ?? null,
        })),
      );
    }
  }
}

export async function deleteRestrictionTerm(
  db: Database,
  params: ActorParams & { termId: string },
) {
  assertLifecycle(params.planTier);
  return db.transaction(async (tx) => {
    const term = await getActiveTerm(tx, params.orgId, params.termId, params.entityId);
    const [deleted] = await tx
      .update(restrictionTerms)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(restrictionTerms.id, params.termId),
          eq(restrictionTerms.orgId, params.orgId),
          params.entityId ? restrictionTermEntityScope(params.orgId, params.entityId) : undefined,
          isNull(restrictionTerms.deletedAt),
        ),
      )
      .returning();
    if (!deleted) throw notFound("Restriction term not found");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "deleted",
      entityType: "restriction_term",
      entityId: term.id,
      entityLabel: term.title,
      changes: { before: term, after: deleted },
    });
    return deleted;
  });
}

async function availableBalanceCents(db: Database | TransactionDb, orgId: string, termId: string) {
  const term = await getActiveTerm(db, orgId, termId);
  const [additionTotals] = await db
    .select({ total: sum(restrictionAdditions.amountCents) })
    .from(restrictionAdditions)
    .where(
      and(
        eq(restrictionAdditions.orgId, orgId),
        eq(restrictionAdditions.restrictionTermId, termId),
        isNull(restrictionAdditions.deletedAt),
      ),
    );
  const [releaseTotals] = await db
    .select({ total: sum(restrictionReleases.amountCents) })
    .from(restrictionReleases)
    .where(
      and(
        eq(restrictionReleases.orgId, orgId),
        eq(restrictionReleases.restrictionTermId, termId),
        isNull(restrictionReleases.deletedAt),
      ),
    );

  return (
    term.beginningBalanceCents +
    Number(additionTotals?.total ?? 0) -
    Number(releaseTotals?.total ?? 0)
  );
}

export async function createRestrictionAddition(
  db: Database,
  params: ActorParams & { termId: string; data: CreateRestrictionAdditionInput },
) {
  assertLifecycle(params.planTier);
  const data = createRestrictionAdditionSchema.parse(params.data);
  await assertLinkedRecordsInOrg(db, params.orgId, data, params.entityId);
  return db.transaction(async (tx) => {
    await getActiveTerm(tx, params.orgId, params.termId, params.entityId);
    const [addition] = await tx
      .insert(restrictionAdditions)
      .values({
        orgId: params.orgId,
        restrictionTermId: params.termId,
        createdBy: params.actorId,
        ...data,
        date: new Date(data.date),
      })
      .returning();
    if (!addition) throw badRequest("Failed to create restriction addition");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "restriction_addition",
      entityId: addition.id,
      changes: { after: addition },
    });
    return addition;
  });
}

export async function createRestrictionRelease(
  db: Database,
  params: ActorParams & { termId: string; data: CreateRestrictionReleaseInput },
) {
  assertLifecycle(params.planTier);
  const data = createRestrictionReleaseSchema.parse(params.data);
  await assertLinkedRecordsInOrg(db, params.orgId, data, params.entityId);
  return db.transaction(async (tx) => {
    const term = await getActiveTerm(tx, params.orgId, params.termId, params.entityId);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${params.orgId}:${params.termId}`}))`,
    );
    const warnings = await getReleaseWarnings(tx, params.orgId, params.termId, data);
    if (warnings.length > 0) {
      throw badRequest(warnings.join("; "));
    }
    const available = await availableBalanceCents(tx, params.orgId, term.id);
    if (data.amountCents > available) {
      throw badRequest("Release exceeds available restricted balance");
    }
    const [release] = await tx
      .insert(restrictionReleases)
      .values({
        orgId: params.orgId,
        restrictionTermId: params.termId,
        createdBy: params.actorId,
        expenseId: data.expenseId,
        journalLineId: data.journalLineId,
        amountCents: data.amountCents,
        date: new Date(data.date),
        reason: data.reason,
      })
      .returning();
    if (!release) throw badRequest("Failed to create restriction release");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "restriction_release",
      entityId: release.id,
      changes: { after: release },
    });
    return { release, warnings };
  });
}

async function getReleaseWarnings(
  db: Database | TransactionDb,
  orgId: string,
  termId: string,
  data: CreateRestrictionReleaseInput,
) {
  const warnings: string[] = [];
  if (data.program) {
    const allowedPrograms = await db
      .select({ program: restrictionAllowedPrograms.program })
      .from(restrictionAllowedPrograms)
      .where(
        and(
          eq(restrictionAllowedPrograms.orgId, orgId),
          eq(restrictionAllowedPrograms.restrictionTermId, termId),
          isNull(restrictionAllowedPrograms.deletedAt),
        ),
      );
    if (
      allowedPrograms.length > 0 &&
      !allowedPrograms.some((row) => row.program === data.program)
    ) {
      warnings.push("Release program is not allowed by this restriction term");
    }
  }
  if (data.category || data.accountId) {
    const allowedCategories = await db
      .select({
        category: restrictionAllowedCategories.category,
        accountId: restrictionAllowedCategories.accountId,
      })
      .from(restrictionAllowedCategories)
      .where(
        and(
          eq(restrictionAllowedCategories.orgId, orgId),
          eq(restrictionAllowedCategories.restrictionTermId, termId),
          isNull(restrictionAllowedCategories.deletedAt),
        ),
      );
    if (
      allowedCategories.length > 0 &&
      !allowedCategories.some(
        (row) =>
          (!data.category || row.category === data.category) &&
          (row.accountId === null || !data.accountId || row.accountId === data.accountId),
      )
    ) {
      warnings.push("Release category is not allowed by this restriction term");
    }
  }
  return warnings;
}

export async function linkRestrictionEvidence(
  db: Database,
  params: ActorParams & { releaseId: string; data: CreateRestrictionEvidenceLinkInput },
) {
  assertLifecycle(params.planTier);
  const data = createRestrictionEvidenceLinkSchema.parse(params.data);
  await assertLinkedRecordsInOrg(db, params.orgId, data, params.entityId);
  return db.transaction(async (tx) => {
    // Core query builder, not the relational query API —
    // restrictionReleaseEntityScope embeds raw `sql` fragments referencing
    // restrictionTerms (and, transitively, funds/grants/donations/organizations)
    // columns. See the note on getActiveTerm above. getTableColumns preserves
    // the "select every column" behavior of the original findFirst call.
    const [release] = await tx
      .select(getTableColumns(restrictionReleases))
      .from(restrictionReleases)
      .where(
        and(
          eq(restrictionReleases.id, params.releaseId),
          eq(restrictionReleases.orgId, params.orgId),
          params.entityId
            ? restrictionReleaseEntityScope(params.orgId, params.entityId)
            : undefined,
          isNull(restrictionReleases.deletedAt),
        ),
      )
      .limit(1);
    if (!release) throw notFound("Restriction release not found");
    const [link] = await tx
      .insert(restrictionEvidenceLinks)
      .values({
        orgId: params.orgId,
        restrictionReleaseId: params.releaseId,
        documentId: data.documentId,
        generatedReportId: data.generatedReportId,
        label: data.label,
        evidenceType: data.evidenceType,
        createdBy: params.actorId,
      })
      .returning();
    if (!link) throw badRequest("Failed to link restriction evidence");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "restriction_evidence_link",
      entityId: link.id,
      changes: { after: link },
    });
    return link;
  });
}

export type RestrictionAlert = {
  id: string;
  alertType: RestrictionAlertType;
  termId: string;
  releaseId: string | null;
  amountCents: number;
  label: string;
  contextLabel: string | null;
  date: Date;
};

export async function listRestrictionAlerts(
  db: Database,
  params: ActorParams & RestrictionAlertFilterParams,
): Promise<RestrictionAlert[]> {
  assertLifecycle(params.planTier);
  const filters = restrictionAlertFilterSchema.parse(params);
  const wantsType = (type: RestrictionAlertType) =>
    !filters.alertType || filters.alertType === type;

  const buckets = await Promise.all([
    wantsType("release_without_support")
      ? detectReleasesWithoutSupport(db, params.orgId, filters, params.entityId)
      : [],
    wantsType("missing_evidence")
      ? detectMissingEvidence(db, params.orgId, filters, params.entityId)
      : [],
    wantsType("expired_time_restriction")
      ? detectExpiredTimeRestrictions(db, params.orgId, filters, params.entityId)
      : [],
    wantsType("release_term_conflict")
      ? detectReleaseTermConflicts(db, params.orgId, filters, params.entityId)
      : [],
    wantsType("expense_term_conflict")
      ? detectExpenseTermConflicts(db, params.orgId, filters, params.entityId)
      : [],
    wantsType("negative_restricted_balance")
      ? detectNegativeBalances(db, params.orgId, filters, params.entityId)
      : [],
  ]);
  return buckets.flat();
}

// Re-export the canonical alert-type list so callers can iterate consistently.
export const RESTRICTION_ALERT_TYPE_LIST: ReadonlyArray<RestrictionAlertType> =
  RESTRICTION_ALERT_TYPES;

async function detectReleasesWithoutSupport(
  db: Database,
  orgId: string,
  filters: RestrictionAlertFilterParams,
  entityId?: string,
): Promise<RestrictionAlert[]> {
  const conditions = [
    eq(restrictionReleases.orgId, orgId),
    isNull(restrictionReleases.deletedAt),
    isNull(restrictionTerms.deletedAt),
    entityId ? restrictionTermEntityScope(orgId, entityId) : undefined,
    sql`${restrictionEvidenceLinks.id} is null`,
    filters.periodStart ? gte(restrictionReleases.date, new Date(filters.periodStart)) : undefined,
    filters.periodEnd ? lte(restrictionReleases.date, new Date(filters.periodEnd)) : undefined,
    filters.fundId ? eq(restrictionTerms.fundId, filters.fundId) : undefined,
    filters.grantId ? eq(restrictionTerms.grantId, filters.grantId) : undefined,
  ];
  const releases = await db
    .select({
      releaseId: restrictionReleases.id,
      termId: restrictionReleases.restrictionTermId,
      amountCents: restrictionReleases.amountCents,
      date: restrictionReleases.date,
      title: restrictionTerms.title,
    })
    .from(restrictionReleases)
    .innerJoin(
      restrictionTerms,
      and(
        eq(restrictionTerms.id, restrictionReleases.restrictionTermId),
        eq(restrictionTerms.orgId, orgId),
      ),
    )
    .leftJoin(
      restrictionEvidenceLinks,
      and(
        eq(restrictionEvidenceLinks.restrictionReleaseId, restrictionReleases.id),
        eq(restrictionEvidenceLinks.orgId, orgId),
        isNull(restrictionEvidenceLinks.deletedAt),
      ),
    )
    .where(and(...conditions.filter(Boolean)));

  return releases.map((release) => ({
    id: `release-without-support:${release.releaseId}`,
    alertType: "release_without_support",
    termId: release.termId,
    releaseId: release.releaseId,
    amountCents: release.amountCents,
    label: "Release is missing evidence",
    contextLabel: release.title ?? null,
    date: release.date,
  }));
}

async function detectMissingEvidence(
  db: Database,
  orgId: string,
  filters: RestrictionAlertFilterParams,
  entityId?: string,
): Promise<RestrictionAlert[]> {
  const conditions = [
    eq(restrictionTerms.orgId, orgId),
    isNull(restrictionTerms.deletedAt),
    entityId ? restrictionTermEntityScope(orgId, entityId) : undefined,
    isNotNull(restrictionTerms.evidenceRequirement),
    sql`NOT EXISTS (
      SELECT 1 FROM ${restrictionEvidenceLinks} el
      JOIN ${restrictionReleases} r ON el.restriction_release_id = r.id
      WHERE r.restriction_term_id = ${restrictionTerms.id}
        AND el.org_id = ${orgId}
        AND r.org_id = ${orgId}
        AND el.deleted_at IS NULL
        AND r.deleted_at IS NULL
    )`,
    filters.fundId ? eq(restrictionTerms.fundId, filters.fundId) : undefined,
    filters.grantId ? eq(restrictionTerms.grantId, filters.grantId) : undefined,
  ];
  const terms = await db
    .select({
      id: restrictionTerms.id,
      title: restrictionTerms.title,
      createdAt: restrictionTerms.createdAt,
    })
    .from(restrictionTerms)
    .where(and(...conditions.filter(Boolean)));

  return terms.map((term) => ({
    id: `missing-evidence:${term.id}`,
    alertType: "missing_evidence",
    termId: term.id,
    releaseId: null,
    amountCents: 0,
    label: `${term.title}: required evidence has not been recorded`,
    contextLabel: null,
    date: term.createdAt,
  }));
}

async function detectExpiredTimeRestrictions(
  db: Database,
  orgId: string,
  filters: RestrictionAlertFilterParams,
  entityId?: string,
): Promise<RestrictionAlert[]> {
  const now = new Date();
  const conditions = [
    eq(restrictionTerms.orgId, orgId),
    isNull(restrictionTerms.deletedAt),
    entityId ? restrictionTermEntityScope(orgId, entityId) : undefined,
    inArray(restrictionTerms.restrictionType, ["time", "purpose_and_time"]),
    isNotNull(restrictionTerms.endDate),
    lt(restrictionTerms.endDate, now),
    filters.fundId ? eq(restrictionTerms.fundId, filters.fundId) : undefined,
    filters.grantId ? eq(restrictionTerms.grantId, filters.grantId) : undefined,
    filters.periodStart ? gte(restrictionTerms.endDate, new Date(filters.periodStart)) : undefined,
    filters.periodEnd ? lte(restrictionTerms.endDate, new Date(filters.periodEnd)) : undefined,
  ];
  const additionsTotal = sql<string | null>`(
    SELECT SUM(amount_cents)::text FROM ${restrictionAdditions}
    WHERE restriction_term_id = ${restrictionTerms.id}
      AND org_id = ${orgId}
      AND deleted_at IS NULL
  )`;
  const releasesTotal = sql<string | null>`(
    SELECT SUM(amount_cents)::text FROM ${restrictionReleases}
    WHERE restriction_term_id = ${restrictionTerms.id}
      AND org_id = ${orgId}
      AND deleted_at IS NULL
  )`;
  const rows = await db
    .select({
      id: restrictionTerms.id,
      title: restrictionTerms.title,
      endDate: restrictionTerms.endDate,
      beginningBalanceCents: restrictionTerms.beginningBalanceCents,
      additionsTotal,
      releasesTotal,
    })
    .from(restrictionTerms)
    .where(and(...conditions.filter(Boolean)));

  return rows
    .map((row) => ({
      ...row,
      remaining:
        row.beginningBalanceCents +
        Number(row.additionsTotal ?? 0) -
        Number(row.releasesTotal ?? 0),
    }))
    .filter((row) => row.remaining > 0)
    .map((row) => ({
      id: `expired-time:${row.id}`,
      alertType: "expired_time_restriction",
      termId: row.id,
      releaseId: null,
      amountCents: row.remaining,
      label: `${row.title}: time restriction expired with ${row.remaining} cents unspent`,
      contextLabel: null,
      date: row.endDate ?? now,
    }));
}

async function detectReleaseTermConflicts(
  db: Database,
  orgId: string,
  filters: RestrictionAlertFilterParams,
  entityId?: string,
): Promise<RestrictionAlert[]> {
  const conditions = [
    eq(restrictionReleases.orgId, orgId),
    isNull(restrictionReleases.deletedAt),
    isNull(restrictionTerms.deletedAt),
    entityId ? restrictionTermEntityScope(orgId, entityId) : undefined,
    sql`(
      (${restrictionTerms.startDate} IS NOT NULL AND ${restrictionReleases.date} < ${restrictionTerms.startDate})
      OR (${restrictionTerms.endDate} IS NOT NULL AND ${restrictionReleases.date} > ${restrictionTerms.endDate})
    )`,
    filters.periodStart ? gte(restrictionReleases.date, new Date(filters.periodStart)) : undefined,
    filters.periodEnd ? lte(restrictionReleases.date, new Date(filters.periodEnd)) : undefined,
    filters.fundId ? eq(restrictionTerms.fundId, filters.fundId) : undefined,
    filters.grantId ? eq(restrictionTerms.grantId, filters.grantId) : undefined,
  ];
  const rows = await db
    .select({
      releaseId: restrictionReleases.id,
      termId: restrictionReleases.restrictionTermId,
      amountCents: restrictionReleases.amountCents,
      date: restrictionReleases.date,
      title: restrictionTerms.title,
    })
    .from(restrictionReleases)
    .innerJoin(
      restrictionTerms,
      and(
        eq(restrictionTerms.id, restrictionReleases.restrictionTermId),
        eq(restrictionTerms.orgId, orgId),
      ),
    )
    .where(and(...conditions.filter(Boolean)));

  return rows.map((row) => ({
    id: `release-term-conflict:${row.releaseId}`,
    alertType: "release_term_conflict",
    termId: row.termId,
    releaseId: row.releaseId,
    amountCents: row.amountCents,
    label: "Release date falls outside the restriction term window",
    contextLabel: row.title ?? null,
    date: row.date,
  }));
}

async function detectExpenseTermConflicts(
  db: Database,
  orgId: string,
  filters: RestrictionAlertFilterParams,
  entityId?: string,
): Promise<RestrictionAlert[]> {
  const conditions = [
    eq(restrictionReleases.orgId, orgId),
    isNull(restrictionReleases.deletedAt),
    isNull(restrictionTerms.deletedAt),
    entityId ? restrictionTermEntityScope(orgId, entityId) : undefined,
    entityId ? eq(expenses.entityId, entityId) : undefined,
    isNull(expenses.deletedAt),
    sql`(
      (${restrictionTerms.fundId} IS NOT NULL AND ${expenses.fundId} IS NOT NULL AND ${restrictionTerms.fundId} <> ${expenses.fundId})
      OR (${restrictionTerms.grantId} IS NOT NULL AND ${expenses.grantId} IS NOT NULL AND ${restrictionTerms.grantId} <> ${expenses.grantId})
      OR (
        EXISTS (
          SELECT 1 FROM ${restrictionAllowedCategories} ac
          WHERE ac.restriction_term_id = ${restrictionTerms.id}
            AND ac.org_id = ${orgId}
            AND ac.deleted_at IS NULL
        )
        AND ${expenses.category} IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${restrictionAllowedCategories} ac2
          WHERE ac2.restriction_term_id = ${restrictionTerms.id}
            AND ac2.org_id = ${orgId}
            AND ac2.deleted_at IS NULL
            AND ac2.category = ${expenses.category}
        )
      )
    )`,
    filters.periodStart ? gte(restrictionReleases.date, new Date(filters.periodStart)) : undefined,
    filters.periodEnd ? lte(restrictionReleases.date, new Date(filters.periodEnd)) : undefined,
    filters.fundId ? eq(restrictionTerms.fundId, filters.fundId) : undefined,
    filters.grantId ? eq(restrictionTerms.grantId, filters.grantId) : undefined,
  ];
  const rows = await db
    .select({
      releaseId: restrictionReleases.id,
      termId: restrictionReleases.restrictionTermId,
      amountCents: restrictionReleases.amountCents,
      date: restrictionReleases.date,
      title: restrictionTerms.title,
    })
    .from(restrictionReleases)
    .innerJoin(
      restrictionTerms,
      and(
        eq(restrictionTerms.id, restrictionReleases.restrictionTermId),
        eq(restrictionTerms.orgId, orgId),
      ),
    )
    .innerJoin(
      expenses,
      and(eq(expenses.id, restrictionReleases.expenseId), eq(expenses.orgId, orgId)),
    )
    .where(and(...conditions.filter(Boolean)));

  return rows.map((row) => ({
    id: `expense-term-conflict:${row.releaseId}`,
    alertType: "expense_term_conflict",
    termId: row.termId,
    releaseId: row.releaseId,
    amountCents: row.amountCents,
    label: "Release expense conflicts with the restriction term scope",
    contextLabel: row.title ?? null,
    date: row.date,
  }));
}

async function detectNegativeBalances(
  db: Database,
  orgId: string,
  filters: RestrictionAlertFilterParams,
  entityId?: string,
): Promise<RestrictionAlert[]> {
  // Negative balance is a point-in-time check; the schema's periodStart/End
  // filter intentionally has no effect here.
  const conditions = [
    eq(restrictionTerms.orgId, orgId),
    isNull(restrictionTerms.deletedAt),
    entityId ? restrictionTermEntityScope(orgId, entityId) : undefined,
    filters.fundId ? eq(restrictionTerms.fundId, filters.fundId) : undefined,
    filters.grantId ? eq(restrictionTerms.grantId, filters.grantId) : undefined,
  ];
  const additionsTotal = sql<string | null>`(
    SELECT SUM(amount_cents)::text FROM ${restrictionAdditions}
    WHERE restriction_term_id = ${restrictionTerms.id}
      AND org_id = ${orgId}
      AND deleted_at IS NULL
  )`;
  const releasesTotal = sql<string | null>`(
    SELECT SUM(amount_cents)::text FROM ${restrictionReleases}
    WHERE restriction_term_id = ${restrictionTerms.id}
      AND org_id = ${orgId}
      AND deleted_at IS NULL
  )`;
  const rows = await db
    .select({
      id: restrictionTerms.id,
      title: restrictionTerms.title,
      createdAt: restrictionTerms.createdAt,
      beginningBalanceCents: restrictionTerms.beginningBalanceCents,
      additionsTotal,
      releasesTotal,
    })
    .from(restrictionTerms)
    .where(and(...conditions.filter(Boolean)));

  return rows
    .map((row) => ({
      ...row,
      balance:
        row.beginningBalanceCents +
        Number(row.additionsTotal ?? 0) -
        Number(row.releasesTotal ?? 0),
    }))
    .filter((row) => row.balance < 0)
    .map((row) => ({
      id: `negative-balance:${row.id}`,
      alertType: "negative_restricted_balance",
      termId: row.id,
      releaseId: null,
      amountCents: row.balance,
      label: `${row.title}: restricted balance is negative`,
      contextLabel: null,
      date: row.createdAt,
    }));
}

export async function generateRestrictedRollforward(
  db: Database,
  params: ActorParams & {
    data: RestrictedRollforwardExportInput;
    env?: RestrictionEnv;
    onFirstReady?: () => void | Promise<void>;
    trialUsageTier?: "growth" | "audit_ready" | null;
  },
) {
  assertLifecycle(params.planTier);
  const data = restrictedRollforwardExportSchema.parse(params.data);
  if (data.includeEvidencePackage) {
    assertEvidencePackage(params.planTier);
  }
  const requestEntityId = await resolveReportEntityId(db, {
    orgId: params.orgId,
    entityId: params.entityId,
    fundId: data.fundId,
    grantId: data.grantId,
  });
  await assertRollforwardLinksInEntity(db, {
    orgId: params.orgId,
    entityId: requestEntityId,
    fundId: data.fundId,
    grantId: data.grantId,
  });

  const generatedReportQuery = (
    db.query as unknown as
      | {
          generatedReports?: {
            findFirst: (params: {
              where: unknown;
            }) => Promise<typeof generatedReports.$inferSelect | undefined>;
          };
        }
      | undefined
  )?.generatedReports;
  const existing = await generatedReportQuery?.findFirst({
    where: and(
      eq(generatedReports.orgId, params.orgId),
      eq(generatedReports.entityId, requestEntityId),
      eq(generatedReports.type, "restricted_rollforward"),
      eq(generatedReports.attemptId, data.attemptId),
    ),
  });
  if (existing?.type === "restricted_rollforward" && existing.attemptId === data.attemptId) {
    const metadata = readRollforwardMetadata(existing.metadata);
    assertRollforwardAttemptMatches(metadata, data);
    if (existing.status === "ready" || !params.env?.R2) {
      if (existing.status === "ready" && params.env) {
        await deliverReportReadyEffects(db, params.env, existing.id);
      }
      return {
        report: existing,
        rows: metadata.rows,
        evidencePackage: metadata.includeEvidencePackage,
      };
    }
    const completion = await finishRestrictedRollforward(db, params.env, existing, metadata);
    if (completion.transitioned) await params.onFirstReady?.();
    return completion.result;
  }

  await assertLinkedRecordsInOrg(db, params.orgId, data, requestEntityId);

  const termConditions = [
    eq(restrictionTerms.orgId, params.orgId),
    restrictionTermEntityScope(params.orgId, requestEntityId),
    isNull(restrictionTerms.deletedAt),
  ];
  if (data.fundId) termConditions.push(eq(restrictionTerms.fundId, data.fundId));
  if (data.grantId) termConditions.push(eq(restrictionTerms.grantId, data.grantId));
  const terms = await db
    .select()
    .from(restrictionTerms)
    .where(and(...termConditions))
    .orderBy(desc(restrictionTerms.createdAt));

  const rows = await Promise.all(
    terms.map(async (term) => {
      const [additionTotals] = await db
        .select({ total: sum(restrictionAdditions.amountCents) })
        .from(restrictionAdditions)
        .where(
          and(
            eq(restrictionAdditions.orgId, params.orgId),
            eq(restrictionAdditions.restrictionTermId, term.id),
            isNull(restrictionAdditions.deletedAt),
            gte(restrictionAdditions.date, new Date(data.periodStart)),
            lte(restrictionAdditions.date, new Date(data.periodEnd)),
          ),
        );
      const [releaseTotals] = await db
        .select({ total: sum(restrictionReleases.amountCents) })
        .from(restrictionReleases)
        .where(
          and(
            eq(restrictionReleases.orgId, params.orgId),
            eq(restrictionReleases.restrictionTermId, term.id),
            isNull(restrictionReleases.deletedAt),
            gte(restrictionReleases.date, new Date(data.periodStart)),
            lte(restrictionReleases.date, new Date(data.periodEnd)),
          ),
        );
      const additionsCents = Number(additionTotals?.total ?? 0);
      const releasesCents = Number(releaseTotals?.total ?? 0);
      const [priorAdditionTotals] = await db
        .select({ total: sum(restrictionAdditions.amountCents) })
        .from(restrictionAdditions)
        .where(
          and(
            eq(restrictionAdditions.orgId, params.orgId),
            eq(restrictionAdditions.restrictionTermId, term.id),
            isNull(restrictionAdditions.deletedAt),
            lt(restrictionAdditions.date, new Date(data.periodStart)),
          ),
        );
      const [priorReleaseTotals] = await db
        .select({ total: sum(restrictionReleases.amountCents) })
        .from(restrictionReleases)
        .where(
          and(
            eq(restrictionReleases.orgId, params.orgId),
            eq(restrictionReleases.restrictionTermId, term.id),
            isNull(restrictionReleases.deletedAt),
            lt(restrictionReleases.date, new Date(data.periodStart)),
          ),
        );
      const beginningBalanceCents =
        term.beginningBalanceCents +
        Number(priorAdditionTotals?.total ?? 0) -
        Number(priorReleaseTotals?.total ?? 0);
      const evidenceLinks = data.includeEvidencePackage
        ? await db
            .select({
              releaseId: restrictionReleases.id,
              evidenceLinkId: restrictionEvidenceLinks.id,
              evidenceType: restrictionEvidenceLinks.evidenceType,
              label: restrictionEvidenceLinks.label,
              documentId: restrictionEvidenceLinks.documentId,
              generatedReportId: restrictionEvidenceLinks.generatedReportId,
            })
            .from(restrictionReleases)
            .leftJoin(
              restrictionEvidenceLinks,
              and(
                eq(restrictionEvidenceLinks.restrictionReleaseId, restrictionReleases.id),
                eq(restrictionEvidenceLinks.orgId, params.orgId),
                isNull(restrictionEvidenceLinks.deletedAt),
              ),
            )
            .where(
              and(
                eq(restrictionReleases.orgId, params.orgId),
                eq(restrictionReleases.restrictionTermId, term.id),
                isNull(restrictionReleases.deletedAt),
                gte(restrictionReleases.date, new Date(data.periodStart)),
                lte(restrictionReleases.date, new Date(data.periodEnd)),
              ),
            )
        : [];
      return {
        termId: term.id,
        title: term.title,
        fundId: term.fundId,
        grantId: term.grantId,
        beginningBalanceCents,
        additionsCents,
        releasesCents,
        endingBalanceCents: beginningBalanceCents + additionsCents - releasesCents,
        evidenceLinks,
      };
    }),
  );

  const reportId = crypto.randomUUID();
  const fileName = "restricted-rollforward.csv";
  const fileKey = `${params.orgId}/reports/restricted-rollforward/${reportId}/${fileName}`;
  const metadata: RollforwardMetadata = {
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    includeEvidencePackage: data.includeEvidencePackage,
    fundId: data.fundId ?? null,
    grantId: data.grantId ?? null,
    title: data.title ?? "Restricted rollforward",
    rows,
  };
  const pendingValues = {
    id: reportId,
    orgId: params.orgId,
    entityId: requestEntityId,
    type: "restricted_rollforward",
    attemptId: data.attemptId,
    format: "csv_bundle",
    status: "pending",
    readyEffectsStatus: "pending",
    readyEffectsTrialTier: params.trialUsageTier ?? null,
    title: data.title ?? "Restricted rollforward",
    fileKey,
    fileName,
    metadata,
    generatedBy: params.actorId,
    fundId: data.fundId ?? null,
    grantId: data.grantId ?? null,
  };
  let inserted: typeof generatedReports.$inferSelect | undefined;
  try {
    [inserted] = await db.insert(generatedReports).values(pendingValues).returning();
  } catch (error) {
    if (!isUniqueViolation(error) || !generatedReportQuery) throw error;
    const winner = await generatedReportQuery.findFirst({
      where: and(
        eq(generatedReports.orgId, params.orgId),
        eq(generatedReports.entityId, requestEntityId),
        eq(generatedReports.type, "restricted_rollforward"),
        eq(generatedReports.attemptId, data.attemptId),
      ),
    });
    if (
      !winner ||
      winner.type !== "restricted_rollforward" ||
      winner.attemptId !== data.attemptId
    ) {
      throw error;
    }
    const winnerMetadata = readRollforwardMetadata(winner.metadata);
    assertRollforwardAttemptMatches(winnerMetadata, data);
    if (winner.status === "ready" || !params.env?.R2) {
      if (winner.status === "ready" && params.env) {
        await deliverReportReadyEffects(db, params.env, winner.id);
      }
      return {
        report: winner,
        rows: winnerMetadata.rows,
        evidencePackage: winnerMetadata.includeEvidencePackage,
      };
    }
    const completion = await finishRestrictedRollforward(db, params.env, winner, winnerMetadata);
    if (completion.transitioned) await params.onFirstReady?.();
    return completion.result;
  }
  if (!inserted) throw badRequest("Failed to persist restricted rollforward report");
  const report = {
    ...inserted,
    ...pendingValues,
    id: inserted.id,
    createdAt: inserted.createdAt,
    status: "pending",
  } as typeof generatedReports.$inferSelect;
  if (!params.env?.R2) {
    return { report, rows, evidencePackage: data.includeEvidencePackage };
  }
  const completion = await finishRestrictedRollforward(db, params.env, report, metadata);
  if (completion.transitioned) await params.onFirstReady?.();
  return completion.result;
}

function isUniqueViolation(error: unknown): error is Error & { code: "23505" } {
  return error instanceof Error && "code" in error && error.code === "23505";
}

type RollforwardRow = {
  termId: string;
  title: string;
  fundId: string | null;
  grantId: string | null;
  beginningBalanceCents: number;
  additionsCents: number;
  releasesCents: number;
  endingBalanceCents: number;
  evidenceLinks: Array<{
    releaseId: string;
    evidenceLinkId: string | null;
    evidenceType: string | null;
    label: string | null;
    documentId: string | null;
    generatedReportId: string | null;
  }>;
};

type RollforwardMetadata = {
  periodStart: string;
  periodEnd: string;
  includeEvidencePackage: boolean;
  fundId: string | null;
  grantId: string | null;
  title: string;
  rows: RollforwardRow[];
};

function readRollforwardMetadata(value: unknown): RollforwardMetadata {
  if (!value || typeof value !== "object") throw badRequest("Pending report cannot be resumed");
  const metadata = value as Partial<RollforwardMetadata>;
  if (
    typeof metadata.periodStart !== "string" ||
    typeof metadata.periodEnd !== "string" ||
    typeof metadata.includeEvidencePackage !== "boolean" ||
    !(typeof metadata.fundId === "string" || metadata.fundId === null) ||
    !(typeof metadata.grantId === "string" || metadata.grantId === null) ||
    typeof metadata.title !== "string" ||
    !Array.isArray(metadata.rows)
  ) {
    throw badRequest("Pending report cannot be resumed");
  }
  return metadata as RollforwardMetadata;
}

function assertRollforwardAttemptMatches(
  metadata: RollforwardMetadata,
  data: ReturnType<typeof restrictedRollforwardExportSchema.parse>,
): void {
  if (
    metadata.periodStart !== data.periodStart ||
    metadata.periodEnd !== data.periodEnd ||
    metadata.includeEvidencePackage !== data.includeEvidencePackage ||
    metadata.fundId !== (data.fundId ?? null) ||
    metadata.grantId !== (data.grantId ?? null) ||
    metadata.title !== (data.title ?? "Restricted rollforward")
  ) {
    throw badRequest("Export attempt does not match this request");
  }
}

function buildRestrictedRollforwardCsv(metadata: RollforwardMetadata) {
  const balanceRows = [
    [
      "Restriction Term",
      "Beginning Balance (cents)",
      "Additions (cents)",
      "Releases (cents)",
      "Ending Balance (cents)",
    ].join(","),
    ...metadata.rows.map((row) =>
      [
        csvCell(row.title),
        row.beginningBalanceCents,
        row.additionsCents,
        row.releasesCents,
        row.endingBalanceCents,
      ].join(","),
    ),
  ];
  const evidenceRows = metadata.includeEvidencePackage
    ? [
        "",
        "Evidence Package",
        [
          "Restriction Term",
          "Release ID",
          "Evidence Type",
          "Evidence Label",
          "Document ID",
          "Generated Report ID",
        ].join(","),
        ...metadata.rows.flatMap((row) =>
          row.evidenceLinks.map((link) =>
            [
              csvCell(row.title),
              csvCell(link.releaseId),
              csvCell(link.evidenceType ?? "missing"),
              csvCell(link.label ?? "Missing evidence"),
              csvCell(link.documentId ?? ""),
              csvCell(link.generatedReportId ?? ""),
            ].join(","),
          ),
        ),
      ]
    : [];
  return [...balanceRows, ...evidenceRows].join("\n");
}

async function finishRestrictedRollforward(
  db: Database,
  env: RestrictionEnv,
  report: typeof generatedReports.$inferSelect,
  metadata: RollforwardMetadata,
  options: { recoveredFromPending?: boolean } = {},
) {
  await env.R2!.put(report.fileKey, buildRestrictedRollforwardCsv(metadata), {
    httpMetadata: { contentType: "text/csv; charset=utf-8" },
  });
  const completion = await db.transaction(async (tx) => {
    const persistedMetadata = options.recoveredFromPending
      ? { ...metadata, recoveredFromPending: true }
      : metadata;
    const [updated] = await tx
      .update(generatedReports)
      .set({
        status: "ready",
        readyEffectsStatus: "pending",
        metadata: persistedMetadata,
      })
      .where(
        and(
          eq(generatedReports.id, report.id),
          eq(generatedReports.orgId, report.orgId),
          eq(generatedReports.status, "pending"),
        ),
      )
      .returning();
    if (!updated) {
      return {
        readyReport: { ...report, status: "ready" },
        transitioned: false,
      };
    }
    if (metadata.rows.length > 0) {
      await tx
        .insert(restrictionBalances)
        .values(
          metadata.rows.map((row) => ({
            orgId: report.orgId,
            restrictionTermId: row.termId,
            fundId: row.fundId,
            grantId: row.grantId,
            periodStart: new Date(metadata.periodStart),
            periodEnd: new Date(metadata.periodEnd),
            beginningBalanceCents: row.beginningBalanceCents,
            additionsCents: row.additionsCents,
            releasesCents: row.releasesCents,
            endingBalanceCents: row.endingBalanceCents,
            generatedReportId: report.id,
            source: "rollforward_generation",
            createdBy: report.generatedBy,
          })),
        )
        .onConflictDoNothing();
    }
    return { readyReport: { ...report, ...updated, status: "ready" }, transitioned: true };
  });
  if (completion.transitioned) await deliverReportReadyEffects(db, env, report.id);
  return {
    result: {
      report: completion.readyReport,
      rows: metadata.rows,
      evidencePackage: metadata.includeEvidencePackage,
    },
    transitioned: completion.transitioned,
  };
}

export async function recoverPendingRestrictedRollforwards(
  db: Database,
  env: Pick<Bindings, "R2" | "APP_URL" | "INTEGRATION_MODE">,
  now = new Date(),
): Promise<number> {
  if (!env.R2) return 0;
  const reports = await db.query.generatedReports.findMany({
    where: and(
      eq(generatedReports.type, "restricted_rollforward"),
      eq(generatedReports.status, "pending"),
      isNotNull(generatedReports.attemptId),
      lt(generatedReports.createdAt, new Date(now.getTime() - 5 * 60_000)),
      or(
        isNull(generatedReports.recoveryAttemptedAt),
        lt(generatedReports.recoveryAttemptedAt, new Date(now.getTime() - 60 * 60_000)),
      ),
    ),
    orderBy: [
      sql`${generatedReports.recoveryAttemptedAt} asc nulls first`,
      asc(generatedReports.createdAt),
      asc(generatedReports.id),
    ],
    limit: 25,
  });
  let recovered = 0;
  for (const report of reports) {
    if (!report.attemptId) continue;
    try {
      const metadata = readRollforwardMetadata(report.metadata);
      const result = await finishRestrictedRollforward(db, env, report, metadata, {
        recoveredFromPending: true,
      });
      if (!result.transitioned) continue;
      recovered += 1;
    } catch (error) {
      captureBackgroundException(error, "report_export_recovery", {
        report_type: "restricted_rollforward",
        operation: "resume_pending",
      });
      try {
        await db
          .update(generatedReports)
          .set({ recoveryAttemptedAt: now })
          .where(
            and(
              eq(generatedReports.id, report.id),
              eq(generatedReports.status, "pending"),
              isNotNull(generatedReports.attemptId),
            ),
          );
      } catch (stampError) {
        captureBackgroundException(stampError, "report_export_recovery", {
          report_type: "restricted_rollforward",
          operation: "backoff_stamp",
        });
      }
    }
  }
  return recovered;
}

function csvCell(value: string) {
  return `"${neutralizeCsvFormula(value).replaceAll('"', '""')}"`;
}

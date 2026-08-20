import { and, eq, isNotNull, isNull, lte, or, sql, sum } from "drizzle-orm";
import {
  donations,
  expenses,
  funds,
  grantIndirectCostRules,
  grantPaymentRequests,
  grantPaymentRequestLines,
  grants,
  organizations,
  restrictionAdditions,
  restrictionAllowedCategories,
  restrictionReleases,
  restrictionTerms,
  type Database,
} from "@grantpipe/db";
import {
  ANOMALY_CLASSES,
  classifyCategoryMisallocation,
  classifyDuplicateDonationGroup,
  classifyIndirectRateMismatch,
  classifyReleaseOverBalance,
  compareSeverity,
  deriveIndirectRateBasisPoints,
  type AnomalyClass,
  type AnomalySeverity,
} from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// Item types (discriminated union keyed on class)
// ---------------------------------------------------------------------------

export type CategoryMisallocationItem = {
  class: "category_misallocation";
  severity: AnomalySeverity;
  reason: string;
  entityType: "expense";
  entityId: string;
  expenseCategory: string | null;
  expenseAccountId: string | null;
  termId: string;
  fundId: string;
};

export type ReleaseOverBalanceItem = {
  class: "release_over_balance";
  severity: AnomalySeverity;
  reason: string;
  entityType: "restriction_release";
  entityId: string;
  releaseAmountCents: number;
  availableBalanceCents: number;
  overByCents: number;
  termId: string;
  fundId: string | null;
  grantId: string | null;
  donationId: string | null;
  contactId: string | null;
};

export type DuplicateDonationItem = {
  class: "duplicate_donation";
  severity: AnomalySeverity;
  reason: string;
  entityType: "donation";
  entityId: string;
  contactId: string;
  duplicateGroupIds: string[];
};

export type IndirectRateMismatchItem = {
  class: "indirect_rate_mismatch";
  severity: AnomalySeverity;
  reason: string;
  entityType: "payment_request";
  entityId: string;
  postedRateBasisPoints: number;
  postedAmountCents: number;
  expectedRateBasisPoints: number;
  expectedAmountCents: number;
  deltaCents: number;
};

export type AnomalyItem =
  | CategoryMisallocationItem
  | ReleaseOverBalanceItem
  | DuplicateDonationItem
  | IndirectRateMismatchItem;

export type AnomalyTotals = Record<AnomalyClass, number>;

export type AnomalyResult = {
  asOf: Date;
  items: AnomalyItem[];
  totals: AnomalyTotals;
};

// ---------------------------------------------------------------------------
// isReviewableAnomaly — filters to warning/critical severity
// ---------------------------------------------------------------------------

export function isReviewableAnomaly(item: AnomalyItem): boolean {
  return item.severity === "warning" || item.severity === "critical";
}

// ---------------------------------------------------------------------------
// Severity ordering helper (critical > warning > info)
// ---------------------------------------------------------------------------

function severitySort(a: AnomalyItem, b: AnomalyItem): number {
  const diff = compareSeverity(b.severity, a.severity);
  if (diff !== 0) return diff;
  // Stable secondary key: class then entityId
  if (a.class !== b.class) return a.class.localeCompare(b.class);
  return a.entityId.localeCompare(b.entityId);
}

// ---------------------------------------------------------------------------
// Per-class detectors
// ---------------------------------------------------------------------------

function donationEntityScope(orgId: string, entityId?: string) {
  if (!entityId) return undefined;
  return and(
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
  );
}

function restrictionTermEntityScope(orgId: string, entityId?: string) {
  if (!entityId) return undefined;
  const defaultEntity = sql`EXISTS (
    SELECT 1 FROM ${organizations}
    WHERE ${organizations.id} = ${orgId}
      AND ${organizations.defaultEntityId} = ${entityId}
  )`;
  const linkedDonation = sql`EXISTS (
    SELECT 1 FROM ${donations}
    WHERE ${donations.id} = ${restrictionTerms.donationId}
      AND ${donations.orgId} = ${orgId}
      AND ${donationEntityScope(orgId, entityId)}
  )`;
  return and(
    or(
      isNull(restrictionTerms.fundId),
      sql`EXISTS (
        SELECT 1 FROM ${funds}
        WHERE ${funds.id} = ${restrictionTerms.fundId}
          AND ${funds.orgId} = ${orgId}
          AND ${funds.entityId} = ${entityId}
      )`,
    ),
    or(
      isNull(restrictionTerms.grantId),
      sql`EXISTS (
        SELECT 1 FROM ${grants}
        WHERE ${grants.id} = ${restrictionTerms.grantId}
          AND ${grants.orgId} = ${orgId}
          AND ${grants.entityId} = ${entityId}
      )`,
    ),
    or(isNull(restrictionTerms.donationId), linkedDonation),
    or(
      isNotNull(restrictionTerms.fundId),
      isNotNull(restrictionTerms.grantId),
      isNotNull(restrictionTerms.donationId),
      defaultEntity,
    ),
  );
}

function restrictionReleaseEntityScope(orgId: string, entityId?: string) {
  if (!entityId) return undefined;
  return sql`EXISTS (
    SELECT 1 FROM ${restrictionTerms}
    WHERE ${restrictionTerms.id} = ${restrictionReleases.restrictionTermId}
      AND ${restrictionTerms.orgId} = ${orgId}
      AND ${restrictionTerms.deletedAt} IS NULL
      AND ${restrictionTermEntityScope(orgId, entityId)}
  )`;
}

async function detectCategoryMisallocations(
  db: Database,
  orgId: string,
  entityId?: string,
): Promise<CategoryMisallocationItem[]> {
  // Load all non-deleted expenses that have a fundId (only those can violate restriction terms)
  const expenseRows = await db.query.expenses.findMany({
    where: and(
      eq(expenses.orgId, orgId),
      entityId ? eq(expenses.entityId, entityId) : undefined,
      isNull(expenses.deletedAt),
    ),
    columns: {
      id: true,
      fundId: true,
      category: true,
      accountId: true,
    },
  });

  const items: CategoryMisallocationItem[] = [];

  for (const expense of expenseRows) {
    if (!expense.fundId) continue;
    if (!expense.category && !expense.accountId) continue;

    // Find active restriction terms for this expense's fund
    const terms = await db.query.restrictionTerms.findMany({
      where: and(
        eq(restrictionTerms.orgId, orgId),
        eq(restrictionTerms.fundId, expense.fundId),
        isNull(restrictionTerms.deletedAt),
      ),
      columns: { id: true },
    });

    for (const term of terms) {
      const allowedCats = await db
        .select({
          category: restrictionAllowedCategories.category,
          accountId: restrictionAllowedCategories.accountId,
        })
        .from(restrictionAllowedCategories)
        .where(
          and(
            eq(restrictionAllowedCategories.orgId, orgId),
            eq(restrictionAllowedCategories.restrictionTermId, term.id),
            isNull(restrictionAllowedCategories.deletedAt),
          ),
        );

      const result = classifyCategoryMisallocation({
        expenseCategory: expense.category ?? null,
        expenseAccountId: expense.accountId ?? null,
        allowedCategories: allowedCats.map((r) => ({
          category: r.category ?? null,
          accountId: r.accountId ?? null,
        })),
      });

      if (result.isAnomaly) {
        items.push({
          class: "category_misallocation",
          severity: result.severity,
          reason: result.reason,
          entityType: "expense",
          entityId: expense.id,
          expenseCategory: expense.category ?? null,
          expenseAccountId: expense.accountId ?? null,
          termId: term.id,
          fundId: expense.fundId,
        });
      }
    }
  }

  return items;
}

async function detectReleaseOverBalances(
  db: Database,
  orgId: string,
  entityId?: string,
): Promise<ReleaseOverBalanceItem[]> {
  // Load all non-deleted restriction releases with their term info.
  //
  // Uses the core query builder (db.select().from().where()), not the
  // relational query API (db.query.*.findMany), because
  // restrictionReleaseEntityScope embeds raw `sql` fragments that reference
  // OTHER tables' columns (restrictionTerms, funds, grants, organizations).
  // The relational compiler re-qualifies every bare Column reference in
  // `where` with the base table's own alias, which would corrupt those
  // cross-table fragments and 500 in Postgres.
  const releases = await db
    .select({
      id: restrictionReleases.id,
      restrictionTermId: restrictionReleases.restrictionTermId,
      amountCents: restrictionReleases.amountCents,
      date: restrictionReleases.date,
      createdAt: restrictionReleases.createdAt,
    })
    .from(restrictionReleases)
    .where(
      and(
        eq(restrictionReleases.orgId, orgId),
        restrictionReleaseEntityScope(orgId, entityId),
        isNull(restrictionReleases.deletedAt),
      ),
    );

  const items: ReleaseOverBalanceItem[] = [];

  const termCache = new Map<
    string,
    {
      beginningBalanceCents: number;
      fundId: string | null;
      grantId: string | null;
      donationId: string | null;
      contactId: string | null;
    }
  >();

  for (const release of releases) {
    const termId = release.restrictionTermId;

    let cached = termCache.get(termId);

    if (!cached) {
      // Core query builder for the same relational-API re-qualification
      // reason documented above restrictionReleases.findMany.
      const termRows = await db
        .select({
          id: restrictionTerms.id,
          beginningBalanceCents: restrictionTerms.beginningBalanceCents,
          fundId: restrictionTerms.fundId,
          grantId: restrictionTerms.grantId,
          donationId: restrictionTerms.donationId,
          donation: {
            contactId: sql<string | null>`(
              SELECT ${donations.contactId}
              FROM ${donations}
              WHERE ${donations.id} = ${restrictionTerms.donationId}
                AND ${donations.orgId} = ${orgId}
                AND ${donations.deletedAt} IS NULL
              LIMIT 1
            )`,
          },
        })
        .from(restrictionTerms)
        .where(
          and(
            eq(restrictionTerms.orgId, orgId),
            eq(restrictionTerms.id, termId),
            restrictionTermEntityScope(orgId, entityId),
            isNull(restrictionTerms.deletedAt),
          ),
        )
        .limit(1);
      const [term] = termRows;

      if (!term) continue;

      cached = {
        beginningBalanceCents: term.beginningBalanceCents,
        fundId: term.fundId ?? null,
        grantId: term.grantId ?? null,
        donationId: term.donationId ?? null,
        contactId: term.donation?.contactId ?? null,
      };

      termCache.set(termId, cached);
    }

    const releaseDate = release.date instanceof Date ? release.date : new Date(release.date);

    const [additionTotals] = await db
      .select({ total: sum(restrictionAdditions.amountCents) })
      .from(restrictionAdditions)
      .where(
        and(
          eq(restrictionAdditions.orgId, orgId),
          eq(restrictionAdditions.restrictionTermId, termId),
          lte(restrictionAdditions.date, releaseDate),
          isNull(restrictionAdditions.deletedAt),
        ),
      );

    const poolCents = cached.beginningBalanceCents + Number(additionTotals?.total ?? 0);
    const releaseCreatedAt =
      release.createdAt instanceof Date ? release.createdAt : new Date(release.createdAt);
    const priorReleaseCents = releases
      .filter((candidate) => {
        if (candidate.restrictionTermId !== termId || candidate.id === release.id) {
          return false;
        }

        const candidateDate =
          candidate.date instanceof Date ? candidate.date : new Date(candidate.date);
        if (candidateDate.getTime() < releaseDate.getTime()) {
          return true;
        }
        if (candidateDate.getTime() > releaseDate.getTime()) {
          return false;
        }

        const candidateCreatedAt =
          candidate.createdAt instanceof Date ? candidate.createdAt : new Date(candidate.createdAt);
        if (candidateCreatedAt.getTime() < releaseCreatedAt.getTime()) {
          return true;
        }
        if (candidateCreatedAt.getTime() > releaseCreatedAt.getTime()) {
          return false;
        }

        return candidate.id < release.id;
      })
      .reduce((total, candidate) => total + candidate.amountCents, 0);
    const availableBalance = poolCents - priorReleaseCents;

    const result = classifyReleaseOverBalance({
      releaseAmountCents: release.amountCents,
      availableBalanceCents: availableBalance,
    });

    if (result.isAnomaly) {
      items.push({
        class: "release_over_balance",
        severity: result.severity,
        reason: result.reason,
        entityType: "restriction_release",
        entityId: release.id,
        releaseAmountCents: release.amountCents,
        availableBalanceCents: availableBalance,
        overByCents: result.overByCents,
        termId,
        fundId: cached.fundId,
        grantId: cached.grantId,
        donationId: cached.donationId,
        contactId: cached.contactId,
      });
    }
  }

  return items;
}

async function detectDuplicateDonations(
  db: Database,
  orgId: string,
  entityId?: string,
): Promise<DuplicateDonationItem[]> {
  // Core query builder for the same relational-API re-qualification reason
  // documented above restrictionReleases.findMany.
  const donationRows = await db
    .select({
      id: donations.id,
      contactId: donations.contactId,
      amountCents: donations.amountCents,
      date: donations.date,
    })
    .from(donations)
    .where(
      and(
        eq(donations.orgId, orgId),
        donationEntityScope(orgId, entityId),
        isNull(donations.deletedAt),
      ),
    );

  // Group by (contactId, amountCents)
  const groups = new Map<string, Array<{ id: string; contactId: string; dateMs: number }>>();
  for (const d of donationRows) {
    const key = `${d.contactId}::${d.amountCents}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      id: d.id,
      contactId: d.contactId,
      dateMs: d.date instanceof Date ? d.date.getTime() : new Date(d.date).getTime(),
    });
  }

  const items: DuplicateDonationItem[] = [];
  const seenDonationIds = new Set<string>();

  for (const groupDonations of groups.values()) {
    const result = classifyDuplicateDonationGroup({ donations: groupDonations });
    if (!result.isAnomaly) continue;

    for (const id of result.duplicateIds) {
      if (seenDonationIds.has(id)) continue;
      seenDonationIds.add(id);
      const donation = groupDonations.find((d) => d.id === id);
      if (!donation) continue;
      items.push({
        class: "duplicate_donation",
        severity: result.severity,
        reason: result.reason,
        entityType: "donation",
        entityId: id,
        contactId: donation.contactId,
        duplicateGroupIds: result.duplicateIds,
      });
    }
  }

  return items;
}

async function detectIndirectRateMismatches(
  db: Database,
  orgId: string,
  now: Date,
  entityId?: string,
): Promise<IndirectRateMismatchItem[]> {
  // Load all non-deleted indirect lines and their parent request
  const indirectLines = await db
    .select({
      requestId: grantPaymentRequestLines.requestId,
      lineId: grantPaymentRequestLines.id,
      postedAmountCents: grantPaymentRequestLines.amountCents,
      grantId: grantPaymentRequests.grantId,
    })
    .from(grantPaymentRequestLines)
    .innerJoin(
      grantPaymentRequests,
      and(
        eq(grantPaymentRequestLines.requestId, grantPaymentRequests.id),
        eq(grantPaymentRequests.orgId, orgId),
        entityId
          ? sql`EXISTS (
              SELECT 1 FROM ${grants}
              WHERE ${grants.id} = ${grantPaymentRequests.grantId}
                AND ${grants.orgId} = ${orgId}
                AND ${grants.entityId} = ${entityId}
                AND ${grants.deletedAt} IS NULL
            )`
          : undefined,
        isNull(grantPaymentRequests.deletedAt),
      ),
    )
    .where(
      and(
        eq(grantPaymentRequestLines.orgId, orgId),
        eq(grantPaymentRequestLines.category, "indirect"),
        isNull(grantPaymentRequestLines.deletedAt),
      ),
    );

  if (indirectLines.length === 0) return [];

  // Load active indirect cost rules for this org
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
      ),
    );

  if (rules.length === 0) return [];

  // For each unique request, find the active rule and compute the expected indirect
  const items: IndirectRateMismatchItem[] = [];
  const processedRequests = new Set<string>();

  for (const line of indirectLines) {
    if (processedRequests.has(line.requestId)) continue;
    processedRequests.add(line.requestId);

    // Find best rule for this request's grant (prefer grant-specific, then org-wide)
    const relevantRules = rules.filter((r) => r.grantId === line.grantId || r.grantId === null);
    if (relevantRules.length === 0) continue;

    const sorted = [...relevantRules].sort((a, b) => {
      const aSpecific = a.grantId !== null ? 1 : 0;
      const bSpecific = b.grantId !== null ? 1 : 0;
      if (aSpecific !== bSpecific) return bSpecific - aSpecific;
      const aDate = a.effectiveFrom instanceof Date ? a.effectiveFrom : new Date(a.effectiveFrom);
      const bDate = b.effectiveFrom instanceof Date ? b.effectiveFrom : new Date(b.effectiveFrom);
      return bDate.getTime() - aDate.getTime();
    });

    const activeRule = sorted[0];
    if (!activeRule) continue;

    // Compute base from direct lines in this request
    const directLines = await db
      .select({
        amountCents: grantPaymentRequestLines.amountCents,
        description: grantPaymentRequestLines.description,
      })
      .from(grantPaymentRequestLines)
      .where(
        and(
          eq(grantPaymentRequestLines.requestId, line.requestId),
          eq(grantPaymentRequestLines.orgId, orgId),
          eq(grantPaymentRequestLines.category, "direct"),
          isNull(grantPaymentRequestLines.deletedAt),
        ),
      );

    // Base classification mirrors computeIndirectLine in payments/indirect.service.ts
    // exactly. V1 heuristic: salaries_only / modified_total_direct bases are
    // resolved by description keyword matching, a documented limitation pending a
    // structured costCategory field. Because the detector reuses the same
    // computation the system uses to produce the expected line, the posted-vs-
    // expected comparison stays internally consistent.
    let baseAmountCents = 0;
    if (activeRule.base === "direct_costs") {
      baseAmountCents = directLines.reduce((acc, l) => acc + l.amountCents, 0);
    } else if (activeRule.base === "salaries_only") {
      baseAmountCents = directLines
        .filter((l) => {
          const desc = (l.description ?? "").toLowerCase();
          return (
            desc.includes("salary") || desc.includes("payroll") || desc.includes("compensation")
          );
        })
        .reduce((acc, l) => acc + l.amountCents, 0);
    } else if (activeRule.base === "modified_total_direct") {
      baseAmountCents = directLines
        .filter((l) => {
          const desc = (l.description ?? "").toLowerCase();
          return !desc.includes("equipment") && !desc.includes("capital");
        })
        .reduce((acc, l) => acc + l.amountCents, 0);
    }

    const expectedAmountCents = Math.round((baseAmountCents * activeRule.rateBasisPoints) / 10000);

    // Get the posted indirect line(s) for this request
    const requestIndirectLines = indirectLines.filter((l) => l.requestId === line.requestId);
    const totalPostedCents = requestIndirectLines.reduce((acc, l) => acc + l.postedAmountCents, 0);

    const result = classifyIndirectRateMismatch({
      postedAmountCents: totalPostedCents,
      expectedRateBasisPoints: activeRule.rateBasisPoints,
      expectedAmountCents,
    });

    if (result.isAnomaly) {
      // Effective rate the posted amount actually represents against the base.
      // Falls back to the rule rate when the base is zero (no derivable rate).
      const derivedPostedRate = deriveIndirectRateBasisPoints({
        postedAmountCents: totalPostedCents,
        baseAmountCents,
      });

      items.push({
        class: "indirect_rate_mismatch",
        severity: result.severity,
        reason: result.reason,
        entityType: "payment_request",
        entityId: line.requestId,
        postedRateBasisPoints: derivedPostedRate ?? activeRule.rateBasisPoints,
        postedAmountCents: totalPostedCents,
        expectedRateBasisPoints: activeRule.rateBasisPoints,
        expectedAmountCents,
        deltaCents: result.deltaCents,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// getAnomalies — main service entry point
// ---------------------------------------------------------------------------

export async function getAnomalies(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    now: Date;
    classes?: AnomalyClass[];
    limit?: number;
    hasIndirectRules?: boolean;
    hasRestrictionData?: boolean;
  },
): Promise<AnomalyResult> {
  const {
    orgId,
    entityId,
    now,
    classes,
    limit,
    hasIndirectRules = true,
    hasRestrictionData = true,
  } = params;

  // Detectors are gated ONLY by the org's capabilities, never by the `classes`
  // filter. This keeps `totals` an accurate count of the full anomaly
  // population so the web view's per-class filter chips show real counts even
  // while the visible item list is narrowed to a subset of classes.
  const [categoryMisallocations, releaseOverBalances, duplicateDonations, indirectRateMismatches] =
    await Promise.all([
      hasRestrictionData
        ? detectCategoryMisallocations(db, orgId, entityId)
        : Promise.resolve<CategoryMisallocationItem[]>([]),
      hasRestrictionData
        ? detectReleaseOverBalances(db, orgId, entityId)
        : Promise.resolve<ReleaseOverBalanceItem[]>([]),
      detectDuplicateDonations(db, orgId, entityId),
      hasIndirectRules
        ? detectIndirectRateMismatches(db, orgId, now, entityId)
        : Promise.resolve<IndirectRateMismatchItem[]>([]),
    ]);

  // Totals are computed over the FULL population (before classes/limit filtering)
  const totals: AnomalyTotals = {
    category_misallocation: categoryMisallocations.length,
    release_over_balance: releaseOverBalances.length,
    duplicate_donation: duplicateDonations.length,
    indirect_rate_mismatch: indirectRateMismatches.length,
  };

  // `classes` filters which classes appear in the returned item list only.
  const enabledClasses = new Set<AnomalyClass>(
    classes ?? (ANOMALY_CLASSES as readonly AnomalyClass[]),
  );

  // Merge all items, narrow to the requested classes, sort by severity desc.
  let allItems: AnomalyItem[] = [
    ...categoryMisallocations,
    ...releaseOverBalances,
    ...duplicateDonations,
    ...indirectRateMismatches,
  ]
    .filter((item) => enabledClasses.has(item.class))
    .sort(severitySort);

  // Apply limit
  if (limit !== undefined) {
    allItems = allItems.slice(0, limit);
  }

  return { asOf: now, items: allItems, totals };
}

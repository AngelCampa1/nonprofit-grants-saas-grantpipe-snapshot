import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import {
  grants,
  funds,
  grantBudgetVersions,
  grantBudgetLines,
  grantBudgetLineAllocations,
  plannedExpenses,
  restrictionTerms,
  restrictionAdditions,
  restrictionReleases,
  type Database,
} from "@grantpipe/db";
import {
  classifyBudgetLineOverspend,
  classifyFundUnderspend,
  type BudgetOverspendBand,
  type FundUnderspendBand,
} from "@grantpipe/shared";
import { getBudgetVarianceRowsFromData } from "./budget-reporting.service";

type EntityScopedParams = { entityId?: string };

function entityScopeCondition(table: { entityId: Column }, entityId?: string) {
  return entityId ? eq(table.entityId, entityId) : undefined;
}

async function getRestrictionEntityScope(
  db: Database,
  orgId: string,
  entityId: string | undefined,
) {
  if (!entityId) return undefined;

  const [grantRows, fundRows] = await Promise.all([
    db.query.grants.findMany({
      where: and(
        eq(grants.orgId, orgId),
        entityScopeCondition(grants, entityId),
        isNull(grants.deletedAt),
      ),
      columns: { id: true },
    }),
    db.query.funds.findMany({
      where: and(
        eq(funds.orgId, orgId),
        entityScopeCondition(funds, entityId),
        isNull(funds.deletedAt),
      ),
      columns: { id: true },
    }),
  ]);

  const grantIds = grantRows.map((grant) => grant.id);
  const fundIds = fundRows.map((fund) => fund.id);

  return (
    or(
      fundIds.length > 0 ? inArray(restrictionTerms.fundId, fundIds) : undefined,
      grantIds.length > 0 ? inArray(restrictionTerms.grantId, grantIds) : undefined,
    ) ?? eq(restrictionTerms.id, "__no_active_entity_restrictions__")
  );
}

// ---------------------------------------------------------------------------
// Allow-list of grant statuses where budget alerts make sense.
// Statuses: discovery | application | submitted | awarded | active |
//           reporting | closeout | renewal | declined
// We alert on: awarded, active, reporting (budget is being executed).
// All other statuses are excluded: discovery, application, submitted
// (pre-award, no spend yet), closeout, declined, renewal (terminal or
// pre-re-award).
// ---------------------------------------------------------------------------
const EXECUTING_GRANT_STATUSES = ["awarded", "active", "reporting"] as const;

// ---------------------------------------------------------------------------
// Item types
// ---------------------------------------------------------------------------

export type BudgetSentinelOverspendItem = {
  kind: "overspend";
  id: string; // budgetLineId
  grantId: string;
  grantName: string;
  category: string;
  band: BudgetOverspendBand;
  approvedAmountCents: number;
  actualCents: number;
  plannedCents: number;
  projectedCents: number;
  overByCents: number;
  utilizationPercent: number | null;
  riskScore: number;
};

export type BudgetSentinelUnderspendItem = {
  kind: "underspend";
  id: string; // restrictionTermId
  fundId: string | null;
  fundName: string | null;
  grantId: string | null;
  title: string;
  band: FundUnderspendBand;
  balanceCents: number;
  daysUntilEnd: number;
  endDate: Date;
  riskScore: number;
};

export type BudgetSentinelItem = BudgetSentinelOverspendItem | BudgetSentinelUnderspendItem;

export type BudgetSentinelTotals = {
  overspend: {
    near_limit: number;
    projected_overspend: number;
    over_budget: number;
    total: number;
  };
  underspend: {
    lapse_watch: number;
    lapsing_soon: number;
    lapsed_unspent: number;
    total: number;
  };
  totalAtRisk: number;
};

export type BudgetSentinelResult = {
  asOf: Date;
  items: BudgetSentinelItem[];
  totals: BudgetSentinelTotals;
};

// ---------------------------------------------------------------------------
// Core service
// ---------------------------------------------------------------------------

export async function getBudgetSentinel(
  db: Database,
  params: EntityScopedParams & {
    orgId: string;
    now: Date;
    kinds?: ("overspend" | "underspend")[];
    limit?: number;
  },
): Promise<BudgetSentinelResult> {
  const { orgId, now, kinds, limit } = params;

  // ---- OVERSPEND: bulk-load all approved budget versions + lines for this org ----
  const versions = await db.query.grantBudgetVersions.findMany({
    where: and(
      eq(grantBudgetVersions.orgId, orgId),
      entityScopeCondition(grantBudgetVersions, params.entityId),
      eq(grantBudgetVersions.status, "approved"),
      isNull(grantBudgetVersions.deletedAt),
    ),
    columns: { id: true, grantId: true },
  });

  const overspendItems: BudgetSentinelOverspendItem[] = [];

  if (versions.length > 0) {
    const versionIds = versions.map((v) => v.id);
    const grantIdByVersionId = new Map(versions.map((v) => [v.id, v.grantId]));

    // Fetch grant info for all grantIds from versions (to filter closed/deleted grants)
    const grantIds = [...new Set(versions.map((v) => v.grantId))];
    const grantRows = await db.query.grants.findMany({
      where: and(
        eq(grants.orgId, orgId),
        entityScopeCondition(grants, params.entityId),
        inArray(grants.id, grantIds),
        isNull(grants.deletedAt),
      ),
      columns: { id: true, name: true, status: true },
    });
    const grantById = new Map(grantRows.map((g) => [g.id, g]));

    // Exclude versions whose grant is closed or missing.
    // grantIdByVersionId is built from the same versions array, so get() always returns a value.
    // grantById only contains the grants returned from DB — if a grant isn't there it was deleted.
    const activeVersionIds = versionIds.filter((vId) => {
      const grantId = grantIdByVersionId.get(vId);
      /* c8 ignore next -- vId always in grantIdByVersionId (built from same versions array) */
      if (!grantId) return false;
      const grant = grantById.get(grantId);
      if (!grant) return false;
      return (EXECUTING_GRANT_STATUSES as readonly string[]).includes(grant.status);
    });

    if (activeVersionIds.length === 0) {
      // no active grants with approved budgets
    } else {
      // Bulk-fetch all lines across all active approved versions
      const lines = await db.query.grantBudgetLines.findMany({
        where: and(
          eq(grantBudgetLines.orgId, orgId),
          entityScopeCondition(grantBudgetLines, params.entityId),
          inArray(grantBudgetLines.budgetVersionId, activeVersionIds),
          isNull(grantBudgetLines.deletedAt),
        ),
        columns: {
          id: true,
          category: true,
          approvedAmountCents: true,
          allowable: true,
          costType: true,
          budgetVersionId: true,
        },
      });

      if (lines.length > 0) {
        const lineIds = lines.map((l) => l.id);

        // Bulk-fetch allocations
        const allAllocations = await db.query.grantBudgetLineAllocations.findMany({
          where: and(
            eq(grantBudgetLineAllocations.orgId, orgId),
            entityScopeCondition(grantBudgetLineAllocations, params.entityId),
            inArray(grantBudgetLineAllocations.budgetLineId, lineIds),
            isNull(grantBudgetLineAllocations.deletedAt),
          ),
          columns: { budgetLineId: true, amountCents: true, expenseId: true },
          with: {
            expense: {
              columns: { deletedAt: true },
            },
          },
        });
        const activeAllocations = allAllocations.filter((allocation) => {
          if (!allocation.expenseId) return true;
          return allocation.expense?.deletedAt === null;
        });

        // Gather all grantIds for active lines
        const grantIdsForLines = [
          ...new Set(
            lines
              .map((l) => grantIdByVersionId.get(l.budgetVersionId))
              .filter((id): id is string => Boolean(id)),
          ),
        ];

        // grantIdsForLines is always non-empty here (lines are filtered to activeVersionIds
        // which all have a corresponding grantId); the [] fallback is a type-safety guard.
        /* c8 ignore next 10 */
        const allPlanned =
          grantIdsForLines.length > 0
            ? await db.query.plannedExpenses.findMany({
                where: and(
                  eq(plannedExpenses.orgId, orgId),
                  entityScopeCondition(plannedExpenses, params.entityId),
                  inArray(plannedExpenses.grantId, grantIdsForLines),
                  inArray(plannedExpenses.budgetLineId, lineIds),
                  inArray(plannedExpenses.status, ["planned", "committed"]),
                  isNull(plannedExpenses.deletedAt),
                ),
                columns: { budgetLineId: true, amountCents: true },
              })
            : /* c8 ignore next */ [];

        // Compute variance rows for ALL lines
        const varianceRows = getBudgetVarianceRowsFromData({
          lines: lines.map((l) => ({
            id: l.id,
            category: l.category,
            approvedAmountCents: l.approvedAmountCents,
            allowable: l.allowable,
            costType: l.costType,
          })),
          allocations: activeAllocations,
          plannedExpenses: allPlanned,
        });

        // Build a lookup: lineId → budgetVersionId
        const lineVersionId = new Map(lines.map((l) => [l.id, l.budgetVersionId]));

        for (const row of varianceRows) {
          /* c8 ignore next 2 -- getBudgetVarianceRowsFromData only returns rows for lineIds we passed */
          const vId = lineVersionId.get(row.lineId);
          if (!vId) continue;
          /* c8 ignore next 2 -- vId always in grantIdByVersionId (from activeVersionIds) */
          const grantId = grantIdByVersionId.get(vId);
          if (!grantId) continue;
          /* c8 ignore next 2 -- grantId always in grantById (we filter to activeVersionIds) */
          const grant = grantById.get(grantId);
          if (!grant) continue;

          const classification = classifyBudgetLineOverspend({
            approvedAmountCents: row.approvedAmountCents,
            actualCents: row.actualCents,
            plannedCents: row.plannedCents,
          });

          if (classification.band === "ok") continue;

          overspendItems.push({
            kind: "overspend",
            id: row.lineId,
            grantId,
            grantName: grant.name,
            category: row.category,
            band: classification.band,
            approvedAmountCents: row.approvedAmountCents,
            actualCents: row.actualCents,
            plannedCents: row.plannedCents,
            projectedCents: classification.projectedCents,
            overByCents: classification.overByCents,
            utilizationPercent: classification.utilizationPercent,
            riskScore: classification.riskScore,
          });
        }
      }
    }
  }

  // ---- UNDERSPEND: load restriction_terms with non-null endDate ----
  const restrictionEntityScope = await getRestrictionEntityScope(db, orgId, params.entityId);
  const terms = await db.query.restrictionTerms.findMany({
    where: and(
      eq(restrictionTerms.orgId, orgId),
      restrictionEntityScope,
      isNull(restrictionTerms.deletedAt),
      isNotNull(restrictionTerms.endDate),
    ),
    columns: {
      id: true,
      fundId: true,
      grantId: true,
      title: true,
      endDate: true,
      beginningBalanceCents: true,
    },
    with: {
      fund: {
        columns: { id: true, name: true },
      },
      additions: {
        where: isNull(restrictionAdditions.deletedAt),
        columns: { amountCents: true },
      },
      releases: {
        where: isNull(restrictionReleases.deletedAt),
        columns: { amountCents: true },
      },
    },
  });

  const underspendItems: BudgetSentinelUnderspendItem[] = [];

  for (const term of terms) {
    // Skip terms without an end date
    if (!term.endDate) continue;

    // Live balance = beginning + additions - releases
    const additionsTotal = (term.additions ?? []).reduce((acc, a) => acc + a.amountCents, 0);
    const releasesTotal = (term.releases ?? []).reduce((acc, r) => acc + r.amountCents, 0);
    const balanceCents = term.beginningBalanceCents + additionsTotal - releasesTotal;

    const classification = classifyFundUnderspend({
      endDate: term.endDate,
      balanceCents,
      now,
    });

    if (classification.band === "ok") continue;

    underspendItems.push({
      kind: "underspend",
      id: term.id,
      fundId: term.fundId ?? null,
      fundName: term.fund?.name ?? null,
      grantId: term.grantId ?? null,
      title: term.title,
      band: classification.band,
      balanceCents: classification.balanceCents,
      daysUntilEnd: classification.daysUntilEnd,
      endDate: term.endDate,
      riskScore: classification.riskScore,
    });
  }

  // ---- TOTALS (over full at-risk population, before kinds/limit) ----
  const totals: BudgetSentinelTotals = {
    overspend: {
      near_limit: overspendItems.filter((i) => i.band === "near_limit").length,
      projected_overspend: overspendItems.filter((i) => i.band === "projected_overspend").length,
      over_budget: overspendItems.filter((i) => i.band === "over_budget").length,
      total: overspendItems.length,
    },
    underspend: {
      lapse_watch: underspendItems.filter((i) => i.band === "lapse_watch").length,
      lapsing_soon: underspendItems.filter((i) => i.band === "lapsing_soon").length,
      lapsed_unspent: underspendItems.filter((i) => i.band === "lapsed_unspent").length,
      total: underspendItems.length,
    },
    totalAtRisk: overspendItems.length + underspendItems.length,
  };

  // ---- SORT: riskScore DESC, then exposure amount DESC ----
  const sortedOverspend = [...overspendItems].sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return b.overByCents - a.overByCents;
  });

  const sortedUnderspend = [...underspendItems].sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return b.balanceCents - a.balanceCents;
  });

  // Merge: interleave by riskScore
  let allItems: BudgetSentinelItem[] = [];
  {
    let oi = 0;
    let ui = 0;
    while (oi < sortedOverspend.length || ui < sortedUnderspend.length) {
      const o = sortedOverspend[oi];
      const u = sortedUnderspend[ui];
      if (!o) {
        allItems.push(u!);
        ui++;
      } else if (!u) {
        allItems.push(o);
        oi++;
      } else if (o.riskScore >= u.riskScore) {
        allItems.push(o);
        oi++;
      } else {
        allItems.push(u);
        ui++;
      }
    }
  }

  // ---- FILTER by kinds ----
  if (kinds && kinds.length > 0) {
    allItems = allItems.filter((item) => kinds.includes(item.kind));
  }

  // ---- LIMIT ----
  if (limit !== undefined) {
    allItems = allItems.slice(0, limit);
  }

  return { asOf: now, items: allItems, totals };
}

// ---------------------------------------------------------------------------
// Alert-level item filter helpers (used by sentinel-alerts.ts)
// Overspend alerts fire on: projected_overspend, over_budget
// Underspend alerts fire on: lapse_watch, lapsing_soon, lapsed_unspent
// near_limit is shown in the UI view but does NOT fire notifications.
// ---------------------------------------------------------------------------

export function isAlertableBand(item: BudgetSentinelItem): boolean {
  if (item.kind === "overspend") {
    return item.band === "projected_overspend" || item.band === "over_budget";
  }
  // underspend: all non-ok bands are alertable
  return true;
}

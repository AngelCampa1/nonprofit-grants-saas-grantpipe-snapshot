import { and, count, eq, isNull } from "drizzle-orm";
import { funds, grants } from "@grantpipe/db";
import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../types";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { captureBackgroundException } from "../../lib/sentry";
import { getIntegrations } from "../../lib/integrations";
import {
  requireAllEntityPermissions,
  requireEntityPermission,
} from "../../middleware/require-role";
import {
  ANALYTICS_EVENTS,
  createAllocationSchema,
  createCloseoutItemSchema,
  createGrantExpenseSchema,
  createFunderContactSchema,
  createFunderSchema,
  createFundSchema,
  createGrantSchema,
  createGrantOpportunitySchema,
  createGrantOpportunitySavedSearchSchema,
  createImpactMetricEntrySchema,
  createImpactMetricSchema,
  createReportingRequirementSchema,
  convertGrantOpportunitySchema,
  foundationProspectLookupSchema,
  federalAwardMetadataSchema,
  funderListSchema,
  fundListSchema,
  grantCloseoutSchema,
  grantOpportunityActionSchema,
  grantOpportunitySearchSchema,
  grantListSchema,
  resolveEffectivePermissions,
  spendDownQuerySchema,
  updateAllocationSchema,
  updateCloseoutItemSchema,
  updateExpenseSchema,
  updateFunderContactSchema,
  updateFunderSchema,
  updateFundSchema,
  updateGrantSchema,
  updateGrantOpportunitySavedSearchSchema,
  updateImpactMetricEntrySchema,
  updateImpactMetricSchema,
  updateReportingRequirementSchema,
  type PermissionLevel,
} from "@grantpipe/shared";
import {
  createFunder,
  createFunderContact,
  deleteFunder,
  deleteFunderContact,
  getFunder,
  listFunders,
  updateFunder,
  updateFunderContact,
} from "./funder.service";
import {
  closeoutGrant,
  createAllocation,
  createGrant,
  createImpactMetric,
  createImpactMetricEntry,
  deleteAllocation,
  deleteGrant,
  deleteImpactMetric,
  deleteImpactMetricEntry,
  getGrant,
  listGrantPipeline,
  listGrants,
  updateAllocation,
  updateGrant,
  updateImpactMetric,
  updateImpactMetricEntry,
  upsertGrantFederalAwardMetadata,
} from "./grant.service";
import {
  createExpense,
  createFund,
  deleteExpense,
  deleteFund,
  getFund,
  listFunds,
  updateExpense,
  updateFund,
} from "./fund.service";
import {
  createCloseoutItem,
  createReportingRequirement,
  deleteCloseoutItem,
  deleteReportingRequirement,
  updateCloseoutItem,
  updateReportingRequirement,
} from "./reporting.service";
import { getGrantSpendDown } from "./spend-down.service";
import {
  convertGrantOpportunity,
  createGrantOpportunity,
  createGrantOpportunitySavedSearch,
  deleteGrantOpportunitySavedSearch,
  dismissGrantOpportunity,
  listGrantOpportunities,
  listGrantOpportunitySavedSearches,
  lookupFoundationProspects,
  saveGrantOpportunity,
  searchGrantOpportunities,
  updateGrantOpportunitySavedSearch,
} from "./opportunity.service";
import { grantBudgetRoutes } from "./budget.routes";
import {
  getBudgetSentinel,
  type BudgetSentinelItem,
  type BudgetSentinelTotals,
} from "./sentinel.service";
import { budgetSentinelQuerySchema, canUseGrantBudgetAlerts } from "@grantpipe/shared";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function entityIdForContext(c: Context<AppEnv>): string | undefined {
  return c.get("entityId") ?? undefined;
}

function captureGrantEvent(
  c: Context<AppEnv>,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  const orgId = c.get("orgId");
  const user = c.get("user");

  if (!orgId || !user) {
    return;
  }

  captureApiAnalyticsSafely(
    analyticsForContext(c).capture({
      orgId,
      eventName,
      payload: {
        actorId: user.id,
        ...payload,
      },
    }),
    { c, eventName },
  );
}

function countBucket(count: number | undefined): string {
  if (count === undefined) return "unknown";
  if (count <= 0) return "0";
  if (count <= 10) return "1_10";
  if (count <= 25) return "10_25";
  if (count <= 100) return "25_100";
  return "100_plus";
}

function sentinelKindFilter(kinds: Array<"overspend" | "underspend"> | undefined): string {
  if (!kinds || kinds.length === 0) return "all";
  return kinds.join(",");
}

const PERMISSION_RANK: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  manage: 3,
};

function hasViewPermission(level: PermissionLevel): boolean {
  return PERMISSION_RANK[level] >= PERMISSION_RANK.view;
}

function canViewBudgetSentinelItem(
  permissions: NonNullable<AppEnv["Variables"]["memberPermissions"]>,
  item: BudgetSentinelItem,
): boolean {
  if (item.kind === "overspend") {
    return hasViewPermission(permissions.grants);
  }

  if (item.fundId) {
    return hasViewPermission(permissions.funds);
  }

  if (item.grantId) {
    return hasViewPermission(permissions.grants);
  }

  return hasViewPermission(permissions.funds) || hasViewPermission(permissions.grants);
}

function recomputeBudgetSentinelTotals(items: BudgetSentinelItem[]): BudgetSentinelTotals {
  const overspend = items.filter((item) => item.kind === "overspend");
  const underspend = items.filter((item) => item.kind === "underspend");

  return {
    overspend: {
      near_limit: overspend.filter((item) => item.band === "near_limit").length,
      projected_overspend: overspend.filter((item) => item.band === "projected_overspend").length,
      over_budget: overspend.filter((item) => item.band === "over_budget").length,
      total: overspend.length,
    },
    underspend: {
      lapse_watch: underspend.filter((item) => item.band === "lapse_watch").length,
      lapsing_soon: underspend.filter((item) => item.band === "lapsing_soon").length,
      lapsed_unspent: underspend.filter((item) => item.band === "lapsed_unspent").length,
      total: underspend.length,
    },
    totalAtRisk: items.length,
  };
}

function changedFields(data: Record<string, unknown>): string[] {
  return Object.keys(data);
}

export const grantRoutes = new Hono<AppEnv>()
  .get(
    "/",
    requireEntityPermission("grants", "view"),
    zValidator("query", grantListSchema),
    async (c) => {
      const result = await listGrants(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .post(
    "/",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createGrantSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const actorId = c.get("user")!.id;
      const grant = await createGrant(db, {
        orgId,
        entityId: entityIdForContext(c),
        actorId,
        ...c.req.valid("json"),
      });
      captureGrantEvent(c, ANALYTICS_EVENTS.grantCreated, {
        entity_type: "grant",
        source: "manual",
      });
      const isFirstGrant = await db
        .select({ value: count() })
        .from(grants)
        .where(and(eq(grants.orgId, orgId), isNull(grants.deletedAt)))
        .then((rows) => rows[0]?.value === 1)
        .catch((error: unknown) => {
          captureBackgroundException(error, "grants", {
            step: "first_grant_count",
          });
          return false;
        });
      if (isFirstGrant) {
        captureApiAnalyticsSafely(
          analyticsForContext(c).capture({
            orgId,
            eventName: ANALYTICS_EVENTS.firstGrantCreated,
            payload: { actorId },
          }),
          { c, eventName: ANALYTICS_EVENTS.firstGrantCreated },
        );
      }
      return c.json(grant, 201);
    },
  )
  .get("/pipeline", requireEntityPermission("grants", "view"), async (c) => {
    const pipeline = await listGrantPipeline(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: entityIdForContext(c),
    });
    return c.json(pipeline);
  })
  .get(
    "/opportunities",
    requireEntityPermission("grants", "view"),
    zValidator("query", grantOpportunitySearchSchema),
    async (c) => {
      const result = await listGrantOpportunities(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .post(
    "/opportunities/search",
    requireEntityPermission("grants", "view"),
    zValidator("json", grantOpportunitySearchSchema),
    async (c) => {
      const result = await searchGrantOpportunities(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("json"),
      });
      return c.json(result);
    },
  )
  .post(
    "/opportunities",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createGrantOpportunitySchema),
    async (c) => {
      const opportunity = await createGrantOpportunity(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      const payload = c.req.valid("json");
      captureGrantEvent(c, ANALYTICS_EVENTS.grantOpportunityCreated, {
        entity_type: "grant_opportunity",
        source_type: payload.sourceType,
        funder_type: payload.funderType,
      });
      return c.json(opportunity, 201);
    },
  )
  .get(
    "/foundation-prospects",
    requireEntityPermission("grants", "view"),
    zValidator("query", foundationProspectLookupSchema),
    async (c) => {
      const result = await lookupFoundationProspects(c.req.valid("query"));
      return c.json(result);
    },
  )
  .post(
    "/opportunities/:opportunityId/save",
    requireEntityPermission("grants", "edit"),
    zValidator("json", grantOpportunityActionSchema),
    async (c) => {
      const action = await saveGrantOpportunity(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        opportunityId: c.req.param("opportunityId"),
        ...c.req.valid("json"),
      });
      captureGrantEvent(c, ANALYTICS_EVENTS.grantOpportunitySaved, {
        entity_type: "grant_opportunity",
      });
      return c.json(action);
    },
  )
  .post(
    "/opportunities/:opportunityId/dismiss",
    requireEntityPermission("grants", "edit"),
    zValidator("json", grantOpportunityActionSchema),
    async (c) => {
      const action = await dismissGrantOpportunity(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        opportunityId: c.req.param("opportunityId"),
        ...c.req.valid("json"),
      });
      return c.json(action);
    },
  )
  .post(
    "/opportunities/:opportunityId/convert",
    requireEntityPermission("grants", "edit"),
    zValidator("json", convertGrantOpportunitySchema),
    async (c) => {
      const result = await convertGrantOpportunity(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        opportunityId: c.req.param("opportunityId"),
        ...c.req.valid("json"),
      });
      captureGrantEvent(c, ANALYTICS_EVENTS.grantOpportunityConverted, {
        entity_type: "grant_opportunity",
        status: c.req.valid("json").status,
      });
      return c.json(result, 201);
    },
  )
  .get("/opportunity-searches", requireEntityPermission("grants", "view"), async (c) => {
    const searches = await listGrantOpportunitySavedSearches(c.get("db"), {
      orgId: c.get("orgId")!,
    });
    return c.json(searches);
  })
  .post(
    "/opportunity-searches",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createGrantOpportunitySavedSearchSchema),
    async (c) => {
      const search = await createGrantOpportunitySavedSearch(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      return c.json(search, 201);
    },
  )
  .patch(
    "/opportunity-searches/:searchId",
    requireEntityPermission("grants", "edit"),
    zValidator("json", updateGrantOpportunitySavedSearchSchema),
    async (c) => {
      const search = await updateGrantOpportunitySavedSearch(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        searchId: c.req.param("searchId"),
        data: c.req.valid("json"),
      });
      return c.json(search);
    },
  )
  .delete(
    "/opportunity-searches/:searchId",
    requireEntityPermission("grants", "manage"),
    async (c) => {
      await deleteGrantOpportunitySavedSearch(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        searchId: c.req.param("searchId"),
      });
      return c.body(null, 204);
    },
  )
  .route("/:grantId/budget", grantBudgetRoutes)
  .get(
    "/funders",
    requireEntityPermission("grants", "view"),
    zValidator("query", funderListSchema),
    async (c) => {
      const result = await listFunders(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .post(
    "/funders",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createFunderSchema),
    async (c) => {
      const funder = await createFunder(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      captureGrantEvent(c, ANALYTICS_EVENTS.funderCreated, {
        entity_type: "funder",
        funder_type: c.req.valid("json").type,
      });
      return c.json(funder, 201);
    },
  )
  .get("/funders/:funderId", requireEntityPermission("grants", "view"), async (c) => {
    const funder = await getFunder(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: entityIdForContext(c),
      funderId: c.req.param("funderId"),
    });
    return c.json(funder);
  })
  .patch(
    "/funders/:funderId",
    requireEntityPermission("grants", "edit"),
    zValidator("json", updateFunderSchema),
    async (c) => {
      const funder = await updateFunder(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        funderId: c.req.param("funderId"),
        data: c.req.valid("json"),
      });
      captureGrantEvent(c, ANALYTICS_EVENTS.funderUpdated, {
        entity_type: "funder",
        changed_fields: changedFields(c.req.valid("json")),
      });
      return c.json(funder);
    },
  )
  .delete("/funders/:funderId", requireEntityPermission("grants", "manage"), async (c) => {
    await deleteFunder(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: entityIdForContext(c),
      actorId: c.get("user")!.id,
      funderId: c.req.param("funderId"),
    });
    captureGrantEvent(c, ANALYTICS_EVENTS.funderDeleted, {
      entity_type: "funder",
    });
    return c.body(null, 204);
  })
  .post(
    "/funders/:funderId/contacts",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createFunderContactSchema),
    async (c) => {
      const contact = await createFunderContact(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        funderId: c.req.param("funderId"),
        ...c.req.valid("json"),
      });
      return c.json(contact, 201);
    },
  )
  .patch(
    "/funders/:funderId/contacts/:contactId",
    requireEntityPermission("grants", "edit"),
    zValidator("json", updateFunderContactSchema),
    async (c) => {
      const contact = await updateFunderContact(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        funderId: c.req.param("funderId"),
        contactId: c.req.param("contactId"),
        data: c.req.valid("json"),
      });
      return c.json(contact);
    },
  )
  .delete(
    "/funders/:funderId/contacts/:contactId",
    requireEntityPermission("grants", "manage"),
    async (c) => {
      await deleteFunderContact(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        funderId: c.req.param("funderId"),
        contactId: c.req.param("contactId"),
      });
      return c.body(null, 204);
    },
  )
  .get(
    "/funds",
    requireEntityPermission("funds", "view"),
    zValidator("query", fundListSchema),
    async (c) => {
      const result = await listFunds(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .post(
    "/funds",
    requireEntityPermission("funds", "edit"),
    zValidator("json", createFundSchema),
    async (c) => {
      const fundDb = c.get("db");
      const fundOrgId = c.get("orgId")!;
      const fundActorId = c.get("user")!.id;
      const fundData = c.req.valid("json");
      const fund = await createFund(fundDb, {
        orgId: fundOrgId,
        entityId: entityIdForContext(c),
        actorId: fundActorId,
        ...fundData,
      });
      captureGrantEvent(c, ANALYTICS_EVENTS.fundCreated, {
        entity_type: "fund",
        fund_type: fundData.type,
      });
      const isFirstFund = await fundDb
        .select({ value: count() })
        .from(funds)
        .where(and(eq(funds.orgId, fundOrgId), isNull(funds.deletedAt)))
        .then((rows) => rows[0]?.value === 1)
        .catch((error: unknown) => {
          captureBackgroundException(error, "grants", {
            step: "first_fund_count",
          });
          return false;
        });
      if (isFirstFund) {
        captureApiAnalyticsSafely(
          analyticsForContext(c).capture({
            orgId: fundOrgId,
            eventName: ANALYTICS_EVENTS.firstFundCreated,
            payload: { actorId: fundActorId },
          }),
          { c, eventName: ANALYTICS_EVENTS.firstFundCreated },
        );
      }
      return c.json(fund, 201);
    },
  )
  .get("/funds/:fundId", requireEntityPermission("funds", "view"), async (c) => {
    const fund = await getFund(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: entityIdForContext(c),
      fundId: c.req.param("fundId"),
    });
    return c.json(fund);
  })
  .patch(
    "/funds/:fundId",
    requireEntityPermission("funds", "edit"),
    zValidator("json", updateFundSchema),
    async (c) => {
      const fund = await updateFund(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        fundId: c.req.param("fundId"),
        data: c.req.valid("json"),
      });
      captureGrantEvent(c, ANALYTICS_EVENTS.fundUpdated, {
        entity_type: "fund",
        changed_fields: changedFields(c.req.valid("json")),
      });
      return c.json(fund);
    },
  )
  .delete("/funds/:fundId", requireEntityPermission("funds", "manage"), async (c) => {
    await deleteFund(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: entityIdForContext(c),
      actorId: c.get("user")!.id,
      fundId: c.req.param("fundId"),
    });
    captureGrantEvent(c, ANALYTICS_EVENTS.fundDeleted, {
      entity_type: "fund",
    });
    return c.body(null, 204);
  })
  // -------------------------------------------------------------------------
  // Budget Sentinel — org-wide overspend + underspend feed (must be before /:grantId)
  // -------------------------------------------------------------------------
  .get("/budget-sentinel", async (c) => {
    const memberRole = c.get("memberRole");
    if (!memberRole) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const effectivePermissions = resolveEffectivePermissions(
      memberRole,
      c.get("memberPermissions"),
    );
    if (
      !hasViewPermission(effectivePermissions.grants) &&
      !hasViewPermission(effectivePermissions.funds)
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const planTier = getContextEffectivePlanTier(c);
    if (!canUseGrantBudgetAlerts(planTier)) {
      return c.json({ error: "insufficient_plan", required: "paid_plan", current: planTier }, 402);
    }

    const rawKinds = c.req.query("kinds");
    const rawLimit = c.req.query("limit");

    const parsed = budgetSentinelQuerySchema.safeParse({
      kinds: rawKinds
        ? rawKinds
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : undefined,
      limit: rawLimit,
    });

    if (!parsed.success) {
      return c.json({ error: "invalid_query", details: parsed.error.flatten() }, 400);
    }

    const { kinds, limit } = parsed.data;

    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const now = new Date();

    const result = await getBudgetSentinel(db, {
      orgId,
      entityId: entityIdForContext(c),
      now,
      kinds,
    }).catch((error) => {
      captureGrantEvent(c, ANALYTICS_EVENTS.budgetSentinelOperationFailed, {
        kind_filter: sentinelKindFilter(kinds),
        limit_bucket: countBucket(limit),
        operation: "view",
        failure_type: "service_error",
      });
      throw error;
    });
    const visibleItems = result.items.filter((item) =>
      canViewBudgetSentinelItem(effectivePermissions, item),
    );
    const visibleTotals = recomputeBudgetSentinelTotals(visibleItems);
    const limitedVisibleItems = limit === undefined ? visibleItems : visibleItems.slice(0, limit);

    captureGrantEvent(c, ANALYTICS_EVENTS.budgetSentinelViewed, {
      kind_filter: sentinelKindFilter(kinds),
      limit_bucket: countBucket(limit),
      item_count_bucket: countBucket(limitedVisibleItems.length),
      total_at_risk_bucket: countBucket(visibleTotals.totalAtRisk),
      overspend_count_bucket: countBucket(visibleTotals.overspend.total),
      underspend_count_bucket: countBucket(visibleTotals.underspend.total),
    });

    return c.json({
      asOf: result.asOf.toISOString(),
      items: limitedVisibleItems,
      totals: visibleTotals,
    });
  })
  .get("/:grantId", requireEntityPermission("grants", "view"), async (c) => {
    const grant = await getGrant(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: entityIdForContext(c),
      grantId: c.req.param("grantId"),
    });
    return c.json(grant);
  })
  .patch(
    "/:grantId",
    requireEntityPermission("grants", "edit"),
    zValidator("json", updateGrantSchema),
    async (c) => {
      const grant = await updateGrant(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        data: c.req.valid("json"),
      });
      const data = c.req.valid("json");
      captureGrantEvent(c, ANALYTICS_EVENTS.grantUpdated, {
        entity_type: "grant",
        changed_fields: changedFields(data),
      });
      if (data.status) {
        captureGrantEvent(c, ANALYTICS_EVENTS.grantStageChanged, {
          entity_type: "grant",
          stage: data.status,
        });
      }
      return c.json(grant);
    },
  )
  .put(
    "/:grantId/federal-award-metadata",
    requireEntityPermission("grants", "edit"),
    zValidator("json", federalAwardMetadataSchema.omit({ grantId: true })),
    async (c) => {
      const metadata = await upsertGrantFederalAwardMetadata(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        data: c.req.valid("json"),
      });
      captureGrantEvent(c, ANALYTICS_EVENTS.grantUpdated, {
        entity_type: "grant",
        changed_fields: ["federalAwardMetadata"],
      });
      return c.json(metadata);
    },
  )
  .delete("/:grantId", requireEntityPermission("grants", "manage"), async (c) => {
    await deleteGrant(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: entityIdForContext(c),
      actorId: c.get("user")!.id,
      grantId: c.req.param("grantId"),
    });
    captureGrantEvent(c, ANALYTICS_EVENTS.grantDeleted, {
      entity_type: "grant",
    });
    return c.body(null, 204);
  })
  .post(
    "/:grantId/closeout",
    requireEntityPermission("grants", "manage"),
    zValidator("json", grantCloseoutSchema),
    async (c) => {
      await closeoutGrant(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        closeoutDisposition: c.req.valid("json").closeoutDisposition,
      });
      return c.json({ success: true });
    },
  )
  .post(
    "/:grantId/allocations",
    requireAllEntityPermissions([
      ["grants", "edit"],
      ["funds", "edit"],
    ]),
    zValidator("json", createAllocationSchema),
    async (c) => {
      const allocation = await createAllocation(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        ...c.req.valid("json"),
      });
      captureGrantEvent(c, ANALYTICS_EVENTS.grantFundAllocationCreated, {
        entity_type: "grant_fund_allocation",
      });
      return c.json(allocation, 201);
    },
  )
  .patch(
    "/:grantId/allocations/:allocationId",
    requireAllEntityPermissions([
      ["grants", "edit"],
      ["funds", "edit"],
    ]),
    zValidator("json", updateAllocationSchema),
    async (c) => {
      const allocation = await updateAllocation(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        allocationId: c.req.param("allocationId"),
        data: c.req.valid("json"),
      });
      return c.json(allocation);
    },
  )
  .delete(
    "/:grantId/allocations/:allocationId",
    requireAllEntityPermissions([
      ["grants", "manage"],
      ["funds", "manage"],
    ]),
    async (c) => {
      await deleteAllocation(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        allocationId: c.req.param("allocationId"),
      });
      return c.body(null, 204);
    },
  )
  .post(
    "/:grantId/expenses",
    requireAllEntityPermissions([
      ["grants", "edit"],
      ["funds", "edit"],
    ]),
    zValidator("json", createGrantExpenseSchema),
    async (c) => {
      const expense = await createExpense(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        ...c.req.valid("json"),
      });
      return c.json(expense, 201);
    },
  )
  .patch(
    "/:grantId/expenses/:expenseId",
    requireAllEntityPermissions([
      ["grants", "edit"],
      ["funds", "edit"],
    ]),
    zValidator("json", updateExpenseSchema),
    async (c) => {
      const expense = await updateExpense(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        expenseId: c.req.param("expenseId"),
        data: c.req.valid("json"),
      });
      return c.json(expense);
    },
  )
  .delete(
    "/:grantId/expenses/:expenseId",
    requireAllEntityPermissions([
      ["grants", "manage"],
      ["funds", "manage"],
    ]),
    async (c) => {
      await deleteExpense(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        expenseId: c.req.param("expenseId"),
      });
      return c.body(null, 204);
    },
  )
  .post(
    "/:grantId/metrics",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createImpactMetricSchema),
    async (c) => {
      const metric = await createImpactMetric(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        ...c.req.valid("json"),
      });
      return c.json(metric, 201);
    },
  )
  .patch(
    "/:grantId/metrics/:metricId",
    requireEntityPermission("grants", "edit"),
    zValidator("json", updateImpactMetricSchema),
    async (c) => {
      const metric = await updateImpactMetric(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        metricId: c.req.param("metricId"),
        data: c.req.valid("json"),
      });
      return c.json(metric);
    },
  )
  .delete("/:grantId/metrics/:metricId", requireEntityPermission("grants", "manage"), async (c) => {
    await deleteImpactMetric(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: entityIdForContext(c),
      actorId: c.get("user")!.id,
      grantId: c.req.param("grantId"),
      metricId: c.req.param("metricId"),
    });
    return c.body(null, 204);
  })
  .post(
    "/:grantId/metrics/:metricId/entries",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createImpactMetricEntrySchema),
    async (c) => {
      const entry = await createImpactMetricEntry(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        metricId: c.req.param("metricId"),
        ...c.req.valid("json"),
      });
      return c.json(entry, 201);
    },
  )
  .patch(
    "/:grantId/metrics/:metricId/entries/:entryId",
    requireEntityPermission("grants", "edit"),
    zValidator("json", updateImpactMetricEntrySchema),
    async (c) => {
      const entry = await updateImpactMetricEntry(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        metricId: c.req.param("metricId"),
        entryId: c.req.param("entryId"),
        data: c.req.valid("json"),
      });
      return c.json(entry);
    },
  )
  .delete(
    "/:grantId/metrics/:metricId/entries/:entryId",
    requireEntityPermission("grants", "manage"),
    async (c) => {
      await deleteImpactMetricEntry(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        metricId: c.req.param("metricId"),
        entryId: c.req.param("entryId"),
      });
      return c.body(null, 204);
    },
  )
  .post(
    "/:grantId/reporting-requirements",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createReportingRequirementSchema),
    async (c) => {
      const requirement = await createReportingRequirement(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        ...c.req.valid("json"),
      });
      return c.json(requirement, 201);
    },
  )
  .patch(
    "/:grantId/reporting-requirements/:requirementId",
    requireEntityPermission("grants", "edit"),
    zValidator("json", updateReportingRequirementSchema),
    async (c) => {
      const requirement = await updateReportingRequirement(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        requirementId: c.req.param("requirementId"),
        data: c.req.valid("json"),
      });
      return c.json(requirement);
    },
  )
  .delete(
    "/:grantId/reporting-requirements/:requirementId",
    requireEntityPermission("grants", "manage"),
    async (c) => {
      await deleteReportingRequirement(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        requirementId: c.req.param("requirementId"),
      });
      return c.body(null, 204);
    },
  )
  .post(
    "/:grantId/closeout-items",
    requireEntityPermission("grants", "edit"),
    zValidator("json", createCloseoutItemSchema),
    async (c) => {
      const item = await createCloseoutItem(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        ...c.req.valid("json"),
      });
      return c.json(item, 201);
    },
  )
  .patch(
    "/:grantId/closeout-items/:itemId",
    requireEntityPermission("grants", "edit"),
    zValidator("json", updateCloseoutItemSchema),
    async (c) => {
      const item = await updateCloseoutItem(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: c.req.param("grantId"),
        itemId: c.req.param("itemId"),
        userId: c.get("user")!.id,
        actorId: c.get("user")!.id,
        data: c.req.valid("json"),
      });
      return c.json(item);
    },
  )
  .delete(
    "/:grantId/closeout-items/:itemId",
    requireEntityPermission("grants", "manage"),
    async (c) => {
      await deleteCloseoutItem(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        actorId: c.get("user")!.id,
        grantId: c.req.param("grantId"),
        itemId: c.req.param("itemId"),
      });
      return c.body(null, 204);
    },
  )
  .get(
    "/:grantId/spend-down",
    requireAllEntityPermissions([
      ["grants", "view"],
      ["reports", "view"],
    ]),
    zValidator("query", spendDownQuerySchema),
    async (c) => {
      const { from, to } = c.req.valid("query");
      const data = await getGrantSpendDown(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: entityIdForContext(c),
        grantId: c.req.param("grantId"),
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      });
      return c.json(data);
    },
  );

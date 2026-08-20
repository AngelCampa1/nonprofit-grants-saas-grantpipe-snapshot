import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  createRestrictionAdditionSchema,
  createRestrictionEvidenceLinkSchema,
  createRestrictionReleaseSchema,
  createRestrictionTermSchema,
  restrictedRollforwardExportSchema,
  restrictionAlertFilterSchema,
  restrictionTermListSchema,
  updateRestrictionTermSchema,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { getIntegrations } from "../../lib/integrations";
import {
  requireAllEntityPermissions,
  requireEntityPermission,
} from "../../middleware/require-role";
import {
  getContextEffectivePlanTier,
  getContextTrialUsageTier,
} from "../../lib/effective-plan-tier";
import {
  createRestrictionAddition,
  createRestrictionRelease,
  createRestrictionTerm,
  deleteRestrictionTerm,
  generateRestrictedRollforward,
  linkRestrictionEvidence,
  listRestrictionAlerts,
  listRestrictionTerms,
  updateRestrictionTerm,
} from "./service";

function context(c: Context<AppEnv>) {
  return {
    orgId: c.get("orgId")!,
    entityId: c.get("entityId") ?? undefined,
    actorId: c.get("user")!.id,
    planTier: getContextEffectivePlanTier(c),
  };
}

function restrictionContext(c: Context<AppEnv>) {
  return context(c);
}

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function captureRestrictionEvent(
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

function changedFields(data: Record<string, unknown>): string[] {
  return Object.keys(data);
}

function restrictionAdditionSource(data: {
  donationId?: string;
  grantId?: string;
  journalLineId?: string;
}): string {
  if (data.donationId) return "donation";
  if (data.grantId) return "grant";
  if (data.journalLineId) return "journal_line";
  return "manual";
}

export const restrictionRoutes = new Hono<AppEnv>()
  .get(
    "/terms",
    requireEntityPermission("funds", "view"),
    zValidator("query", restrictionTermListSchema),
    async (c) => {
      const terms = await listRestrictionTerms(c.get("db"), {
        ...restrictionContext(c),
        ...c.req.valid("query"),
      });
      return c.json({ data: terms });
    },
  )
  .post(
    "/terms",
    requireEntityPermission("funds", "edit"),
    zValidator("json", createRestrictionTermSchema),
    async (c) => {
      const term = await createRestrictionTerm(c.get("db"), {
        ...restrictionContext(c),
        data: c.req.valid("json"),
      });
      const data = c.req.valid("json");
      captureRestrictionEvent(c, ANALYTICS_EVENTS.restrictionTermCreated, {
        entity_type: "restriction_term",
        restriction_type: data.restrictionType,
        source: data.source,
      });
      return c.json(term, 201);
    },
  )
  .patch(
    "/terms/:termId",
    requireEntityPermission("funds", "edit"),
    zValidator("json", updateRestrictionTermSchema),
    async (c) => {
      const term = await updateRestrictionTerm(c.get("db"), {
        ...restrictionContext(c),
        termId: c.req.param("termId"),
        data: c.req.valid("json"),
      });
      captureRestrictionEvent(c, ANALYTICS_EVENTS.restrictionTermUpdated, {
        entity_type: "restriction_term",
        changed_fields: changedFields(c.req.valid("json")),
      });
      return c.json(term);
    },
  )
  .delete("/terms/:termId", requireEntityPermission("funds", "manage"), async (c) => {
    const term = await deleteRestrictionTerm(c.get("db"), {
      ...restrictionContext(c),
      termId: c.req.param("termId"),
    });
    captureRestrictionEvent(c, ANALYTICS_EVENTS.restrictionTermDeleted, {
      entity_type: "restriction_term",
    });
    return c.json(term);
  })
  .post(
    "/terms/:termId/additions",
    requireEntityPermission("funds", "edit"),
    zValidator("json", createRestrictionAdditionSchema),
    async (c) => {
      const addition = await createRestrictionAddition(c.get("db"), {
        ...restrictionContext(c),
        termId: c.req.param("termId"),
        data: c.req.valid("json"),
      });
      captureRestrictionEvent(c, ANALYTICS_EVENTS.restrictionAdditionCreated, {
        entity_type: "restriction_addition",
        source: restrictionAdditionSource(c.req.valid("json")),
      });
      return c.json(addition, 201);
    },
  )
  .post(
    "/terms/:termId/releases",
    requireEntityPermission("funds", "edit"),
    zValidator("json", createRestrictionReleaseSchema),
    async (c) => {
      const release = await createRestrictionRelease(c.get("db"), {
        ...restrictionContext(c),
        termId: c.req.param("termId"),
        data: c.req.valid("json"),
      });
      captureRestrictionEvent(c, ANALYTICS_EVENTS.restrictionReleaseCreated, {
        entity_type: "restriction_release",
      });
      return c.json(release, 201);
    },
  )
  .post(
    "/releases/:releaseId/evidence",
    requireEntityPermission("documents", "edit"),
    zValidator("json", createRestrictionEvidenceLinkSchema),
    async (c) => {
      const link = await linkRestrictionEvidence(c.get("db"), {
        ...restrictionContext(c),
        releaseId: c.req.param("releaseId"),
        data: c.req.valid("json"),
      });
      captureRestrictionEvent(c, ANALYTICS_EVENTS.restrictionEvidenceLinked, {
        entity_type: "restriction_evidence",
        evidence_type: c.req.valid("json").evidenceType,
      });
      return c.json(link, 201);
    },
  )
  .get(
    "/alerts",
    requireEntityPermission("funds", "view"),
    zValidator("query", restrictionAlertFilterSchema),
    async (c) => {
      const alerts = await listRestrictionAlerts(c.get("db"), {
        ...restrictionContext(c),
        ...c.req.valid("query"),
      });
      return c.json({ data: alerts });
    },
  )
  .post(
    "/reports/rollforward",
    requireAllEntityPermissions([
      ["funds", "view"],
      ["reports", "view"],
    ]),
    zValidator("json", restrictedRollforwardExportSchema),
    async (c) => {
      const data = c.req.valid("json");
      const report = await generateRestrictedRollforward(c.get("db"), {
        ...context(c),
        data,
        env: c.env,
        trialUsageTier: getContextTrialUsageTier(
          c,
          data.includeEvidencePackage ? "audit_ready" : "growth",
        ),
      });
      return c.json(report, 201);
    },
  );

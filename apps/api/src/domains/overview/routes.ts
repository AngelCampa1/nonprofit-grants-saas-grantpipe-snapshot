import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../types";
import { requireEntityRole, requireRole } from "../../middleware/require-role";
import {
  ANALYTICS_EVENTS,
  dashboardPreferenceInputSchema,
  overviewCalendarQuerySchema,
} from "@grantpipe/shared";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { getIntegrations } from "../../lib/integrations";
import {
  getCalendarOverview,
  getDashboardOverview,
  upsertDashboardHomePreference,
} from "./service";

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env).analytics;
}

function captureOverviewEvent(
  c: Context<AppEnv>,
  orgId: string,
  actorId: string,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  captureApiAnalyticsSafely(
    analyticsForContext(c).capture({
      orgId,
      eventName,
      payload: { actorId, ...payload },
    }),
    { c, eventName },
  );
}

export const overviewRoutes = new Hono<AppEnv>()
  .get("/dashboard", requireEntityRole("viewer"), async (c) => {
    const user = c.get("user")!;
    const memberRole = c.get("memberRole")!;
    const payload = await getDashboardOverview(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: c.get("entityId")!,
      userId: user.id,
      memberRole,
      includeDonorData: memberRole !== "auditor",
    });
    return c.json(payload);
  })
  .put(
    "/dashboard/preferences",
    requireRole("viewer"),
    zValidator("json", dashboardPreferenceInputSchema),
    async (c) => {
      const user = c.get("user")!;
      const memberRole = c.get("memberRole")!;
      const { pinnedWidgetIds } = c.req.valid("json");
      const payload = await upsertDashboardHomePreference(c.get("db"), {
        orgId: c.get("orgId")!,
        userId: user.id,
        memberRole,
        pinnedWidgetIds,
      });
      captureOverviewEvent(c, c.get("orgId")!, user.id, ANALYTICS_EVENTS.dashboardHomeCustomized, {
        member_role: memberRole,
        pinned_count: pinnedWidgetIds.length,
      });
      return c.json(payload);
    },
  )
  .get(
    "/calendar",
    requireEntityRole("viewer"),
    zValidator("query", overviewCalendarQuerySchema),
    async (c) => {
      const payload = await getCalendarOverview(c.get("db"), {
        orgId: c.get("orgId")!,
        entityId: c.get("entityId")!,
        month: c.req.valid("query").month,
      });
      return c.json(payload);
    },
  );

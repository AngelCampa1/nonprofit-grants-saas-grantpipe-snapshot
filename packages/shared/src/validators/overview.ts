import { z } from "zod";
import type { Role } from "../types";

export const overviewCalendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export type OverviewCalendarQueryParams = z.infer<typeof overviewCalendarQuerySchema>;

export const DASHBOARD_WIDGET_IDS = [
  "executive_snapshot",
  "needs_attention",
  "quick_actions",
  "payments",
  "donor_metrics",
  "donor_pipeline",
  "grant_pipeline",
  "grant_health",
  "restriction_risk",
  "fund_balances",
  "reporting_readiness",
  "recent_activity",
  "agenda",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

export const dashboardWidgetIdSchema = z.enum(DASHBOARD_WIDGET_IDS);

export const dashboardPreferenceInputSchema = z.object({
  pinnedWidgetIds: z.array(dashboardWidgetIdSchema).min(1).max(DASHBOARD_WIDGET_IDS.length),
});

export type DashboardPreferenceInput = z.infer<typeof dashboardPreferenceInputSchema>;

export const DEFAULT_DASHBOARD_WIDGETS_BY_ROLE = {
  admin: [
    "executive_snapshot",
    "needs_attention",
    "quick_actions",
    "payments",
    "donor_metrics",
    "donor_pipeline",
    "grant_pipeline",
    "grant_health",
    "restriction_risk",
    "fund_balances",
    "reporting_readiness",
    "recent_activity",
  ],
  editor: [
    "executive_snapshot",
    "needs_attention",
    "quick_actions",
    "donor_metrics",
    "donor_pipeline",
    "grant_pipeline",
    "grant_health",
    "restriction_risk",
    "fund_balances",
    "reporting_readiness",
    "recent_activity",
  ],
  viewer: [
    "executive_snapshot",
    "needs_attention",
    "quick_actions",
    "payments",
    "donor_metrics",
    "donor_pipeline",
    "grant_pipeline",
    "grant_health",
    "restriction_risk",
    "fund_balances",
    "reporting_readiness",
    "recent_activity",
  ],
  auditor: [
    "executive_snapshot",
    "needs_attention",
    "grant_health",
    "restriction_risk",
    "fund_balances",
    "reporting_readiness",
    "agenda",
  ],
} as const satisfies Record<Role, readonly DashboardWidgetId[]>;

const DISALLOWED_DASHBOARD_WIDGETS_BY_ROLE = {
  admin: [],
  editor: [],
  viewer: [],
  auditor: ["quick_actions", "payments", "donor_metrics", "donor_pipeline", "recent_activity"],
} as const satisfies Record<Role, readonly DashboardWidgetId[]>;

export function getAllowedDashboardWidgetsForRole(role: Role): DashboardWidgetId[] {
  const blocked = new Set<DashboardWidgetId>(DISALLOWED_DASHBOARD_WIDGETS_BY_ROLE[role]);
  return DASHBOARD_WIDGET_IDS.filter((widgetId) => !blocked.has(widgetId));
}

export function normalizeDashboardWidgetIds(
  widgetIds: readonly DashboardWidgetId[],
  role: Role,
): DashboardWidgetId[] {
  const allowed = new Set(getAllowedDashboardWidgetsForRole(role));
  const normalized = widgetIds.filter((widgetId, index) => {
    return allowed.has(widgetId) && widgetIds.indexOf(widgetId) === index;
  });

  return normalized.length > 0 ? normalized : [...DEFAULT_DASHBOARD_WIDGETS_BY_ROLE[role]];
}

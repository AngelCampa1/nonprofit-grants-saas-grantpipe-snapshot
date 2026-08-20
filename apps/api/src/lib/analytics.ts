import type { Context } from "hono";
import type { AnalyticsProvider } from "./integrations";
import { captureBackgroundException, getSafeRoutePath } from "./sentry";
import type { AppEnv } from "../types";

export type ApiAnalyticsCaptureParams = Parameters<AnalyticsProvider["capture"]>[0];

type ApiAnalyticsContext = {
  c: Context<AppEnv>;
  eventName: string;
};

/**
 * Keeps analytics best-effort for user-facing flows while making capture
 * failures visible in Sentry. This is for fire-and-forget analytics calls where
 * throwing would fail a primary app action after the action itself succeeded.
 */
export function captureApiAnalyticsSafely(
  capture: Promise<unknown> | unknown,
  { c, eventName }: ApiAnalyticsContext,
): void {
  void Promise.resolve(capture).catch((error: unknown) => {
    captureBackgroundException(error, "api.analytics", {
      analytics_event: eventName,
      method: c.req.method,
      path: getSafeRoutePath(c),
      org_id: c.get("orgId") ?? "",
      entity_id: c.get("entityId") ?? "",
    });
  });
}

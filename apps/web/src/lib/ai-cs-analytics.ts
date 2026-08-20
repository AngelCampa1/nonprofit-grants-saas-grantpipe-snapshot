import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { captureEvent } from "./analytics";

/**
 * Report that the AI-CS support widget failed to mount or load — e.g. its lazy
 * chunk failed to download or it crashed during render. The surrounding
 * SilentErrorBoundary already forwards the crash to Sentry; this records the same
 * failure in product analytics so it is visible alongside the widget's other
 * lifecycle events, mirroring the AI-SDR widget's load-failure event.
 *
 * This lives in its own lightweight module (not in the lazily-loaded
 * `ai-cs-support-widget` module) precisely because the failure it reports is the
 * lazy chunk failing to load: the reporter must stay eagerly importable and must
 * not pull the heavy `@ventora/ai-cs` dependency into the main bundle.
 *
 * Privacy: emits only fixed enum values (never a user id, org id, route path, or
 * error text), so no nonprofit or user data reaches analytics.
 */
export function reportAiCsWidgetLoadFailure(): void {
  captureEvent(ANALYTICS_EVENTS.aiCsWidgetError, { stage: "load", surface: "app" });
}

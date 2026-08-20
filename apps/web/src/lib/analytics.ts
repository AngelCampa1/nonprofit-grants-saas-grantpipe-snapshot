import posthog, { type BeforeSendFn, type CaptureOptions } from "posthog-js";
import {
  ANALYTICS_EVENTS,
  isMeaningfulProductEvent,
  type MeaningfulProductEvent,
} from "@grantpipe/shared";
import { trackBingUetEvent } from "./bing-uet";
import { mergeStoredPaidAttribution } from "./paid-attribution";

export const POSTHOG_PENDING_EVENT_KEY = "posthog_pending_event";
// Query-param marker placed on the OAuth `callbackURL` so the pending-event drain
// fires ONLY on the genuine OAuth return that created it. localStorage is shared
// across tabs, so without this marker an abandoned OAuth attempt in one tab could
// be drained and mis-attributed on an unrelated authenticated load in another tab
// (org switch, plan load, remount) within the TTL. The marker makes the drain
// tab-local and bound to the actual return, then it is stripped from the URL.
export const POSTHOG_PENDING_EVENT_MARKER = "ph_pending";
const PENDING_EVENT_MARKER_BASE = "https://grantpipe.invalid";
// Pending signup-completion events must survive a full cross-origin OAuth
// round-trip (Google consent screen + the auth-origin callback hop), so they are
// stored in localStorage — not sessionStorage, which is not reliably preserved
// across that redirect chain and silently dropped ~85% of Google completions.
// A short TTL prevents a stale pending event from firing on an unrelated later
// session, and consume is one-shot so the event fires exactly once.
const PENDING_EVENT_TTL_MS = 30 * 60 * 1000;
const POSTHOG_HOST = "https://us.i.posthog.com";
const ACTIVATION_STATE_STORAGE_KEY = "grantpipe_analytics_activation_state";
const REDACTED_ANALYTICS_VALUE = "[redacted]";
const SENSITIVE_ANALYTICS_PROPERTY_KEYS = new Set(["email", "invite", "password", "token"]);
const HIGH_RISK_TEXT_PROPERTY_KEYS = new Set([
  "$exception_message",
  "$exception_stack",
  "exception_message",
  "exception_stack",
  "console_args",
  "document_title",
  "documenttitle",
  "file_name",
  "filename",
  "message",
  "name",
  "phone",
  "phone_number",
  "phonenumber",
  "query",
  "report_title",
  "reporttitle",
  "search",
  "search_text",
  "searchtext",
  "stack",
  "title",
]);
const SENSITIVE_ANALYTICS_URL_PROPERTY_KEYS = new Set([
  "$current_url",
  "$pathname",
  "$referrer",
  "current_url",
  "pathname",
  "referrer",
  "url",
]);
const URL_LIKE_PROPERTY_KEY_PARTS = ["url", "href", "referrer", "pathname", "path"];
const SENSITIVE_QUERY_PARAM_KEYS = new Set([
  "email",
  "email_address",
  "emailaddress",
  "mail",
  "recipient",
  "recipient_email",
  "user_email",
]);

type AnalyticsContext = {
  org_id?: string;
  active_entity_id?: string;
  member_role?: string;
  plan_tier?: string;
  subscription_status?: string;
};

let analyticsContext: AnalyticsContext = {};

const BING_CONVERSION_EVENT_NAMES = new Set([
  "signup_completed",
  "lead_created",
  "trial_started",
  "checkout_completed",
  "subscription_started",
]);

const FIRST_PRODUCT_EVENT_BY_TRIGGER: Partial<Record<MeaningfulProductEvent, string>> = {
  [ANALYTICS_EVENTS.contactCreated]: ANALYTICS_EVENTS.firstContactCreated,
  [ANALYTICS_EVENTS.grantCreated]: ANALYTICS_EVENTS.firstGrantCreated,
  [ANALYTICS_EVENTS.fundCreated]: ANALYTICS_EVENTS.firstFundCreated,
  [ANALYTICS_EVENTS.importCompleted]: ANALYTICS_EVENTS.firstImportCompleted,
  [ANALYTICS_EVENTS.reportGenerated]: ANALYTICS_EVENTS.firstReportGenerated,
};
const ACTIVATION_REQUIRED_EVENTS: MeaningfulProductEvent[] = [
  ANALYTICS_EVENTS.contactCreated,
  ANALYTICS_EVENTS.grantCreated,
  ANALYTICS_EVENTS.fundCreated,
];

type ActivationState = Record<
  string,
  {
    activationCompleted?: boolean;
    seenEvents?: string[];
  }
>;

function getEnvironment(): string {
  return (import.meta.env.MODE as string | undefined) ?? "production";
}

function getPosthogProjectKey(): string {
  return (import.meta.env.VITE_POSTHOG_KEY as string | undefined)?.trim() ?? "";
}

function withAppContext(properties?: Record<string, unknown>): Record<string, unknown> {
  return {
    ...analyticsContext,
    ...mergeStoredPaidAttribution(properties),
    app_surface: "app",
    environment: getEnvironment(),
  };
}

function getActivationScope(): string {
  return analyticsContext.org_id ?? "anonymous";
}

function readActivationState(): ActivationState {
  try {
    const raw = window.localStorage.getItem(ACTIVATION_STATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ActivationState) : {};
  } catch {
    return {};
  }
}

function writeActivationState(state: ActivationState): void {
  try {
    window.localStorage.setItem(ACTIVATION_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort; analytics storage failures must never break the app.
  }
}

function capturePosthogEvent(
  event: string,
  properties?: Record<string, unknown>,
  options?: CaptureOptions,
): void {
  if (options) {
    posthog.capture(event, withAppContext(properties), options);
  } else if (event === "signup_completed" || event === "outbound_signup_completed") {
    posthog.capture(event, withAppContext(properties), {
      send_instantly: true,
      transport: "sendBeacon",
    });
  } else {
    posthog.capture(event, withAppContext(properties));
  }
}

function captureActivationMilestones(event: string, properties?: Record<string, unknown>): void {
  if (!isMeaningfulProductEvent(event)) return;

  const state = readActivationState();
  const scope = getActivationScope();
  const scopedState = state[scope] ?? {};
  const seenEvents = new Set(scopedState.seenEvents ?? []);
  const milestoneProperties = {
    ...properties,
    trigger_event: event,
  };

  if (!seenEvents.has(event)) {
    const firstEvent = FIRST_PRODUCT_EVENT_BY_TRIGGER[event as MeaningfulProductEvent];
    if (firstEvent) {
      capturePosthogEvent(firstEvent, milestoneProperties);
    }
    seenEvents.add(event);
  }

  const hasCompletedActivation = ACTIVATION_REQUIRED_EVENTS.every((requiredEvent) =>
    seenEvents.has(requiredEvent),
  );

  if (!scopedState.activationCompleted && hasCompletedActivation) {
    capturePosthogEvent(ANALYTICS_EVENTS.activationCompleted, {
      ...properties,
      activation_event: event,
      activation_milestone_count: seenEvents.size,
      activation_required_milestones: ACTIVATION_REQUIRED_EVENTS,
    });
    scopedState.activationCompleted = true;
  }

  state[scope] = {
    ...scopedState,
    seenEvents: [...seenEvents],
  };
  writeActivationState(state);
}

function captureBingConversionEvent(event: string, properties?: Record<string, unknown>): void {
  if (!BING_CONVERSION_EVENT_NAMES.has(event)) return;
  trackBingUetEvent(event, {
    ...mergeStoredPaidAttribution(properties),
    app_surface: "app",
    environment: getEnvironment(),
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUrlLikePropertyKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    SENSITIVE_ANALYTICS_URL_PROPERTY_KEYS.has(normalized) ||
    URL_LIKE_PROPERTY_KEY_PARTS.some((part) => normalized.includes(part))
  );
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"']+/gi, (match) => redactSensitiveUrlTokens(match))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\/invite\/[^/?#\s"']+/gi, "/invite/[redacted]")
    .replace(/\/app\/portal\/(?!review\b)[^/?#\s"']+/gi, "/app/portal/[redacted]")
    .replace(/\/portal\/(?!review\b)[^/?#\s"']+/gi, "/portal/[redacted]")
    .replace(/([?&](?:invite|token)=)[^&#\s"']*/gi, "$1[redacted]")
    .replace(/(\b(?:invite|token)=)[^&#\s"']*/gi, "$1[redacted]");
}

function isLikelyEntityId(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
    /^[0-9a-f]{24}$/i.test(value) ||
    /^c[a-z0-9]{20,}$/i.test(value) ||
    (/^(?:[a-z]+[-_])?[a-z0-9_-]{12,}$/i.test(value) && /\d/.test(value))
  );
}

function isIdLikeQueryParam(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === "id" || normalized.endsWith("id") || normalized.endsWith("_id");
}

function isSensitiveQueryParam(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_QUERY_PARAM_KEYS.has(normalized) || normalized.includes("email");
}

function redactGenericEntityIdsInPath(pathname: string): string {
  return pathname
    .split("/")
    .map((part) => (isLikelyEntityId(decodeURIComponent(part)) ? "[redacted-id]" : part))
    .join("/");
}

function sanitizeAnalyticsValue(value: unknown, key = ""): unknown {
  const normalizedKey = key.toLowerCase();
  if (SENSITIVE_ANALYTICS_PROPERTY_KEYS.has(normalizedKey)) {
    return REDACTED_ANALYTICS_VALUE;
  }
  if (HIGH_RISK_TEXT_PROPERTY_KEYS.has(normalizedKey)) {
    return REDACTED_ANALYTICS_VALUE;
  }
  if (typeof value === "string") {
    return isUrlLikePropertyKey(key) ? redactSensitiveUrlTokens(value) : redactSensitiveText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAnalyticsValue(item, key));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeAnalyticsValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

const redactSensitiveEventProperties: BeforeSendFn = (event) => {
  if (event === null) return event;
  if (!event.properties) return event;

  const properties = sanitizeAnalyticsValue(event.properties);
  const rawToken = event.properties.token;
  if (typeof rawToken === "string" && rawToken === getPosthogProjectKey()) {
    (properties as Record<string, unknown>).token = rawToken;
  }

  return { ...event, properties: properties as Record<string, unknown> };
};

function redactSensitiveUrlTokens(url: string): string {
  try {
    const parsed = new URL(url, "https://grantpipe.invalid");
    const parts = parsed.pathname.split("/");
    const inviteIndex = parts.indexOf("invite");
    if (inviteIndex >= 0 && parts[inviteIndex + 1]) {
      parts[inviteIndex + 1] = "[redacted]";
    }
    const portalIndex = parts.indexOf("portal");
    if (portalIndex >= 0 && parts[portalIndex + 1] && parts[portalIndex + 1] !== "review") {
      parts[portalIndex + 1] = "[redacted]";
    }
    parsed.pathname = redactGenericEntityIdsInPath(parts.join("/"));
    for (const [param] of parsed.searchParams) {
      if (param === "invite" || param === "token") {
        parsed.searchParams.set(param, "[redacted]");
      } else if (isSensitiveQueryParam(param)) {
        parsed.searchParams.set(param, "[redacted-email]");
      } else if (isIdLikeQueryParam(param)) {
        parsed.searchParams.set(param, "[redacted-id]");
      }
    }
    const sanitized = parsed.toString();
    return url.startsWith("http") ? sanitized : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url
      .replace(/\/invite\/[^/?#]+/, "/invite/[redacted]")
      .replace(/\/(?:app\/)?portal\/(?!review\b)[^/?#]+/, (match) =>
        match.startsWith("/app/portal/") ? "/app/portal/[redacted]" : "/portal/[redacted]",
      )
      .replace(/\/([^/?#]+)/g, (match, segment: string) =>
        isLikelyEntityId(segment) ? "/[redacted-id]" : match,
      )
      .replace(/([?&](?:invite|token)=)[^&#]*/g, "$1[redacted]")
      .replace(/([?&][^=&#]*email[^=&#]*=)[^&#]*/gi, "$1[redacted-email]")
      .replace(/([?&][^=&#]*id=)[^&#]*/gi, "$1[redacted-id]");
  }
}

export function initAnalytics(): void {
  try {
    const rawKey = getPosthogProjectKey();
    if (rawKey.length === 0) {
      return;
    }
    const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.trim() || POSTHOG_HOST;
    posthog.init(rawKey, {
      api_host: host,
      autocapture: { dom_event_allowlist: ["click", "change", "submit"] },
      disable_compression: true,
      capture_pageview: false,
      capture_pageleave: true,
      rageclick: true,
      capture_dead_clicks: true,
      capture_heatmaps: true,
      capture_performance: { web_vitals: true, network_timing: false },
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: true,
      },
      mask_all_element_attributes: true,
      mask_all_text: true,
      // PostHog's blanket personal-data masking nulls $current_url, $pathname, and
      // every referrer property on every event, which leaves URL-based funnels and
      // path analytics blind (only $host survives). We keep it OFF and rely on the
      // before_send hook (redactSensitiveEventProperties) to strip the actual PII —
      // emails, tokens, invite params, and entity IDs — while preserving the route
      // path. custom_personal_data_properties is intentionally omitted because it
      // only takes effect while mask_personal_data_properties is on.
      mask_personal_data_properties: false,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*",
        blockSelector: "[data-ph-block], .ph-block, [data-sensitive]",
        recordHeaders: false,
        recordBody: false,
      },
      person_profiles: "identified_only",
      before_send: redactSensitiveEventProperties,
    });
  } catch {
    // Best-effort; analytics failures must never break the app.
  }
}

export function identifyUser(
  userId: string,
  properties: {
    email?: string;
    orgId?: string | null;
    activeEntityId?: string | null;
    activeEntityName?: string | null;
    name?: string;
    member_role?: string;
    plan_tier?: string;
    subscription_status?: string;
  },
): void {
  analyticsContext = {
    org_id: properties.orgId ?? undefined,
    active_entity_id: properties.activeEntityId ?? undefined,
    member_role: properties.member_role,
    plan_tier: properties.plan_tier,
    subscription_status: properties.subscription_status,
  };

  try {
    posthog.identify(userId, {
      org_id: properties.orgId ?? undefined,
      active_entity_id: properties.activeEntityId ?? undefined,
      member_role: properties.member_role,
      plan_tier: properties.plan_tier,
      subscription_status: properties.subscription_status,
    });
  } catch {
    // Best-effort; analytics failures must never break the app.
  }

  if (!properties.orgId) return;

  try {
    posthog.group("organization", properties.orgId, {
      plan_tier: properties.plan_tier,
      subscription_status: properties.subscription_status,
    });
  } catch {
    // Best-effort; analytics failures must never break the app.
  }

  if (!properties.activeEntityId) return;

  try {
    posthog.group("entity", properties.activeEntityId, {
      org_id: properties.orgId,
    });
  } catch {
    // Best-effort; analytics failures must never break the app.
  }
}

export function resetAnalytics(): void {
  analyticsContext = {};
  try {
    posthog.reset();
  } catch {
    // Best-effort; analytics failures must never break the app.
  }
}

export type PendingAnalyticsEvent = {
  event: string;
  properties?: Record<string, unknown>;
};

type PendingAnalyticsPayload = PendingAnalyticsEvent | { events: PendingAnalyticsEvent[] };

type StoredPendingAnalyticsEnvelope = {
  payload: PendingAnalyticsPayload;
  expiresAt: number;
};

function isPendingAnalyticsEvent(value: unknown): value is PendingAnalyticsEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "event" in value &&
    typeof (value as { event: unknown }).event === "string" &&
    (!("properties" in value) ||
      (value as { properties: unknown }).properties === undefined ||
      (typeof (value as { properties: unknown }).properties === "object" &&
        (value as { properties: unknown }).properties !== null))
  );
}

function readPendingAnalyticsEvents(value: unknown): PendingAnalyticsEvent[] {
  if (isPendingAnalyticsEvent(value)) {
    return [value];
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "events" in value &&
    Array.isArray((value as { events: unknown }).events)
  ) {
    return (value as { events: unknown[] }).events.filter(isPendingAnalyticsEvent);
  }
  return [];
}

/**
 * Persist a pending analytics event payload so it can be replayed after a
 * navigation that leaves the SPA (e.g. a Google OAuth redirect). Best-effort:
 * storage failures must never break the signup flow.
 */
export function storePendingAnalyticsEvents(payload: PendingAnalyticsPayload): void {
  try {
    const envelope: StoredPendingAnalyticsEnvelope = {
      payload,
      expiresAt: Date.now() + PENDING_EVENT_TTL_MS,
    };
    window.localStorage.setItem(POSTHOG_PENDING_EVENT_KEY, JSON.stringify(envelope));
  } catch {
    // Best-effort; analytics storage failures must never break the app.
  }
}

/**
 * Remove any stored pending analytics event payload. Returns `true` when the
 * key was successfully removed and `false` when storage threw, so callers can
 * avoid handing out events that could not be cleared (and would otherwise
 * re-fire on a later consume).
 */
export function clearPendingAnalyticsEvents(): boolean {
  try {
    window.localStorage.removeItem(POSTHOG_PENDING_EVENT_KEY);
    return true;
  } catch {
    // Best-effort; analytics storage failures must never break the app.
    return false;
  }
}

/**
 * Read and remove (one-shot) any stored pending analytics events. Returns an
 * empty array when nothing is stored, the payload is malformed, or it has
 * expired, guaranteeing each pending event fires at most once.
 */
export function consumePendingAnalyticsEvents(): PendingAnalyticsEvent[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(POSTHOG_PENDING_EVENT_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  // If the clear failed, the value is still in storage. Returning the events
  // anyway would let a later consume re-fire them (a double-count). Bail out so
  // a failed clear can never double-fire; the next successful consume drains it.
  if (!clearPendingAnalyticsEvents()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("payload" in parsed) ||
      !("expiresAt" in parsed)
    ) {
      return [];
    }
    const envelope = parsed as StoredPendingAnalyticsEnvelope;
    if (typeof envelope.expiresAt !== "number" || Date.now() > envelope.expiresAt) {
      return [];
    }
    return readPendingAnalyticsEvents(envelope.payload);
  } catch {
    return [];
  }
}

/**
 * Append the OAuth-return marker query param to a Better Auth `callbackURL`
 * (a same-origin path, optionally with a query string) so the post-OAuth landing
 * URL carries it. Idempotent — never duplicates the marker. Returns the input
 * unchanged when it cannot be parsed.
 */
export function appendPendingEventMarker(callbackURL: string): string {
  try {
    const parsed = new URL(callbackURL, PENDING_EVENT_MARKER_BASE);
    if (parsed.searchParams.has(POSTHOG_PENDING_EVENT_MARKER)) {
      return callbackURL;
    }
    parsed.searchParams.set(POSTHOG_PENDING_EVENT_MARKER, "1");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return callbackURL;
  }
}

/** True when the current URL carries the OAuth-return pending-event marker. */
export function hasPendingEventMarker(): boolean {
  try {
    return new URLSearchParams(window.location.search).has(POSTHOG_PENDING_EVENT_MARKER);
  } catch {
    return false;
  }
}

/**
 * Strip the OAuth-return marker from the current URL via `history.replaceState`
 * so it does not add a history entry or trigger a navigation. No-op when the
 * marker is absent. Best-effort: history failures must never break the app.
 */
export function clearPendingEventMarker(): void {
  try {
    const parsed = new URL(window.location.href);
    if (!parsed.searchParams.has(POSTHOG_PENDING_EVENT_MARKER)) {
      return;
    }
    parsed.searchParams.delete(POSTHOG_PENDING_EVENT_MARKER);
    window.history.replaceState(
      window.history.state,
      "",
      `${parsed.pathname}${parsed.search}${parsed.hash}`,
    );
  } catch {
    // Best-effort; history failures must never break the app.
  }
}

export function createAnonymousPersonProfile(): void {
  try {
    posthog.createPersonProfile();
  } catch {
    // Best-effort; analytics failures must never break the app.
  }
}

export function capturePageview(url: string): void {
  try {
    const sanitized = redactSensitiveUrlTokens(url);
    posthog.capture("$pageview", withAppContext({ $current_url: sanitized }));
  } catch {
    // Best-effort; analytics failures must never break the app.
  }
}

export function captureEvent(
  event: string,
  properties?: Record<string, unknown>,
  options?: CaptureOptions,
): void {
  try {
    capturePosthogEvent(event, properties, options);
    captureActivationMilestones(event, properties);
  } catch {
    // Best-effort; analytics failures must never break the app.
  }
  captureBingConversionEvent(event, properties);
}

export function captureRedirectEvent(event: string, properties?: Record<string, unknown>): void {
  try {
    posthog.capture(event, withAppContext(properties), {
      send_instantly: true,
      transport: "sendBeacon",
    });
  } catch {
    // Best-effort; analytics failures must never break the app.
  }
  captureBingConversionEvent(event, properties);
}

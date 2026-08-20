const DEFAULT_BING_UET_ID = "343248795";

const UET_SCRIPT_SRC = "https://bat.bing.net/bat.js";
const UET_READY_RETRY_INTERVAL_MS = 100;
const UET_READY_MAX_ATTEMPTS = 50;

declare global {
  interface Window {
    uetq?: UetQueue | unknown[];
    UET?: new (cfg: {
      ti: string;
      q?: unknown[];
      ts?: number;
      enableAutoSpaTracking?: boolean;
    }) => {
      push: (...event: unknown[]) => void;
    };
  }
}

type UetQueue = {
  push: (...event: unknown[]) => void;
};

type BingEventValue = string | number;

const ALLOWED_BING_EVENT_PROPERTY_KEYS = new Set([
  "amount_cents",
  "app_surface",
  "billing_cycle",
  "environment",
  "has_invite",
  "gclid",
  "landing_page",
  "lead_source",
  "method",
  "msclkid",
  "plan_tier",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

export function initBingUet(): void {
  if (!import.meta.env.PROD) return;
  /* c8 ignore next — SSR guard, unreachable in jsdom test env */
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const envValue = (import.meta.env.VITE_BING_UET_ID as string | undefined)?.trim();
  const tagId = envValue || DEFAULT_BING_UET_ID;

  try {
    const queue: unknown[] = [];
    window.uetq = queue;

    const script = document.createElement("script");
    script.src = `${UET_SCRIPT_SRC}?ti=${encodeURIComponent(tagId)}`;
    script.async = true;
    script.onload = () => initializeWhenUetIsReady(tagId, queue);
    document.head.appendChild(script);
  } catch {
    // Best-effort; UET failures must never break the app.
  }
}

export function trackBingUetEvent(eventName: string, properties?: Record<string, unknown>): void {
  try {
    const queue = window.uetq;
    if (!isUetQueue(queue)) return;

    queue.push("event", eventName, {
      event_category: "app",
      ...toBingEventProperties(properties),
    });
  } catch {
    // Best-effort; conversion tracking failures must never break the app.
  }
}

function initializeWhenUetIsReady(
  tagId: string,
  queue: unknown[],
  attemptsRemaining = UET_READY_MAX_ATTEMPTS,
): void {
  try {
    const Ctor = window.UET;
    if (!Ctor) {
      if (attemptsRemaining > 0) {
        window.setTimeout(
          () => initializeWhenUetIsReady(tagId, queue, attemptsRemaining - 1),
          UET_READY_RETRY_INTERVAL_MS,
        );
      }
      return;
    }

    const instance = new Ctor({
      ti: tagId,
      q: queue,
      ts: Date.now(),
      enableAutoSpaTracking: true,
    });
    window.uetq = instance;
    instance.push("pageLoad");
  } catch {
    // Best-effort; UET failures must never break the app.
  }
}

function isUetQueue(value: Window["uetq"]): value is UetQueue {
  return Boolean(
    value && typeof value === "object" && "push" in value && typeof value.push === "function",
  );
}

function toBingEventProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, BingEventValue> {
  if (!properties) return {};

  const eventProperties: Record<string, BingEventValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_BING_EVENT_PROPERTY_KEYS.has(key)) continue;
    if (typeof value === "string" || typeof value === "number") {
      eventProperties[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      eventProperties[key] = value ? "true" : "false";
    }
  }
  return eventProperties;
}

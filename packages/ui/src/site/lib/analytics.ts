export const POSTHOG_HOST = "https://us.i.posthog.com";
const SENSITIVE_ANALYTICS_PROPERTY_KEYS = ["email", "invite", "password", "token"];
const HIGH_RISK_TEXT_PROPERTY_KEYS = [
  "$exception_message",
  "$exception_stack",
  "exception_message",
  "exception_stack",
  "console_args",
  "message",
  "stack",
];
const SENSITIVE_ANALYTICS_URL_PROPERTY_KEYS = [
  "$current_url",
  "$pathname",
  "$referrer",
  "current_url",
  "pathname",
  "referrer",
  "url",
];
const URL_LIKE_PROPERTY_KEY_PARTS = ["url", "href", "referrer", "pathname", "path"];

export interface PostHogInstance {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  register?(properties: Record<string, unknown>): void;
}

declare global {
  interface Window {
    posthog?: PostHogInstance;
  }
}

export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  try {
    window.posthog?.capture(event, properties);
  } catch {
    // PostHog is best-effort; browser analytics failures should never break the page.
  }
}

function sanitizeIdentifyProperties(
  properties?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!properties) return undefined;

  const allowedKeys = new Set(["plan_tier", "member_role", "subscription_status", "site"]);
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => allowedKeys.has(key.toLowerCase())),
  );
}

export function identifyUser(distinctId: string, properties?: Record<string, unknown>): void {
  try {
    window.posthog?.identify(distinctId, sanitizeIdentifyProperties(properties));
  } catch {
    // PostHog is best-effort; browser analytics failures should never break the page.
  }
}

export function buildOsPositioningViewScript(page: string, path: string): string {
  return `try {
  window.posthog?.capture("marketing.os_positioning_view", {
    page: ${JSON.stringify(page)},
    path: ${JSON.stringify(path)}
  });
} catch {
  // PostHog is best-effort; OS positioning analytics must never break the page.
}`;
}

export function resolvePostHogBootstrapConfig(
  apiKey?: string | null,
  apiHost?: string,
): { apiKey: string | null; apiHost: string } {
  const trimmedKey = apiKey?.trim() ?? "";
  return {
    apiKey: trimmedKey.length > 0 ? trimmedKey : null,
    apiHost: apiHost?.trim() || POSTHOG_HOST,
  };
}

export function buildPostHogBootstrapScript(
  siteName: string,
  apiKey?: string | null,
  apiHost = POSTHOG_HOST,
): string {
  const trimmedKey = apiKey?.trim() ?? "";
  if (trimmedKey.length === 0) {
    return "";
  }
  const resolvedApiHost = apiHost.trim() || POSTHOG_HOST;

  return `/* PostHog CDN snippet - loads array.js asynchronously */
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub people)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
try {
  var supportsArrayAt = typeof Array.prototype.at === "function";
  posthog.init(${JSON.stringify(trimmedKey)}, {
    api_host: ${JSON.stringify(resolvedApiHost)},
    autocapture: { dom_event_allowlist: ["click", "change", "submit"] },
    capture_pageview: true,
    capture_pageleave: true,
    rageclick: true,
    capture_dead_clicks: true,
    capture_heatmaps: true,
    capture_performance: { web_vitals: supportsArrayAt, network_timing: false },
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: true
    },
    mask_all_element_attributes: true,
    mask_all_text: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: ${JSON.stringify(SENSITIVE_ANALYTICS_PROPERTY_KEYS)},
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      blockSelector: "[data-ph-block], .ph-block, [data-sensitive]",
      recordHeaders: false,
      recordBody: false
    },
    before_send: function (event) {
      if (!event || !event.properties) return event;
      function isLikelyEntityId(value) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
          /^[0-9a-f]{24}$/i.test(value) ||
          /^c[a-z0-9]{20,}$/i.test(value) ||
          (/^(?:[a-z]+[-_])?[a-z0-9_-]{12,}$/i.test(value) && /\\d/.test(value));
      }
      function isIdLikeQueryParam(key) {
        var normalized = String(key || "").toLowerCase();
        return normalized === "id" || normalized.slice(-2) === "id" || normalized.slice(-3) === "_id";
      }
      function redactGenericEntityIdsInPath(pathname) {
        return String(pathname).split("/").map(function (part) {
          try {
            return isLikelyEntityId(decodeURIComponent(part)) ? "[redacted-id]" : part;
          } catch (error) {
            return isLikelyEntityId(part) ? "[redacted-id]" : part;
          }
        }).join("/");
      }
      function redactSensitiveUrlTokens(url) {
        try {
          var parsed = new URL(url, "https://grantpipe.invalid");
          var parts = parsed.pathname.split("/");
          var inviteIndex = parts.indexOf("invite");
          if (inviteIndex >= 0 && parts[inviteIndex + 1]) parts[inviteIndex + 1] = "[redacted]";
          var portalIndex = parts.indexOf("portal");
          if (portalIndex >= 0 && parts[portalIndex + 1] && parts[portalIndex + 1] !== "review") parts[portalIndex + 1] = "[redacted]";
          parsed.pathname = redactGenericEntityIdsInPath(parts.join("/"));
          Array.from(parsed.searchParams.keys()).forEach(function (param) {
            if (param === "invite" || param === "token") {
              parsed.searchParams.set(param, "[redacted]");
            } else if (isIdLikeQueryParam(param)) {
              parsed.searchParams.set(param, "[redacted-id]");
            }
          });
          return /^https?:\\/\\//i.test(url) ? parsed.toString() : parsed.pathname + parsed.search + parsed.hash;
        } catch (error) {
          return String(url)
            .replace(/\\/invite\\/[^/?#]+/, "/invite/[redacted]")
            .replace(/\\/(?:app\\/)?portal\\/(?!review\\b)[^/?#]+/, function (match) {
              return match.indexOf("/app/portal/") === 0 ? "/app/portal/[redacted]" : "/portal/[redacted]";
            })
            .replace(/\\/([^/?#]+)/g, function (match, segment) {
              return isLikelyEntityId(segment) ? "/[redacted-id]" : match;
            })
            .replace(/([?&](?:invite|token)=)[^&#]*/g, "$1[redacted]")
            .replace(/([?&][^=&#]*id=)[^&#]*/gi, "$1[redacted-id]");
        }
      }
      var sensitiveKeys = ${JSON.stringify(SENSITIVE_ANALYTICS_PROPERTY_KEYS)};
      var highRiskTextKeys = ${JSON.stringify(HIGH_RISK_TEXT_PROPERTY_KEYS)};
      var sensitiveUrlKeys = ${JSON.stringify(SENSITIVE_ANALYTICS_URL_PROPERTY_KEYS)};
      var urlLikeKeyParts = ${JSON.stringify(URL_LIKE_PROPERTY_KEY_PARTS)};
      function isUrlLikePropertyKey(key) {
        var normalized = String(key || "").toLowerCase();
        if (sensitiveUrlKeys.indexOf(normalized) >= 0) return true;
        for (var i = 0; i < urlLikeKeyParts.length; i += 1) {
          if (normalized.indexOf(urlLikeKeyParts[i]) >= 0) return true;
        }
        return false;
      }
      function redactSensitiveText(value) {
        return String(value)
          .replace(/https?:\\/\\/[^\\s"']+/gi, function (match) {
            return redactSensitiveUrlTokens(match);
          })
          .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[redacted-email]")
          .replace(/\\/invite\\/[^/?#\\s"']+/gi, "/invite/[redacted]")
          .replace(/\\/app\\/portal\\/(?!review\\b)[^/?#\\s"']+/gi, "/app/portal/[redacted]")
          .replace(/\\/portal\\/(?!review\\b)[^/?#\\s"']+/gi, "/portal/[redacted]")
          .replace(/([?&](?:invite|token)=)[^&#\\s"']*/gi, "$1[redacted]")
          .replace(/(\\b(?:invite|token)=)[^&#\\s"']*/gi, "$1[redacted]");
      }
      function sanitizeAnalyticsValue(value, key) {
        var normalized = String(key || "").toLowerCase();
        if (sensitiveKeys.indexOf(normalized) >= 0) return "[redacted]";
        if (highRiskTextKeys.indexOf(normalized) >= 0) return "[redacted]";
        if (typeof value === "string") {
          return isUrlLikePropertyKey(key) ? redactSensitiveUrlTokens(value) : redactSensitiveText(value);
        }
        if (Array.isArray(value)) {
          return value.map(function (item) {
            return sanitizeAnalyticsValue(item, key);
          });
        }
        if (value && typeof value === "object") {
          var next = {};
          Object.keys(value).forEach(function (entryKey) {
            next[entryKey] = sanitizeAnalyticsValue(value[entryKey], entryKey);
          });
          return next;
        }
        return value;
      }
      event.properties = sanitizeAnalyticsValue(event.properties, "");
      return event;
    },
    person_profiles: "identified_only"
  });
} catch {
  // PostHog is best-effort; bootstrap failures should never break the page.
}
try {
  posthog.register({ site: ${JSON.stringify(siteName)} });
} catch {
  // PostHog is best-effort; bootstrap failures should never break the page.
}
try {
  // Astro's client router (astro:transitions) swaps the DOM in place on
  // navigation instead of doing a full page load, so PostHog's built-in
  // pageview autocapture (which listens for full loads / history API calls)
  // does not reliably fire again after the very first page. Explicitly
  // capture a pageview on every "astro:page-load" firing instead. That event
  // also fires once on the initial hard load, so guard against double-
  // counting the first pageview (already captured by capture_pageview: true
  // during posthog.init above) with a one-time skip flag.
  var hasCapturedInitialPageview = false;
  document.addEventListener("astro:page-load", function () {
    if (!hasCapturedInitialPageview) {
      hasCapturedInitialPageview = true;
      return;
    }
    try {
      posthog.capture("$pageview");
    } catch {
      // PostHog is best-effort; pageview capture failures should never break the page.
    }
  });
} catch {
  // PostHog is best-effort; bootstrap failures should never break the page.
}`;
}

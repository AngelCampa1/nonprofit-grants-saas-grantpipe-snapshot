import { useCallback, useMemo } from "react";
import { AiCsWidget } from "@ventora/ai-cs/react";
import type { AiCsSseEvent } from "@ventora/ai-cs";
import { useNavigate } from "@tanstack/react-router";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { captureAppException } from "../lib/sentry";
import { captureEvent } from "../lib/analytics";

/**
 * GrantPipe brand palette for the shared AI-CS widget.
 *
 * Derived from the GrantPipe design tokens (packages/ui/src/globals.css):
 *   --primary: oklch(0.42 0.13 165) -> #047857 (emerald-700)
 *   --primary-foreground: oklch(0.99 0.006 165) -> #f0fdf9 (near-white)
 *   --background: oklch(0.99 0.006 165) -> #fafaf9
 *   --foreground: oklch(0.20 0.012 165) -> #1a2c26
 */
const BRAND = {
  accentColor: "#047857",
  accentTextColor: "#f0fdf9",
  surfaceColor: "#fafaf9",
  textColor: "#1a2c26",
} as const;

const COPY = {
  title: "GrantPipe help",
  subtitle: "Answers fit your role and page",
  launcher: "Questions?",
  placeholder: "Ask about this page",
  emptyBody: "Ask about this page. Find the next step.",
  emptySuggestions: ["How do I add a grant?", "Where are reports?"],
};

/** Navigation argument shape accepted by TanStack Router's `navigate`. */
type ParsedInAppTarget = {
  to: string;
  search?: Record<string, string>;
  hash?: string;
};

/**
 * Parse an assistant-supplied navigation target into a TanStack Router
 * navigation argument, or return null when the target is not a safe in-app
 * path.
 *
 * TanStack Router does not parse a combined `"/path#hash"` string passed as a
 * single `to`; it treats the whole thing as a literal path and the nav 404s.
 * We split path / search / hash into the discrete fields the router expects.
 *
 * Security: only same-origin in-app paths are allowed. A target must begin
 * with a single "/" and must not begin with "//" (protocol-relative URLs like
 * "//evil.com" resolve off-site). Scheme URLs ("http://", "https://",
 * "javascript:") and relative/empty paths are rejected.
 */
export function parseInAppTarget(rawPath: string): ParsedInAppTarget | null {
  if (typeof rawPath !== "string") return null;
  // Must start with exactly one leading slash. Rejects "", "relative/path",
  // "//evil.com" (protocol-relative) and any scheme URL ("http://", "javascript:").
  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) return null;

  const hashIndex = rawPath.indexOf("#");
  const withoutHash = hashIndex === -1 ? rawPath : rawPath.slice(0, hashIndex);
  const rawHash = hashIndex === -1 ? "" : rawPath.slice(hashIndex + 1);

  const searchIndex = withoutHash.indexOf("?");
  const to = searchIndex === -1 ? withoutHash : withoutHash.slice(0, searchIndex);
  const rawSearch = searchIndex === -1 ? "" : withoutHash.slice(searchIndex + 1);

  const result: ParsedInAppTarget = { to };

  if (rawSearch) {
    const search: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(rawSearch)) {
      search[key] = value;
    }
    if (Object.keys(search).length > 0) result.search = search;
  }

  if (rawHash) result.hash = rawHash;

  return result;
}

interface AiCsSupportWidgetProps {
  /** Authenticated app user id. Widget is not mounted when absent. */
  userId: string;
  /** Current organization id, used by the worker when fetching support context. */
  orgId: string | null;
  /** Current route path, surfaced to the assistant for page-level context. */
  currentPath: string;
}

/**
 * Mounts the Ventora AI-CS support widget on the authenticated app surface.
 *
 * The SPA cannot hold the HMAC client-assertion secret, so the widget posts to
 * the same-origin BFF at /api/ai-cs which gates on the better-auth session
 * cookie and signs each forwarded request to the AI-CS Worker. We pass only
 * baseUrl + credentials: "include" — the session cookie rides along
 * automatically, no signRequest callback needed.
 *
 * Only rendered when userId is available (never for the anonymous/loading state)
 * so the BFF never tries to proxy a session for a user it cannot verify.
 */
export function AiCsSupportWidget({ userId, orgId, currentPath }: AiCsSupportWidgetProps) {
  const navigate = useNavigate();
  const api = useMemo(
    () =>
      ({
        baseUrl: "/api/ai-cs",
        credentials: "include" as const,
      }) as const,
    [],
  );

  const session = useMemo(
    () => ({
      appId: "grantpipe",
      userId,
      currentPath,
      ...(orgId ? { metadata: { orgId } } : {}),
    }),
    [userId, orgId, currentPath],
  );

  const onNavigate = useCallback(
    (target: { path: string }) => {
      const parsed = parseInAppTarget(target.path);
      if (!parsed) return;
      // The target is a runtime string the assistant produced, so the router's
      // statically-typed route literals cannot validate it. Forward through the
      // navigate parameter type — the path/hash/search are plain strings.
      void navigate(parsed as Parameters<typeof navigate>[0]);
    },
    [navigate],
  );

  const onError = useCallback((error: Error) => {
    captureAppException(error, { tags: { source: "ai-cs-support-widget" } });
  }, []);

  // Map the assistant's SSE stream to privacy-safe product analytics. We only
  // forward the lifecycle signal of each event, never its payload: no question
  // text, answer deltas, cited source content, suggested entity paths, or
  // escalation reasons ever reach analytics. The single exception is the
  // machine error code, which is a fixed enum value and carries no user data.
  const onEvent = useCallback((event: AiCsSseEvent) => {
    switch (event.event) {
      case "session.created":
        captureEvent(ANALYTICS_EVENTS.aiCsSessionStarted);
        break;
      case "message.done":
        captureEvent(ANALYTICS_EVENTS.aiCsAnswerCompleted);
        break;
      case "navigation.suggestion":
        captureEvent(ANALYTICS_EVENTS.aiCsNavigationSuggested);
        break;
      case "support.escalation.requested":
        captureEvent(ANALYTICS_EVENTS.aiCsEscalationRequested);
        break;
      case "error":
        captureEvent(ANALYTICS_EVENTS.aiCsFailed, { code: event.data.code });
        break;
      default:
        // message.delta, source, cta, workflow.step, and heartbeat carry
        // user-derived or non-actionable content and are intentionally dropped.
        break;
    }
  }, []);

  return (
    <AiCsWidget
      api={api}
      session={session}
      brand={BRAND}
      copy={COPY}
      onNavigate={onNavigate}
      onError={onError}
      onEvent={onEvent}
    />
  );
}

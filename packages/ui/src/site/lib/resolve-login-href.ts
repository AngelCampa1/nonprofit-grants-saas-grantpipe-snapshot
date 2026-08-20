/**
 * Resolve the marketing-site "Sign in" href from a configured bottom-of-funnel
 * CTA target.
 *
 * The bofu CTA target is usually an absolute URL pointing at the app signup
 * route on the configured app host. The marketing header surfaces a sibling
 * "Sign in" link that should point at `/app/login` on the same origin. When the
 * input is a relative path or otherwise unparseable, the optional `fallback`
 * is returned instead so callers can degrade gracefully without throwing.
 */
export function resolveLoginHref(
  ctaTarget: string | null | undefined,
  fallback?: string,
): string | undefined {
  if (typeof ctaTarget !== "string" || ctaTarget.length === 0) {
    return fallback;
  }
  try {
    return buildAppUrl(new URL(ctaTarget).origin, "/login");
  } catch {
    return fallback;
  }
}
import { buildAppUrl } from "@grantpipe/shared";

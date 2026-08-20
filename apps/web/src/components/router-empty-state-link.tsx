import { Link } from "@tanstack/react-router";
import type { EmptyStateLinkProps } from "@grantpipe/ui";

/**
 * Adapter that satisfies EmptyStateLinkProps using TanStack Router's <Link>.
 *
 * TanStack Router is registered with basepath "/app" (see main.tsx), so using
 * <Link> instead of a plain <a> ensures the basepath is prepended automatically
 * and navigation stays client-side (no full-page reload).
 *
 * The href prop may contain a hash (e.g. "/help#statement_of_activities_report").
 * We split on the first "#" so the router receives a clean path and a separate
 * hash, which it handles correctly for both cross-route and same-page anchors.
 *
 * TanStack Router's Link `to` prop is typed against the registered route tree,
 * which does not accept a plain `string`. We cast to the widest accepted form
 * here — this is intentional because EmptyStateLinkProps intentionally uses an
 * untyped string href to remain framework-agnostic in packages/ui.
 */
function RouterEmptyStateLink({ href, className, children }: EmptyStateLinkProps) {
  const hashIndex = href.indexOf("#");
  const path = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : undefined;

  return (
    <Link to={path as Parameters<typeof Link>[0]["to"]} hash={hash} className={className}>
      {children}
    </Link>
  );
}

export { RouterEmptyStateLink };

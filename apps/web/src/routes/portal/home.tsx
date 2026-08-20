import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@grantpipe/ui";
import { usePortalSession, type PortalScope } from "../../hooks/use-portal-session";
import { humanizeEnum } from "../../lib/format";

export const Route = createFileRoute("/portal/home")({
  component: PortalHomePage,
});

type ScopeGroup = {
  type: string;
  scopes: PortalScope[];
};

const BOARD_PACKET_SCOPE_TYPES = new Set(["generated_report", "evidence_bundle"]);

function groupScopes(scopes: PortalScope[]): ScopeGroup[] {
  const map = new Map<string, PortalScope[]>();
  for (const scope of scopes) {
    const existing = map.get(scope.scopeType) ?? [];
    existing.push(scope);
    map.set(scope.scopeType, existing);
  }
  return Array.from(map.entries()).map(([type, scopes]) => ({ type, scopes }));
}

function isBoardPacketScope(scope: PortalScope): boolean {
  return BOARD_PACKET_SCOPE_TYPES.has(scope.scopeType);
}

type ScopeRoute =
  | { to: "/portal/grants/$id"; params: { id: string } }
  | { to: "/portal/funds/$id"; params: { id: string } }
  | { to: "/portal/programs/$id"; params: { id: string } }
  | { to: "/portal/restriction-terms/$id"; params: { id: string } }
  | { to: "/portal/documents/$id"; params: { id: string } }
  | { to: "/portal/generated-reports/$id"; params: { id: string } }
  | { to: "/portal/bundles/$id"; params: { id: string } };

// Routes that actually exist under apps/web/src/routes/portal/*.$id.tsx.
// Scope types not in this map render as disabled cards instead of broken links.
export function getScopeRoute(scopeType: string, scopeId: string): ScopeRoute | null {
  switch (scopeType) {
    case "grant":
      return { to: "/portal/grants/$id", params: { id: scopeId } };
    case "fund":
      return { to: "/portal/funds/$id", params: { id: scopeId } };
    case "program":
      return { to: "/portal/programs/$id", params: { id: scopeId } };
    case "restriction_term":
      return { to: "/portal/restriction-terms/$id", params: { id: scopeId } };
    case "document":
      return { to: "/portal/documents/$id", params: { id: scopeId } };
    case "generated_report":
      return { to: "/portal/generated-reports/$id", params: { id: scopeId } };
    case "evidence_bundle":
      return { to: "/portal/bundles/$id", params: { id: scopeId } };
    default:
      return null;
  }
}

function PortalScopeCard({ scope }: { scope: PortalScope }) {
  const route = getScopeRoute(scope.scopeType, scope.scopeId);
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {scope.scopeType.charAt(0).toUpperCase()}
        </span>
        <span className="font-medium text-foreground">
          {scope.scopeName?.trim() ? scope.scopeName : humanizeEnum(scope.scopeType)}
        </span>
      </div>
      {route ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <span className="text-xs italic text-muted-foreground">Coming soon for this scope</span>
      )}
    </>
  );

  if (!route) {
    return (
      <div
        aria-disabled="true"
        data-testid={`portal-scope-disabled-${scope.scopeType}`}
        className="flex cursor-not-allowed items-center justify-between rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm opacity-75"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      to={route.to}
      params={route.params}
      className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/40"
    >
      {inner}
    </Link>
  );
}

function ScopeSection({ title, scopes }: { title: string; scopes: PortalScope[] }) {
  if (scopes.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-heading text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2">
        {scopes.map((scope) => (
          <PortalScopeCard key={scope.id} scope={scope} />
        ))}
      </div>
    </section>
  );
}

export function PortalHomePage() {
  const navigate = useNavigate();
  const portalQuery = usePortalSession();

  useEffect(() => {
    // Redirect to index if session is gone.
    if (portalQuery.isError) {
      void navigate({ to: "/portal" });
    }
  }, [portalQuery.isError, navigate]);

  if (portalQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="space-y-6 py-8">
        <p className="sr-only">Loading your review materials…</p>
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-12 w-full" />
        </div>
        <span className="text-sm text-muted-foreground">Loading your review materials…</span>
      </div>
    );
  }

  if (!portalQuery.data) {
    return null;
  }

  const { reviewer, session, scopes } = portalQuery.data;
  const groups = groupScopes(scopes);
  const isBoardReviewer = reviewer.reviewerType === "board";
  const boardPacketScopes = isBoardReviewer ? scopes.filter(isBoardPacketScope) : [];
  const otherBoardScopes = isBoardReviewer
    ? scopes.filter((scope) => !isBoardPacketScope(scope))
    : [];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {isBoardReviewer ? "Board portal" : `Welcome, ${reviewer.name}`}
        </h1>
        {isBoardReviewer ? (
          <p className="text-sm text-muted-foreground">Welcome, {reviewer.name}.</p>
        ) : null}
        {session.purpose && isBoardReviewer ? (
          <p className="text-sm text-muted-foreground">{session.purpose}</p>
        ) : null}
        {session.purpose && !isBoardReviewer ? (
          <p className="text-sm text-muted-foreground">Review purpose: {session.purpose}</p>
        ) : null}
      </div>

      {scopes.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {isBoardReviewer ? "No board materials yet" : "No materials available yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isBoardReviewer
              ? "The organization has not shared board packet materials yet."
              : "The organization has not added any records to your review session yet."}
          </p>
        </div>
      ) : isBoardReviewer ? (
        <div className="space-y-8">
          <ScopeSection title="Board packets" scopes={boardPacketScopes} />
          <ScopeSection title="Other shared records" scopes={otherBoardScopes} />
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <ScopeSection
              key={group.type}
              title={`${humanizeEnum(group.type)}s`}
              scopes={group.scopes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

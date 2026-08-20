import { createFileRoute, Link } from "@tanstack/react-router";
import { Skeleton } from "@grantpipe/ui";
import { usePortalBundle } from "../../hooks/use-portal-session";
import { humanizeEnum, formatUtcCalendarDate } from "../../lib/format";
import { getScopeRoute } from "./home";

export const Route = createFileRoute("/portal/bundles/$id")({
  component: PortalBundlePage,
});

type BundleItem = {
  id: string;
  itemType: string;
  itemId: string;
  caption?: string | null;
  sortOrder: number;
};

export function PortalBundlePage() {
  const { id } = Route.useParams();
  const bundleQuery = usePortalBundle(id);
  const raw = bundleQuery.data;

  // API returns { bundle, items } shape
  const bundle =
    raw && typeof raw === "object" && "bundle" in raw
      ? (raw.bundle as Record<string, unknown>)
      : (raw as Record<string, unknown> | undefined);

  const items: BundleItem[] =
    raw && typeof raw === "object" && "items" in raw
      ? ((raw.items as BundleItem[]) ?? []).sort((a, b) => a.sortOrder - b.sortOrder)
      : [];

  if (bundleQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="space-y-6 py-8">
        <p className="sr-only">Loading bundle…</p>
        <Skeleton className="h-4 w-16" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (bundleQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-5">
        <p className="text-sm font-semibold text-destructive">Unable to load bundle</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {bundleQuery.error instanceof Error
            ? bundleQuery.error.message
            : "You may not have access to this record."}
        </p>
        <Link to="/portal/home" className="mt-3 inline-block text-sm text-primary underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!bundle) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/portal/home" className="text-sm text-primary underline">
          ← Back
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {String(bundle.title ?? "Evidence bundle")}
        </h1>
        {bundle.purpose ? (
          <p className="text-sm text-muted-foreground">{humanizeEnum(String(bundle.purpose))}</p>
        ) : null}
        {bundle.periodStart && bundle.periodEnd ? (
          <p className="text-xs text-muted-foreground">
            {formatUtcCalendarDate(String(bundle.periodStart))} to{" "}
            {formatUtcCalendarDate(String(bundle.periodEnd))}
          </p>
        ) : null}
      </div>

      {bundle.description ? (
        <p className="text-sm text-muted-foreground">{String(bundle.description)}</p>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Items ({items.length})</h2>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">This bundle has no items.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const route = getScopeRoute(item.itemType, item.itemId);
              const inner = (
                <>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {item.itemType.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-medium text-foreground">{humanizeEnum(item.itemType)}</p>
                      {item.caption ? (
                        <p className="text-xs text-muted-foreground">{item.caption}</p>
                      ) : null}
                    </div>
                  </div>
                  {route ? (
                    <span className="text-muted-foreground">→</span>
                  ) : (
                    <span className="text-xs italic text-muted-foreground">
                      Not available in portal
                    </span>
                  )}
                </>
              );

              if (!route) {
                return (
                  <div
                    key={item.id}
                    aria-disabled="true"
                    data-testid={`portal-bundle-item-disabled-${item.itemType}`}
                    className="flex cursor-not-allowed items-center justify-between rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm opacity-75"
                  >
                    {inner}
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  to={route.to}
                  params={route.params}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/40"
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

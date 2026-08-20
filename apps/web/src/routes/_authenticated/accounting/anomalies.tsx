import { useEffect, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { z } from "zod";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageShell,
  StatusPanel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@grantpipe/ui";
import { ANALYTICS_EVENTS, ANOMALY_CLASSES, type AnomalyClass } from "@grantpipe/shared";
import {
  useAnomalies,
  type AnomalyItem,
  type CategoryMisallocationItem,
  type ReleaseOverBalanceItem,
  type DuplicateDonationItem,
  type IndirectRateMismatchItem,
} from "../../../hooks/use-anomalies";
import { captureEvent } from "../../../lib/analytics";
import { formatCurrency } from "../../../lib/format";
import { useSession } from "../../../hooks/use-session";
import { ACTIVE_ENTITY_STORAGE_KEY } from "../../../lib/org-context";
import { captureAppException } from "../../../lib/sentry";

export const Route = createFileRoute("/_authenticated/accounting/anomalies")({
  validateSearch: z.object({
    entityId: z.string().trim().min(1).max(200).optional(),
    highlightEntityId: z.string().trim().min(1).max(200).optional(),
  }),
  component: AnomalyDetectorPage,
});

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

export function getSeverityVariant(
  severity: "info" | "warning" | "critical",
): "secondary" | "warning" | "destructive" {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "warning";
  return "secondary";
}

// ---------------------------------------------------------------------------
// Class labels
// ---------------------------------------------------------------------------

export const CLASS_LABELS: Record<AnomalyClass, string> = {
  category_misallocation: "Category Misallocation",
  release_over_balance: "Release Over Balance",
  duplicate_donation: "Duplicate Donation",
  indirect_rate_mismatch: "Indirect Rate Mismatch",
};

// ---------------------------------------------------------------------------
// Per-class summary formatters
// ---------------------------------------------------------------------------

export function formatCategoryMisallocationSummary(item: CategoryMisallocationItem): string {
  const cat = item.expenseCategory ?? "unknown category";
  return `Expense in "${cat}" may not be allowed under this award term.`;
}

export function formatReleaseOverBalanceSummary(item: ReleaseOverBalanceItem): string {
  return `Release of ${formatCurrency(item.releaseAmountCents)} exceeds available ${formatCurrency(item.availableBalanceCents)}. Over by ${formatCurrency(item.overByCents)}.`;
}

export function formatDuplicateDonationSummary(item: DuplicateDonationItem): string {
  const count = item.duplicateGroupIds.length;
  return `${count} donation${count !== 1 ? "s" : ""} flagged as likely duplicates.`;
}

export function formatIndirectRateMismatchSummary(item: IndirectRateMismatchItem): string {
  const posted = (item.postedRateBasisPoints / 100).toFixed(2);
  const expected = (item.expectedRateBasisPoints / 100).toFixed(2);
  const over = item.deltaCents >= 0;
  const delta = formatCurrency(Math.abs(item.deltaCents));
  return `Indirect cost posted ${formatCurrency(item.postedAmountCents)} (${posted}%) but the rule expects ${formatCurrency(item.expectedAmountCents)} (${expected}%). ${over ? "Over" : "Under"} by ${delta}.`;
}

export function formatAnomalySummary(item: AnomalyItem): string {
  switch (item.class) {
    case "category_misallocation":
      return formatCategoryMisallocationSummary(item);
    case "release_over_balance":
      return formatReleaseOverBalanceSummary(item);
    case "duplicate_donation":
      return formatDuplicateDonationSummary(item);
    case "indirect_rate_mismatch":
      return formatIndirectRateMismatchSummary(item);
  }
}

export function getAnomalyRecordHref(item: AnomalyItem): string {
  const entityId = encodeURIComponent(item.entityId);

  switch (item.class) {
    case "category_misallocation":
      return `/funds/${encodeURIComponent(item.fundId)}?tab=overview&highlightExpenseId=${entityId}`;
    case "release_over_balance":
      if (item.fundId) {
        return `/funds/${encodeURIComponent(item.fundId)}?tab=restrictions&highlightRestrictionTermId=${encodeURIComponent(item.termId)}`;
      }
      if (item.grantId) {
        return `/grants/${encodeURIComponent(item.grantId)}/restrictions/${encodeURIComponent(item.termId)}`;
      }
      if (item.donationId && item.contactId) {
        return `/donors/${encodeURIComponent(item.contactId)}?tab=donations&highlightDonation=${encodeURIComponent(item.donationId)}`;
      }
      return `/accounting/anomalies?highlightEntityId=${entityId}`;
    case "duplicate_donation":
      return `/donors/${encodeURIComponent(item.contactId)}?tab=donations&highlightDonation=${entityId}`;
    case "indirect_rate_mismatch":
      return `/payments/${entityId}`;
  }
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

const ALL_CLASSES: AnomalyClass[] = [...ANOMALY_CLASSES];

function toggleClass(selected: AnomalyClass[], cls: AnomalyClass): AnomalyClass[] {
  return selected.includes(cls) ? selected.filter((c) => c !== cls) : [...selected, cls];
}

export function countBucket(count: number): string {
  if (count <= 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 100) return "11-100";
  if (count <= 1000) return "101-1000";
  return "1000+";
}

function totalAnomalyCount(totals: Record<AnomalyClass, number>): number {
  return Object.values(totals).reduce((sum, count) => sum + count, 0);
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function AnomalyRow({ item, highlighted }: { item: AnomalyItem; highlighted?: boolean }) {
  function handleRecordOpen() {
    captureEvent(ANALYTICS_EVENTS.accountingAnomalyItemOpened, {
      anomaly_class: item.class,
      severity: item.severity,
      entity_type: item.entityType,
    });
  }

  return (
    <TableRow
      data-testid="anomaly-row"
      data-highlighted={highlighted ? "true" : undefined}
      className={highlighted ? "bg-primary/10 ring-2 ring-primary" : undefined}
    >
      <TableCell>
        <Badge variant="secondary" className="rounded-full text-xs">
          {CLASS_LABELS[item.class]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant={getSeverityVariant(item.severity)}
          className="rounded-full text-xs capitalize"
        >
          {item.severity}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatAnomalySummary(item)}</TableCell>
      <TableCell className="text-right">
        <a
          href={getAnomalyRecordHref(item)}
          onClick={handleRecordOpen}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Open record
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AnomalyDetectorPage() {
  const { entityId: requestedEntityId, highlightEntityId } = Route.useSearch();
  const { activeEntity, availableEntities, isLoading: isSessionLoading, orgId } = useSession();
  const queryClient = useQueryClient();
  const resolvedDeepLinkRef = useRef<string | null>(null);
  const [deepLinkResolution, setDeepLinkResolution] = useState<{
    entityId: string | null;
    state: "pending" | "ready" | "denied";
  }>({ entityId: requestedEntityId ?? null, state: requestedEntityId ? "pending" : "ready" });

  useEffect(() => {
    if (!requestedEntityId) {
      resolvedDeepLinkRef.current = null;
      return;
    }
    if (resolvedDeepLinkRef.current === requestedEntityId || isSessionLoading) return;

    const requestedEntity = availableEntities.find((entity) => entity.id === requestedEntityId);
    if (!requestedEntity) {
      captureEvent(ANALYTICS_EVENTS.entitySwitchDenied, {
        org_id: orgId,
        previous_entity_id: activeEntity?.id,
        requested_entity_id: requestedEntityId,
        source: "accounting_anomaly_email",
      });
      captureAppException(
        new Error("Anomaly deep link entity is unavailable"),
        {
          tags: { feature: "entity_switcher", operation: "validate_anomaly_deep_link" },
          extra: {
            org_id: orgId,
            previous_entity_id: activeEntity?.id,
            requested_entity_id: requestedEntityId,
          },
        },
        { includeExpected: true, sanitize: true },
      );
      resolvedDeepLinkRef.current = requestedEntityId;
      return;
    }

    const targetEntityId = requestedEntity.id;
    resolvedDeepLinkRef.current = targetEntityId;
    const previousEntityId = localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY);

    async function switchEntity() {
      try {
        localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, targetEntityId);
        queryClient.removeQueries({ queryKey: ["accounting-anomalies"] });
        await queryClient.invalidateQueries(
          { queryKey: ["auth-session-context"] },
          { throwOnError: true },
        );
        captureEvent(ANALYTICS_EVENTS.entitySwitchCompleted, {
          org_id: orgId,
          previous_entity_id: previousEntityId ?? activeEntity?.id,
          active_entity_id: targetEntityId,
          source: "accounting_anomaly_email",
        });
        if (resolvedDeepLinkRef.current === targetEntityId) {
          setDeepLinkResolution({ entityId: targetEntityId, state: "ready" });
        }
      } catch (error) {
        try {
          if (previousEntityId) {
            localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, previousEntityId);
          } else {
            localStorage.removeItem(ACTIVE_ENTITY_STORAGE_KEY);
          }
        } catch {
          // Keep the original switching error as the reported failure.
        }
        captureEvent(ANALYTICS_EVENTS.entitySwitchDenied, {
          org_id: orgId,
          previous_entity_id: previousEntityId ?? activeEntity?.id,
          requested_entity_id: requestedEntityId,
          source: "accounting_anomaly_email",
        });
        captureAppException(
          error,
          {
            tags: { feature: "entity_switcher", operation: "switch_anomaly_deep_link" },
            extra: {
              org_id: orgId,
              previous_entity_id: previousEntityId ?? activeEntity?.id,
              requested_entity_id: requestedEntityId,
            },
          },
          { includeExpected: true, sanitize: true },
        );
        if (resolvedDeepLinkRef.current === targetEntityId) {
          setDeepLinkResolution({ entityId: targetEntityId, state: "denied" });
        }
      }
    }

    void switchEntity();
  }, [
    activeEntity?.id,
    availableEntities,
    isSessionLoading,
    orgId,
    queryClient,
    requestedEntityId,
  ]);

  const hasResolvedRequestedEntity =
    !requestedEntityId || deepLinkResolution.entityId === requestedEntityId;
  const effectiveDeepLinkState = requestedEntityId ? deepLinkResolution.state : "ready";
  const requestedEntityIsAvailable =
    !requestedEntityId || availableEntities.some((entity) => entity.id === requestedEntityId);
  if (!isSessionLoading && !requestedEntityIsAvailable) {
    return (
      <PageShell>
        <StatusPanel variant="error" title="We can't show anomalies here.">
          Pick a new entity. Try once more.
        </StatusPanel>
      </PageShell>
    );
  }
  if (isSessionLoading || !hasResolvedRequestedEntity || effectiveDeepLinkState === "pending") {
    return (
      <PageShell>
        <StatusPanel variant="loading" title="Please wait.">
          We will check what you can use.
        </StatusPanel>
      </PageShell>
    );
  }
  if (effectiveDeepLinkState === "denied") {
    return (
      <PageShell>
        <StatusPanel variant="error" title="We can't show anomalies here.">
          Pick a new entity. Try once more.
        </StatusPanel>
      </PageShell>
    );
  }

  return <AnomalyFeed highlightEntityId={highlightEntityId} />;
}

function AnomalyFeed({ highlightEntityId }: { highlightEntityId?: string }) {
  const [selectedClasses, setSelectedClasses] = useState<AnomalyClass[]>([]);
  const [showAll, setShowAll] = useState(true);

  const { data, isLoading, isError, isPlanGated } = useAnomalies({
    classes: selectedClasses.length > 0 ? selectedClasses : undefined,
  });

  const allItems = data?.items ?? [];
  const totals = data?.totals;

  const displayedItems =
    !showAll && selectedClasses.length > 0
      ? allItems.filter((item) => selectedClasses.includes(item.class))
      : allItems;

  useEffect(() => {
    if (isLoading || isError || isPlanGated || !data) return;
    captureEvent(ANALYTICS_EVENTS.accountingAnomalyViewed, {
      has_class_filter: selectedClasses.length > 0,
      visible_items_bucket: countBucket(displayedItems.length),
      total_items_bucket: countBucket(totalAnomalyCount(data.totals)),
    });
  }, [data, displayedItems.length, isError, isLoading, isPlanGated, selectedClasses.length]);

  function handleAllClick() {
    captureEvent(ANALYTICS_EVENTS.accountingAnomalyFilterChanged, {
      anomaly_class: "all",
      active: true,
      selected_class_count: 0,
    });
    setShowAll(true);
    setSelectedClasses([]);
  }

  function handleClassClick(cls: AnomalyClass) {
    const next = toggleClass(selectedClasses, cls);
    captureEvent(ANALYTICS_EVENTS.accountingAnomalyFilterChanged, {
      anomaly_class: cls,
      active: next.includes(cls),
      selected_class_count: next.length,
    });
    setSelectedClasses(next);
    setShowAll(next.length === 0);
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker="Accounting"
        title="Anomaly Detector"
        description="Accounting entries that may need review."
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by class">
        <Button
          key="all"
          type="button"
          size="sm"
          variant={showAll ? "secondary" : "outline"}
          aria-pressed={showAll}
          className="rounded-full"
          onClick={handleAllClick}
        >
          All
          {totals && (
            <span className="ml-1 tabular-nums">
              ({Object.values(totals).reduce((sum: number, n) => sum + (n as number), 0)})
            </span>
          )}
        </Button>

        {ALL_CLASSES.map((cls) => {
          const active = selectedClasses.includes(cls);
          const count = totals?.[cls] ?? 0;
          return (
            <Button
              key={cls}
              type="button"
              size="sm"
              variant={active ? "secondary" : "outline"}
              aria-pressed={active}
              className="rounded-full"
              onClick={() => handleClassClick(cls)}
            >
              {CLASS_LABELS[cls]}
              {totals !== undefined && <span className="ml-1 tabular-nums">({count})</span>}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <StatusPanel variant="loading" title="Loading anomalies…">
          Scanning accounting entries for issues.
        </StatusPanel>
      ) : isPlanGated ? (
        <StatusPanel variant="empty" title="Audit-Ready plan required">
          Anomaly Detector is available on the Audit-Ready and Enterprise plans.{" "}
          <Link
            to="/settings"
            hash="billing"
            className="font-medium text-primary hover:underline underline-offset-4"
          >
            Go to Billing to upgrade.
          </Link>
        </StatusPanel>
      ) : isError ? (
        <StatusPanel variant="error" title="Unable to load anomalies.">
          Refresh the page or try again in a moment.
        </StatusPanel>
      ) : displayedItems.length === 0 ? (
        <StatusPanel variant="empty" title="No anomalies found">
          All accounting entries look clean.
        </StatusPanel>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
              Entries to review
            </CardTitle>
            <Badge variant="secondary" className="rounded-full">
              {displayedItems.length}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="text-right">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedItems.map((item: AnomalyItem, idx: number) => (
                  <AnomalyRow
                    key={`${item.class}-${item.entityId}-${idx}`}
                    item={item}
                    highlighted={item.entityId === highlightEntityId}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

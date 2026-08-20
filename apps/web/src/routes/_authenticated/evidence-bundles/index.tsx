import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  PageHeader,
  PageShell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TeachAndActEmptyState,
} from "@grantpipe/ui";
import { FolderArchiveIcon } from "lucide-react";
import {
  ANALYTICS_EVENTS,
  EVIDENCE_BUNDLE_PURPOSES,
  getPlanEntitlements,
  type EvidenceBundlePurpose,
} from "@grantpipe/shared";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { reportsTabs } from "../../../config/page-tabs";
import { useBundles, useBundleMutations } from "../../../hooks/use-external-reviewers";
import { useReportArtifacts } from "../../../hooks/use-reports";
import { captureEvent } from "../../../lib/analytics";
import { captureRecordFilterChanged } from "../../../lib/record-discovery-analytics";
import { captureAppException } from "../../../lib/sentry";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import { formatUtcCalendarDate, humanizeEnum } from "../../../lib/format";
import {
  AUDIT_READY_PLAN_GATE_MESSAGE,
  AUDIT_READY_PLAN_GATE_TITLE,
  isAuditReadyPlanGate,
} from "../../../lib/api-errors";

export const Route = createFileRoute("/_authenticated/evidence-bundles/")({
  component: EvidenceBundlesIndexPage,
});

const BUNDLES_PAGE_SIZE = 25;

const BUNDLE_COLUMN_LABELS = ["Title", "Purpose", "Period", "Items", "Created", "Status"] as const;

type BundleRow = {
  id: string;
  title: string;
  purpose: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  itemCount?: number;
};

type BundlesListResult = { items?: BundleRow[]; data?: BundleRow[]; total?: number };

type AuditReadinessCheck = {
  label: string;
  ready: boolean;
};

function extractBundles(data: unknown): { rows: BundleRow[]; total: number } {
  if (!data) return { rows: [], total: 0 };
  if (Array.isArray(data))
    return { rows: data as BundleRow[], total: (data as BundleRow[]).length };
  const obj = data as BundlesListResult;
  const rows = Array.isArray(obj.items) ? obj.items : Array.isArray(obj.data) ? obj.data : [];
  const total = typeof obj.total === "number" ? obj.total : rows.length;
  return { rows, total };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function getFailureType(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  return /required|invalid|missing|validation/i.test(error.message)
    ? "validation_error"
    : "request_error";
}

function getScoreBucket(score: number): string {
  if (score < 50) return "0-49";
  if (score < 80) return "50-79";
  return "80-100";
}

function getTotalFromReportArtifacts(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const total = (data as { total?: unknown }).total;
  return typeof total === "number" ? total : 0;
}

function getCurrentYearAuditBinderTitle() {
  return `${new Date().getFullYear()} Audit Binder Starter`;
}

function buildAuditReadinessChecks(params: {
  hasAuditorPortal: boolean;
  bundles: BundleRow[];
  auditReportTotal: number;
  irs990ReportTotal: number;
}): AuditReadinessCheck[] {
  const hasAuditBundle = params.bundles.some((bundle) => bundle.purpose === "audit");
  return [
    { label: "Auditor portal", ready: params.hasAuditorPortal },
    { label: "Audit binder starter", ready: hasAuditBundle },
    { label: "Audit export", ready: params.auditReportTotal > 0 },
    { label: "IRS 990 prep export", ready: params.irs990ReportTotal > 0 },
  ];
}

export function EvidenceBundlesIndexPage() {
  const { memberRole, memberPermissions, effectivePlanTier } = useSession();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "compliance", "edit");
  const hasAuditorPortal = getPlanEntitlements(effectivePlanTier).hasAuditorFunderPortal;

  const [page, setPage] = useState(1);
  const [purposeFilter, setPurposeFilter] = useState<"" | EvidenceBundlePurpose>("");
  const bundlesQuery = useBundles(
    {
      page,
      pageSize: BUNDLES_PAGE_SIZE,
      ...(purposeFilter ? { purpose: purposeFilter } : {}),
    },
    { enabled: hasAuditorPortal },
  );
  const { createBundle } = useBundleMutations();

  const { rows: bundles, total } = extractBundles(bundlesQuery.data);
  const auditReportsQuery = useReportArtifacts(
    {
      page: 1,
      pageSize: 1,
      type: "audit",
      sortBy: "createdAt",
      sortOrder: "desc",
    },
    { enabled: hasAuditorPortal },
  );
  const irs990ReportsQuery = useReportArtifacts(
    {
      page: 1,
      pageSize: 1,
      type: "irs_990",
      sortBy: "createdAt",
      sortOrder: "desc",
    },
    { enabled: hasAuditorPortal },
  );
  const readinessChecks = buildAuditReadinessChecks({
    hasAuditorPortal,
    bundles,
    auditReportTotal: getTotalFromReportArtifacts(auditReportsQuery.data),
    irs990ReportTotal: getTotalFromReportArtifacts(irs990ReportsQuery.data),
  });
  const readyCheckCount = readinessChecks.filter((check) => check.ready).length;
  const missingCheckCount = readinessChecks.length - readyCheckCount;
  const readinessScore = Math.round((readyCheckCount / readinessChecks.length) * 100);
  const readinessScoreBucket = getScoreBucket(readinessScore);
  const totalPages = Math.max(1, Math.ceil(total / BUNDLES_PAGE_SIZE));
  const hasFilter = purposeFilter !== "";

  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPurpose, setNewPurpose] = useState<EvidenceBundlePurpose>("audit");
  const [newError, setNewError] = useState<string | null>(null);
  const [auditBinderError, setAuditBinderError] = useState<string | null>(null);
  const hasAuditReadyGate =
    !hasAuditorPortal || (bundlesQuery.isError && isAuditReadyPlanGate(bundlesQuery.error));

  async function handleCreate() {
    if (!newTitle.trim()) {
      setNewError("Title is required.");
      return;
    }
    try {
      await createBundle.mutateAsync({
        title: newTitle.trim(),
        purpose: newPurpose,
      });
      setNewOpen(false);
      setNewTitle("");
      setNewPurpose("audit");
      setNewError(null);
    } catch (err) {
      setNewError(getErrorMessage(err));
    }
  }

  function handlePurposeChange(next: string) {
    const nextPurpose = next === "all" ? "" : (next as EvidenceBundlePurpose);
    setPurposeFilter(nextPurpose);
    setPage(1);
    captureRecordFilterChanged("evidence-bundles", "purpose", { purpose: nextPurpose });
  }

  async function handleCreateAuditBinder() {
    setAuditBinderError(null);
    try {
      await createBundle.mutateAsync({
        title: getCurrentYearAuditBinderTitle(),
        purpose: "audit",
      });
      captureEvent(ANALYTICS_EVENTS.auditReadinessBinderCreated, {
        score_bucket: readinessScoreBucket,
        missing_check_count: missingCheckCount,
      });
    } catch (error) {
      const failureType = getFailureType(error);
      setAuditBinderError("Unable to create the audit binder. Please try again.");
      captureEvent(ANALYTICS_EVENTS.auditReadinessBinderFailed, {
        score_bucket: readinessScoreBucket,
        failure_type: failureType,
      });
      captureAppException(
        error,
        {
          tags: {
            feature: "audit_readiness",
            operation: "create_audit_binder_starter",
          },
          extra: {
            score_bucket: readinessScoreBucket,
            failure_type: failureType,
          },
        },
        { includeExpected: true, sanitize: true },
      );
    }
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <PageHeader
          variant="workbench"
          kicker="Reporting & Compliance"
          title="Evidence Bundles"
          description="Group documents and proof into bundles. Share them with auditors."
        />
        {canEdit && hasAuditorPortal ? (
          <Dialog
            open={newOpen}
            onOpenChange={(next) => {
              setNewOpen(next);
              if (!next) {
                setNewTitle("");
                setNewPurpose("audit");
                setNewError(null);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>Add bundle</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add evidence bundle</DialogTitle>
                <DialogDescription>
                  Create a curated collection of records to share with reviewers.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bundle-title">Title</Label>
                  <Input
                    id="bundle-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. FY2025 Federal Grant Compliance Pack"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Purpose</Label>
                  <Select
                    value={newPurpose}
                    onValueChange={(v) => setNewPurpose(v as EvidenceBundlePurpose)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVIDENCE_BUNDLE_PURPOSES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {humanizeEnum(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {newError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewOpen(false);
                      setNewError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button disabled={createBundle.isPending} onClick={() => void handleCreate()}>
                    {createBundle.isPending ? "Adding…" : "Add"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <AppPageTabs groupId="reports" items={reportsTabs} />

      <Separator />

      {hasAuditorPortal ? (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Audit readiness</h2>
              <p className="text-sm text-muted-foreground">
                See what is ready before you share audit files.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-3xl font-semibold text-foreground">{readinessScore}%</p>
                <p className="text-xs text-muted-foreground">Readiness score</p>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  onClick={() => void handleCreateAuditBinder()}
                  disabled={createBundle.isPending}
                >
                  Create audit binder starter
                </Button>
              ) : null}
            </div>
          </div>
          {auditBinderError ? (
            <Alert variant="destructive" title="Audit binder not created.">
              {auditBinderError}
            </Alert>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {readinessChecks.map((check) => (
              <div key={check.label} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">{check.label}</p>
                <Badge variant={check.ready ? "default" : "secondary"}>
                  {check.ready ? "Ready" : "Missing"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bundle-purpose-filter">Purpose</Label>
          <Select
            value={purposeFilter === "" ? "all" : purposeFilter}
            onValueChange={handlePurposeChange}
          >
            <SelectTrigger id="bundle-purpose-filter" className="w-56">
              <SelectValue placeholder="All purposes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All purposes</SelectItem>
              {EVIDENCE_BUNDLE_PURPOSES.map((p) => (
                <SelectItem key={p} value={p}>
                  {humanizeEnum(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasAuditReadyGate ? (
        <Alert title={AUDIT_READY_PLAN_GATE_TITLE}>
          <div className="space-y-3">
            <p>{AUDIT_READY_PLAN_GATE_MESSAGE}</p>
            {canEdit ? (
              <Button asChild>
                <Link to="/settings" hash="billing">
                  Open billing settings
                </Link>
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : bundlesQuery.isLoading ? (
        <div
          className="overflow-x-auto rounded-lg border border-border"
          data-testid="bundles-loading"
        >
          <Table>
            <TableHeader>
              <TableRow>
                {BUNDLE_COLUMN_LABELS.map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, rowIdx) => (
                <TableRow key={`bundle-skeleton-${rowIdx}`}>
                  {BUNDLE_COLUMN_LABELS.map((label) => (
                    <TableCell key={`bundle-skeleton-${rowIdx}-${label}`}>
                      <Skeleton className="h-4 w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : bundlesQuery.isError ? (
        <Alert variant="destructive" title="Unable to load bundles.">
          {getErrorMessage(bundlesQuery.error)}
        </Alert>
      ) : bundles.length === 0 ? (
        hasFilter ? (
          <p
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid="bundles-filter-empty"
          >
            No evidence bundles match this purpose.{" "}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 font-medium text-primary underline-offset-4"
              onClick={() => handlePurposeChange("all")}
            >
              Clear filter
            </Button>
          </p>
        ) : (
          <TeachAndActEmptyState
            icon={<FolderArchiveIcon className="size-5" />}
            heading="Your evidence bundles live here"
            description="Gather proof for one audit in one place. Share it with a single link."
            primaryAction={
              canEdit
                ? {
                    label: "Add your first bundle",
                    onClick: () => setNewOpen(true),
                  }
                : { label: "Open help", href: "/help" }
            }
            helpLink={{ label: "How evidence bundles work", href: "/help" }}
          />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {BUNDLE_COLUMN_LABELS.map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundles.map((bundle) => (
                  <TableRow key={bundle.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell>
                      <Link
                        to="/evidence-bundles/$bundleId"
                        params={{ bundleId: bundle.id }}
                        className="font-medium text-foreground hover:underline"
                      >
                        {bundle.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{humanizeEnum(bundle.purpose)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {bundle.periodStart && bundle.periodEnd
                        ? `${formatUtcCalendarDate(bundle.periodStart)} to ${formatUtcCalendarDate(bundle.periodEnd)}`
                        : bundle.periodStart
                          ? `From ${formatUtcCalendarDate(bundle.periodStart)}`
                          : "None"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {bundle.itemCount ?? "0"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {bundle.createdAt ? formatUtcCalendarDate(bundle.createdAt) : "None"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={bundle.publishedAt ? "default" : "secondary"}
                        className={bundle.publishedAt ? "bg-primary/10 text-primary" : undefined}
                      >
                        {bundle.publishedAt ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {total > BUNDLES_PAGE_SIZE ? (
            <div
              className="flex items-center justify-between pt-4"
              data-testid="bundles-pagination"
            >
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </PageShell>
  );
}

import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  PageHeader,
  PageShell,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@grantpipe/ui";
import { EntityActivitySection } from "../../../components/entity-activity-section";
import { RetryButton } from "../../../components/retry-button";
import { useReportArtifact, useReportPreview } from "../../../hooks/use-reports";
import { EntityDocumentsSection } from "../../../components/entity-documents-section";
import { formatReportStatusLabel } from "../../../lib/format";
import { QuickShareSheet } from "../../../components/portal/QuickShareSheet";
import { downloadViaOrgFetch } from "../../../lib/download";
import { captureEvent } from "../../../lib/analytics";
import { captureAppException } from "../../../lib/sentry";

export const Route = createFileRoute("/_authenticated/reports/$reportId")({
  component: ReportDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-4 sm:p-6 lg:p-8">
      <Alert variant="destructive" title="Unable to load page">
        <p>{error instanceof Error ? error.message : "Unknown error"}</p>
      </Alert>
    </div>
  ),
  pendingComponent: () => (
    <div className="p-8 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-40" />
    </div>
  ),
});

function ReportDetailPage() {
  const { reportId } = Route.useParams();
  const [shareOpen, setShareOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const artifactQuery = useReportArtifact(reportId);
  const previewQuery = useReportPreview(reportId);
  type ReportArtifact = {
    title: string;
    format: string;
    status: string;
    downloadPath: string;
  };
  type ReportPreview = { content: string };

  function isReportArtifact(value: unknown): value is ReportArtifact {
    return (
      typeof value === "object" &&
      value !== null &&
      "title" in value &&
      "format" in value &&
      "status" in value &&
      "downloadPath" in value
    );
  }

  function isReportPreview(value: unknown): value is ReportPreview {
    return (
      typeof value === "object" &&
      value !== null &&
      "content" in value &&
      typeof (value as Record<string, unknown>).content === "string"
    );
  }

  const artifact: ReportArtifact | undefined = isReportArtifact(artifactQuery.data)
    ? artifactQuery.data
    : undefined;
  const preview: ReportPreview | undefined = isReportPreview(previewQuery.data)
    ? previewQuery.data
    : undefined;
  const artifactFormat = artifact?.format;
  const artifactStatus = artifact?.status;

  React.useEffect(() => {
    if (!artifactFormat || !artifactStatus) {
      return;
    }

    captureEvent("report_opened", {
      report_format: artifactFormat,
      report_status: artifactStatus,
    });
  }, [artifactFormat, artifactStatus, reportId]);

  async function handleDownload(readyArtifact: ReportArtifact) {
    const ext =
      readyArtifact.format === "pdf"
        ? ".pdf"
        : readyArtifact.format === "csv_bundle"
          ? ".csv"
          : ".txt";
    const fallbackFilename = `${readyArtifact.title}${ext}`;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadViaOrgFetch(readyArtifact.downloadPath, fallbackFilename);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to download file.");
      captureAppException(
        error,
        {
          tags: {
            feature: "reports",
            operation: "download",
            surface: "report_detail",
            report_format: readyArtifact.format,
            report_status: readyArtifact.status,
          },
        },
        { sanitize: true },
      );
    } finally {
      setIsDownloading(false);
    }
  }

  if (artifactQuery.isLoading && !artifact) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </PageShell>
    );
  }

  if (artifactQuery.isError && !artifact) {
    const message =
      artifactQuery.error instanceof Error
        ? artifactQuery.error.message
        : "An unexpected error occurred.";

    return (
      <PageShell>
        <Alert variant="destructive" title="Unable to load report.">
          {message}
          <div className="mt-3">
            <RetryButton query={artifactQuery} />
          </div>
        </Alert>
      </PageShell>
    );
  }

  if (!artifact) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </PageShell>
    );
  }

  const canDownloadArtifact = artifact.status === "ready";
  const downloadLabel =
    artifact.format === "csv_bundle"
      ? "Download CSV export"
      : artifact.format === "pdf"
        ? "Download PDF"
        : "Download report";
  const reportActionAnalytics = {
    report_format: artifact.format,
    report_status: artifact.status,
    surface: "report_detail",
  };

  function handleShareClick() {
    captureEvent("report_share_started", reportActionAnalytics);
    setShareOpen(true);
  }

  function handleDownloadClick() {
    captureEvent("report_download_clicked", reportActionAnalytics);
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/reports">Reports</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{artifact.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={artifact.title}
        description={`Status: ${formatReportStatusLabel(artifact.status)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canDownloadArtifact}
              onClick={handleShareClick}
            >
              Share
            </Button>
            {canDownloadArtifact ? (
              <Button
                type="button"
                variant="outline"
                disabled={isDownloading}
                onClick={() => {
                  handleDownloadClick();
                  void handleDownload(artifact);
                }}
              >
                {isDownloading ? "Downloading…" : downloadLabel}
              </Button>
            ) : null}
          </div>
        }
      />

      {!canDownloadArtifact ? (
        <Alert variant={artifact.status === "failed" ? "destructive" : "default"}>
          {artifact.status === "failed"
            ? "Unable to generate this report. There is nothing to download."
            : "This report is still generating. Download will be ready when it finishes."}
        </Alert>
      ) : null}

      {downloadError ? (
        <Alert variant="destructive" title="Download failed">
          {downloadError}
        </Alert>
      ) : null}

      <Tabs defaultValue="preview" className="flex flex-col gap-6">
        <TabsList variant="record">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* ----- Preview Tab ----- */}
        <TabsContent value="preview" className="space-y-4 pt-4">
          <p className="text-sm text-muted-foreground">
            Check the output here before you share or download it.
          </p>
          {previewQuery.isError ? (
            <Alert variant="destructive" title="Unable to load preview.">
              {previewQuery.error instanceof Error
                ? previewQuery.error.message
                : "An unexpected error occurred."}
            </Alert>
          ) : null}
          <iframe
            srcDoc={
              previewQuery.isLoading
                ? "<p>Loading preview…</p>"
                : (preview?.content ?? "<p>Preview unavailable.</p>")
            }
            sandbox="allow-same-origin"
            title="Report preview"
            className="w-full rounded-2xl border border-border bg-white min-h-layout-report-min h-[80vh] max-h-layout-report-max"
          />
        </TabsContent>

        {/* ----- Activity Tab ----- */}
        <TabsContent value="activity" className="pt-4">
          <EntityActivitySection entityType="generated_report" entityId={reportId} />
        </TabsContent>

        {/* ----- Documents Tab ----- */}
        <TabsContent value="documents" className="pt-4">
          <EntityDocumentsSection entityType="generated_report" entityId={reportId} />
        </TabsContent>
      </Tabs>

      <QuickShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        scopeType="generated_report"
        scopeId={reportId}
        entityName={artifact.title}
      />
    </PageShell>
  );
}

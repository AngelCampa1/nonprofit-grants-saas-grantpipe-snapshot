import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Skeleton } from "@grantpipe/ui";
import { usePortalDocument, portalDocumentDownloadUrl } from "../../hooks/use-portal-session";
import { captureEvent } from "../../lib/analytics";
import { getDocumentMimeFamily, getDocumentSizeBucket } from "../../lib/document-analytics";

export const Route = createFileRoute("/portal/documents/$id")({
  component: PortalDocumentPage,
});

export function PortalDocumentPage() {
  const { id } = Route.useParams();
  const documentQuery = usePortalDocument(id);
  const document = documentQuery.data;

  if (documentQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="space-y-6 py-8">
        <p className="sr-only">Loading document…</p>
        <Skeleton className="h-4 w-16" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (documentQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-5">
        <p className="text-sm font-semibold text-destructive">Unable to load document</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {documentQuery.error instanceof Error
            ? documentQuery.error.message
            : "You may not have access to this record."}
        </p>
        <Link to="/portal/home" className="mt-3 inline-block text-sm text-primary underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!document) return null;

  const fileSizeBytes =
    typeof document.fileSizeBytes === "number" && Number.isFinite(document.fileSizeBytes)
      ? document.fileSizeBytes
      : 0;

  function handleDownloadClick() {
    captureEvent("document_download_clicked", {
      mime_family: getDocumentMimeFamily(String(document?.mimeType ?? "")),
      size_bucket: getDocumentSizeBucket(fileSizeBytes),
      surface: "portal_document",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link to="/portal/home" className="text-sm text-primary underline">
          ← Back
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {String(document.filename ?? "Document")}
        </h1>
        {document.mimeType ? (
          <p className="text-xs text-muted-foreground">{String(document.mimeType)}</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              {String(document.filename ?? "File")}
            </p>
            {document.fileSizeBytes != null ? (
              <p className="text-xs text-muted-foreground">
                {Math.round(fileSizeBytes / 1024).toString()} KB
              </p>
            ) : null}
          </div>
          <Button asChild>
            <a href={portalDocumentDownloadUrl(id)} download onClick={handleDownloadClick}>
              Download
            </a>
          </Button>
        </div>
      </div>

      {document.description ? (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Description</h2>
          <p className="text-sm text-muted-foreground">{String(document.description)}</p>
        </div>
      ) : null}
    </div>
  );
}

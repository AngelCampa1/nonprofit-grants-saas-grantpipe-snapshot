import { type FormEvent, type ReactNode, useId, useState } from "react";
import type { DocumentEntityType } from "@grantpipe/shared";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FilePicker,
  Skeleton,
} from "@grantpipe/ui";
import { useDeleteDocument, useEntityDocuments, useUploadDocument } from "../hooks/use-documents";
import { useSession } from "../hooks/use-session";
import { canAccessFeature } from "../lib/access-control";
import { downloadViaOrgFetch } from "../lib/download";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";
import { getDocumentMimeFamily, getDocumentSizeBucket } from "../lib/document-analytics";
import { ConfirmDialog } from "./confirm-dialog";

type EntityDocumentsSectionProps = {
  entityType: DocumentEntityType;
  entityId: string;
  title?: string;
  description?: string;
  renderDocumentActions?: (document: DocumentRecord) => ReactNode;
};

type DocumentRecord = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy?: string | null;
};

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 bytes";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} bytes`;
  }

  const kilobytes = sizeBytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes < 10 ? 1 : 0)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function EntityDocumentsSection({
  entityType,
  entityId,
  title = "Documents",
  description = "Attach files to this record.",
  renderDocumentActions,
}: EntityDocumentsSectionProps) {
  const { memberRole, memberPermissions } = useSession();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const documentsQuery = useEntityDocuments(entityType, entityId);
  const uploadDocument = useUploadDocument(entityType, entityId);
  const deleteDocument = useDeleteDocument(entityType, entityId);
  const canUploadDocuments = canAccessFeature(memberRole, memberPermissions, "documents", "edit");
  const canDeleteDocuments = canAccessFeature(memberRole, memberPermissions, "documents", "manage");

  async function handleDelete(document: DocumentRecord) {
    setDeleteError(null);
    try {
      await deleteDocument.mutateAsync(document.id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete document.");
    }
  }

  async function handleDownload(document: DocumentRecord) {
    setDownloadError(null);
    setDownloadingId(document.id);
    captureEvent("document_download_clicked", {
      entity_type: entityType,
      mime_family: getDocumentMimeFamily(document.mimeType),
      size_bucket: getDocumentSizeBucket(document.sizeBytes),
      surface: "entity_documents",
    });
    try {
      await downloadViaOrgFetch(`/api/documents/${document.id}/download`, document.filename);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to download file.");
      captureAppException(
        error,
        {
          tags: {
            feature: "documents",
            operation: "download",
            surface: "entity_documents",
            entity_type: entityType,
            mime_family: getDocumentMimeFamily(document.mimeType),
          },
        },
        { sanitize: true },
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }

    const form = event.currentTarget;
    try {
      await uploadDocument.mutateAsync(file);
      setFile(null);
      form.reset();
    } catch {
      // Failure is surfaced via uploadDocument.isError below; keep the selected
      // file so the user can retry without re-picking it.
    }
  }

  function handleFileChange(selectedFile: File | null) {
    setFile(selectedFile);

    if (!selectedFile) {
      return;
    }

    captureEvent("document_selected", {
      entity_type: entityType,
      mime_family: getDocumentMimeFamily(selectedFile.type),
      size_bucket: getDocumentSizeBucket(selectedFile.size),
    });
  }

  const documents = documentsQuery.data?.data ?? [];
  const loadError =
    documentsQuery.isError && documentsQuery.error instanceof Error
      ? documentsQuery.error.message
      : documentsQuery.isError
        ? "Unable to load documents."
        : null;

  const uploadError =
    uploadDocument.isError && uploadDocument.error instanceof Error
      ? uploadDocument.error.message
      : uploadDocument.isError
        ? "Unable to upload document."
        : null;

  return (
    <Card className="rounded-2xl border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {canUploadDocuments ? (
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor={inputId} className="text-sm font-medium">
                Document file
              </label>
              <FilePicker id={inputId} onFileChange={handleFileChange} />
            </div>
            <Button type="submit" disabled={!file || uploadDocument.isPending}>
              Upload document
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">You don't have upload access.</p>
        )}

        {canUploadDocuments && uploadError && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {uploadError}
          </div>
        )}

        {downloadError && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {downloadError}
          </div>
        )}

        {deleteError && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {deleteError}
          </div>
        )}

        {documentsQuery.isLoading ? (
          <div
            data-testid="documents-loading"
            role="status"
            aria-live="polite"
            className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4"
          >
            <p className="text-sm text-muted-foreground">Loading documents…</p>
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
            <h3 className="text-sm font-semibold text-foreground">No documents yet.</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a file to attach it to this record.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((document) => (
              <div key={document.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto justify-start p-0 font-medium text-primary hover:underline"
                      disabled={downloadingId === document.id}
                      onClick={() => {
                        void handleDownload(document);
                      }}
                    >
                      {document.filename}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {document.mimeType} - {formatFileSize(document.sizeBytes)}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Uploaded {formatDate(document.createdAt)}</p>
                    {document.uploadedBy && <p>{document.uploadedBy}</p>}
                    {renderDocumentActions && (
                      <div className="mt-2">{renderDocumentActions(document)}</div>
                    )}
                    {canDeleteDocuments && (
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={deleteDocument.isPending && pendingDelete?.id === document.id}
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(document);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        title="Delete document"
        description={
          pendingDelete
            ? `Remove "${pendingDelete.filename}"? This cannot be undone.`
            : "Remove this document? This cannot be undone."
        }
        confirmLabel="Delete document"
        isPending={deleteDocument.isPending}
        onConfirm={() => {
          if (pendingDelete) {
            void handleDelete(pendingDelete);
          }
        }}
      />
    </Card>
  );
}

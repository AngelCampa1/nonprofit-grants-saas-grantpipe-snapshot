import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseEntityDocuments = vi.fn();
const mockUseUploadDocument = vi.fn();
const mockUseDeleteDocument = vi.fn();
const mockUseSession = vi.fn();
const mockDownloadViaOrgFetch = vi.fn();
const mockCaptureEvent = vi.fn();
const mockCaptureAppException = vi.fn();

vi.mock("../hooks/use-documents", () => ({
  useEntityDocuments: (...args: unknown[]) => mockUseEntityDocuments(...args),
  useUploadDocument: (...args: unknown[]) => mockUseUploadDocument(...args),
  useDeleteDocument: (...args: unknown[]) => mockUseDeleteDocument(...args),
}));

vi.mock("../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../lib/download", () => ({
  downloadViaOrgFetch: (...args: unknown[]) => mockDownloadViaOrgFetch(...args),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

vi.mock("../lib/document-analytics", () => ({
  getDocumentMimeFamily: (mimeType: string) => mimeType.split("/")[0] ?? "unknown",
  getDocumentSizeBucket: (sizeBytes: number) => (sizeBytes < 10240 ? "under_10kb" : "over_10kb"),
}));

import { EntityDocumentsSection } from "./entity-documents-section";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("EntityDocumentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureEvent.mockClear();
    mockUseEntityDocuments.mockReturnValue({
      data: {
        data: [
          {
            id: "doc-1",
            filename: "appeal.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1234,
            createdAt: "2026-04-01T00:00:00.000Z",
            uploadedBy: "user-1",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });
    mockUseUploadDocument.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
    mockUseDeleteDocument.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
    mockUseSession.mockReturnValue({
      memberRole: "admin",
      isLoading: false,
    });
    mockDownloadViaOrgFetch.mockResolvedValue(undefined);
    mockCaptureAppException.mockClear();
  });

  it("downloads the file via org-scoped fetch when the filename is clicked", async () => {
    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("appeal.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "appeal.pdf" }));

    await waitFor(() => {
      expect(mockDownloadViaOrgFetch).toHaveBeenCalledWith(
        "/api/documents/doc-1/download",
        "appeal.pdf",
      );
    });
  });

  it("formats the upload date in UTC regardless of the viewer's timezone", () => {
    const originalTz = process.env.TZ;
    // A negative-UTC-offset zone where the UTC midnight timestamp falls on the prior local day.
    process.env.TZ = "America/New_York";
    try {
      render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByText("Uploaded Apr 1, 2026")).toBeInTheDocument();
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("renders custom document actions when provided", () => {
    render(
      <EntityDocumentsSection
        entityType="grant"
        entityId="grant-1"
        renderDocumentActions={(document) => <span>action-{document.id}</span>}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText("action-doc-1")).toBeInTheDocument();
  });

  it("disables the row button while a download is in flight", async () => {
    let resolveDownload: (() => void) | undefined;
    mockDownloadViaOrgFetch.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDownload = resolve;
      }),
    );

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    const button = screen.getByRole("button", { name: "appeal.pdf" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "appeal.pdf" })).toBeDisabled();
    });

    resolveDownload?.();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "appeal.pdf" })).not.toBeDisabled();
    });
  });

  it("surfaces a download error in a destructive box", async () => {
    mockDownloadViaOrgFetch.mockRejectedValue(new Error("Document not found"));

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByRole("button", { name: "appeal.pdf" }));

    await waitFor(() => {
      expect(screen.getByText("Document not found")).toBeInTheDocument();
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: {
          feature: "documents",
          operation: "download",
          surface: "entity_documents",
          entity_type: "grant",
          mime_family: "application",
        },
      }),
      { sanitize: true },
    );
    const calls = JSON.stringify(mockCaptureAppException.mock.calls);
    expect(calls).not.toContain("appeal.pdf");
    expect(calls).not.toContain("doc-1");
    expect(calls).not.toContain("grant-1");
  });

  it("falls back to a generic download error message for non-Error failures", async () => {
    mockDownloadViaOrgFetch.mockRejectedValue("boom");

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByRole("button", { name: "appeal.pdf" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to download file.")).toBeInTheDocument();
    });
  });

  it("tracks file selection without sending file or entity identifiers", () => {
    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    const file = new File(["hello"], "private-appeal.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Document file"), {
      target: { files: [file] },
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("document_selected", {
      entity_type: "grant",
      mime_family: "application",
      size_bucket: "under_10kb",
    });
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("private-appeal.pdf");
    expect(calls).not.toContain("grant-1");
  });

  it("tracks document downloads without sending filenames or document IDs", () => {
    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByRole("button", { name: "appeal.pdf" }));

    expect(mockCaptureEvent).toHaveBeenCalledWith("document_download_clicked", {
      entity_type: "grant",
      mime_family: "application",
      size_bucket: "under_10kb",
      surface: "entity_documents",
    });
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("appeal.pdf");
    expect(calls).not.toContain("doc-1");
    expect(calls).not.toContain("grant-1");
  });

  it("uses document edit permissions instead of role alone for uploads", () => {
    mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { documents: "edit" },
      isLoading: false,
    });

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByRole("button", { name: "Upload document" })).toBeInTheDocument();
  });

  it("formats larger file sizes in megabytes", () => {
    mockUseEntityDocuments.mockReturnValue({
      data: {
        data: [
          {
            id: "doc-2",
            filename: "impact.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2 * 1024 * 1024,
            createdAt: "2026-04-01T00:00:00.000Z",
            uploadedBy: "user-1",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
  });

  it("formats byte, kilobyte, and large megabyte values", () => {
    mockUseEntityDocuments.mockReturnValue({
      data: {
        data: [
          {
            id: "doc-0",
            filename: "empty.txt",
            mimeType: "text/plain",
            sizeBytes: 0,
            createdAt: "2026-04-01T00:00:00.000Z",
            uploadedBy: "user-1",
          },
          {
            id: "doc-1",
            filename: "small.txt",
            mimeType: "text/plain",
            sizeBytes: 123,
            createdAt: "2026-04-01T00:00:00.000Z",
            uploadedBy: "user-1",
          },
          {
            id: "doc-2",
            filename: "brief.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1536,
            createdAt: "2026-04-01T00:00:00.000Z",
            uploadedBy: "user-1",
          },
          {
            id: "doc-3",
            filename: "mid.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12 * 1024,
            createdAt: "2026-04-01T00:00:00.000Z",
            uploadedBy: "user-1",
          },
          {
            id: "doc-4",
            filename: "large.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12 * 1024 * 1024,
            createdAt: "2026-04-01T00:00:00.000Z",
            uploadedBy: "user-1",
          },
        ],
        total: 5,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" && element.textContent?.includes("0 bytes") === true,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" && element.textContent?.includes("123 bytes") === true,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/1.5 KB/)).toBeInTheDocument();
    expect(screen.getByText(/12 KB/)).toBeInTheDocument();
    expect(screen.getByText(/12 MB/)).toBeInTheDocument();
  });

  it("shows an empty state when no documents exist", () => {
    mockUseEntityDocuments.mockReturnValue({
      data: {
        data: [],
        total: 0,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    });

    render(<EntityDocumentsSection entityType="fund" entityId="fund-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("No documents yet.")).toBeInTheDocument();
    expect(screen.getByText("Upload a file to attach it to this record.")).toBeInTheDocument();
  });

  it("shows loading and error states", () => {
    mockUseEntityDocuments.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { rerender } = render(<EntityDocumentsSection entityType="fund" entityId="fund-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId("documents-loading")).toBeInTheDocument();

    mockUseEntityDocuments.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Documents failed"),
    });

    rerender(<EntityDocumentsSection entityType="fund" entityId="fund-1" />);

    expect(screen.getByText("Documents failed")).toBeInTheDocument();
  });

  it("falls back to generic load and upload error messages", () => {
    mockUseEntityDocuments.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: "boom" as unknown as Error,
    });
    mockUseUploadDocument.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
      isError: true,
      error: "boom" as unknown as Error,
    });

    render(<EntityDocumentsSection entityType="fund" entityId="fund-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Unable to load documents.")).toBeInTheDocument();
    expect(screen.getByText("Unable to upload document.")).toBeInTheDocument();
  });

  it("uploads the selected file", async () => {
    const uploadMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    mockUseUploadDocument.mockReturnValue({
      ...uploadMutation,
      isPending: false,
    });

    render(<EntityDocumentsSection entityType="event" entityId="event-1" />, {
      wrapper: createWrapper(),
    });

    const fileInput = screen.getByLabelText("Document file");
    const file = new File(["hello"], "agenda.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    await waitFor(() => {
      expect(uploadMutation.mutateAsync).toHaveBeenCalledWith(file);
    });
  });

  it("keeps the selected file and surfaces the error when upload fails", async () => {
    const uploadMutation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("Upload failed")),
    };
    mockUseUploadDocument.mockReturnValue({
      ...uploadMutation,
      isPending: false,
      isError: true,
      error: new Error("Upload failed"),
    });

    render(<EntityDocumentsSection entityType="event" entityId="event-1" />, {
      wrapper: createWrapper(),
    });

    const fileInput = screen.getByLabelText("Document file");
    const file = new File(["hello"], "agenda.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    await waitFor(() => {
      expect(uploadMutation.mutateAsync).toHaveBeenCalledWith(file);
    });

    // Error message is shown and the file is retained so the user can retry
    // (no unhandled rejection escapes; button stays enabled because file !== null).
    expect(screen.getByText("Upload failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload document" })).toBeEnabled();
  });

  it("ignores submit when no file is selected", () => {
    const uploadMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    mockUseUploadDocument.mockReturnValue({
      ...uploadMutation,
      isPending: false,
    });

    const { container } = render(<EntityDocumentsSection entityType="event" entityId="event-1" />, {
      wrapper: createWrapper(),
    });

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    expect(uploadMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("hides upload controls for viewers while keeping downloads visible", () => {
    mockUseSession.mockReturnValue({
      memberRole: "viewer",
      isLoading: false,
    });

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("appeal.pdf")).toBeInTheDocument();
    expect(screen.getByText("You don't have upload access.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Document file")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload document" })).not.toBeInTheDocument();
  });

  it("shows upload errors", () => {
    mockUseUploadDocument.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
      isError: true,
      error: new Error("Upload failed"),
    });

    render(<EntityDocumentsSection entityType="event" entityId="event-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Upload failed")).toBeInTheDocument();
  });

  it("deletes a document after confirmation for managers", async () => {
    const deleteMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    mockUseDeleteDocument.mockReturnValue({ ...deleteMutation, isPending: false });

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText('Remove "appeal.pdf"? This cannot be undone.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete document" }));

    await waitFor(() => {
      expect(deleteMutation.mutateAsync).toHaveBeenCalledWith("doc-1");
    });
  });

  it("hides the delete control without manage permission", () => {
    mockUseSession.mockReturnValue({
      memberRole: "editor",
      memberPermissions: { documents: "edit" },
      isLoading: false,
    });

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("surfaces a delete error in a destructive box", async () => {
    const deleteMutation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("Delete forbidden")),
    };
    mockUseDeleteDocument.mockReturnValue({ ...deleteMutation, isPending: false });

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete document" }));

    await waitFor(() => {
      expect(screen.getByText("Delete forbidden")).toBeInTheDocument();
    });
  });

  it("falls back to a generic delete error message for non-Error failures", async () => {
    const deleteMutation = { mutateAsync: vi.fn().mockRejectedValue("boom") };
    mockUseDeleteDocument.mockReturnValue({ ...deleteMutation, isPending: false });

    render(<EntityDocumentsSection entityType="grant" entityId="grant-1" />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete document" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to delete document.")).toBeInTheDocument();
    });
  });
});

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useParams: () => ({ id: "portal-doc-1" }),
  })),
  mockUsePortalDocument: vi.fn(),
  mockCaptureEvent: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Button: ({
      children,
      asChild,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
      asChild ? (children as React.ReactElement) : <button {...props}>{children}</button>,
  };
});

vi.mock("../../hooks/use-portal-session", () => ({
  usePortalDocument: hoisted.mockUsePortalDocument,
  portalDocumentDownloadUrl: (id: string) => `/api/public/portal/documents/${id}/download`,
}));

vi.mock("../../lib/analytics", () => ({
  captureEvent: hoisted.mockCaptureEvent,
}));

import { PortalDocumentPage } from "./documents.$id";

describe("PortalDocumentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockUsePortalDocument.mockReturnValue({
      data: {
        filename: "private-award.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 2048,
      },
      isLoading: false,
      isError: false,
    });
  });

  it("tracks portal document downloads without sending document identifiers or names", () => {
    render(<PortalDocumentPage />);

    fireEvent.click(screen.getByRole("link", { name: "Download" }));

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("document_download_clicked", {
      mime_family: "application",
      size_bucket: "under_10kb",
      surface: "portal_document",
    });
    const calls = JSON.stringify(hoisted.mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("portal-doc-1");
    expect(calls).not.toContain("private-award.pdf");
  });

  it("renders loading, error, and missing document states", () => {
    hoisted.mockUsePortalDocument.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { rerender, container } = render(<PortalDocumentPage />);

    expect(screen.getByText(/Loading document/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    hoisted.mockUsePortalDocument.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Portal document unavailable"),
    });

    rerender(<PortalDocumentPage />);

    expect(screen.getByText("Unable to load document")).toBeInTheDocument();
    expect(screen.getByText("Portal document unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/portal/home",
    );

    hoisted.mockUsePortalDocument.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: "nope",
    });

    rerender(<PortalDocumentPage />);

    expect(screen.getByText("You may not have access to this record.")).toBeInTheDocument();

    hoisted.mockUsePortalDocument.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    rerender(<PortalDocumentPage />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders optional document metadata and fallback labels", () => {
    hoisted.mockUsePortalDocument.mockReturnValue({
      data: {
        description: "Shared with your reviewer portal.",
        fileSizeBytes: Number.NaN,
      },
      isLoading: false,
      isError: false,
    });

    render(<PortalDocumentPage />);

    expect(screen.getByRole("heading", { name: "Document" })).toBeInTheDocument();
    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByText("0 KB")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Shared with your reviewer portal.")).toBeInTheDocument();
    expect(screen.queryByText("application/pdf")).not.toBeInTheDocument();
  });
});

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
    component: config.component,
    path,
  })),
  mockUseReportGrantOptions: vi.fn(),
  mockUseGenerateDraft: vi.fn(),
  mockUseSession: vi.fn(),
  mutateAsync: vi.fn(),
  clipboardWriteText: vi.fn(),
  mockCaptureAppException: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/reports/drafts" } }),
  Link: ({
    children,
    to,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    to?: string;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a href={to} className={className} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: hoisted.mockUseSession,
}));

vi.mock("../../../hooks/use-reports", () => ({
  useReportGrantOptions: hoisted.mockUseReportGrantOptions,
}));

vi.mock("../../../hooks/use-drafting-assistant", () => ({
  useGenerateDraft: hoisted.mockUseGenerateDraft,
}));

vi.mock("../../../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => hoisted.mockCaptureAppException(...args),
}));

import { DraftsPage } from "./drafts";

describe("DraftsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "admin",
      memberPermissions: null,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: hoisted.clipboardWriteText,
      },
    });
    hoisted.mockUseReportGrantOptions.mockReturnValue({
      data: [{ id: "123e4567-e89b-12d3-a456-426614174000", name: "Youth Services" }],
      isError: false,
      isPending: false,
      error: undefined,
    });
    hoisted.mockUseGenerateDraft.mockReturnValue({
      mutateAsync: hoisted.mutateAsync,
      isPending: false,
    });
    hoisted.clipboardWriteText.mockResolvedValue(undefined);
    hoisted.mutateAsync.mockResolvedValue({
      draftTitle: "Youth Services draft",
      draftType: "interim_report",
      draftBody: "Draft body.",
      sections: [{ heading: "Progress", body: "42 youth were served." }],
      citations: [
        { type: "grant", label: "Youth Services", href: "/grants/grant-1" },
        {
          type: "metric",
          label: "Youth served",
          href: "/grants/grant-1",
          value: "youth",
        },
      ],
      safeguards: ["Editable draft only. A human must review, edit, and submit outside GrantPipe."],
      modelId: "minimax/minimax-m2.7",
      promptVersion: "proposal-report-drafting-v1",
      generatedAt: "2026-06-18T12:00:00.000Z",
    });
  });

  it("renders the page title in title case", () => {
    render(<DraftsPage />);

    expect(screen.getByRole("heading", { name: "Proposal and Report Drafts" })).toBeInTheDocument();
  });

  it("requires review after staff edit generated draft text before copying", async () => {
    render(<DraftsPage />);

    fireEvent.click(screen.getByText("Select a grant"));
    fireEvent.click(screen.getByText("Youth Services"));
    fireEvent.click(screen.getByText("Proposal narrative"));
    fireEvent.click(screen.getByText("Interim report"));
    await userEvent.clear(screen.getByLabelText("Instructions"));
    await userEvent.type(
      screen.getByLabelText("Instructions"),
      "Draft an interim report from reviewed records.",
    );
    await userEvent.click(screen.getByRole("button", { name: /generate editable draft/i }));

    await waitFor(() => {
      expect(hoisted.mutateAsync).toHaveBeenCalledWith({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "interim_report",
        userPrompt: "Draft an interim report from reviewed records.",
      });
    });

    const copyButton = screen.getByRole("button", { name: /copy reviewed draft/i });
    const reviewCheckbox = screen.getByRole("checkbox", {
      name: /i reviewed the draft and its sources/i,
    });
    expect(copyButton).toBeDisabled();

    await userEvent.click(reviewCheckbox);
    expect(copyButton).toBeEnabled();

    const sectionInput = screen.getByLabelText("Progress draft body");
    await userEvent.clear(sectionInput);
    await userEvent.type(sectionInput, "Edited progress text from staff review.");
    expect(reviewCheckbox).not.toBeChecked();
    expect(copyButton).toBeDisabled();

    await userEvent.click(reviewCheckbox);
    await userEvent.click(copyButton);

    expect(hoisted.clipboardWriteText).toHaveBeenCalledWith(
      expect.stringContaining("Edited progress text from staff review."),
    );
    expect(hoisted.clipboardWriteText).not.toHaveBeenCalledWith(
      expect.stringContaining("42 youth were served."),
    );
  });

  it("reports clipboard failures without sending draft text", async () => {
    hoisted.clipboardWriteText.mockRejectedValueOnce(new Error("Clipboard denied"));
    render(<DraftsPage />);

    fireEvent.click(screen.getByText("Select a grant"));
    fireEvent.click(screen.getByText("Youth Services"));
    fireEvent.click(screen.getByText("Proposal narrative"));
    fireEvent.click(screen.getByText("Interim report"));
    await userEvent.click(screen.getByRole("button", { name: /generate editable draft/i }));
    await screen.findByText("Youth Services draft");

    await userEvent.click(
      screen.getByRole("checkbox", { name: /i reviewed the draft and its sources/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /copy reviewed draft/i }));

    expect(
      await screen.findByText("Unable to copy draft. Please select the text and copy it manually."),
    ).toBeInTheDocument();
    expect(hoisted.mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: {
          feature: "reports",
          operation: "copy_draft",
          surface: "drafting_assistant",
        },
      }),
      { sanitize: true },
    );
    const calls = JSON.stringify(hoisted.mockCaptureAppException.mock.calls);
    expect(calls).not.toContain("Draft body.");
    expect(calls).not.toContain("42 youth were served.");
  });

  it("shows loading, grant-load, and generation-error states", async () => {
    hoisted.mockUseGenerateDraft.mockReturnValueOnce({
      mutateAsync: hoisted.mutateAsync,
      isPending: true,
    });

    const { rerender } = render(<DraftsPage />);
    expect(screen.getByText("Building a source-backed draft…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate editable draft/i })).toBeDisabled();

    hoisted.mockUseGenerateDraft.mockReturnValue({
      mutateAsync: hoisted.mutateAsync,
      isPending: false,
    });
    hoisted.mockUseReportGrantOptions.mockReturnValueOnce({
      data: undefined,
      isError: true,
      isPending: false,
      error: new Error("Grant load failed"),
    });
    rerender(<DraftsPage />);
    expect(screen.getByText("Grant load failed")).toBeInTheDocument();
    expect(screen.getByText("Drafting starts from one grant record.")).toBeInTheDocument();
    expect(
      screen.getByText("Select a grant and generate a draft to review it here."),
    ).toBeInTheDocument();

    hoisted.mockUseReportGrantOptions.mockReturnValue({
      data: [{ id: "123e4567-e89b-12d3-a456-426614174000", name: "Youth Services" }],
      isError: false,
      isPending: false,
      error: undefined,
    });
    hoisted.mutateAsync.mockRejectedValueOnce(new Error("Draft failed"));
    rerender(<DraftsPage />);

    fireEvent.click(screen.getByText("Select a grant"));
    fireEvent.click(screen.getByText("Youth Services"));
    await userEvent.click(screen.getByRole("button", { name: /generate editable draft/i }));

    expect(await screen.findByText("Draft failed")).toBeInTheDocument();
  });

  it("uses a generic generation error when the thrown value is not an Error", async () => {
    hoisted.mutateAsync.mockRejectedValueOnce("Draft failed");
    render(<DraftsPage />);

    fireEvent.click(screen.getByText("Select a grant"));
    fireEvent.click(screen.getByText("Youth Services"));
    await userEvent.click(screen.getByRole("button", { name: /generate editable draft/i }));

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
  });

  it("renders the Reports tab navigation after the page header", () => {
    render(<DraftsPage />);

    const nav = screen.getByRole("navigation", { name: "Reports sections" });
    expect(nav).toBeInTheDocument();

    const links = within(nav).getAllByRole("link");
    const labels = links.map((link) => link.textContent);
    expect(labels).toContain("Overview");
    expect(labels).toContain("Builder");
    expect(labels).toContain("Drafts");
    expect(labels).toContain("Ask Ledger");
  });
});

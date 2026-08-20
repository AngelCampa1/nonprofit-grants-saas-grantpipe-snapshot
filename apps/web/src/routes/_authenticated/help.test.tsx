import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

const { mockUseSession, mockUseGuideProgress, mockMutate, mockIsPending, mockVariables } =
  vi.hoisted(() => ({
    mockUseSession: vi.fn(),
    mockUseGuideProgress: vi.fn(),
    mockMutate: vi.fn(),
    mockIsPending: vi.fn(),
    mockVariables: vi.fn<() => { guideKey: string } | undefined>(),
  }));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Select: ({
      children,
      value = "",
      onValueChange = () => {},
      disabled = false,
    }: {
      children?: React.ReactNode;
      value?: string;
      onValueChange?: (v: string) => void;
      disabled?: boolean;
    }) => (
      <SelectCtx.Provider value={{ value, onValueChange, disabled }}>{children}</SelectCtx.Provider>
    ),
    SelectTrigger: ({
      id,
      "aria-label": ariaLabel,
    }: {
      id?: string;
      "aria-label"?: string;
      children?: React.ReactNode;
      className?: string;
    }) => {
      const { value, onValueChange, disabled } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          id={id}
          aria-label={ariaLabel}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            if (!disabled) onValueChange(e.target.value);
          }}
        />
      );
    },
    SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
      <div role="option" data-value={value}>
        {children}
      </div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  Link: ({
    children,
    hash,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { hash?: string; to?: string }) => (
    <a href={`/app${to}${hash ? `#${hash}` : ""}`} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../hooks/use-guide-progress", () => ({
  useGuideProgress: () => mockUseGuideProgress(),
  useGuideProgressMutation: () => ({
    mutate: mockMutate,
    isPending: mockIsPending(),
    variables: mockVariables(),
  }),
}));

vi.mock("../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../../components/video-dialog", () => ({
  VideoDialog: ({
    slug,
    triggerLabel,
    className,
  }: {
    slug: string;
    triggerLabel?: string;
    className?: string;
  }) => (
    <button data-testid={`video-dialog-${slug}`} className={className}>
      {triggerLabel ?? `Watch: ${slug}`}
    </button>
  ),
}));

import { captureEvent } from "../../lib/analytics";
import { HelpPage } from "./help";

describe("HelpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockReset();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseGuideProgress.mockReturnValue({ data: [] });
    mockIsPending.mockReturnValue(false);
    mockVariables.mockReturnValue(undefined);
  });

  it("fires help_opened with source nav on mount", () => {
    render(<HelpPage />);
    expect(captureEvent).toHaveBeenCalledWith("help_opened", { source: "nav" });
    expect(vi.mocked(captureEvent).mock.calls.filter((c) => c[0] === "help_opened")).toHaveLength(
      1,
    );
  });

  it("renders the in-app product tour VideoDialog", () => {
    render(<HelpPage />);
    const btn = screen.getByTestId("video-dialog-one-workspace-overview");
    expect(btn).toHaveTextContent("Watch product tour");
  });

  it("renders the Learn section with getting-started and add-grant-allocate videos", () => {
    render(<HelpPage />);
    expect(screen.getByRole("heading", { name: "Watch a quick how-to" })).toBeInTheDocument();
    expect(screen.getByTestId("video-dialog-getting-started")).toBeInTheDocument();
    expect(screen.getByTestId("video-dialog-add-grant-allocate")).toBeInTheDocument();
  });

  it("renders the Help Center and PDF guide", () => {
    const { container } = render(<HelpPage />);

    expect(screen.getByRole("heading", { name: "Help" })).toBeInTheDocument();
    expect(screen.getByText("Open a downloaded report")).toBeInTheDocument();
    expect(screen.getByText(/Downloads folder/)).toBeInTheDocument();
    expect(container.querySelector("#product_tour")).toHaveClass("min-w-0");
    expect(container.querySelector("#product_tour")).toHaveClass("p-4");
  });

  it("filters guides by search", () => {
    render(<HelpPage />);

    fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "spreadsheet" } });

    expect(screen.getByText("Import contacts from a spreadsheet")).toBeInTheDocument();
    expect(screen.queryByText("Invite a teammate")).not.toBeInTheDocument();
    expect(captureEvent).toHaveBeenCalledWith("help_searched", {
      trigger: "query",
      query_length_bucket: "1-20",
      category: "All",
      result_count_bucket: "1-10",
      has_results: true,
    });
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain("spreadsheet");
  });

  it("searches plain-language aliases like lost download", () => {
    render(<HelpPage />);

    fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "lost download" } });

    expect(screen.getByText("Open a downloaded report")).toBeInTheDocument();
    expect(screen.queryByText("Set up your workspace")).not.toBeInTheDocument();
  });

  it("shows task-first help navigation for low-tech users", () => {
    render(<HelpPage />);

    expect(screen.getByTestId("video-dialog-one-workspace-overview")).toHaveTextContent(
      "Watch product tour",
    );
    expect(screen.getByRole("heading", { name: "What are you trying to do?" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open import" })[0]).toHaveAttribute(
      "href",
      "/app/import",
    );
    expect(screen.getAllByRole("link", { name: "Open reports" })[0]).toHaveAttribute(
      "href",
      "/app/reports",
    );

    fireEvent.click(screen.getAllByRole("link", { name: "Open import" })[0]!);

    expect(captureEvent).toHaveBeenCalledWith("help_task_clicked", {
      task_target: "/import",
      has_hash: false,
    });
  });

  it("offers a touch-friendly support link when feedback is hard to reach on mobile", () => {
    render(<HelpPage />);

    const supportLink = screen.getByRole("link", { name: "Email support" });
    expect(supportLink).toHaveAttribute("href", "mailto:angel.campa@grantpipe.com");
    expect(supportLink.className).toMatch(/min-h-11/);
  });

  it("renders a Book a 15-min call link pointing to the quick-call booking URL", () => {
    render(<HelpPage />);

    const bookLink = screen.getByRole("link", { name: "Book a 15-min call" });
    expect(bookLink).toHaveAttribute("href", "https://cal.com/angel-campa-grantpipe/15min");
    expect(bookLink).toHaveAttribute("target", "_blank");
    expect(bookLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("filters guides by category", () => {
    render(<HelpPage />);

    fireEvent.change(screen.getByLabelText("Help category"), { target: { value: "Reports" } });

    expect(screen.getByText("Generate a report")).toBeInTheDocument();
    expect(screen.getByText("Open a downloaded report")).toBeInTheDocument();
    expect(screen.queryByText("Set up your workspace")).not.toBeInTheDocument();
    expect(captureEvent).toHaveBeenCalledWith("help_searched", {
      trigger: "category",
      query_length_bucket: "0",
      category: "Reports",
      result_count_bucket: "1-10",
      has_results: true,
    });
  });

  it("tracks guide completion only after progress saves", () => {
    render(<HelpPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0]!);

    expect(captureEvent).not.toHaveBeenCalledWith(
      "help_guide_completed",
      expect.objectContaining({ article_key: "product_tour" }),
    );
    expect(mockMutate).toHaveBeenCalledWith(
      {
        guideKey: "product_tour",
        data: { status: "completed", lastStep: "help-center" },
      },
      expect.objectContaining({ onError: expect.any(Function), onSuccess: expect.any(Function) }),
    );
    const mutationOptions = mockMutate.mock.calls[0]?.[1] as { onSuccess?: () => void } | undefined;
    mutationOptions?.onSuccess?.();

    expect(captureEvent).toHaveBeenCalledWith("help_guide_completed", {
      article_key: "product_tour",
      article_category: "Start here",
      previous_status: "not_started",
    });
  });

  it("surfaces an error alert when marking a guide complete fails", () => {
    mockMutate.mockImplementation((_vars, opts) => opts?.onError?.(new Error("Save failed")));

    render(<HelpPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0]!);

    expect(screen.getByText("Unable to complete the action")).toBeInTheDocument();
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });

  it("falls back to a generic message when the failure is not an Error", () => {
    mockMutate.mockImplementation((_vars, opts) => opts?.onError?.("nope"));

    render(<HelpPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0]!);

    expect(screen.getByText("Unable to complete this action.")).toBeInTheDocument();
  });

  it("clears a prior guide error when a later action starts", () => {
    mockMutate.mockImplementationOnce((_vars, opts) => opts?.onError?.(new Error("Save failed")));

    render(<HelpPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0]!);
    expect(screen.getByText("Save failed")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0]!);
    expect(screen.queryByText("Save failed")).not.toBeInTheDocument();
  });

  it("tracks article CTA clicks with stable article metadata", () => {
    render(<HelpPage />);

    fireEvent.click(screen.getByRole("link", { name: "Open settings" }));

    expect(captureEvent).toHaveBeenCalledWith("help_article_cta_clicked", {
      article_key: "first_setup",
      article_category: "Start here",
      cta_type: "internal",
      cta_target: "/settings",
      has_hash: false,
    });
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain(
      "Set up your workspace",
    );
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain("Open settings");
  });

  it("tracks the product tour article CTA as an internal route click", () => {
    render(<HelpPage />);

    fireEvent.click(screen.getByRole("link", { name: "Open Grants to start" }));

    expect(captureEvent).toHaveBeenCalledWith("help_article_cta_clicked", {
      article_key: "product_tour",
      article_category: "Start here",
      cta_type: "internal",
      cta_target: "/grants",
      has_hash: false,
    });
  });

  it("shows completed progress and disables actions while saving", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [{ guideKey: "first_setup", status: "completed" }],
    });
    mockIsPending.mockReturnValue(true);
    // product_tour is the first visible article; simulate an in-flight save on it
    mockVariables.mockReturnValue({ guideKey: "product_tour" });

    render(<HelpPage />);

    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mark done" })[0]).toBeDisabled();
  });

  it("scopes the per-article Mark done button to the in-flight article only", () => {
    // Two articles are visible in default "All" + no search filter.
    // Pending on "product_tour"; the sibling article's button must stay enabled.
    mockIsPending.mockReturnValue(true);
    mockVariables.mockReturnValue({ guideKey: "product_tour" });

    render(<HelpPage />);

    const markDoneButtons = screen.getAllByRole("button", { name: "Mark done" });
    // At least 2 articles render in the default view
    expect(markDoneButtons.length).toBeGreaterThanOrEqual(2);

    // product_tour is the first article — it should be disabled (in-flight)
    expect(markDoneButtons[0]).toBeDisabled();
    // The next article's button must remain enabled (sibling, not in-flight)
    expect(markDoneButtons[1]).not.toBeDisabled();
  });

  it("renders guides while progress is still loading", () => {
    mockUseGuideProgress.mockReturnValue({ data: undefined });

    render(<HelpPage />);

    expect(screen.getByText("Set up your workspace")).toBeInTheDocument();
    expect(screen.getAllByText("Guide")[0]).toBeInTheDocument();
  });

  it("shows a plain empty state when search has no matches", () => {
    render(<HelpPage />);

    fireEvent.change(screen.getByLabelText("Search help"), {
      target: { value: "printer cable" },
    });

    expect(screen.getByText("No guide matches that search.")).toBeInTheDocument();
    expect(screen.getByText(/Try a simpler word/)).toBeInTheDocument();
  });

  it("hides admin-only guides for viewers", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<HelpPage />);

    expect(screen.getByTestId("video-dialog-one-workspace-overview")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open team settings" })).not.toBeInTheDocument();
    expect(screen.queryByText("Invite a teammate")).not.toBeInTheDocument();
  });

  it("does not let viewers mark hidden admin guides complete through search", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    render(<HelpPage />);

    fireEvent.change(screen.getByLabelText("Search help"), {
      target: { value: "invite teammate" },
    });

    expect(screen.queryByText("Invite a teammate")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("hides donor and import guides from auditors", () => {
    mockUseSession.mockReturnValue({ memberRole: "auditor" });
    render(<HelpPage />);

    expect(screen.queryByText("Import contacts from a spreadsheet")).not.toBeInTheDocument();
    expect(screen.queryByText("Record a donation")).not.toBeInTheDocument();
  });

  it("uses app-basepath-aware links for guide CTAs", () => {
    render(<HelpPage />);

    expect(screen.getByRole("link", { name: "Open settings" })).toHaveAttribute(
      "href",
      "/app/settings",
    );
    expect(screen.getAllByRole("link", { name: "Open team settings" })[0]).toHaveAttribute(
      "href",
      "/app/settings#team",
    );
  });

  it("allows long guide CTAs to wrap on narrow screens", () => {
    render(<HelpPage />);

    expect(screen.getByRole("link", { name: "Open Statement of Functional Expenses" })).toHaveClass(
      "min-w-0",
      "max-w-full",
      "whitespace-normal",
    );
  });
});

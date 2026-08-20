import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseReviewers,
  mockUseReviewerMutations,
  mockUseQuickShare,
  mockUseSession,
  mockCaptureAppException,
} = vi.hoisted(() => ({
  mockUseReviewers: vi.fn(),
  mockUseReviewerMutations: vi.fn(),
  mockUseQuickShare: vi.fn(),
  mockUseSession: vi.fn(),
  mockCaptureAppException: vi.fn(),
}));

vi.mock("../../hooks/use-external-reviewers", () => ({
  useReviewers: mockUseReviewers,
  useReviewerMutations: mockUseReviewerMutations,
  useQuickShare: mockUseQuickShare,
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: mockUseSession,
}));

vi.mock("../../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

import { QuickShareSheet } from "./QuickShareSheet";

describe("QuickShareSheet source contracts", () => {
  it("derives session duration options from shared constants", () => {
    const source = readFileSync(join(__dirname, "QuickShareSheet.tsx"), "utf8");

    expect(source).toContain("PORTAL_SESSION_TTL_OPTIONS");
    expect(source).not.toContain("const TTL_OPTIONS");
    expect(source).not.toContain('{ label: "7 days", value: 7 * 24 * 60 * 60 * 1000 }');
  });
});

describe("QuickShareSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReviewers.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockUseReviewerMutations.mockReturnValue({
      createReviewer: { mutateAsync: vi.fn(), isPending: false },
    });
    mockUseQuickShare.mockReturnValue({
      quickShare: { mutateAsync: vi.fn(), isPending: false },
    });
    mockUseSession.mockReturnValue({ memberRole: "admin" });
  });

  it("does not fetch reviewers while the share sheet is closed", () => {
    render(
      <QuickShareSheet
        open={false}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );

    expect(mockUseReviewers).toHaveBeenCalledWith(undefined, { enabled: false });
  });

  it("fetches reviewers when the share sheet is open", () => {
    render(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );

    expect(mockUseReviewers).toHaveBeenCalledWith(undefined, { enabled: true });
  });

  it("normalizes reviewer list data from arrays and data envelopes", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { rerender } = render(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );
    expect(screen.getByText(/No reviewers yet/)).toBeInTheDocument();

    mockUseReviewers.mockReturnValue({
      data: [{ id: "array-reviewer", email: "array@example.org", name: "Array Reviewer" }],
      isLoading: false,
    });
    rerender(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: /Array Reviewer/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Array Reviewer/ }));

    mockUseReviewers.mockReturnValue({
      data: {
        data: [{ id: "data-reviewer", email: "data@example.org", name: "Data Reviewer" }],
      },
      isLoading: false,
    });
    rerender(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: /Data Reviewer/ })).toBeInTheDocument();
  });

  it("falls back to an empty reviewer list for unknown envelope shapes", () => {
    mockUseReviewers.mockReturnValue({
      data: { data: undefined },
      isLoading: false,
    });

    render(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );

    expect(screen.getByText(/No reviewers yet/)).toBeInTheDocument();
  });

  it("does not render or fetch reviewers for non-admin roles", () => {
    mockUseSession.mockReturnValue({ memberRole: "editor" });

    render(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );

    expect(mockUseReviewers).toHaveBeenCalledWith(undefined, { enabled: false });
    expect(screen.queryByText("Select reviewer")).not.toBeInTheDocument();
  });

  it("renders loading and empty reviewer states", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseReviewers.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = render(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );

    expect(screen.getByText(/Loading reviewers/)).toBeInTheDocument();

    mockUseReviewers.mockReturnValue({ data: undefined, isLoading: false });
    rerender(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add one" }));
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("selects an existing reviewer, changes duration, handles submit errors, and backs out", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const quickShare = vi.fn().mockRejectedValue("failed");
    mockUseReviewers.mockReturnValue({
      data: {
        items: [{ id: "reviewer-1", email: "auditor@example.org", name: "Audit Reviewer" }],
      },
      isLoading: false,
    });
    mockUseQuickShare.mockReturnValue({
      quickShare: { mutateAsync: quickShare, isPending: false },
    });

    render(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: /Audit Reviewer/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Purpose")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "7 days" }));
    await user.type(screen.getByLabelText("Purpose"), "Short access");
    await user.click(screen.getByRole("button", { name: "Create access link" }));

    await waitFor(() =>
      expect(quickShare).toHaveBeenCalledWith({
        reviewerId: "reviewer-1",
        purpose: "Short access",
        ttlMs: 7 * 24 * 60 * 60 * 1000,
        scopeType: "grant",
        scopeId: "grant-1",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Select reviewer")).toBeInTheDocument();
  });

  it("returns from the new reviewer form without creating a reviewer", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );

    await user.click(screen.getByRole("button", { name: "New reviewer" }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: "New reviewer" })).toBeInTheDocument();
  });

  it("creates a reviewer, creates access, copies the link, and resets on close", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const createReviewer = vi.fn().mockResolvedValue({ id: "reviewer-1" });
    const quickShare = vi.fn().mockResolvedValue({ portalUrl: "https://portal.example/token" });
    const onOpenChange = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    mockUseReviewerMutations.mockReturnValue({
      createReviewer: { mutateAsync: createReviewer, isPending: false },
    });
    mockUseQuickShare.mockReturnValue({
      quickShare: { mutateAsync: quickShare, isPending: false },
    });

    render(
      <QuickShareSheet
        open={true}
        onOpenChange={onOpenChange}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );

    await user.click(screen.getByRole("button", { name: "New reviewer" }));
    await user.click(screen.getByRole("button", { name: "Create & continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Email and name are required.");

    await user.type(screen.getByLabelText("Email"), "auditor@example.org");
    await user.type(screen.getByLabelText("Name"), "Audit Reviewer");
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Funder" }));
    await user.click(screen.getByRole("button", { name: "Create & continue" }));

    await waitFor(() =>
      expect(createReviewer).toHaveBeenCalledWith({
        email: "auditor@example.org",
        name: "Audit Reviewer",
        reviewerType: "funder",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Create access link" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Purpose is required.");

    await user.type(screen.getByLabelText("Purpose"), "Year-end grant review");
    await user.click(screen.getByRole("button", { name: "Create access link" }));

    await waitFor(() =>
      expect(quickShare).toHaveBeenCalledWith({
        reviewerId: "reviewer-1",
        purpose: "Year-end grant review",
        ttlMs: 30 * 24 * 60 * 60 * 1000,
        scopeType: "grant",
        scopeId: "grant-1",
      }),
    );

    expect(screen.getByLabelText("Portal access link")).toHaveValue("https://portal.example/token");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("https://portal.example/token");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows mutation and clipboard errors", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseReviewerMutations.mockReturnValue({
      createReviewer: {
        mutateAsync: vi.fn().mockRejectedValue(new Error("Reviewer failed")),
        isPending: false,
      },
    });

    render(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="fund"
        scopeId="fund-1"
        entityName="Restricted Fund"
      />,
    );

    await user.click(screen.getByRole("button", { name: "New reviewer" }));
    await user.type(screen.getByLabelText("Email"), "auditor@example.org");
    await user.type(screen.getByLabelText("Name"), "Audit Reviewer");
    await user.click(screen.getByRole("button", { name: "Create & continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reviewer failed");
  });

  it("shows a clipboard error when copy access is unavailable", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseReviewerMutations.mockReturnValue({
      createReviewer: {
        mutateAsync: vi.fn().mockResolvedValue({ id: "reviewer-1" }),
        isPending: false,
      },
    });
    mockUseQuickShare.mockReturnValue({
      quickShare: {
        mutateAsync: vi.fn().mockResolvedValue({ portalUrl: "https://portal.example/token" }),
        isPending: false,
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="fund"
        scopeId="fund-1"
        entityName="Restricted Fund"
      />,
    );

    await user.click(screen.getByRole("button", { name: "New reviewer" }));
    await user.type(screen.getByLabelText("Email"), "auditor@example.org");
    await user.type(screen.getByLabelText("Name"), "Audit Reviewer");
    await user.click(screen.getByRole("button", { name: "Create & continue" }));
    await screen.findByLabelText("Purpose");
    await user.type(screen.getByLabelText("Purpose"), "Funder review");
    await user.click(screen.getByRole("button", { name: "Create access link" }));
    expect(await screen.findByLabelText("Portal access link")).toHaveValue(
      "https://portal.example/token",
    );
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(
      screen.getByText("Clipboard access is unavailable in this browser."),
    ).toBeInTheDocument();
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      {
        tags: { feature: "portal", operation: "copy_quick_share_link" },
      },
      { sanitize: true },
    );
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain(
      "https://portal.example/token",
    );
  });

  it("renders pending and missing-url confirmation states", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const quickShare = vi.fn().mockResolvedValue({});
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    mockUseReviewers.mockReturnValue({
      data: {
        data: [{ id: "reviewer-1", email: "auditor@example.org", name: "Audit Reviewer" }],
      },
      isLoading: false,
    });
    mockUseQuickShare.mockReturnValue({
      quickShare: { mutateAsync: quickShare, isPending: true },
    });

    const { rerender } = render(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Audit Reviewer/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Purpose"), "Closeout review");
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "90 days" }));
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();

    mockUseQuickShare.mockReturnValue({
      quickShare: { mutateAsync: quickShare, isPending: false },
    });
    rerender(
      <QuickShareSheet
        open={true}
        onOpenChange={vi.fn()}
        scopeType="grant"
        scopeId="grant-1"
        entityName="Federal Grant"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Create access link" }));

    expect(await screen.findByLabelText("Portal access link")).toHaveValue("");
    expect(screen.getByText(/It expires in 90 days/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).not.toHaveBeenCalled();
  });
});

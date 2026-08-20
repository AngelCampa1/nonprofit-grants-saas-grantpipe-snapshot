import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseGuideProgress, mockMutate, mockIsPending, mockVariables, mockUseDashboardOverview } =
  vi.hoisted(() => ({
    mockUseGuideProgress: vi.fn(),
    mockMutate: vi.fn(),
    mockIsPending: vi.fn(),
    mockVariables: vi.fn(),
    mockUseDashboardOverview: vi.fn(),
  }));

vi.mock("@tanstack/react-router", () => ({
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

vi.mock("../hooks/use-guide-progress", () => ({
  useGuideProgress: () => mockUseGuideProgress(),
  useGuideProgressMutation: () => ({
    mutate: mockMutate,
    isPending: mockIsPending(),
    variables: mockVariables(),
  }),
}));

vi.mock("../hooks/use-overview", () => ({
  useDashboardOverview: () => mockUseDashboardOverview(),
}));

import { OnboardingChecklist, deriveChecklistSignals } from "./onboarding-checklist";

describe("OnboardingChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGuideProgress.mockReturnValue({ data: [] });
    mockIsPending.mockReturnValue(false);
    mockVariables.mockReturnValue(undefined);
    mockUseDashboardOverview.mockReturnValue({ data: undefined });
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("shows editor setup steps", () => {
    render(<OnboardingChecklist role="editor" />);

    expect(screen.getByText("Move your first records")).toBeInTheDocument();
    expect(screen.getByText("Add one grant")).toBeInTheDocument();
    expect(screen.getByText("Open a downloaded report")).toBeInTheDocument();
  });

  it("shows read-only report guidance for viewers", () => {
    render(<OnboardingChecklist role="viewer" />);

    expect(screen.getByText("Find reports")).toBeInTheDocument();
    expect(screen.getByText("Open a downloaded report")).toBeInTheDocument();
    expect(screen.queryByText("Move your first records")).not.toBeInTheDocument();
  });

  it("hides completed and dismissed steps — collapses to null when all visible items done", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [
        { guideKey: "generate_report", status: "completed" },
        { guideKey: "open_pdf_report", status: "dismissed" },
      ],
    });

    // handoff not dismissed: shows handoff card, not null
    render(<OnboardingChecklist role="viewer" />);

    expect(screen.getByTestId("onboarding-checklist-handoff")).toBeInTheDocument();
  });

  it("hides the checklist when the role is not known", () => {
    const { container } = render(<OnboardingChecklist role={null} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders checklist items while progress is still loading", () => {
    mockUseGuideProgress.mockReturnValue({ data: undefined });

    render(<OnboardingChecklist role="viewer" />);

    expect(screen.getByText("Find reports")).toBeInTheDocument();
  });

  it("disables the in-flight step's buttons while progress is saving", () => {
    mockIsPending.mockReturnValue(true);
    mockVariables.mockReturnValue({ guideKey: "generate_report" });

    render(<OnboardingChecklist role="viewer" />);

    // The step being saved (generate_report = first viewer step) has both buttons disabled.
    const markDoneButtons = screen.getAllByRole("button", { name: "Mark done" });
    expect(markDoneButtons[0]).toBeDisabled();
    const dismissButtons = screen.getAllByRole("button", { name: "Dismiss" });
    expect(dismissButtons[0]).toBeDisabled();
  });

  it("only disables the step whose progress request is in flight", () => {
    mockIsPending.mockReturnValue(true);
    mockVariables.mockReturnValue({ guideKey: "generate_report" });

    render(<OnboardingChecklist role="viewer" />);

    // Two viewer steps render: generate_report (in flight) and open_pdf_report (free).
    const markDoneButtons = screen.getAllByRole("button", { name: "Mark done" });
    const dismissButtons = screen.getAllByRole("button", { name: "Dismiss" });
    expect(markDoneButtons[0]).toBeDisabled();
    expect(dismissButtons[0]).toBeDisabled();
    expect(markDoneButtons[1]).not.toBeDisabled();
    expect(dismissButtons[1]).not.toBeDisabled();
  });

  // ── Button hierarchy ─────────────────────────────────────────────────────

  it("Start is the primary (filled) button and Mark done is the secondary (outline) button", () => {
    render(<OnboardingChecklist role="viewer" />);

    const startLinks = screen.getAllByRole("link", { name: "Start" });
    expect(startLinks[0]).toHaveAttribute("data-variant", "default");

    const markDoneButtons = screen.getAllByRole("button", { name: "Mark done" });
    expect(markDoneButtons[0]).toHaveAttribute("data-variant", "outline");
  });

  // ── Mark done / Dismiss ──────────────────────────────────────────────────

  it("Mark done button calls mutation with status: completed", () => {
    render(<OnboardingChecklist role="viewer" />);

    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0]!);

    expect(mockMutate).toHaveBeenCalledWith(
      {
        guideKey: "generate_report",
        data: { status: "completed", lastStep: "checklist" },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("Dismiss button calls mutation with status: dismissed", () => {
    render(<OnboardingChecklist role="viewer" />);

    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0]!);

    expect(mockMutate).toHaveBeenCalledWith(
      {
        guideKey: "generate_report",
        data: { status: "dismissed", lastStep: "checklist" },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  // ── Progress indicator ───────────────────────────────────────────────────

  it("shows 0 of 5 steps complete in the progress indicator when no items are done", () => {
    render(<OnboardingChecklist role="admin" />);

    expect(screen.getByText("0 of 5 steps complete")).toBeInTheDocument();
  });

  it("shows updated count in the progress indicator after 1 item is completed", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [{ guideKey: "first_setup", status: "completed" }],
    });

    render(<OnboardingChecklist role="admin" />);

    expect(screen.getByText("1 of 5 steps complete")).toBeInTheDocument();
  });

  it("counts dismissed items toward progress", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [
        { guideKey: "first_setup", status: "completed" },
        { guideKey: "import_contacts", status: "dismissed" },
      ],
    });

    render(<OnboardingChecklist role="admin" />);

    expect(screen.getByText("2 of 5 steps complete")).toBeInTheDocument();
  });

  // ── Dismiss all ──────────────────────────────────────────────────────────

  it("Dismiss all fires mutation for every open item", () => {
    render(<OnboardingChecklist role="viewer" />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss all" }));

    // viewer sees: generate_report, open_pdf_report (2 items)
    expect(mockMutate).toHaveBeenCalledTimes(2);
    expect(mockMutate).toHaveBeenCalledWith(
      {
        guideKey: "generate_report",
        data: { status: "dismissed", lastStep: "checklist" },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(mockMutate).toHaveBeenCalledWith(
      {
        guideKey: "open_pdf_report",
        data: { status: "dismissed", lastStep: "checklist" },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("Dismiss all button is disabled while mutation is pending", () => {
    mockIsPending.mockReturnValue(true);

    render(<OnboardingChecklist role="viewer" />);

    expect(screen.getByRole("button", { name: "Dismiss all" })).toBeDisabled();
  });

  // ── Collapse to banner ───────────────────────────────────────────────────

  it("shows full card when all items are open (no items completed/dismissed)", () => {
    render(<OnboardingChecklist role="admin" />);

    expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-checklist-banner")).not.toBeInTheDocument();
  });

  it("uses a quiet setup panel with ordered step rows", () => {
    const { container } = render(<OnboardingChecklist role="admin" />);

    expect(screen.getByTestId("onboarding-checklist")).toHaveClass(
      "rounded-2xl",
      "border",
      "bg-card",
      "shadow-sm",
    );
    expect(container.querySelectorAll("[data-slot='checklist-step']")).toHaveLength(5);
    expect(container.querySelector("[data-slot='checklist-step-index']")).toHaveTextContent("01");
  });

  it("collapses to banner when at least 1 item is completed or dismissed", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [{ guideKey: "first_setup", status: "completed" }],
    });

    render(<OnboardingChecklist role="admin" />);

    expect(screen.getByTestId("onboarding-checklist-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-checklist")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 5 steps complete")).toBeInTheDocument();
  });

  it("banner expands to full card when View checklist button is clicked", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [{ guideKey: "first_setup", status: "completed" }],
    });

    render(<OnboardingChecklist role="admin" />);

    // starts collapsed
    expect(screen.getByTestId("onboarding-checklist-banner")).toBeInTheDocument();

    // click expand
    fireEvent.click(screen.getByRole("button", { name: "View checklist" }));

    // now full card visible
    expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-checklist-banner")).not.toBeInTheDocument();
  });

  it("disappears entirely when all visible items are done or dismissed and handoff is already dismissed", () => {
    localStorage.setItem("gp:onboarding-handoff-dismissed", "true");

    mockUseGuideProgress.mockReturnValue({
      data: [
        { guideKey: "generate_report", status: "completed" },
        { guideKey: "open_pdf_report", status: "dismissed" },
      ],
    });

    // both viewer items done + handoff already dismissed → component disappears entirely
    const { container } = render(<OnboardingChecklist role="viewer" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders banner with correct completed count for viewer with 1 of 2 done", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [{ guideKey: "generate_report", status: "dismissed" }],
    });

    render(<OnboardingChecklist role="viewer" />);

    expect(screen.getByTestId("onboarding-checklist-banner")).toBeInTheDocument();
    // viewer has 2 total visible items; 1 dismissed
    expect(screen.getByText("1 of 2 steps complete")).toBeInTheDocument();
  });

  it("banner container uses rounded-2xl shape", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [{ guideKey: "first_setup", status: "completed" }],
    });

    render(<OnboardingChecklist role="admin" />);

    const banner = screen.getByTestId("onboarding-checklist-banner");
    expect(banner.className).toContain("rounded-2xl");
    expect(banner.className).not.toContain("rounded-xl");
  });

  // ── Error surfaces ───────────────────────────────────────────────────────

  it("surfaces an error alert when Mark done fails", () => {
    mockMutate.mockImplementationOnce((_vars, opts) =>
      opts?.onError?.(new Error("Progress save failed")),
    );

    render(<OnboardingChecklist role="viewer" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0]!);

    expect(screen.getByText("Unable to complete the action")).toBeInTheDocument();
    expect(screen.getByText("Progress save failed")).toBeInTheDocument();
  });

  it("surfaces an error alert when Dismiss fails", () => {
    mockMutate.mockImplementationOnce((_vars, opts) =>
      opts?.onError?.(new Error("Dismiss failed")),
    );

    render(<OnboardingChecklist role="viewer" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0]!);

    expect(screen.getByText("Dismiss failed")).toBeInTheDocument();
  });

  it("surfaces an error alert when Dismiss all fails", () => {
    mockMutate.mockImplementationOnce((_vars, opts) =>
      opts?.onError?.(new Error("Bulk dismiss failed")),
    );

    render(<OnboardingChecklist role="viewer" />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss all" }));

    expect(screen.getByText("Bulk dismiss failed")).toBeInTheDocument();
  });

  it("falls back to a generic message when a progress mutation rejects without an Error", () => {
    mockMutate.mockImplementationOnce((_vars, opts) => opts?.onError?.("nope"));

    render(<OnboardingChecklist role="viewer" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0]!);

    expect(screen.getByText("Unable to update your checklist progress.")).toBeInTheDocument();
  });

  it("renders a Book a setup call link pointing to the onboarding call URL", () => {
    render(<OnboardingChecklist role="admin" />);
    const link = screen.getByRole("link", { name: "Book a setup call" });
    expect(link).toHaveAttribute("href", "https://cal.com/angel-campa-grantpipe/onboarding");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("dismiss-all and view-checklist buttons use pill shape and standard focus ring", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [{ guideKey: "first_setup", status: "completed" }],
    });

    render(<OnboardingChecklist role="admin" />);
    const viewBtn = screen.getByRole("button", { name: "View checklist" });
    expect(viewBtn.className).toContain("rounded-full");
    expect(viewBtn.className).toContain("focus-visible:ring-[3px]");
  });

  // ── Derived completion from real data ────────────────────────────────────

  it("counts 'Add one grant' done when the org already has grants", () => {
    mockUseDashboardOverview.mockReturnValue({
      data: { donorMetrics: { newDonorCount: 0 }, pipelineSummary: { grants: [{ count: 2 }] } },
    });

    render(<OnboardingChecklist role="editor" />);

    // editor has 3 visible items; create_grant is data-complete → banner, 1 of 3
    expect(screen.getByTestId("onboarding-checklist-banner")).toBeInTheDocument();
    expect(screen.getByText("1 of 4 steps complete")).toBeInTheDocument();
  });

  it("counts 'Move your first records' done when the org already has contacts", () => {
    mockUseDashboardOverview.mockReturnValue({
      data: { donorMetrics: { newDonorCount: 5 }, pipelineSummary: { grants: [] } },
    });

    render(<OnboardingChecklist role="editor" />);

    expect(screen.getByTestId("onboarding-checklist-banner")).toBeInTheDocument();
    expect(screen.getByText("1 of 4 steps complete")).toBeInTheDocument();
  });

  it("hides the data-backed steps from the open list once their data exists", () => {
    mockUseDashboardOverview.mockReturnValue({
      data: { donorMetrics: { newDonorCount: 1 }, pipelineSummary: { grants: [{ count: 1 }] } },
    });

    render(<OnboardingChecklist role="editor" />);

    fireEvent.click(screen.getByRole("button", { name: "View checklist" }));

    expect(screen.queryByText("Move your first records")).not.toBeInTheDocument();
    expect(screen.queryByText("Add one grant")).not.toBeInTheDocument();
    expect(screen.getByText("Open a downloaded report")).toBeInTheDocument();
  });

  it("does not derive completion for the manual education steps", () => {
    mockUseDashboardOverview.mockReturnValue({
      data: { donorMetrics: { newDonorCount: 9 }, pipelineSummary: { grants: [{ count: 9 }] } },
    });

    // viewer's two items are both manual (generate_report, open_pdf_report) and
    // have no data signal, so the full checklist still shows with 0 complete.
    render(<OnboardingChecklist role="viewer" />);

    expect(screen.getByTestId("onboarding-checklist")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 steps complete")).toBeInTheDocument();
  });

  // ── Goal-aware ordering ──────────────────────────────────────────────────

  it("renders open items in donors-goal order (import_contacts before first_setup)", () => {
    // admin sees all 5 items; with goal=donors, import_contacts is first
    render(<OnboardingChecklist role="admin" goal="donors" />);

    const steps = screen.getAllByRole("article");
    const titles = steps.map((s) => s.querySelector("h3")?.textContent ?? "");
    expect(titles[0]).toBe("Move your first records"); // import_contacts
    expect(titles[1]).toBe("Confirm organization settings"); // first_setup
  });

  it("renders open items in grants-goal order (create_grant first)", () => {
    render(<OnboardingChecklist role="admin" goal="grants" />);

    const steps = screen.getAllByRole("article");
    const titles = steps.map((s) => s.querySelector("h3")?.textContent ?? "");
    expect(titles[0]).toBe("Add one grant"); // create_grant
  });

  it("step numbers follow goal-aware order", () => {
    render(<OnboardingChecklist role="admin" goal="donors" />);

    const indices = screen
      .getAllByRole("article")
      .map((s) => s.querySelector("[data-slot='checklist-step-index']")?.textContent ?? "");
    expect(indices[0]).toBe("01");
    expect(indices[1]).toBe("02");
    expect(indices[4]).toBe("05");
  });

  it("renders in default order when no goal is supplied", () => {
    render(<OnboardingChecklist role="admin" />);

    const steps = screen.getAllByRole("article");
    const titles = steps.map((s) => s.querySelector("h3")?.textContent ?? "");
    expect(titles[0]).toBe("Confirm organization settings"); // first_setup default
  });

  it("pins the 5 checklist step routes so nav churn cannot silently break them", () => {
    render(<OnboardingChecklist role="admin" />);

    const startLinks = screen.getAllByRole("link", { name: "Start" });
    const hrefs = startLinks.map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/settings", "/import", "/grants", "/reports", "/help"]);
  });

  it("renders compliance-goal order same as grants (create_grant first)", () => {
    render(<OnboardingChecklist role="admin" goal="compliance" />);

    const steps = screen.getAllByRole("article");
    const titles = steps.map((s) => s.querySelector("h3")?.textContent ?? "");
    expect(titles[0]).toBe("Add one grant"); // create_grant first for compliance
  });

  // ── Progress bar ─────────────────────────────────────────────────────────

  it("renders a progressbar with correct aria attributes for a partial state", () => {
    // 0 of 5 completed for admin → full card renders (not banner)
    render(<OnboardingChecklist role="admin" goal={null} />);

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toBeInTheDocument();
    expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    expect(progressbar).toHaveAttribute("aria-valuemax", "5");
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");
    expect(progressbar).toHaveAttribute("aria-label", "Setup progress");
  });

  it("progressbar aria-valuenow reflects completed count when card is expanded", () => {
    // Start with 0 completed to show full card, then check count text is correct
    // Viewer has 0 complete → full card
    render(<OnboardingChecklist role="viewer" />);

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");
    expect(progressbar).toHaveAttribute("aria-valuemax", "2");
  });

  // ── Handoff card ─────────────────────────────────────────────────────────

  it("shows the handoff card when all items are complete and handoff is not dismissed", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [
        { guideKey: "generate_report", status: "completed" },
        { guideKey: "open_pdf_report", status: "dismissed" },
      ],
    });

    render(<OnboardingChecklist role="viewer" />);

    expect(screen.getByTestId("onboarding-checklist-handoff")).toBeInTheDocument();
    expect(screen.getByText("You're all set.")).toBeInTheDocument();
    expect(
      screen.getByText("You finished every setup step. Your workspace is ready."),
    ).toBeInTheDocument();
  });

  it("clicking Got it hides the handoff card (returns null) and writes localStorage", () => {
    mockUseGuideProgress.mockReturnValue({
      data: [
        { guideKey: "generate_report", status: "completed" },
        { guideKey: "open_pdf_report", status: "dismissed" },
      ],
    });

    const { container } = render(<OnboardingChecklist role="viewer" />);

    expect(screen.getByTestId("onboarding-checklist-handoff")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    expect(container.firstChild).toBeNull();
    expect(localStorage.getItem("gp:onboarding-handoff-dismissed")).toBe("true");
  });

  it("does not show handoff when localStorage key is already set", () => {
    localStorage.setItem("gp:onboarding-handoff-dismissed", "true");

    mockUseGuideProgress.mockReturnValue({
      data: [
        { guideKey: "generate_report", status: "completed" },
        { guideKey: "open_pdf_report", status: "dismissed" },
      ],
    });

    const { container } = render(<OnboardingChecklist role="viewer" />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("onboarding-checklist-handoff")).not.toBeInTheDocument();
  });

  it("does not crash when localStorage.getItem throws on read", () => {
    const originalGetItem = localStorage.getItem.bind(localStorage);
    // Spy on the localStorage instance (not Storage.prototype): happy-dom resolves
    // localStorage.getItem to the instance method, so a prototype spy would not
    // intercept the call and the catch path would never execute.
    const spy = vi.spyOn(localStorage, "getItem").mockImplementation((key) => {
      if (key === "gp:onboarding-handoff-dismissed") {
        throw new Error("localStorage unavailable");
      }
      return originalGetItem(key);
    });

    mockUseGuideProgress.mockReturnValue({
      data: [
        { guideKey: "generate_report", status: "completed" },
        { guideKey: "open_pdf_report", status: "dismissed" },
      ],
    });

    // Should render handoff (default false on throw), not crash
    expect(() => render(<OnboardingChecklist role="viewer" />)).not.toThrow();
    expect(screen.getByTestId("onboarding-checklist-handoff")).toBeInTheDocument();

    spy.mockRestore();
  });

  it("does not crash when localStorage.setItem throws on write", () => {
    // Spy on the localStorage instance (see read-throw test above): a prototype
    // spy would not intercept happy-dom's instance method, leaving the catch
    // path unexecuted.
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation((key) => {
      if (key === "gp:onboarding-handoff-dismissed") {
        throw new Error("localStorage unavailable");
      }
    });

    mockUseGuideProgress.mockReturnValue({
      data: [
        { guideKey: "generate_report", status: "completed" },
        { guideKey: "open_pdf_report", status: "dismissed" },
      ],
    });

    render(<OnboardingChecklist role="viewer" />);

    // Click Got it — setItem throws but component should not crash
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Got it" }))).not.toThrow();

    spy.mockRestore();
  });

  describe("deriveChecklistSignals", () => {
    it("returns no signals when overview is undefined", () => {
      expect(deriveChecklistSignals(undefined)).toEqual({ hasContacts: false, hasGrants: false });
    });

    it("flags contacts from new donor count", () => {
      expect(
        deriveChecklistSignals({
          donorMetrics: { newDonorCount: 2 },
          atRiskGrants: [],
          upcomingDeadlines: [],
          pipelineSummary: { donors: [], grants: [] },
        } as never).hasContacts,
      ).toBe(true);
    });

    it("flags grants from pipeline grant counts", () => {
      expect(
        deriveChecklistSignals({
          donorMetrics: { newDonorCount: 0 },
          atRiskGrants: [],
          upcomingDeadlines: [],
          pipelineSummary: { donors: [], grants: [{ count: 1 }] },
        } as never).hasGrants,
      ).toBe(true);
    });

    it("flags contacts from the donor pipeline counts", () => {
      expect(
        deriveChecklistSignals({
          donorMetrics: { newDonorCount: 0 },
          atRiskGrants: [],
          upcomingDeadlines: [],
          pipelineSummary: { donors: [{ count: 4 }], grants: [] },
        } as never).hasContacts,
      ).toBe(true);
    });

    it("flags grants from at-risk grants", () => {
      expect(
        deriveChecklistSignals({
          donorMetrics: { newDonorCount: 0 },
          atRiskGrants: [{}],
          upcomingDeadlines: [],
          pipelineSummary: { donors: [], grants: [] },
        } as never).hasGrants,
      ).toBe(true);
    });

    it("flags grants from upcoming deadlines", () => {
      expect(
        deriveChecklistSignals({
          donorMetrics: { newDonorCount: 0 },
          atRiskGrants: [],
          upcomingDeadlines: [{}],
          pipelineSummary: { donors: [], grants: [] },
        } as never).hasGrants,
      ).toBe(true);
    });

    it("returns no signals for an empty overview", () => {
      expect(
        deriveChecklistSignals({
          donorMetrics: { newDonorCount: 0 },
          atRiskGrants: [],
          upcomingDeadlines: [],
          pipelineSummary: { donors: [], grants: [] },
        } as never),
      ).toEqual({ hasContacts: false, hasGrants: false });
    });

    it("tolerates an overview without pipeline arrays", () => {
      expect(
        deriveChecklistSignals({
          donorMetrics: { newDonorCount: 0 },
        } as never),
      ).toEqual({ hasContacts: false, hasGrants: false });
    });
  });
});

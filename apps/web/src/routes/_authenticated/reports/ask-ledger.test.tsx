import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_EVENTS,
  getDefaultPermissionsForRole,
  type PermissionMap,
} from "@grantpipe/shared";
import { AskLedgerPage } from "./ask-ledger";

const askMutateAsync = vi.fn();
const mockCaptureEvent = vi.fn();
const mockState = vi.hoisted(() => ({
  isPending: false,
  session: {
    memberRole: "admin" as unknown as string,
    memberPermissions: null as PermissionMap | null,
    effectivePlanTier: "growth" as unknown as string,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (config: unknown) => config,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/reports/ask-ledger" } }),
  Link: ({
    to,
    hash,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; hash?: string }) => (
    <a href={`${to}${hash ? `#${hash}` : ""}`} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../../hooks/use-ask-ledger", () => ({
  useAskLedger: () => ({
    mutateAsync: askMutateAsync,
    isPending: mockState.isPending,
  }),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => mockState.session,
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: (event: string, properties?: Record<string, unknown>) =>
    mockCaptureEvent(event, properties),
}));

describe("AskLedgerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.isPending = false;
    mockState.session = {
      memberRole: "admin",
      memberPermissions: null,
      effectivePlanTier: "growth",
    };
    askMutateAsync.mockResolvedValue({
      answer: "No active grant budget lines are over budget.",
      mode: "deterministic",
      confidence: "high",
      safeguards: [
        "Numbers are calculated from posted GrantPipe records only.",
        "No AI-generated numbers were used.",
      ],
      citations: [
        {
          type: "report_row",
          label: "Budget sentinel",
          href: "/grants/budget-sentinel",
          value: "0 at-risk budget lines",
        },
      ],
      suggestedFollowUps: [],
    });
  });

  it("renders the grounded question workspace and guardrails", () => {
    render(<AskLedgerPage />);

    expect(screen.getByRole("heading", { name: "Ask Ledger" })).toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toHaveValue("Which grants are over budget?");
    expect(screen.getByText("Grounding rules")).toBeInTheDocument();
    expect(screen.getByText("Every number needs a source link.")).toBeInTheDocument();
  });

  it("submits a question and renders answer citations", async () => {
    const user = userEvent.setup();
    render(<AskLedgerPage />);

    await user.click(screen.getByRole("button", { name: "Ask Ledger" }));

    expect(askMutateAsync).toHaveBeenCalledWith({
      question: "Which grants are over budget?",
      mode: "deterministic",
    });
    expect(
      await screen.findByText("No active grant budget lines are over budget."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Budget sentinel/ })).toHaveAttribute(
      "href",
      "/grants/budget-sentinel",
    );
    expect(screen.getByText("high confidence")).toBeInTheDocument();
  });

  it("renders citations without optional values", async () => {
    const user = userEvent.setup();
    askMutateAsync.mockResolvedValueOnce({
      answer: "Open the report builder for this question.",
      mode: "deterministic",
      confidence: "low",
      safeguards: ["No answer is shown without GrantPipe records behind it."],
      citations: [
        {
          type: "report_row",
          label: "Report builder",
          href: "/reports/builder",
        },
      ],
      suggestedFollowUps: [],
    });
    render(<AskLedgerPage />);

    await user.click(screen.getByRole("button", { name: "Ask Ledger" }));

    expect(
      await screen.findByText("Open the report builder for this question."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Report builder/ })).toHaveAttribute(
      "href",
      "/reports/builder",
    );
  });

  it("runs example questions and disables too-short manual questions", async () => {
    const user = userEvent.setup();
    render(<AskLedgerPage />);

    await user.click(screen.getByRole("button", { name: "Show restricted fund balances." }));
    expect(askMutateAsync).toHaveBeenLastCalledWith({
      question: "Show restricted fund balances.",
      mode: "deterministic",
    });

    await user.clear(screen.getByLabelText("Question"));
    await user.type(screen.getByLabelText("Question"), "why");
    expect(screen.getByRole("button", { name: "Ask Ledger" })).toBeDisabled();
  });

  it("runs suggested follow-up questions from an answer", async () => {
    const user = userEvent.setup();
    askMutateAsync.mockResolvedValueOnce({
      answer: "Fund A still has money left.",
      mode: "deterministic",
      confidence: "high",
      safeguards: ["Numbers are calculated from posted GrantPipe records only."],
      citations: [
        {
          type: "report_row",
          label: "Restricted fund balances",
          href: "/funds",
          value: "$12,000",
        },
      ],
      suggestedFollowUps: ["What changed since last month?"],
    });
    render(<AskLedgerPage />);

    await user.click(screen.getByRole("button", { name: "Ask Ledger" }));
    expect(await screen.findByText("Suggested questions")).toBeInTheDocument();
    const followUp = await screen.findByRole("button", {
      name: "What changed since last month?",
    });
    await user.click(followUp);

    expect(askMutateAsync).toHaveBeenLastCalledWith({
      question: "What changed since last month?",
      mode: "deterministic",
    });
  });

  it("shows pending state and disables manual submit while asking", () => {
    mockState.isPending = true;
    render(<AskLedgerPage />);

    expect(screen.getByText("Checking ledger records…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Ledger" })).toBeDisabled();
  });

  it("blocks direct route use without accounting access", () => {
    mockState.session = {
      memberRole: "editor",
      memberPermissions: { accounting: "none", reports: "view" } as never,
      effectivePlanTier: "growth",
    };
    render(<AskLedgerPage />);

    expect(screen.getByText("Access required")).toBeInTheDocument();
    expect(
      screen.getByText("Ask Ledger requires report and accounting access."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Question")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask Ledger" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Which grants are over budget?" }),
    ).not.toBeInTheDocument();
    expect(askMutateAsync).not.toHaveBeenCalled();
  });

  it("shows a Growth upgrade prompt for Starter plans before rendering the form", async () => {
    const user = userEvent.setup();
    mockState.session = {
      memberRole: "admin",
      memberPermissions: null,
      effectivePlanTier: "starter",
    };
    render(<AskLedgerPage />);

    expect(screen.getByRole("heading", { name: "Ask Ledger needs Growth" })).toBeInTheDocument();
    expect(screen.getByText("Ask Ledger is included on Growth plans and up.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Question")).not.toBeInTheDocument();
    expect(askMutateAsync).not.toHaveBeenCalled();
    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.upgradePromptShown, {
      surface: "ask_ledger_gate",
      plan_tier_used: "starter",
      required_plan_tier: "growth",
    });

    await user.click(screen.getByRole("link", { name: "See Growth" }));
    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.upgradeClicked, {
      surface: "ask_ledger_gate",
      target_plan_tier: "growth",
    });
  });

  it("shows loading and error states", async () => {
    const user = userEvent.setup();
    askMutateAsync.mockRejectedValueOnce(new Error("Server unavailable"));
    render(<AskLedgerPage />);

    await user.click(screen.getByRole("button", { name: "Ask Ledger" }));

    expect(await screen.findByText("Unable to ask the ledger.")).toBeInTheDocument();
    expect(screen.getByText("Server unavailable")).toBeInTheDocument();
  });

  it("shows a fallback message for non-Error failures", async () => {
    const user = userEvent.setup();
    askMutateAsync.mockRejectedValueOnce("offline");
    render(<AskLedgerPage />);

    await user.click(screen.getByRole("button", { name: "Ask Ledger" }));

    expect(await screen.findByText("Unable to ask the ledger.")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("renders the Reports tab navigation after the page header", () => {
    mockState.session = {
      memberRole: "admin",
      memberPermissions: getDefaultPermissionsForRole("admin"),
      effectivePlanTier: "growth",
    };
    render(<AskLedgerPage />);

    const nav = screen.getByRole("navigation", { name: "Reports sections" });
    expect(nav).toBeInTheDocument();

    const links = within(nav).getAllByRole("link");
    const labels = links.map((link) => link.textContent);
    expect(labels).toContain("Overview");
    expect(labels).toContain("Builder");
    expect(labels).toContain("Drafts");
    expect(labels).toContain("Ask Ledger");
  });

  it("hides Ask Ledger tab when user lacks accounting:view permission", () => {
    mockState.session = {
      memberRole: "viewer",
      memberPermissions: { ...getDefaultPermissionsForRole("viewer"), accounting: "none" },
      effectivePlanTier: "growth",
    };
    render(<AskLedgerPage />);

    const nav = screen.getByRole("navigation", { name: "Reports sections" });
    const askLedgerLink = within(nav).queryByRole("link", { name: "Ask Ledger" });
    expect(askLedgerLink).not.toBeInTheDocument();
  });
});

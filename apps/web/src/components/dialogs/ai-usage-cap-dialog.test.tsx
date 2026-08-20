import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockCaptureEvent, mockCaptureAppException, mockNavigate } = vi.hoisted(() => ({
  mockCaptureEvent: vi.fn(),
  mockCaptureAppException: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("../../lib/analytics", () => ({
  captureEvent: mockCaptureEvent,
}));

vi.mock("../../lib/sentry", () => ({
  captureAppException: mockCaptureAppException,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-content">{children}</div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => (
      <h2 data-testid="dialog-title">{children}</h2>
    ),
    DialogDescription: ({ children }: { children: React.ReactNode }) => (
      <p data-testid="dialog-description">{children}</p>
    ),
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Button: ({
      children,
      onClick,
      className,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      className?: string;
    }) => (
      <button onClick={onClick} className={className}>
        {children}
      </button>
    ),
  };
});

import { AiUsageCapDialog } from "./ai-usage-cap-dialog";
import type { AiUsageCapPayload } from "@grantpipe/shared";

const awardIntakePayload: AiUsageCapPayload = {
  error: "ai_usage_cap_reached",
  feature: "award_intake",
  cap: 5,
  used: 5,
  currentPlan: "starter",
  upgradeToPlan: "growth",
};

const askLedgerPayload: AiUsageCapPayload = {
  error: "ai_usage_cap_reached",
  feature: "ask_your_ledger",
  cap: 20,
  used: 20,
  currentPlan: "starter",
  upgradeToPlan: "growth",
};

const noUpgradePayload: AiUsageCapPayload = {
  error: "ai_usage_cap_reached",
  feature: "award_intake",
  cap: 5,
  used: 5,
  currentPlan: "growth",
  upgradeToPlan: null,
};

describe("AiUsageCapDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(<AiUsageCapDialog open={false} onOpenChange={vi.fn()} payload={awardIntakePayload} />);
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("renders nothing when open but payload is null", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={null} />);
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("renders award_intake dialog with correct title", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={awardIntakePayload} />);
    expect(screen.getByTestId("dialog-title")).toHaveTextContent(
      "You're out of AI intakes this month",
    );
  });

  it("renders ask_your_ledger dialog with correct title", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={askLedgerPayload} />);
    expect(screen.getByTestId("dialog-title")).toHaveTextContent(
      "You're out of AI questions this month",
    );
  });

  it("renders body with cap count, noun phrase, and upgrade copy when upgradeToPlan is set", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={awardIntakePayload} />);
    const desc = screen.getByTestId("dialog-description").textContent ?? "";
    expect(desc).toContain("5");
    expect(desc).toContain("AI award intakes");
    expect(desc).toContain("Want more now?");
    expect(desc).toContain("Growth");
    expect(desc).toContain("unlimited AI");
  });

  it("omits upgrade copy when upgradeToPlan is null", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={noUpgradePayload} />);
    const desc = screen.getByTestId("dialog-description").textContent ?? "";
    expect(desc).not.toContain("Want more now?");
    expect(desc).not.toContain("unlimited AI");
  });

  it("shows Get unlimited AI button only when upgradeToPlan is non-null", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={awardIntakePayload} />);
    expect(screen.getByText("Get unlimited AI")).toBeDefined();
  });

  it("does not show Get unlimited AI button when upgradeToPlan is null", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={noUpgradePayload} />);
    expect(screen.queryByText("Get unlimited AI")).toBeNull();
  });

  it("shows Not now button", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={awardIntakePayload} />);
    expect(screen.getByText("Not now")).toBeDefined();
  });

  it("fires aiUsageCapPromptViewed when dialog opens with a payload", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={awardIntakePayload} />);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "ai_usage_cap_prompt_viewed",
      expect.objectContaining({ feature: "award_intake", plan: "starter" }),
    );
  });

  it("does not fire aiUsageCapPromptViewed when closed", () => {
    render(<AiUsageCapDialog open={false} onOpenChange={vi.fn()} payload={awardIntakePayload} />);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("closes dialog when Not now is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <AiUsageCapDialog open={true} onOpenChange={onOpenChange} payload={awardIntakePayload} />,
    );
    fireEvent.click(screen.getByText("Not now"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("fires aiUsageCapPromptClicked and navigates on Get unlimited AI click", () => {
    const onOpenChange = vi.fn();
    render(
      <AiUsageCapDialog open={true} onOpenChange={onOpenChange} payload={awardIntakePayload} />,
    );
    fireEvent.click(screen.getByText("Get unlimited AI"));
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "ai_usage_cap_prompt_clicked",
      expect.objectContaining({ feature: "award_intake", plan: "starter" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/settings/billing" }));
  });

  it("renders ask_your_ledger noun phrase in body", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={askLedgerPayload} />);
    const desc = screen.getByTestId("dialog-description").textContent ?? "";
    expect(desc).toContain("AI ledger questions");
  });

  it("buttons have rounded-full class", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={awardIntakePayload} />);
    const buttons = document.querySelectorAll("button");
    buttons.forEach((btn) => {
      expect(btn.className).toContain("rounded-full");
    });
  });

  it("calls captureAppException when captureEvent throws in the mount effect", () => {
    mockCaptureEvent.mockImplementationOnce(() => {
      throw new Error("analytics down");
    });
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={awardIntakePayload} />);
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ feature: "ai_usage_cap_dialog", operation: "analytics" }),
      }),
    );
  });

  it("calls captureAppException when captureEvent throws inside handleUpgradeClick", () => {
    render(<AiUsageCapDialog open={true} onOpenChange={vi.fn()} payload={awardIntakePayload} />);
    vi.clearAllMocks();
    mockCaptureEvent.mockImplementationOnce(() => {
      throw new Error("analytics down");
    });
    fireEvent.click(screen.getByText("Get unlimited AI"));
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ feature: "ai_usage_cap_dialog", operation: "analytics" }),
      }),
    );
  });
});

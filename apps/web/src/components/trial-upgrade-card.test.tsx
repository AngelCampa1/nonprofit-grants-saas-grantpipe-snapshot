import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    hash,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    hash?: string;
  }) => {
    const href = `${to ?? ""}${hash ? `#${hash}` : ""}`;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("@grantpipe/ui", () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
  Button: ({
    asChild,
    children,
    className = "",
    variant,
    size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    variant?: string;
    size?: string;
  }) => {
    if (asChild && React.isValidElement<{ className?: string }>(children)) {
      return React.cloneElement(children, {
        ...props,
        "data-slot": "button",
        "data-variant": variant ?? "default",
        className: `${className} ${children.props.className ?? ""}`.trim(),
      } as React.AnchorHTMLAttributes<HTMLAnchorElement>);
    }
    return (
      <button
        data-slot="button"
        data-variant={variant ?? "default"}
        data-size={size ?? "default"}
        className={className}
        {...props}
      >
        {children}
      </button>
    );
  },
}));

const mockCaptureEvent = vi.fn();
vi.mock("../lib/analytics", () => ({
  captureEvent: (event: string, properties?: Record<string, unknown>) =>
    mockCaptureEvent(event, properties),
}));

const mockUsePaywall = vi.fn();
vi.mock("../hooks/use-paywall", () => ({
  usePaywall: () => mockUsePaywall(),
}));

const mockUseSession = vi.fn();
vi.mock("../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

const mockUseTrialFeatureUsage = vi.fn();
vi.mock("../hooks/use-trial-feature-usage", () => ({
  useTrialFeatureUsage: () => mockUseTrialFeatureUsage(),
}));

import { TrialUpgradeCard } from "./trial-upgrade-card";

const ORG_ID = "org_123";

function setVisibleDefaults() {
  mockUsePaywall.mockReturnValue({
    state: { allowed: true, status: "trialing", daysRemaining: 20, trialEndsAt: new Date() },
    isLoading: false,
    isError: false,
  });
  mockUseSession.mockReturnValue({
    memberRole: "admin",
    onboardingCompleted: true,
    orgId: ORG_ID,
  });
  mockUseTrialFeatureUsage.mockReturnValue({
    data: { highestTier: "growth", tiersUsed: ["starter", "growth"] },
    isLoading: false,
    isError: false,
  });
}

describe("TrialUpgradeCard", () => {
  beforeEach(() => {
    mockCaptureEvent.mockReset();
    mockUsePaywall.mockReset();
    mockUseSession.mockReset();
    mockUseTrialFeatureUsage.mockReset();
    localStorage.clear();
  });

  it("renders nothing when the org is not trialing", () => {
    setVisibleDefaults();
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "active" },
      isLoading: false,
      isError: false,
    });
    const { container } = render(<TrialUpgradeCard />);
    expect(container.firstChild).toBeNull();
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("renders nothing when onboarding is not complete", () => {
    setVisibleDefaults();
    mockUseSession.mockReturnValue({
      memberRole: "admin",
      onboardingCompleted: false,
      orgId: ORG_ID,
    });
    const { container } = render(<TrialUpgradeCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for non-admin members", () => {
    setVisibleDefaults();
    mockUseSession.mockReturnValue({
      memberRole: "editor",
      onboardingCompleted: true,
      orgId: ORG_ID,
    });
    const { container } = render(<TrialUpgradeCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the trial has no activation signal", () => {
    setVisibleDefaults();
    mockUseTrialFeatureUsage.mockReturnValue({
      data: { highestTier: null, tiersUsed: [] },
      isLoading: false,
      isError: false,
    });
    const { container } = render(<TrialUpgradeCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing while feature usage is still loading", () => {
    setVisibleDefaults();
    mockUseTrialFeatureUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = render(<TrialUpgradeCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when already dismissed for this org", () => {
    setVisibleDefaults();
    localStorage.setItem(`gp-trial-upgrade-card-dismissed:${ORG_ID}`, "1");
    const { container } = render(<TrialUpgradeCard />);
    expect(container.firstChild).toBeNull();
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("shows the card and fires upgrade_prompt_shown once when all gates pass", () => {
    setVisibleDefaults();
    const { rerender } = render(<TrialUpgradeCard />);
    expect(screen.getByTestId("trial-upgrade-card")).toBeDefined();

    const shownCalls = mockCaptureEvent.mock.calls.filter(
      ([event]) => event === "upgrade_prompt_shown",
    );
    expect(shownCalls).toHaveLength(1);
    expect(shownCalls[0]?.[1]).toEqual({ surface: "dashboard_card", plan_tier_used: "growth" });

    rerender(<TrialUpgradeCard />);
    const shownCallsAfter = mockCaptureEvent.mock.calls.filter(
      ([event]) => event === "upgrade_prompt_shown",
    );
    expect(shownCallsAfter).toHaveLength(1);
  });

  it("links the CTA to billing with pill styling and fires upgrade_clicked", () => {
    setVisibleDefaults();
    render(<TrialUpgradeCard />);
    const cta = screen.getByRole("link", { name: /see plans/i });
    expect(cta.getAttribute("href")).toBe("/settings#billing");
    expect(cta.className).toMatch(/rounded-full/);

    fireEvent.click(cta);
    expect(mockCaptureEvent).toHaveBeenCalledWith("upgrade_clicked", {
      surface: "dashboard_card",
    });
  });

  it("hides the card and persists dismissal when dismissed", () => {
    setVisibleDefaults();
    const { container } = render(<TrialUpgradeCard />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(container.firstChild).toBeNull();
    expect(localStorage.getItem(`gp-trial-upgrade-card-dismissed:${ORG_ID}`)).toBe("1");
  });

  it("treats unreadable storage as not dismissed", () => {
    setVisibleDefaults();
    const getItemSpy = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const { container } = render(<TrialUpgradeCard />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByTestId("trial-upgrade-card")).toBeDefined();
    getItemSpy.mockRestore();
  });

  it("still hides the card when persisting the dismissal throws", () => {
    setVisibleDefaults();
    const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage full");
    });
    const { container } = render(<TrialUpgradeCard />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: /dismiss/i }))).not.toThrow();
    expect(container.firstChild).toBeNull();
    setItemSpy.mockRestore();
  });

  it("renders for a trialing admin even when the org id is not yet known", () => {
    setVisibleDefaults();
    mockUseSession.mockReturnValue({
      memberRole: "admin",
      onboardingCompleted: true,
      orgId: null,
    });
    render(<TrialUpgradeCard />);
    expect(screen.getByTestId("trial-upgrade-card")).toBeDefined();
    expect(mockCaptureEvent).toHaveBeenCalledWith("upgrade_prompt_shown", {
      surface: "dashboard_card",
      plan_tier_used: "growth",
    });
  });

  it("resets dismissal when the active org changes", () => {
    setVisibleDefaults();
    localStorage.setItem(`gp-trial-upgrade-card-dismissed:${ORG_ID}`, "1");
    const { container, rerender } = render(<TrialUpgradeCard />);
    expect(container.firstChild).toBeNull();

    mockUseSession.mockReturnValue({
      memberRole: "admin",
      onboardingCompleted: true,
      orgId: "org_456",
    });
    rerender(<TrialUpgradeCard />);
    expect(screen.getByTestId("trial-upgrade-card")).toBeDefined();
  });
});

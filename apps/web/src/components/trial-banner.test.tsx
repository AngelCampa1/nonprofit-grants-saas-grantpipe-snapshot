import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    hash,
    search,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    hash?: string;
    search?: Record<string, string | undefined>;
  }) => {
    const query = search
      ? "?" +
        Object.entries(search)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${k}=${v}`)
          .join("&")
      : "";
    const href = `${to ?? ""}${query}${hash ? `#${hash}` : ""}`;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("@grantpipe/ui", () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
  AttentionBanner: ({
    title,
    description,
    icon,
    action,
    variant = "warning",
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    title: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    variant?: "warning" | "destructive" | "info";
  }) => (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      aria-live={variant === "destructive" ? "assertive" : "polite"}
      data-slot="attention-banner"
      data-variant={variant}
      className={className}
      {...props}
    >
      {icon}
      <p>{title}</p>
      {description ? <p>{description}</p> : null}
      {children}
      {action}
    </div>
  ),
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
        "data-size": size ?? "default",
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

import { TrialBanner } from "./trial-banner";

const mockUsePaywall = vi.fn();
vi.mock("../hooks/use-paywall", () => ({
  usePaywall: () => mockUsePaywall(),
}));

describe("TrialBanner", () => {
  beforeEach(() => {
    mockUsePaywall.mockReset();
    mockCaptureEvent.mockReset();
  });

  it("renders nothing when state is unavailable", () => {
    mockUsePaywall.mockReturnValue({ state: null, isLoading: true, isError: false });
    const { container } = render(<TrialBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for active subscription", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "active" },
      isLoading: false,
      isError: false,
    });
    const { container } = render(<TrialBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows trial countdown for trialing state with multiple days", () => {
    mockUsePaywall.mockReturnValue({
      state: {
        allowed: true,
        status: "trialing",
        daysRemaining: 30,
        trialEndsAt: new Date(),
      },
      isLoading: false,
      isError: false,
    });
    render(<TrialBanner canManageBilling={true} />);
    const banner = screen.getByTestId("trial-banner");
    expect(banner).toBeDefined();
    expect(banner).toHaveAttribute("data-urgency", "normal");
    expect(screen.getByText("Trial")).toBeDefined();
    expect(screen.getByText("30d")).toBeDefined();
    expect(screen.queryByText(/Add billing now to keep access uninterrupted/i)).toBeNull();
    const cta = screen.getByRole("link", { name: /add billing, trial ends in 30 days/i });
    expect(cta.getAttribute("href")).toBe("/settings#billing");
    expect(cta.className).toMatch(/rounded-full/);
    expect(cta.className).not.toMatch(/min-h-11/);
  });

  it("fires upgrade_clicked from the topbar chip when an admin clicks it", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "trialing", daysRemaining: 20, trialEndsAt: new Date() },
      isLoading: false,
      isError: false,
    });
    render(<TrialBanner canManageBilling={true} />);
    fireEvent.click(screen.getByRole("link", { name: /add billing/i }));
    expect(mockCaptureEvent).toHaveBeenCalledWith("upgrade_clicked", {
      surface: "topbar_chip",
    });
  });

  it("does not fire upgrade_clicked for read-only trial chips", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "trialing", daysRemaining: 20, trialEndsAt: new Date() },
      isLoading: false,
      isError: false,
    });
    render(<TrialBanner canManageBilling={false} />);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("shows singular copy when 1 day remaining", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "trialing", daysRemaining: 1, trialEndsAt: new Date() },
      isLoading: false,
      isError: false,
    });
    render(<TrialBanner canManageBilling={true} />);
    expect(screen.getByTestId("trial-banner")).toHaveAttribute("data-urgency", "critical");
    expect(screen.getByText("Trial ends tomorrow")).toBeDefined();
  });

  it("marks seven-day trial countdowns as elevated urgency", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "trialing", daysRemaining: 7, trialEndsAt: new Date() },
      isLoading: false,
      isError: false,
    });
    render(<TrialBanner canManageBilling={true} />);
    expect(screen.getByTestId("trial-banner")).toHaveAttribute("data-urgency", "elevated");
    expect(screen.getByText("7d")).toBeDefined();
  });

  it("renders trial status as read-only for non-admin users", () => {
    mockUsePaywall.mockReturnValue({
      state: {
        allowed: true,
        status: "trialing",
        daysRemaining: 12,
        trialEndsAt: new Date(),
      },
      isLoading: false,
      isError: false,
    });
    render(<TrialBanner canManageBilling={false} />);
    expect(screen.getByRole("status")).toHaveAccessibleName("Trial ends in 12 days");
    expect(screen.queryByRole("link", { name: /add billing/i })).toBeNull();
  });

  it("shows trial expired message when blocked by trial_expired", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "trial_expired", trialEndsAt: new Date() },
      isLoading: false,
      isError: false,
    });
    render(<TrialBanner />);
    expect(screen.getByTestId("paywall-banner")).toBeDefined();
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByText("Free trial ended")).toBeDefined();
  });

  it("shows canceled message when subscription is canceled", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "subscription_canceled", trialEndsAt: null },
      isLoading: false,
      isError: false,
    });
    render(<TrialBanner />);
    expect(screen.getByText("Subscription canceled")).toBeDefined();
    expect(screen.getByText(/Reactivate billing to restore access/i)).toBeDefined();
  });

  it("shows generic inactive message for past_due", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "subscription_inactive", trialEndsAt: null },
      isLoading: false,
      isError: false,
    });
    render(<TrialBanner />);
    expect(screen.getByText("Billing action required")).toBeDefined();
    expect(screen.getByText(/Update billing to restore access/i)).toBeDefined();
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const { mockUseSearch, mockReadPendingPlan, mockClearPendingPlan } = vi.hoisted(() => ({
  mockUseSearch: vi.fn().mockReturnValue({}),
  mockReadPendingPlan: vi.fn().mockReturnValue(null),
  mockClearPendingPlan: vi.fn(),
}));

vi.mock("../signup", () => ({
  readPendingPlan: () => mockReadPendingPlan(),
  clearPendingPlan: () => mockClearPendingPlan(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) =>
    Object.assign({ ...config, path }, { useSearch: mockUseSearch }),
  Link: ({
    to,
    children,
    className,
    hash,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
    hash?: string;
  }) => React.createElement("a", { href: `${to}${hash ? `#${hash}` : ""}`, className }, children),
}));

import { ConfirmPlanPage } from "./confirm-plan";

describe("ConfirmPlanPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue({});
    mockReadPendingPlan.mockReturnValue(null);
  });

  it("renders the active-trial message", () => {
    render(React.createElement(ConfirmPlanPage));

    expect(
      screen.getByRole("heading", { name: "Your trial is active", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No credit card needed/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review billing options" })).toHaveAttribute(
      "href",
      "/settings#billing",
    );
  });

  it("renders the saved plan summary without promo code copy when a pending plan exists", () => {
    mockReadPendingPlan.mockReturnValue({
      planTier: "growth",
      billingCycle: "annual",
      promoCode: "Y80OFF",
    });

    render(React.createElement(ConfirmPlanPage));

    expect(screen.getByText(/You're exploring/i)).toHaveTextContent("Growth");
    expect(screen.getByText(/You're exploring/i)).toHaveTextContent("annual");
    expect(screen.getByText(/You're exploring/i)).not.toHaveTextContent("Y80OFF");
  });

  it("omits optional billing and promo copy when only a plan is pending", () => {
    mockReadPendingPlan.mockReturnValue({
      planTier: "starter",
    });

    render(React.createElement(ConfirmPlanPage));

    const summary = screen.getByText(/You're exploring/i);
    expect(summary).toHaveTextContent("Starter");
    expect(summary).not.toHaveTextContent("billing");
    expect(summary).not.toHaveTextContent("Promo code");
  });

  it("renders the cancelled checkout notice when present", () => {
    mockUseSearch.mockReturnValue({ checkout: "cancelled" });

    render(React.createElement(ConfirmPlanPage));

    expect(screen.getByText(/Checkout cancelled/i)).toBeInTheDocument();
  });

  it("clears the pending plan when continuing to the dashboard", () => {
    render(React.createElement(ConfirmPlanPage));

    fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

    expect(mockClearPendingPlan).toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";

const {
  mockUseSession,
  mockUseOrgBilling,
  mockUseTrialFeatureUsage,
  mockUseOrgSettingsMutations,
  mockReadPendingPlan,
  mockClearPendingPlan,
  mockCaptureEvent,
  mockCaptureRedirectEvent,
  mockIsAllowedBillingUrl,
  mockCaptureAppException,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseTrialFeatureUsage: vi.fn(),
  mockUseOrgSettingsMutations: vi.fn(),
  mockReadPendingPlan: vi.fn().mockReturnValue(null),
  mockClearPendingPlan: vi.fn(),
  mockCaptureEvent: vi.fn(),
  mockCaptureRedirectEvent: vi.fn(),
  mockIsAllowedBillingUrl: vi.fn().mockReturnValue(true),
  mockCaptureAppException: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("a", props, children),
}));

vi.mock("../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../hooks/use-org-settings", () => ({
  useOrgBilling: () => mockUseOrgBilling(),
  useOrgSettingsMutations: () => mockUseOrgSettingsMutations(),
}));

vi.mock("../hooks/use-trial-feature-usage", () => ({
  useTrialFeatureUsage: () => mockUseTrialFeatureUsage(),
}));

vi.mock("../routes/signup", () => ({
  readPendingPlan: () => mockReadPendingPlan(),
  clearPendingPlan: () => mockClearPendingPlan(),
}));

vi.mock("../lib/billing-redirect", () => ({
  isAllowedBillingUrl: (url: string) => mockIsAllowedBillingUrl(url),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
  captureRedirectEvent: (...args: unknown[]) => mockCaptureRedirectEvent(...args),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

import { SettingsBillingPanel } from "./settings-billing-panel";

const noopUsage = { data: { highestTier: null, tiersUsed: [] }, isLoading: false, isError: false };
const billingPanelSource = readFileSync(
  join(process.cwd(), "src/components/settings-billing-panel.tsx"),
  "utf8",
);

function defaultMutations() {
  return {
    saveBillingSelection: {
      mutateAsync: vi.fn().mockResolvedValue({ planTier: "growth" }),
      isPending: false,
    },
    startCheckout: {
      mutateAsync: vi.fn().mockResolvedValue({ url: "/api/checkout" }),
      isPending: false,
    },
    openPortal: {
      mutateAsync: vi.fn().mockResolvedValue({ url: "/api/portal" }),
      isPending: false,
    },
  };
}

describe("SettingsBillingPanel pricing source contract", () => {
  it("uses shared pricing helpers without local plan-order or launch promo checkout logic", () => {
    expect(billingPanelSource).toContain("isPlanTierAtLeast");
    expect(billingPanelSource).not.toContain("getGrantPipePricingCopy");
    expect(billingPanelSource).not.toContain("getLaunchPromoForBillingCycle");
    expect(billingPanelSource).not.toContain("const PLAN_TIER_RANK");
    expect(billingPanelSource).not.toContain(
      "Limited offer: 80% off the first year. Subscriptions only. First 300 customers.",
    );
    expect(billingPanelSource).toContain("20% off monthly.");
  });
});

describe("SettingsBillingPanel", () => {
  let originalAssign: typeof window.location.assign;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadPendingPlan.mockReturnValue(null);
    mockIsAllowedBillingUrl.mockReturnValue(true);
    mockUseSession.mockReturnValue({ memberRole: "admin", orgId: "org-1" });
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        billingCycle: "annual",
        status: "trialing",
        trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      isLoading: false,
      isError: false,
    });
    mockUseTrialFeatureUsage.mockReturnValue(noopUsage);
    mockUseOrgSettingsMutations.mockReturnValue(defaultMutations());

    originalAssign = window.location.assign;
    Object.defineProperty(window.location, "assign", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(window.location, "assign", {
      configurable: true,
      value: originalAssign,
    });
  });

  it("renders the admin gate message for non-admin members", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer", orgId: "org-1" });
    render(<SettingsBillingPanel />);
    expect(
      screen.getByText("Ask an organization admin to manage billing for this workspace."),
    ).toBeInTheDocument();
  });

  it("renders three self-serve plan cards with Enterprise as a custom path", () => {
    render(<SettingsBillingPanel />);
    expect(screen.getByTestId("billing-plan-starter")).toBeInTheDocument();
    expect(screen.getByTestId("billing-plan-growth")).toBeInTheDocument();
    expect(screen.getByTestId("billing-plan-audit_ready")).toBeInTheDocument();
    expect(screen.queryByTestId("billing-plan-enterprise")).not.toBeInTheDocument();

    const growthCard = screen.getByTestId("billing-plan-growth");
    expect(within(growthCard).getByText("Run more grants with less stress")).toBeInTheDocument();
    expect(within(growthCard).getByText(/Up to 50 active grants/i)).toBeInTheDocument();

    const starterCard = screen.getByTestId("billing-plan-starter");
    expect(within(starterCard).queryByText("List price")).not.toBeInTheDocument();
    expect(within(starterCard).queryByText("Limited price")).not.toBeInTheDocument();
    expect(within(starterCard).getByText("$39/mo")).toBeInTheDocument();
    expect(
      within(starterCard).getByText("Billed annually at $468/yr. 20% off monthly."),
    ).toBeInTheDocument();

    const customPath = screen.getByTestId("billing-enterprise-custom-path");
    expect(within(customPath).getByText("Need a custom path?")).toBeInTheDocument();
    const emailFounderLink = within(customPath).getByText("Email Angel");
    const linkedInLink = within(customPath).getByText("LinkedIn");
    expect(emailFounderLink).toBeInTheDocument();
    expect(linkedInLink).toBeInTheDocument();
    fireEvent.click(emailFounderLink);
    fireEvent.click(linkedInLink);
  });

  it("opens the founder LinkedIn link with rel=noopener noreferrer", () => {
    render(<SettingsBillingPanel />);
    const customPath = screen.getByTestId("billing-enterprise-custom-path");
    const linkedInLink = within(customPath).getByText("LinkedIn");
    expect(linkedInLink).toHaveAttribute("target", "_blank");
    expect(linkedInLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("updates the review section when the user picks a different tier", () => {
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByTestId("billing-plan-growth"));
    expect(screen.getByText("Growth - Annual billing - $79/mo")).toBeInTheDocument();
    expect(screen.getAllByText("Billed annually at $948/yr. 20% off monthly.")).not.toHaveLength(0);
    expect(screen.getByText("This plan includes:")).toBeInTheDocument();
  });

  it("selects a plan card from the keyboard", () => {
    render(<SettingsBillingPanel />);
    fireEvent.keyDown(screen.getByTestId("billing-plan-growth"), { key: "Enter" });
    expect(screen.getByText("Growth - Annual billing - $79/mo")).toBeInTheDocument();
  });

  it("changing the billing cycle updates the review price label", () => {
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByTestId("billing-plan-growth"));
    fireEvent.click(screen.getByTestId("billing-cycle-monthly"));
    expect(screen.getByText("Growth - Monthly billing - $99/mo")).toBeInTheDocument();
    expect(screen.getAllByText("Billed monthly.")).not.toHaveLength(0);
  });

  it("keeps active subscription billing context at list price", () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "growth",
        billingCycle: "annual",
        status: "active",
        subscriptionId: "sub_123",
      },
      isLoading: false,
      isError: false,
    });
    render(<SettingsBillingPanel />);

    const growthCard = screen.getByTestId("billing-plan-growth");
    expect(within(growthCard).getByText("$79/mo")).toBeInTheDocument();
    expect(
      within(growthCard).getByText("Billed annually at $948/yr. 20% off monthly."),
    ).toBeInTheDocument();
    expect(within(growthCard).queryByText("Limited price")).not.toBeInTheDocument();
    expect(screen.queryByText("Limited offer: 80% off the first year.")).not.toBeInTheDocument();
  });

  it("does not submit a pending Y80OFF promo for active subscriptions", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "growth",
        billingCycle: "annual",
        status: "active",
        subscriptionId: "sub_123",
      },
      isLoading: false,
      isError: false,
    });
    mockReadPendingPlan.mockReturnValue({
      planTier: "growth",
      billingCycle: "annual",
      promoCode: "Y80OFF",
    });
    render(<SettingsBillingPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));
    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "annual",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /Update billing for Growth/ }));
    await waitFor(() => {
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "annual",
        promoCode: undefined,
      });
    });
  });

  it("does not show the downgrade callout when no higher trial tier was used", () => {
    render(<SettingsBillingPanel />);
    expect(screen.queryByTestId("billing-downgrade-callout")).not.toBeInTheDocument();
  });

  it("shows the downgrade callout listing features lost when downgrading from a higher trial tier", () => {
    mockUseTrialFeatureUsage.mockReturnValue({
      data: { highestTier: "audit_ready", tiersUsed: ["audit_ready"] },
      isLoading: false,
      isError: false,
    });
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByTestId("billing-plan-growth"));
    const callout = screen.getByTestId("billing-downgrade-callout");
    expect(within(callout).getByText(/Auditor & Funder Portal/)).toBeInTheDocument();
    expect(within(callout).getByText(/Subrecipient monitoring/)).toBeInTheDocument();
  });

  it("opens the warning modal on Add billing details when downgrading and listing the right features", () => {
    mockUseTrialFeatureUsage.mockReturnValue({
      data: { highestTier: "audit_ready", tiersUsed: ["audit_ready"] },
      isLoading: false,
      isError: false,
    });
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByTestId("billing-plan-growth"));
    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Growth/ }));

    const modal = screen.getByTestId("billing-downgrade-modal");
    expect(
      within(modal).getByText("You're about to lose access to higher-tier features"),
    ).toBeInTheDocument();
    expect(within(modal).getByText(/Auditor & Funder Portal/)).toBeInTheDocument();
    expect(within(modal).getByRole("button", { name: /Continue with Growth/ })).toBeInTheDocument();
    expect(
      within(modal).getByRole("button", { name: /Upgrade to Audit-Ready/ }),
    ).toBeInTheDocument();
  });

  it("Continue with selected plan in the modal triggers checkout for the selected plan", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockUseTrialFeatureUsage.mockReturnValue({
      data: { highestTier: "audit_ready", tiersUsed: ["audit_ready"] },
      isLoading: false,
      isError: false,
    });

    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByTestId("billing-plan-growth"));
    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Growth/ }));
    const modal = screen.getByTestId("billing-downgrade-modal");
    fireEvent.click(within(modal).getByRole("button", { name: /Continue with Growth/ }));

    await waitFor(() => {
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "annual",
        promoCode: undefined,
      });
    });
  });

  it("redirects after checkout without duplicating checkout analytics", async () => {
    const mutations = defaultMutations();
    mutations.startCheckout.mutateAsync = vi
      .fn()
      .mockResolvedValue({ url: "https://checkout.stripe.com/cs_test" });
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    render(<SettingsBillingPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Starter/ }));

    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith("https://checkout.stripe.com/cs_test");
    });
    expect(mockCaptureRedirectEvent).not.toHaveBeenCalled();
  });

  it("Upgrade to highestTier in the modal selects that tier and starts checkout for it", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockUseTrialFeatureUsage.mockReturnValue({
      data: { highestTier: "audit_ready", tiersUsed: ["audit_ready"] },
      isLoading: false,
      isError: false,
    });

    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByTestId("billing-plan-growth"));
    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Growth/ }));
    const modal = screen.getByTestId("billing-downgrade-modal");
    fireEvent.click(within(modal).getByRole("button", { name: /Upgrade to Audit-Ready/ }));

    await waitFor(() => {
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalledWith({
        planTier: "audit_ready",
        billingCycle: "annual",
        promoCode: undefined,
      });
    });
  });

  it("does not open the modal when highestTier equals selectedPlan", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockUseTrialFeatureUsage.mockReturnValue({
      data: { highestTier: "growth", tiersUsed: ["growth"] },
      isLoading: false,
      isError: false,
    });

    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByTestId("billing-plan-growth"));
    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Growth/ }));

    await waitFor(() => {
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "annual",
        promoCode: undefined,
      });
    });
    expect(screen.queryByTestId("billing-downgrade-modal")).not.toBeInTheDocument();
  });

  it("does not open the modal when there is no recorded highest trial tier", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByTestId("billing-plan-starter"));
    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Starter/ }));

    await waitFor(() => {
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("billing-downgrade-modal")).not.toBeInTheDocument();
  });

  it("Save selection persists the current plan and clears the pending bridge", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockReadPendingPlan.mockReturnValue({
      planTier: "growth",
      billingCycle: "monthly",
      promoCode: "Y80OFF",
    });
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "monthly",
      });
      expect(mockClearPendingPlan).toHaveBeenCalled();
    });
  });

  it("uses direct billing search params as trial checkout intent without forwarding retired promos", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    render(<SettingsBillingPanel search={{ plan: "growth", cycle: "monthly", promo: "M80OFF" }} />);

    expect(screen.getByText("Growth - Monthly billing - $99/mo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Growth/ }));
    await waitFor(() => {
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "monthly",
        promoCode: undefined,
      });
    });
  });

  it("does not replace a mismatched pending promo with the selected cycle promo", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    render(<SettingsBillingPanel search={{ plan: "growth", cycle: "monthly", promo: "Y80OFF" }} />);

    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Growth/ }));
    await waitFor(() => {
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "monthly",
        promoCode: undefined,
      });
    });
  });

  it("does not forward unsupported pending promo codes to checkout", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    render(
      <SettingsBillingPanel search={{ plan: "growth", cycle: "monthly", promo: "SPECIAL" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Growth/ }));
    await waitFor(() => {
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "monthly",
        promoCode: undefined,
      });
    });
  });

  it("defaults direct trial checkout to annual billing without a retired promo code", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    render(<SettingsBillingPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));
    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).toHaveBeenCalledWith({
        planTier: "starter",
        billingCycle: "annual",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Starter/ }));
    await waitFor(() => {
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalledWith({
        planTier: "starter",
        billingCycle: "annual",
        promoCode: undefined,
      });
    });
  });

  it("does not save stale pending promo codes with plan selection", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockReadPendingPlan.mockReturnValue({
      planTier: "growth",
      billingCycle: "monthly",
      promoCode: "M80OFF",
    });
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "monthly",
      });
    });
  });

  it("does not save explicit blank pending promo codes with plan selection", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockReadPendingPlan.mockReturnValue({
      planTier: "growth",
      billingCycle: "monthly",
      promoCode: "",
    });
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "monthly",
      });
    });
  });

  it("does not save non-limited pending promo codes with plan selection", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockReadPendingPlan.mockReturnValue({
      planTier: "growth",
      billingCycle: "monthly",
      promoCode: "SPECIAL",
    });
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "monthly",
      });
    });
  });

  it("does not show retired limited-offer billing copy or deadline", () => {
    render(<SettingsBillingPanel />);

    expect(screen.queryByText(/80% off/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("billing-promo-deadline")).not.toBeInTheDocument();
  });

  it("shows full price only with no discount badge or deadline copy", () => {
    render(<SettingsBillingPanel />);

    const starterCard = screen.getByTestId("billing-plan-starter");
    expect(within(starterCard).queryByText("List price")).not.toBeInTheDocument();
    expect(within(starterCard).queryByText("Limited price")).not.toBeInTheDocument();
    expect(screen.queryByTestId("billing-promo-deadline")).not.toBeInTheDocument();
  });

  it("shows checkout success and cancel banners from search params", () => {
    const { rerender } = render(<SettingsBillingPanel search={{ checkout: "success" }} />);
    expect(screen.getByText("Billing details added successfully.")).toBeInTheDocument();
    rerender(<SettingsBillingPanel search={{ checkout: "cancel" }} />);
    expect(
      screen.getByText("Checkout was canceled. Your saved plan selection is unchanged."),
    ).toBeInTheDocument();
    rerender(<SettingsBillingPanel search={{ portal: "open" }} />);
    expect(screen.getByText("Stripe billing portal opened.")).toBeInTheDocument();
  });

  it("renders an Open portal button when the org has a stripe customer", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "growth",
        billingCycle: "annual",
        status: "active",
        customerId: "cus_123",
      },
      isLoading: false,
      isError: false,
    });
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Open portal" }));
    await waitFor(() => {
      expect(mutations.openPortal.mutateAsync).toHaveBeenCalledWith({
        returnPath: "/settings#billing",
      });
    });
  });

  it("fires cancellation_started when Open portal is clicked", async () => {
    const mutations = defaultMutations();
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "growth",
        billingCycle: "annual",
        status: "active",
        customerId: "cus_123",
      },
      isLoading: false,
      isError: false,
    });
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Open portal" }));
    expect(mockCaptureEvent).toHaveBeenCalledWith("cancellation_started", {
      source: "billing_portal",
    });
  });

  it("redirects to the trusted portal URL without duplicating portal analytics", async () => {
    const mutations = defaultMutations();
    mutations.openPortal.mutateAsync = vi
      .fn()
      .mockResolvedValue({ url: "https://billing.stripe.com/p/session" });
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "growth",
        billingCycle: "monthly",
        status: "active",
        customerId: "cus_123",
      },
      isLoading: false,
      isError: false,
    });
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Open portal" }));

    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith("https://billing.stripe.com/p/session");
    });
    expect(mockCaptureRedirectEvent).not.toHaveBeenCalled();
  });

  it("reports billing redirect failures without sending the redirect URL", async () => {
    const mutations = defaultMutations();
    const error = new Error(
      "portal unavailable for cus_secret at https://billing.stripe.com/p/session",
    );
    mutations.openPortal.mutateAsync = vi.fn().mockRejectedValue(error);
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "growth",
        billingCycle: "monthly",
        status: "active",
        customerId: "cus_123",
      },
      isLoading: false,
      isError: false,
    });
    render(<SettingsBillingPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Open portal" }));

    expect(
      await screen.findByText(
        "portal unavailable for cus_secret at https://billing.stripe.com/p/session",
      ),
    ).toBeInTheDocument();
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      error,
      {
        tags: { feature: "billing", operation: "redirect" },
      },
      { sanitize: true },
    );
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("billing.stripe.com");
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("cus_123");
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("cus_secret");
  });

  it("renders a loading state while billing is fetching", () => {
    mockUseOrgBilling.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<SettingsBillingPanel />);
    expect(screen.getByText("Loading billing details…")).toBeInTheDocument();
  });

  it("renders an error state when billing query fails", () => {
    mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
    });
    render(<SettingsBillingPanel />);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("keeps Enterprise out of selectable billing cards for existing Enterprise orgs", () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "enterprise",
        billingCycle: "annual",
        status: "active",
        subscriptionId: "sub_123",
      },
      isLoading: false,
      isError: false,
    });
    render(<SettingsBillingPanel />);
    expect(screen.queryByTestId("billing-plan-enterprise")).not.toBeInTheDocument();
    expect(screen.getByText("Enterprise - Annual billing - Contact founder")).toBeInTheDocument();
    expect(screen.getByTestId("billing-enterprise-custom-path")).toBeInTheDocument();
  });

  it("renders a Book a 30-min call link in the custom path section", () => {
    render(<SettingsBillingPanel />);
    const link = screen.getByRole("link", { name: "Book a 30-min call" });
    expect(link).toHaveAttribute("href", "https://cal.com/angel-campa-grantpipe/30min");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders Contact founder as a booking link for non-self-serve plans", () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "enterprise",
        billingCycle: "annual",
        status: "active",
        subscriptionId: "sub_123",
      },
      isLoading: false,
      isError: false,
    });
    render(<SettingsBillingPanel />);
    const link = screen.getByRole("link", { name: "Contact founder" });
    expect(link).toHaveAttribute("href", "https://cal.com/angel-campa-grantpipe/30min");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders the trial countdown when trialing", () => {
    render(<SettingsBillingPanel />);
    expect(screen.getByTestId("billing-trial-countdown")).toBeInTheDocument();
  });

  it("renders Back to settings link when showBackLink is true", () => {
    render(<SettingsBillingPanel showBackLink />);
    expect(screen.getByText("Back to settings")).toBeInTheDocument();
  });

  it("surfaces an error when the checkout mutation fails", async () => {
    const mutations = defaultMutations();
    mutations.startCheckout.mutateAsync = vi.fn().mockRejectedValue(new Error("checkout failed"));
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Starter/ }));
    expect(await screen.findByText("checkout failed")).toBeInTheDocument();
  });

  it("surfaces an error when checkout does not return a redirect URL", async () => {
    const mutations = defaultMutations();
    mutations.startCheckout.mutateAsync = vi.fn().mockResolvedValue({ url: null });
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Starter/ }));
    expect(await screen.findByText("Billing redirect URL was not returned.")).toBeInTheDocument();
  });

  it("surfaces an error when checkout returns an untrusted redirect URL", async () => {
    mockIsAllowedBillingUrl.mockReturnValue(false);
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Add billing details for Starter/ }));
    expect(await screen.findByText("Billing redirect URL is not trusted.")).toBeInTheDocument();
  });

  it("surfaces an error when Save selection fails", async () => {
    const mutations = defaultMutations();
    mutations.saveBillingSelection.mutateAsync = vi
      .fn()
      .mockRejectedValue(new Error("save failed"));
    mockUseOrgSettingsMutations.mockReturnValue(mutations);
    render(<SettingsBillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));
    expect(await screen.findByText("save failed")).toBeInTheDocument();
  });
});

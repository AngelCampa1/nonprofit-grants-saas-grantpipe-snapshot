import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const {
  mockRouteUseSearch,
  mockUseSession,
  mockUseOrgBilling,
  mockUseOrgSettingsMutations,
  mockUseTrialFeatureUsage,
  mockReadPendingPlan,
  mockClearPendingPlan,
  mockNavigate,
} = vi.hoisted(() => ({
  mockRouteUseSearch: vi.fn().mockReturnValue({}),
  mockUseSession: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseOrgSettingsMutations: vi.fn(),
  mockUseTrialFeatureUsage: vi.fn(),
  mockReadPendingPlan: vi.fn().mockReturnValue(null),
  mockClearPendingPlan: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (path: string) => (config: { component: React.ComponentType; validateSearch?: unknown }) => ({
      ...config,
      path,
      useSearch: mockRouteUseSearch,
    }),
  Link: ({
    to,
    hash,
    children,
    className,
  }: {
    to: string;
    hash?: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href: `${to}${hash ? `#${hash}` : ""}`, className }, children),
  useNavigate: () => mockNavigate,
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../hooks/use-org-settings", () => ({
  useOrgBilling: (options?: unknown) => mockUseOrgBilling(options),
  useOrgSettingsMutations: () => mockUseOrgSettingsMutations(),
}));

vi.mock("../../hooks/use-trial-feature-usage", () => ({
  useTrialFeatureUsage: (options?: unknown) => mockUseTrialFeatureUsage(options),
}));

vi.mock("../signup", () => ({
  readPendingPlan: () => mockReadPendingPlan(),
  clearPendingPlan: () => mockClearPendingPlan(),
}));

import { SettingsBillingPanel } from "../../components/settings-billing-panel";
import { isAllowedBillingUrl } from "../../lib/billing-redirect";
import { SettingsBillingRedirect } from "./settings.billing";

describe("SettingsBillingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        assign: vi.fn(),
        origin: "https://app.grantpipe.com",
        hash: "",
      },
    });
    mockRouteUseSearch.mockReturnValue({});
    mockReadPendingPlan.mockReturnValue(null);
    mockUseSession.mockReturnValue({ memberRole: "admin", orgId: "org-1" });
    mockUseTrialFeatureUsage.mockReturnValue({
      data: { highestTier: null, tiersUsed: [] },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockReadPendingPlan.mockReturnValue(null);
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        billingCycle: "monthly",
        status: "trialing",
        trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        subscriptionId: null,
        promoCodeApplied: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgSettingsMutations.mockReturnValue({
      saveBillingSelection: {
        mutateAsync: vi.fn().mockResolvedValue({ planTier: "growth" }),
        isPending: false,
      },
      startCheckout: {
        mutateAsync: vi.fn().mockResolvedValue({
          url: "https://checkout.stripe.com/c/pay_123",
        }),
        isPending: false,
      },
      openPortal: {
        mutateAsync: vi.fn().mockResolvedValue({
          url: "https://billing.stripe.com/p/session_123",
        }),
        isPending: false,
      },
    });
  });

  it("renders the selected plan summary and trial CTA", () => {
    render(React.createElement(SettingsBillingPanel, { showBackLink: true }));

    expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
    expect(screen.getByText("You're picking")).toBeInTheDocument();
    expect(screen.getAllByText("Starter").length).toBeGreaterThan(0);
    expect(screen.getByTestId("billing-trial-countdown")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add billing details for Starter" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open portal" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to settings" })).toHaveAttribute(
      "href",
      "/settings#billing",
    );
  });

  it("renders a singular trial countdown when one day remains", () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        billingCycle: "monthly",
        status: "trialing",
        trialEndsAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        subscriptionId: null,
        promoCodeApplied: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(SettingsBillingPanel));

    expect(screen.getByTestId("billing-trial-countdown")).toHaveTextContent(
      "1 day left in your free trial.",
    );
  });

  it("starts checkout with the changed selection without persisting it first", async () => {
    render(React.createElement(SettingsBillingPanel));

    fireEvent.click(screen.getByTestId("billing-plan-growth"));
    fireEvent.click(screen.getByTestId("billing-cycle-annual"));
    fireEvent.click(screen.getByRole("button", { name: "Add billing details for Growth" }));

    const mutations = mockUseOrgSettingsMutations.mock.results[0]?.value;

    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).not.toHaveBeenCalled();
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "annual",
        promoCode: undefined,
      });
      expect(window.location.assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay_123");
    });
    expect(mockClearPendingPlan).not.toHaveBeenCalled();
  });

  it("prefills pending trial plan details before a card is collected without promo code UI", async () => {
    mockReadPendingPlan.mockReturnValue({
      planTier: "growth",
      billingCycle: "annual",
      promoCode: "Y80OFF",
    });

    render(React.createElement(SettingsBillingPanel));

    expect(
      await screen.findByRole("button", { name: /Add billing details for Growth/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("billing-cycle-annual")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("billing-promo-code")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/promo code/i)).not.toBeInTheDocument();
  });

  it("does not reapply a cleared pending plan after saving and refetching billing", async () => {
    mockReadPendingPlan.mockReturnValue({
      planTier: "growth",
      billingCycle: "annual",
      promoCode: "Y80OFF",
    });

    const { rerender } = render(React.createElement(SettingsBillingPanel));

    expect(
      await screen.findByRole("button", { name: /Add billing details for Growth/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    await waitFor(() => {
      expect(mockClearPendingPlan).toHaveBeenCalled();
    });

    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        billingCycle: "monthly",
        status: "trialing",
        trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        subscriptionId: null,
        promoCodeApplied: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    rerender(React.createElement(SettingsBillingPanel));

    expect(
      screen.getByRole("button", { name: /Add billing details for Starter/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("billing-cycle-monthly")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("billing-promo-code")).not.toBeInTheDocument();
  });

  it("renders loading and checkout-cancel states without billing summary content", () => {
    mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    render(
      React.createElement(SettingsBillingPanel, {
        search: { checkout: "cancel" },
      }),
    );

    expect(
      screen.getByText("Checkout was canceled. Your saved plan selection is unchanged."),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading billing details…")).toBeInTheDocument();
    expect(screen.queryByText("You're picking")).not.toBeInTheDocument();
  });

  it("surfaces missing and untrusted checkout redirect errors", async () => {
    const mutations = {
      saveBillingSelection: {
        mutateAsync: vi.fn().mockResolvedValue({ planTier: "starter" }),
        isPending: false,
      },
      startCheckout: {
        mutateAsync: vi
          .fn()
          .mockResolvedValueOnce({ url: null })
          .mockResolvedValueOnce({ url: "https://phish.example/billing" }),
        isPending: false,
      },
      openPortal: {
        mutateAsync: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/p/session_123" }),
        isPending: false,
      },
    };
    mockUseOrgSettingsMutations.mockReturnValue(mutations);

    const { rerender } = render(React.createElement(SettingsBillingPanel));

    fireEvent.click(screen.getByRole("button", { name: "Add billing details for Starter" }));

    expect(await screen.findByText("Billing redirect URL was not returned.")).toBeInTheDocument();

    rerender(React.createElement(SettingsBillingPanel));
    fireEvent.click(screen.getByRole("button", { name: "Add billing details for Starter" }));

    expect(await screen.findByText("Billing redirect URL is not trusted.")).toBeInTheDocument();
  });

  it("opens the billing portal with the dedicated return path", async () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        billingCycle: "monthly",
        status: "active",
        trialEndsAt: null,
        customerId: "cus_123",
        subscriptionId: "sub_123",
        promoCodeApplied: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(SettingsBillingPanel));

    fireEvent.click(screen.getByRole("button", { name: "Open portal" }));

    const mutations = mockUseOrgSettingsMutations.mock.results[0]?.value;

    await waitFor(() => {
      expect(mutations.openPortal.mutateAsync).toHaveBeenCalledWith({
        returnPath: "/settings#billing",
      });
      expect(window.location.assign).toHaveBeenCalledWith(
        "https://billing.stripe.com/p/session_123",
      );
    });
  });

  it("opens the billing portal without persisting changed selections first", async () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        billingCycle: "monthly",
        status: "active",
        trialEndsAt: null,
        customerId: "cus_123",
        subscriptionId: "sub_123",
        promoCodeApplied: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(SettingsBillingPanel));

    fireEvent.click(screen.getByTestId("billing-plan-growth"));
    fireEvent.click(screen.getByRole("button", { name: "Open portal" }));

    const mutations = mockUseOrgSettingsMutations.mock.results[0]?.value;

    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).not.toHaveBeenCalled();
      expect(mutations.openPortal.mutateAsync).toHaveBeenCalledWith({
        returnPath: "/settings#billing",
      });
    });
  });

  it("renders non-submit button types for save-in-place actions", () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        billingCycle: "monthly",
        status: "active",
        trialEndsAt: null,
        customerId: "cus_123",
        subscriptionId: "sub_123",
        promoCodeApplied: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(SettingsBillingPanel));

    expect(screen.getByRole("button", { name: "Update billing for Starter" })).toHaveAttribute(
      "type",
      "button",
    );
    expect(screen.getByRole("button", { name: "Open portal" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Save selection" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("saves the current selection in place without launching checkout", async () => {
    render(React.createElement(SettingsBillingPanel));

    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    const mutations = mockUseOrgSettingsMutations.mock.results[0]?.value;

    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).toHaveBeenCalledWith({
        planTier: "starter",
        billingCycle: "monthly",
      });
      expect(mockClearPendingPlan).toHaveBeenCalled();
    });
    expect(screen.queryByText("Something went wrong. Please try again.")).not.toBeInTheDocument();
  });

  it("shows a fallback message when saving the selection fails with a non-error value", async () => {
    mockUseOrgSettingsMutations.mockReturnValue({
      saveBillingSelection: {
        mutateAsync: vi.fn().mockRejectedValue("network unavailable"),
        isPending: false,
      },
      startCheckout: {
        mutateAsync: vi.fn().mockResolvedValue({
          url: "https://checkout.stripe.com/c/pay_123",
        }),
        isPending: false,
      },
      openPortal: {
        mutateAsync: vi.fn().mockResolvedValue({
          url: "https://billing.stripe.com/p/session_123",
        }),
        isPending: false,
      },
    });

    render(React.createElement(SettingsBillingPanel));

    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });

  it("shows Enterprise as a custom path without starting checkout", async () => {
    render(React.createElement(SettingsBillingPanel));

    expect(screen.queryByTestId("billing-plan-enterprise")).not.toBeInTheDocument();
    const customPath = screen.getByTestId("billing-enterprise-custom-path");
    expect(customPath).toHaveTextContent("Need a custom path?");
    expect(customPath).toHaveTextContent("Email Angel");
    expect(
      screen.queryByText("Enterprise - Monthly billing - Contact founder"),
    ).not.toBeInTheDocument();
  });

  it("renders success and portal banners from search params", () => {
    render(
      React.createElement(SettingsBillingPanel, {
        search: { checkout: "success", portal: "opened" },
      }),
    );

    expect(screen.getByText("Billing details added successfully.")).toBeInTheDocument();
    expect(screen.getByText("Stripe billing portal opened.")).toBeInTheDocument();
  });

  it("renders checkout cancel, loading, and billing error states", () => {
    mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    const { rerender } = render(
      React.createElement(SettingsBillingPanel, {
        search: { checkout: "cancel" },
      }),
    );

    expect(
      screen.getByText("Checkout was canceled. Your saved plan selection is unchanged."),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading billing details…")).toBeInTheDocument();

    mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Billing unavailable"),
    });
    rerender(
      React.createElement(SettingsBillingPanel, {
        search: { checkout: "cancel" },
      }),
    );

    expect(screen.getByText("Unable to load billing details.")).toBeInTheDocument();
    expect(screen.getByText("Billing unavailable")).toBeInTheDocument();
  });

  it("prefills trial checkout from a pending plan without promo code UI", async () => {
    mockReadPendingPlan.mockReturnValue({
      planTier: "audit_ready",
      billingCycle: "annual",
      promoCode: "READY25",
    });

    render(React.createElement(SettingsBillingPanel));

    await waitFor(() => {
      expect(screen.getByTestId("billing-plan-audit_ready")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(screen.getByTestId("billing-cycle-annual")).toHaveAttribute("aria-checked", "true");
      expect(screen.queryByTestId("billing-promo-code")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Add billing details for Audit-Ready" }),
      ).toBeInTheDocument();
    });
  });

  it("falls back to starter and annual for unknown billing values", async () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "legacy",
        billingCycle: null,
        status: "active",
        trialEndsAt: null,
        customerId: null,
        subscriptionId: null,
        promoCodeApplied: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(SettingsBillingPanel));

    await waitFor(() => {
      expect(screen.getByTestId("billing-plan-starter")).toHaveAttribute("aria-checked", "true");
      expect(screen.getByTestId("billing-cycle-annual")).toHaveAttribute("aria-checked", "true");
      expect(
        screen.getByRole("button", { name: "Update billing for Starter" }),
      ).toBeInTheDocument();
    });
  });

  it("skips saving unchanged selections before checkout", async () => {
    render(React.createElement(SettingsBillingPanel));

    fireEvent.click(screen.getByRole("button", { name: "Add billing details for Starter" }));

    const mutations = mockUseOrgSettingsMutations.mock.results[0]?.value;

    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).not.toHaveBeenCalled();
      expect(mutations.startCheckout.mutateAsync).toHaveBeenCalledWith({
        planTier: "starter",
        billingCycle: "monthly",
        promoCode: undefined,
      });
      expect(window.location.assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay_123");
    });
  });

  it("does not persist changed selections before opening the portal", async () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        billingCycle: "monthly",
        status: "active",
        trialEndsAt: null,
        customerId: "cus_123",
        subscriptionId: null,
        promoCodeApplied: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(SettingsBillingPanel));

    fireEvent.click(screen.getByTestId("billing-plan-growth"));
    fireEvent.click(screen.getByRole("button", { name: "Open portal" }));

    const mutations = mockUseOrgSettingsMutations.mock.results[0]?.value;

    await waitFor(() => {
      expect(mutations.saveBillingSelection.mutateAsync).not.toHaveBeenCalled();
      expect(mutations.openPortal.mutateAsync).toHaveBeenCalledWith({
        returnPath: "/settings#billing",
      });
      expect(window.location.assign).toHaveBeenCalledWith(
        "https://billing.stripe.com/p/session_123",
      );
    });
  });

  it("shows redirect errors for missing and untrusted billing URLs", async () => {
    const startCheckout = vi.fn().mockResolvedValue({ url: null });
    mockUseOrgSettingsMutations.mockReturnValue({
      saveBillingSelection: {
        mutateAsync: vi.fn().mockResolvedValue({}),
        isPending: false,
      },
      startCheckout: {
        mutateAsync: startCheckout,
        isPending: false,
      },
      openPortal: {
        mutateAsync: vi.fn().mockResolvedValue({
          url: "https://billing.stripe.com/p/session_123",
        }),
        isPending: false,
      },
    });

    const { rerender } = render(React.createElement(SettingsBillingPanel));

    fireEvent.click(screen.getByRole("button", { name: "Add billing details for Starter" }));

    await waitFor(() => {
      expect(screen.getByText("Billing redirect URL was not returned.")).toBeInTheDocument();
    });

    startCheckout.mockResolvedValue({ url: "https://phish.example/checkout" });
    rerender(React.createElement(SettingsBillingPanel));
    fireEvent.click(screen.getByRole("button", { name: "Add billing details for Starter" }));

    await waitFor(() => {
      expect(screen.getByText("Billing redirect URL is not trusted.")).toBeInTheDocument();
    });
  });

  it("shows save-selection errors without redirecting", async () => {
    const saveBillingSelection = vi.fn().mockRejectedValue(new Error("Save failed"));
    mockUseOrgSettingsMutations.mockReturnValue({
      saveBillingSelection: {
        mutateAsync: saveBillingSelection,
        isPending: false,
      },
      startCheckout: {
        mutateAsync: vi.fn().mockResolvedValue({
          url: "https://checkout.stripe.com/c/pay_123",
        }),
        isPending: false,
      },
      openPortal: {
        mutateAsync: vi.fn().mockResolvedValue({
          url: "https://billing.stripe.com/p/session_123",
        }),
        isPending: false,
      },
    });

    render(React.createElement(SettingsBillingPanel));

    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    await waitFor(() => {
      expect(saveBillingSelection).toHaveBeenCalled();
      expect(screen.getByText("Save failed")).toBeInTheDocument();
      expect(window.location.assign).not.toHaveBeenCalled();
    });
  });

  it("shows a generic save error when saving selection rejects with a non-error", async () => {
    mockUseOrgSettingsMutations.mockReturnValue({
      saveBillingSelection: {
        mutateAsync: vi.fn().mockRejectedValue("nope"),
        isPending: false,
      },
      startCheckout: {
        mutateAsync: vi.fn().mockResolvedValue({
          url: "https://checkout.stripe.com/c/pay_123",
        }),
        isPending: false,
      },
      openPortal: {
        mutateAsync: vi.fn().mockResolvedValue({
          url: "https://billing.stripe.com/p/session_123",
        }),
        isPending: false,
      },
    });

    render(React.createElement(SettingsBillingPanel));
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });

  it("renders an admin-only notice for non-admin members", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });

    render(React.createElement(SettingsBillingPanel));

    expect(
      screen.getByText(/ask an organization admin to manage billing for this workspace/i),
    ).toBeInTheDocument();
  });
});

describe("isAllowedBillingUrl", () => {
  it("rejects malformed billing redirect URLs", () => {
    expect(isAllowedBillingUrl("http://[not-a-url")).toBe(false);
  });
});

describe("SettingsBillingRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteUseSearch.mockReturnValue({ checkout: "success" });
  });

  it("redirects the legacy billing route to the billing settings panel", async () => {
    render(React.createElement(SettingsBillingRedirect));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/settings",
        hash: "billing",
        search: { checkout: "success" },
        replace: true,
      });
    });
  });
});

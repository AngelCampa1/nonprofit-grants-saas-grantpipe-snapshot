import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const hoisted = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockQueryClientCancelQueries: vi.fn().mockResolvedValue(undefined),
  mockQueryClientClear: vi.fn(),
  mockResetAnalytics: vi.fn(),
  mockIdentifyUser: vi.fn(),
  mockToggleSidebar: vi.fn(),
  mockAiCsSupportWidget: vi.fn(),
  mockCaptureAppException: vi.fn(),
}));

const mockUseSession = vi.fn();
const mockUsePaywall = vi.fn();
const mockStartPaywallCheckout = vi.fn();
const mockNavigate = vi.fn();
const locationState = { pathname: "/dashboard" };
let originalAssign: typeof window.location.assign;

vi.mock("../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../hooks/use-paywall", () => ({
  usePaywall: () => mockUsePaywall(),
}));

vi.mock("../hooks/use-org-settings", () => ({
  useBillingCheckoutMutation: () => ({
    mutateAsync: mockStartPaywallCheckout,
    isPending: false,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  Link: ({
    children,
    to,
    hash,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; hash?: string }) =>
    React.createElement("a", { href: `${to ?? ""}${hash ? `#${hash}` : ""}`, ...props }, children),
  Outlet: () => React.createElement("div", { "data-testid": "outlet" }, "outlet content"),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: locationState.pathname }),
}));

vi.mock("../lib/auth-client", () => ({
  signOut: hoisted.mockSignOut,
}));

vi.mock("../components/shell/user-menu", () => ({
  UserMenu: ({ onSignOut }: { onSignOut: () => void }) =>
    React.createElement(
      "button",
      { "data-testid": "sign-out-btn", onClick: onSignOut },
      "Sign out",
    ),
}));

vi.mock("../components/shell/app-topbar", () => ({
  AppTopbar: ({
    onOpenCommandPalette,
    onOpenMobileNav,
    statusSlot,
  }: {
    onOpenCommandPalette?: () => void;
    onOpenMobileNav?: () => void;
    statusSlot?: React.ReactNode;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "app-topbar" },
      statusSlot,
      React.createElement(
        "button",
        { "data-testid": "open-command-palette", onClick: onOpenCommandPalette },
        "palette",
      ),
      React.createElement(
        "button",
        { "data-testid": "open-mobile-nav", onClick: onOpenMobileNav },
        "nav",
      ),
    ),
}));

vi.mock("../components/shell/mobile-nav", () => ({
  MobileNav: () => null,
}));

vi.mock("../components/shell/command-palette", () => ({
  CommandPalette: () => null,
}));

vi.mock("../components/shell/app-shell", () => ({
  AppShell: ({
    children,
    sidebar,
    topbar,
    beforeMain,
    afterMain,
  }: {
    children: React.ReactNode;
    sidebar?: React.ReactNode;
    topbar?: React.ReactNode;
    beforeMain?: React.ReactNode;
    afterMain?: React.ReactNode;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "app-shell" },
      sidebar,
      topbar,
      beforeMain,
      children,
      afterMain,
    ),
}));

vi.mock("../components/shell/app-sidebar", () => ({
  AppSidebar: ({ footer }: { footer?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "app-sidebar" }, "sidebar", footer),
}));

vi.mock("../components/feedback-widget", () => ({
  FeedbackWidget: () => null,
}));

vi.mock("../components/crm-feedback-widget", () => ({
  CrmFeedbackWidget: () => null,
}));

vi.mock("../components/ai-cs-support-widget", () => ({
  AiCsSupportWidget: (props: { userId: string; orgId: string | null; currentPath: string }) => {
    hoisted.mockAiCsSupportWidget(props);
    return null;
  },
}));

vi.mock("../components/trial-banner", () => ({
  TrialBanner: ({ canManageBilling }: { canManageBilling?: boolean }) =>
    React.createElement(
      "div",
      { "data-testid": "trial-banner", "data-can-manage-billing": String(canManageBilling) },
      "trial",
    ),
}));

vi.mock("../components/sample-data-banner", () => ({
  SampleDataBanner: () => null,
}));

vi.mock("../hooks/use-command-palette", () => ({
  useCommandPalette: () => ({ open: false, setOpen: vi.fn() }),
}));

vi.mock("../hooks/use-sidebar-collapse", () => ({
  useSidebarCollapse: () => ({ collapsed: false, toggle: hoisted.mockToggleSidebar }),
}));

vi.mock("../main", () => ({
  queryClient: {
    cancelQueries: hoisted.mockQueryClientCancelQueries,
    clear: hoisted.mockQueryClientClear,
    invalidateQueries: vi.fn(),
  },
}));

const mockCaptureEvent = vi.fn();
const mockConsumePendingAnalyticsEvents = vi.fn<
  () => Array<{ event: string; properties?: Record<string, unknown> }>
>(() => []);
const mockHasPendingEventMarker = vi.fn<() => boolean>(() => true);
const mockClearPendingEventMarker = vi.fn();
vi.mock("../lib/analytics", () => ({
  POSTHOG_PENDING_EVENT_KEY: "posthog_pending_event",
  resetAnalytics: hoisted.mockResetAnalytics,
  identifyUser: hoisted.mockIdentifyUser,
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
  consumePendingAnalyticsEvents: (...args: unknown[]) =>
    mockConsumePendingAnalyticsEvents(...(args as [])),
  hasPendingEventMarker: (...args: unknown[]) => mockHasPendingEventMarker(...(args as [])),
  clearPendingEventMarker: (...args: unknown[]) => mockClearPendingEventMarker(...(args as [])),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => hoisted.mockCaptureAppException(...args),
}));

import { Route as AuthenticatedRoute } from "./_authenticated";
import { ACTIVE_ORG_STORAGE_KEY } from "../lib/org-context";

const Route = AuthenticatedRoute;
const AuthenticatedLayout = (AuthenticatedRoute as unknown as { component: React.ComponentType })
  .component as React.ComponentType;
const AuthenticatedNotFound = (
  AuthenticatedRoute as unknown as { notFoundComponent: React.ComponentType }
).notFoundComponent as React.ComponentType;

function authenticatedSession(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "u1", name: "Angel Campa", email: "angel@grantpipe.com" },
    isLoading: false,
    orgId: "org1",
    memberRole: "admin",
    contextError: null,
    onboardingCompleted: true,
    planSelectionCompleted: true,
    hasLoadedContext: true,
    orgSubscription: {
      subscriptionStatus: "active",
      trialEndsAt: null,
      planTier: "growth",
      onboardingCompleted: true,
      planSelectedAt: "2026-04-20T00:00:00.000Z",
      stripeSubscriptionId: "sub_123",
    },
    ...overrides,
  };
}

describe("AuthenticatedLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumePendingAnalyticsEvents.mockReturnValue([]);
    mockHasPendingEventMarker.mockReturnValue(true);
    mockStartPaywallCheckout.mockResolvedValue({ url: "https://checkout.stripe.com/cs_test" });
    originalAssign = window.location.assign;
    Object.defineProperty(window.location, "assign", {
      configurable: true,
      value: vi.fn(),
    });
    sessionStorage.clear();
    localStorage.clear();
    locationState.pathname = "/dashboard";
    mockUseSession.mockReturnValue(authenticatedSession());
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "active" },
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    Object.defineProperty(window.location, "assign", {
      configurable: true,
      value: originalAssign,
    });
  });

  it("shows the shell skeleton while auth is loading", () => {
    mockUseSession.mockReturnValue({
      user: null,
      isLoading: true,
      memberRole: null,
      contextError: null,
      onboardingCompleted: false,
      planSelectionCompleted: false,
    });

    render(<AuthenticatedLayout />);

    expect(document.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });

  it("redirects to login when no user is present", () => {
    mockUseSession.mockReturnValue({
      user: null,
      isLoading: false,
      memberRole: null,
      contextError: null,
      onboardingCompleted: false,
      planSelectionCompleted: false,
    });

    render(<AuthenticatedLayout />);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
  });

  it("renders the authenticated shell when setup is complete", () => {
    render(<AuthenticatedLayout />);

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("trial-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("passes active org context to the AI-CS support widget", async () => {
    render(<AuthenticatedLayout />);

    await waitFor(() => {
      expect(hoisted.mockAiCsSupportWidget).toHaveBeenCalled();
    });
    expect(hoisted.mockAiCsSupportWidget.mock.calls[0]?.[0]).toMatchObject({
      userId: "u1",
      orgId: "org1",
      currentPath: "/dashboard",
    });
  });

  it("mounts the AI-CS support widget on the minimal-shell onboarding/plan screens", () => {
    for (const pathname of ["/onboarding", "/select-plan", "/confirm-plan"]) {
      hoisted.mockAiCsSupportWidget.mockClear();
      locationState.pathname = pathname;

      const { unmount } = render(<AuthenticatedLayout />);

      expect(screen.getByTestId("outlet")).toBeInTheDocument();
      expect(hoisted.mockAiCsSupportWidget).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u1", orgId: "org1", currentPath: pathname }),
      );
      unmount();
    }
  });

  it("mounts the AI-CS support widget on the paywall (billing blocked) screen", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "trial_expired" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Start billing to keep using GrantPipe")).toBeInTheDocument();
    expect(hoisted.mockAiCsSupportWidget).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", orgId: "org1" }),
    );
  });

  it("mounts the AI-CS support widget on the 'still being set up' screen", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        memberRole: "viewer",
        onboardingCompleted: false,
      }),
    );

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Your workspace is still being set up")).toBeInTheDocument();
    expect(hoisted.mockAiCsSupportWidget).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", orgId: "org1" }),
    );
  });

  it("renders trial status in the topbar for active trials", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "trialing", daysRemaining: 14, trialEndsAt: new Date() },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByTestId("trial-banner")).toHaveAttribute("data-can-manage-billing", "true");
    expect(screen.getByTestId("app-topbar")).toContainElement(screen.getByTestId("trial-banner"));
  });

  it("does not render active trial status in the beforeMain slot", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "trialing", daysRemaining: 14, trialEndsAt: new Date() },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    const shell = screen.getByTestId("app-shell");
    const topbar = screen.getByTestId("app-topbar");
    expect(topbar).toContainElement(screen.getByTestId("trial-banner"));
    expect(shell.childNodes[2]).not.toBe(screen.getByTestId("trial-banner"));
  });

  it("uses the minimal shell on select-plan", () => {
    locationState.pathname = "/select-plan";

    render(<AuthenticatedLayout />);

    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.queryByText("Billing action required")).not.toBeInTheDocument();
  });

  it("redirects a not-onboarded admin org to onboarding", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        onboardingCompleted: false,
        planSelectionCompleted: true,
      }),
    );

    render(<AuthenticatedLayout />);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
  });

  it("allows a not-onboarded admin to continue through import activation", () => {
    locationState.pathname = "/import";
    mockUseSession.mockReturnValue(
      authenticatedSession({
        onboardingCompleted: false,
        planSelectionCompleted: true,
      }),
    );

    render(<AuthenticatedLayout />);

    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/onboarding" });
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("allows a not-onboarded admin to continue through first-record activation", () => {
    locationState.pathname = "/donors";
    mockUseSession.mockReturnValue(
      authenticatedSession({
        onboardingCompleted: false,
        planSelectionCompleted: true,
      }),
    );

    render(<AuthenticatedLayout />);

    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/onboarding" });
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("redirects an onboarded admin without plan selection to select-plan", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        onboardingCompleted: true,
        planSelectionCompleted: false,
      }),
    );

    render(<AuthenticatedLayout />);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/select-plan" });
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/onboarding" });
    // Regression: the guard must send a no-plan trial to the real picker, never
    // bounce it straight to billing settings (the old /select-plan stub did that,
    // trapping trial users at /settings#billing after they seeded sample data).
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "/settings" }),
    );
  });

  it("does not let no-plan admins bypass plan selection through settings routes", () => {
    locationState.pathname = "/settings/team";
    mockUseSession.mockReturnValue(
      authenticatedSession({
        onboardingCompleted: true,
        planSelectionCompleted: false,
      }),
    );

    render(<AuthenticatedLayout />);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/select-plan" });
  });

  it("does not redirect invited members to /onboarding or /select-plan — shows setup screen instead", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        memberRole: "editor",
        onboardingCompleted: false,
        planSelectionCompleted: false,
      }),
    );

    render(<AuthenticatedLayout />);

    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/select-plan" });
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/onboarding" });
    // FIX 2: non-admins in un-onboarded orgs see the blocking setup screen
    expect(screen.getByText("Your workspace is still being set up")).toBeInTheDocument();
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  // FIX 1 — WEB-SHELL-03: paywall evaluated before minimal-shell early return
  it("shows paywall screen for a blocked (trial_expired) user navigating to /confirm-plan", () => {
    locationState.pathname = "/confirm-plan";
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "trial_expired" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Start billing to keep using GrantPipe")).toBeInTheDocument();
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("shows paywall screen for a blocked user navigating to /onboarding", () => {
    locationState.pathname = "/onboarding";
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "subscription_canceled" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Billing action required")).toBeInTheDocument();
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("shows minimal-shell outlet for an ALLOWED trialing user on /confirm-plan", () => {
    locationState.pathname = "/confirm-plan";
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "trialing", daysRemaining: 7, trialEndsAt: new Date() },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.queryByText("Your free trial has ended")).not.toBeInTheDocument();
  });

  // FIX 2 — WEB-SHELL-05: non-admin in un-onboarded org sees blocking screen
  it("shows 'still being set up' screen for a viewer in an un-onboarded org", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        memberRole: "viewer",
        onboardingCompleted: false,
      }),
    );
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "active" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Your workspace is still being set up")).toBeInTheDocument();
    expect(screen.queryByTestId("app-sidebar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("signs out from the 'still being set up' screen when Sign out is clicked", async () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        memberRole: "viewer",
        onboardingCompleted: false,
      }),
    );
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "active" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(hoisted.mockSignOut).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
    });
  });

  it("does not show 'still being set up' screen for an admin in an un-onboarded org", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        memberRole: "admin",
        onboardingCompleted: false,
      }),
    );
    mockUsePaywall.mockReturnValue({
      state: { allowed: true, status: "active" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.queryByText("Your workspace is still being set up")).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
  });

  it("renders an admin billing recovery screen that points to the billing settings panel", () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "subscription_canceled" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Billing action required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start billing" })).toHaveAttribute(
      "href",
      "/settings#billing",
    );
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("lets blocked admins access settings routes for billing recovery", () => {
    locationState.pathname = "/settings/billing";
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "subscription_canceled" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.queryByText("Billing action required")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trial-banner")).not.toBeInTheDocument();
  });

  it("starts paywall checkout from the expired-trial wall for admins", async () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        orgSubscription: {
          subscriptionStatus: "trialing",
          trialEndsAt: "2026-06-01T00:00:00.000Z",
          planTier: "audit_ready",
          onboardingCompleted: true,
          planSelectedAt: "2026-04-20T00:00:00.000Z",
          stripeSubscriptionId: null,
        },
      }),
    );
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "trial_expired" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Start billing to keep using GrantPipe")).toBeInTheDocument();
    expect(
      screen.getByText("Your free trial ended. Start the Audit-Ready annual plan to get back in."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Audit-Ready annual" }));

    await waitFor(() => {
      expect(mockStartPaywallCheckout).toHaveBeenCalledWith({
        planTier: "audit_ready",
        billingCycle: "annual",
        surface: "paywall",
      });
      expect(window.location.assign).toHaveBeenCalledWith("https://checkout.stripe.com/cs_test");
    });
  });

  it("falls back to Growth annual when expired-trial plan data is invalid", async () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        orgSubscription: {
          subscriptionStatus: "trialing",
          trialEndsAt: "2026-06-01T00:00:00.000Z",
          planTier: "legacy_invalid",
          onboardingCompleted: true,
          planSelectedAt: "2026-04-20T00:00:00.000Z",
          stripeSubscriptionId: null,
        },
      }),
    );
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "trial_expired" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(
      screen.getByText("Your free trial ended. Start the Growth annual plan to get back in."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Growth annual" }));

    await waitFor(() => {
      expect(mockStartPaywallCheckout).toHaveBeenCalledWith({
        planTier: "growth",
        billingCycle: "annual",
        surface: "paywall",
      });
    });
  });

  it("shows recovery copy when expired-trial checkout cannot start", async () => {
    mockStartPaywallCheckout.mockRejectedValue(new Error("checkout failed"));
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "trial_expired" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Start Growth annual" }));

    expect(
      await screen.findByText("Unable to start checkout. Try again or start billing in Settings."),
    ).toHaveTextContent("Unable to start checkout. Try again or start billing in Settings.");
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("reports and blocks unsafe paywall checkout redirect URLs", async () => {
    mockStartPaywallCheckout.mockResolvedValue({ url: "https://evil.example/checkout" });
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "trial_expired" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Start Growth annual" }));

    expect(
      await screen.findByText("Unable to start checkout. Try again or start billing in Settings."),
    ).toBeInTheDocument();
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(hoisted.mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: {
          source: "billing",
          feature: "billing",
          operation: "paywall_checkout_redirect",
        },
        extra: { hasUrl: true },
      }),
      { sanitize: true },
    );
    expect(JSON.stringify(hoisted.mockCaptureAppException.mock.calls)).not.toContain(
      "evil.example",
    );
  });

  it("shows non-admin blocked message without add-billing link for viewer role", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        memberRole: "viewer",
      }),
    );
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "subscription_canceled" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Billing action required")).toBeInTheDocument();
    expect(
      screen.getByText("Ask an admin to add billing. They can get you back in."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start billing" })).not.toBeInTheDocument();
  });

  it("renders session error screen with sign-in button when sessionError is set", () => {
    mockUseSession.mockReturnValue({
      user: null,
      isLoading: false,
      memberRole: null,
      contextError: null,
      onboardingCompleted: false,
      planSelectionCompleted: false,
      error: new Error("session expired"),
    });

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Session expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("retries the session fetch when the session-error 'Try again' button is clicked", () => {
    const refetchSession = vi.fn();
    mockUseSession.mockReturnValue({
      user: null,
      isLoading: false,
      memberRole: null,
      contextError: null,
      onboardingCompleted: false,
      planSelectionCompleted: false,
      error: new Error("get-session failed"),
      refetchSession,
    });

    render(<AuthenticatedLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(refetchSession).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/login" });
  });

  it("navigates to login when the session-error 'Sign in' button is clicked", async () => {
    mockUseSession.mockReturnValue({
      user: null,
      isLoading: false,
      memberRole: null,
      contextError: null,
      onboardingCompleted: false,
      planSelectionCompleted: false,
      error: new Error("session expired"),
    });

    render(<AuthenticatedLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
    });
  });

  it("renders the context error UI with a retry button when contextError is set", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        contextError: new Error("session context fetch failed"),
      }),
    );

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("invalidates auth session query when retry is clicked", async () => {
    const mockInvalidateQueries = vi.fn();
    const { queryClient } = await import("../main");
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(mockInvalidateQueries);

    mockUseSession.mockReturnValue(
      authenticatedSession({
        contextError: new Error("session context fetch failed"),
      }),
    );

    render(<AuthenticatedLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["auth-session-context"],
      });
    });
  });

  it("clears a stale active org before retrying session context", async () => {
    const mockInvalidateQueries = vi.fn();
    const { queryClient } = await import("../main");
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(mockInvalidateQueries);
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, "stale-org");

    mockUseSession.mockReturnValue(
      authenticatedSession({
        contextError: new Error("session context fetch failed"),
      }),
    );

    render(<AuthenticatedLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["auth-session-context"],
      });
    });
    expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBeNull();
  });

  it("toggles the sidebar when Ctrl+B is pressed", () => {
    render(<AuthenticatedLayout />);

    fireEvent.keyDown(window, { ctrlKey: true, key: "b" });

    expect(hoisted.mockToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("does not toggle the sidebar for unrelated key presses", () => {
    render(<AuthenticatedLayout />);

    fireEvent.keyDown(window, { key: "b" });
    fireEvent.keyDown(window, { ctrlKey: true, key: "k" });

    expect(hoisted.mockToggleSidebar).not.toHaveBeenCalled();
  });

  it("renders shell with empty strings when user name and email are null", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        user: { id: "u2", name: null, email: null },
        memberRole: null,
        orgSubscription: null,
      }),
    );

    render(<AuthenticatedLayout />);

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
  });

  it("removes the keyboard listener on unmount", () => {
    const { unmount } = render(<AuthenticatedLayout />);

    unmount();

    // After unmount the listener is cleaned up — subsequent keydown should not fire toggle
    fireEvent.keyDown(window, { ctrlKey: true, key: "b" });
    expect(hoisted.mockToggleSidebar).not.toHaveBeenCalled();
  });

  it("uses / as the effective pathname when the URL is the bare root", () => {
    locationState.pathname = "/";
    mockUseSession.mockReturnValue(
      authenticatedSession({
        onboardingCompleted: false,
        planSelectionCompleted: true,
      }),
    );

    render(<AuthenticatedLayout />);

    // / is not /onboarding so admin should be redirected there
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
  });

  it("clears local state and redirects to login even when signOut throws", async () => {
    hoisted.mockSignOut.mockRejectedValueOnce(new Error("network error"));
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, "org-42");

    render(<AuthenticatedLayout />);

    fireEvent.click(screen.getByTestId("sign-out-btn"));

    await waitFor(() => {
      expect(hoisted.mockQueryClientCancelQueries).toHaveBeenCalledTimes(1);
      expect(hoisted.mockQueryClientClear).toHaveBeenCalledTimes(1);
      expect(hoisted.mockResetAnalytics).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
    });
    expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBeNull();
  });

  it("opens the command palette when the topbar button is clicked", () => {
    render(<AuthenticatedLayout />);

    fireEvent.click(screen.getByTestId("open-command-palette"));

    // commandPalette.setOpen is from the useCommandPalette mock — just verify no crash
    expect(screen.getByTestId("app-topbar")).toBeInTheDocument();
  });

  it("opens mobile nav when the topbar nav button is clicked", () => {
    render(<AuthenticatedLayout />);

    fireEvent.click(screen.getByTestId("open-mobile-nav"));

    expect(screen.getByTestId("app-topbar")).toBeInTheDocument();
  });

  it("signs out from the paywall screen when sign-out button is clicked", async () => {
    mockUsePaywall.mockReturnValue({
      state: { allowed: false, reason: "trial_expired" },
      isLoading: false,
      isError: false,
    });

    render(<AuthenticatedLayout />);

    const signOutBtn = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(hoisted.mockResetAnalytics).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
    });
  });

  it("calls identifyUser with the correct properties when session loads", () => {
    render(<AuthenticatedLayout />);

    expect(hoisted.mockIdentifyUser).toHaveBeenCalledWith("u1", {
      email: "angel@grantpipe.com",
      name: "Angel Campa",
      orgId: "org1",
      member_role: "admin",
      plan_tier: "growth",
      subscription_status: "active",
    });
  });

  it("does not call identifyUser when user is null", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        user: null,
        isLoading: false,
        orgId: "org1",
      }),
    );

    render(<AuthenticatedLayout />);

    expect(hoisted.mockIdentifyUser).not.toHaveBeenCalled();
  });

  it("does not call identifyUser when orgId is null", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        orgId: null,
      }),
    );

    render(<AuthenticatedLayout />);

    expect(hoisted.mockIdentifyUser).not.toHaveBeenCalled();
  });

  it("flushes a pending analytics event after user is identified", () => {
    mockConsumePendingAnalyticsEvents.mockReturnValue([
      { event: "login_completed", properties: { method: "google" } },
    ]);

    render(<AuthenticatedLayout />);

    expect(mockConsumePendingAnalyticsEvents).toHaveBeenCalled();
    expect(mockCaptureEvent).toHaveBeenCalledWith("login_completed", { method: "google" });
  });

  it("flushes multiple pending analytics events after user is identified", () => {
    mockConsumePendingAnalyticsEvents.mockReturnValue([
      { event: "signup_completed", properties: { method: "google" } },
      {
        event: "outbound_signup_completed",
        properties: { method: "google", ve_campaign_id: "cmp_123" },
      },
    ]);

    render(<AuthenticatedLayout />);

    expect(mockCaptureEvent).toHaveBeenCalledWith("signup_completed", { method: "google" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("outbound_signup_completed", {
      method: "google",
      ve_campaign_id: "cmp_123",
    });
  });

  it("captures a pending event that has no properties", () => {
    mockConsumePendingAnalyticsEvents.mockReturnValue([{ event: "signup_completed" }]);

    render(<AuthenticatedLayout />);

    expect(mockCaptureEvent).toHaveBeenCalledWith("signup_completed", undefined);
  });

  it("fires nothing when there are no pending events", () => {
    mockConsumePendingAnalyticsEvents.mockReturnValue([]);

    expect(() => render(<AuthenticatedLayout />)).not.toThrow();
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("strips the OAuth-return marker after firing a pending event", () => {
    mockConsumePendingAnalyticsEvents.mockReturnValue([
      { event: "login_completed", properties: { method: "google" } },
    ]);

    render(<AuthenticatedLayout />);

    expect(mockCaptureEvent).toHaveBeenCalledWith("login_completed", { method: "google" });
    expect(mockClearPendingEventMarker).toHaveBeenCalledTimes(1);
  });

  it("does NOT drain or fire a pending event on an authenticated load without the OAuth-return marker", () => {
    // A pending event left in shared localStorage by an abandoned OAuth attempt
    // in another tab must not be drained on an unrelated authenticated load
    // (org switch / plan load / remount) that lacks the return marker.
    mockHasPendingEventMarker.mockReturnValue(false);
    mockConsumePendingAnalyticsEvents.mockReturnValue([
      { event: "signup_completed", properties: { method: "google" } },
    ]);

    render(<AuthenticatedLayout />);

    expect(mockConsumePendingAnalyticsEvents).not.toHaveBeenCalled();
    expect(mockCaptureEvent).not.toHaveBeenCalled();
    expect(mockClearPendingEventMarker).not.toHaveBeenCalled();
  });

  it("does not consume pending events when user is null", () => {
    mockUseSession.mockReturnValue(
      authenticatedSession({
        user: null,
        isLoading: false,
        orgId: "org1",
      }),
    );

    render(<AuthenticatedLayout />);

    expect(mockConsumePendingAnalyticsEvents).not.toHaveBeenCalled();
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("re-calls identifyUser when memberRole changes", () => {
    const { rerender } = render(<AuthenticatedLayout />);
    expect(hoisted.mockIdentifyUser).toHaveBeenCalledTimes(1);

    mockUseSession.mockReturnValue(authenticatedSession({ memberRole: "editor" }));
    rerender(<AuthenticatedLayout />);

    expect(hoisted.mockIdentifyUser).toHaveBeenCalledTimes(2);
    expect(hoisted.mockIdentifyUser).toHaveBeenLastCalledWith(
      "u1",
      expect.objectContaining({ member_role: "editor" }),
    );
  });

  it("re-calls identifyUser when plan tier changes", () => {
    const { rerender } = render(<AuthenticatedLayout />);
    expect(hoisted.mockIdentifyUser).toHaveBeenCalledTimes(1);

    mockUseSession.mockReturnValue(
      authenticatedSession({
        orgSubscription: {
          subscriptionStatus: "active",
          trialEndsAt: null,
          planTier: "audit_ready",
          onboardingCompleted: true,
          planSelectedAt: "2026-04-20T00:00:00.000Z",
          stripeSubscriptionId: "sub_123",
        },
      }),
    );
    rerender(<AuthenticatedLayout />);

    expect(hoisted.mockIdentifyUser).toHaveBeenCalledTimes(2);
    expect(hoisted.mockIdentifyUser).toHaveBeenLastCalledWith(
      "u1",
      expect.objectContaining({ plan_tier: "audit_ready" }),
    );
  });

  it("clears local state and redirects to login on sign-out", async () => {
    render(<AuthenticatedLayout />);

    fireEvent.click(screen.getByTestId("sign-out-btn"));

    await waitFor(() => {
      expect(hoisted.mockQueryClientCancelQueries).toHaveBeenCalledTimes(1);
      expect(hoisted.mockQueryClientClear).toHaveBeenCalledTimes(1);
      expect(hoisted.mockResetAnalytics).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
    });
  });
});

describe("AuthenticatedNotFound", () => {
  it("links back to the dashboard", () => {
    render(<AuthenticatedNotFound />);

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});

describe("Route error component", () => {
  it("renders the route error boundary with the failed-route message", () => {
    const routeConfig = Route as unknown as {
      errorComponent: (props: { error: unknown }) => React.ReactElement;
    };

    render(routeConfig.errorComponent({ error: new Error("Authenticated route blew up") }));

    expect(screen.getByTestId("route-error-boundary")).toBeInTheDocument();
    expect(screen.getByText("Authenticated route blew up")).toBeInTheDocument();
  });
});

import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { DEFAULT_BILLING_CYCLE, PLAN_LABELS, type SelfServePlanTier } from "@grantpipe/shared";

import { useSidebarCollapse } from "../hooks/use-sidebar-collapse";

import { Button, Skeleton } from "@grantpipe/ui";

import { AppNotFound } from "../components/app-not-found";
import { RouteErrorBoundary } from "../components/route-error-boundary";
import { AppShell } from "../components/shell/app-shell";
import { AppSidebar } from "../components/shell/app-sidebar";
import { AppTopbar } from "../components/shell/app-topbar";
import { NotificationBell } from "../components/shell/notification-bell";
import { CommandPalette } from "../components/shell/command-palette";
import { MobileNav } from "../components/shell/mobile-nav";
import { UserMenu } from "../components/shell/user-menu";
import { CrmFeedbackWidget } from "../components/crm-feedback-widget";
import { SilentErrorBoundary } from "../components/silent-error-boundary";
import { reportAiCsWidgetLoadFailure } from "../lib/ai-cs-analytics";
const AiCsSupportWidget = lazy(() =>
  import("../components/ai-cs-support-widget").then((m) => ({ default: m.AiCsSupportWidget })),
);
import { SampleDataBanner } from "../components/sample-data-banner";
import { TrialBanner } from "../components/trial-banner";
import { useCommandPalette } from "../hooks/use-command-palette";
import { useBillingCheckoutMutation } from "../hooks/use-org-settings";
import { usePaywall } from "../hooks/use-paywall";
import { useSession } from "../hooks/use-session";
import { getBlockedBillingCopy } from "../lib/billing-checkout-copy";
import { isAllowedBillingUrl } from "../lib/billing-redirect";
import { signOut } from "../lib/auth-client";
import {
  captureEvent,
  clearPendingEventMarker,
  consumePendingAnalyticsEvents,
  hasPendingEventMarker,
  identifyUser,
  resetAnalytics,
} from "../lib/analytics";
import { clearActiveOrgSelection } from "../lib/org-context";
import { captureAppException } from "../lib/sentry";
import { queryClient } from "../main";
import type { AppRole } from "../config/nav";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
  notFoundComponent: AppNotFound,
  errorComponent: (props) => <RouteErrorBoundary {...props} source="authenticated-route" />,
});

function ShellSkeleton() {
  return (
    <div className="grid min-h-screen grid-cols-[var(--spacing-layout-sidebar)_minmax(0,1fr)] bg-background">
      <div className="hidden h-screen flex-col gap-3 border-r border-border bg-card p-4 md:flex">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-4 h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
      <div className="flex min-h-screen flex-col">
        <div className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="mb-4 h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}

const SELF_SERVE_CHECKOUT_PLAN_TIERS = [
  "starter",
  "growth",
  "audit_ready",
] as const satisfies readonly SelfServePlanTier[];

const PRE_ACTIVATION_ROUTES = ["/onboarding", "/import", "/donors"] as const;

function isSelfServeCheckoutPlan(
  planTier: string | null | undefined,
): planTier is SelfServePlanTier {
  return (
    typeof planTier === "string" &&
    SELF_SERVE_CHECKOUT_PLAN_TIERS.includes(planTier as SelfServePlanTier)
  );
}

function getExpiredTrialCheckoutPlan(planTier: string | null | undefined): SelfServePlanTier {
  if (isSelfServeCheckoutPlan(planTier)) {
    return planTier;
  }

  return "growth";
}

function AuthenticatedLayout() {
  const sessionState = useSession();
  const {
    user,
    isLoading,
    orgId,
    memberRole,
    memberPermissions,
    activeEntity,
    availableEntities,
    orgSubscription,
    contextError,
    error: sessionError,
    refetchSession,
    onboardingCompleted,
    planSelectionCompleted,
  } = sessionState;
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paywallCheckoutError, setPaywallCheckoutError] = useState<string | null>(null);
  const commandPalette = useCommandPalette();
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapse();
  const paywall = usePaywall({ enabled: user != null });
  const startCheckout = useBillingCheckoutMutation();

  useEffect(() => {
    if (!isLoading && !user && !sessionError) {
      void navigate({ to: "/login" });
    }
  }, [isLoading, user, sessionError, navigate]);

  useEffect(() => {
    if (isLoading || !user || memberRole !== "admin") {
      return;
    }

    const pathname = location.pathname.replace(/\/+$/, "") || "/";
    const isPreActivationRoute = PRE_ACTIVATION_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );

    if (!onboardingCompleted && !isPreActivationRoute) {
      void navigate({ to: "/onboarding" });
    }
  }, [isLoading, user, memberRole, location.pathname, navigate, onboardingCompleted]);

  useEffect(() => {
    if (isLoading || !user || memberRole !== "admin" || !onboardingCompleted) {
      return;
    }

    const pathname = location.pathname.replace(/\/+$/, "") || "/";
    const isPlanSelectionRoute = pathname === "/select-plan" || pathname === "/confirm-plan";

    if (!planSelectionCompleted && !isPlanSelectionRoute) {
      void navigate({ to: "/select-plan" });
    }
  }, [
    isLoading,
    user,
    memberRole,
    location.pathname,
    navigate,
    onboardingCompleted,
    planSelectionCompleted,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  useEffect(() => {
    if (!user || orgId == null) return;
    identifyUser(user.id, {
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      orgId,
      activeEntityId: activeEntity?.id,
      member_role: memberRole ?? undefined,
      plan_tier: orgSubscription?.planTier ?? undefined,
      subscription_status: orgSubscription?.subscriptionStatus ?? undefined,
    });
    // Replay pending signup/login-completion events captured before an OAuth
    // redirect, but ONLY on the genuine OAuth return that set them — detected by
    // the marker query param on the callback URL. localStorage is shared across
    // tabs, so without this gate an abandoned attempt in one tab could be drained
    // and mis-attributed on an unrelated authenticated load (org switch, plan
    // load, remount) in another tab. Strip the marker after firing so it does not
    // re-fire on subsequent renders (consume is one-shot; the marker bounds it to
    // this tab and this return).
    if (hasPendingEventMarker()) {
      for (const { event, properties } of consumePendingAnalyticsEvents()) {
        captureEvent(event, properties);
      }
      clearPendingEventMarker();
    }
  }, [
    user,
    orgId,
    activeEntity?.id,
    memberRole,
    orgSubscription?.planTier,
    orgSubscription?.subscriptionStatus,
  ]);

  if (isLoading) return <ShellSkeleton />;
  if (sessionError) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-foreground">Session expired</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              We couldn&apos;t verify your session. Please sign in again to continue.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                onClick={() => {
                  void refetchSession?.();
                }}
              >
                Try again
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void navigate({ to: "/login" });
                }}
              >
                Sign in
              </Button>
            </div>
          </div>
        </div>
        <Toaster richColors position="top-right" />
      </>
    );
  }
  if (!user) return null;
  if (contextError) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">Something went wrong. Please try again.</p>
            <Button
              variant="ghost"
              className="h-auto p-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => {
                clearActiveOrgSelection();
                void queryClient.invalidateQueries({ queryKey: ["auth-session-context"] });
              }}
            >
              Retry
            </Button>
          </div>
        </div>
        <Toaster richColors position="top-right" />
      </>
    );
  }

  const isOnboarding = location.pathname.replace(/\/+$/, "") === "/onboarding";
  const isSelectPlan = location.pathname.replace(/\/+$/, "") === "/select-plan";
  const isConfirmPlan = location.pathname.replace(/\/+$/, "") === "/confirm-plan";
  const isSettingsRoute = location.pathname.replace(/\/+$/, "").startsWith("/settings");
  const userRole = (memberRole ?? undefined) as AppRole | undefined;
  const canAccessBlockedRecoveryRoute = isSettingsRoute && userRole === "admin";
  const showTrialStatus = paywall.state?.allowed === true && paywall.state.status === "trialing";

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // signOut failure is non-fatal — always clear local state and redirect
    } finally {
      await queryClient.cancelQueries();
      queryClient.clear();
      clearActiveOrgSelection();
      resetAnalytics();
      await navigate({ to: "/login" });
    }
  };

  const userMenu = (
    <UserMenu
      name={user.name ?? ""}
      email={user.email ?? ""}
      onSignOut={() => void handleSignOut()}
      showSettings={userRole === "admin"}
      currentOrgId={orgId ?? undefined}
      activeEntityId={activeEntity?.id}
      availableEntities={availableEntities}
    />
  );
  const topbarUserMenu = (
    <UserMenu
      name={user.name ?? ""}
      email={user.email ?? ""}
      onSignOut={() => void handleSignOut()}
      showSettings={userRole === "admin"}
      currentOrgId={orgId ?? undefined}
      activeEntityId={activeEntity?.id}
      availableEntities={availableEntities}
      compact
    />
  );

  // Confused new users live on the paywall, onboarding, and plan-selection
  // screens — exactly where in-app help matters most — so the support widget
  // rides along on every authenticated surface, not just the full shell.
  const supportWidget = (
    <SilentErrorBoundary source="ai-cs-support-widget" onError={reportAiCsWidgetLoadFailure}>
      <Suspense fallback={null}>
        <AiCsSupportWidget userId={user.id} orgId={orgId} currentPath={location.pathname} />
      </Suspense>
    </SilentErrorBoundary>
  );

  if (paywall.state && !paywall.state.allowed && !canAccessBlockedRecoveryRoute) {
    const checkoutPlanTier = getExpiredTrialCheckoutPlan(orgSubscription?.planTier);
    const blockedCopy = getBlockedBillingCopy({
      reason: paywall.state.reason,
      isAdmin: userRole === "admin",
      checkoutPlanLabel: PLAN_LABELS[checkoutPlanTier],
    });
    const handlePaywallCheckout = async () => {
      setPaywallCheckoutError(null);
      let hasUrl = false;
      try {
        const result = await startCheckout.mutateAsync({
          planTier: checkoutPlanTier,
          billingCycle: DEFAULT_BILLING_CYCLE,
          surface: "paywall",
        });
        hasUrl = typeof result.url === "string" && result.url.length > 0;
        if (!result.url || !isAllowedBillingUrl(result.url)) {
          throw new Error("Invalid billing checkout redirect URL");
        }
        window.location.assign(result.url);
      } catch (error) {
        captureAppException(
          error,
          {
            tags: {
              source: "billing",
              feature: "billing",
              operation: "paywall_checkout_redirect",
            },
            extra: { hasUrl },
          },
          { sanitize: true },
        );
        setPaywallCheckoutError(
          "Unable to start checkout. Try again or start billing in Settings.",
        );
      }
    };

    return (
      <>
        <AppShell variant="minimal">
          <div className="flex min-h-screen items-center justify-center px-4 py-12">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
              <h1 className="text-2xl font-semibold text-foreground">{blockedCopy.title}</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{blockedCopy.message}</p>
              {paywallCheckoutError ? (
                <p role="alert" className="mt-3 text-sm leading-6 text-destructive">
                  {paywallCheckoutError}
                </p>
              ) : null}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                {blockedCopy.primaryAction === "checkout" && blockedCopy.primaryCta ? (
                  <Button
                    type="button"
                    disabled={startCheckout.isPending}
                    onClick={() => void handlePaywallCheckout()}
                  >
                    {blockedCopy.primaryCta}
                  </Button>
                ) : null}
                {blockedCopy.primaryAction === "settings" && blockedCopy.primaryCta ? (
                  <Button asChild>
                    <Link to="/settings" hash="billing">
                      {blockedCopy.primaryCta}
                    </Link>
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => void handleSignOut()}>
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </AppShell>
        {supportWidget}
        <Toaster richColors position="top-right" />
      </>
    );
  }

  if (isOnboarding || isSelectPlan || isConfirmPlan) {
    return (
      <>
        <AppShell variant="minimal">
          <Outlet />
        </AppShell>
        {supportWidget}
        <Toaster richColors position="top-right" />
      </>
    );
  }

  if (!onboardingCompleted && userRole != null && userRole !== "admin") {
    return (
      <>
        <AppShell variant="minimal">
          <div role="status" className="flex min-h-screen items-center justify-center px-4 py-12">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
              <h1 className="text-2xl font-semibold text-foreground">
                Your workspace is still being set up
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                An administrator needs to finish setting up your organization before you can start.
                Check back shortly, or reach out to your admin.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button variant="outline" onClick={() => void handleSignOut()}>
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </AppShell>
        {supportWidget}
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <>
      <AppShell
        sidebarCollapsed={sidebarCollapsed}
        sidebar={
          <AppSidebar
            userRole={userRole}
            userPermissions={memberPermissions}
            userId={user.id}
            footer={userMenu}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
          />
        }
        topbar={
          <AppTopbar
            onOpenCommandPalette={() => commandPalette.setOpen(true)}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
            statusSlot={
              showTrialStatus ? <TrialBanner canManageBilling={userRole === "admin"} /> : null
            }
            notificationsSlot={<NotificationBell />}
            userMenu={topbarUserMenu}
          />
        }
        afterMain={
          <>
            {supportWidget}
            <SilentErrorBoundary source="crm-feedback-widget">
              <CrmFeedbackWidget />
            </SilentErrorBoundary>
          </>
        }
      >
        <SampleDataBanner />
        <Outlet />
      </AppShell>
      <MobileNav
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        userRole={userRole}
        userPermissions={memberPermissions}
        userId={user.id}
        footer={userMenu}
      />
      <CommandPalette
        open={commandPalette.open}
        onOpenChange={commandPalette.setOpen}
        userRole={userRole}
        userPermissions={memberPermissions}
      />
      <Toaster richColors position="top-right" />
    </>
  );
}

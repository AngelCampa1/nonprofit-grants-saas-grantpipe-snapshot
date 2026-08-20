import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePaywall } from "./use-paywall";

const mockUseOrgBilling = vi.fn();
const mockUseSession = vi.fn();
vi.mock("./use-org-settings", () => ({
  useOrgBilling: (opts?: { enabled?: boolean }) => mockUseOrgBilling(opts),
}));
vi.mock("./use-session", () => ({
  useSession: () => mockUseSession(),
}));

describe("usePaywall", () => {
  beforeEach(() => {
    mockUseOrgBilling.mockReset();
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({
      orgSubscription: null,
      hasLoadedContext: false,
      contextError: null,
      memberRole: null,
    });
  });

  it("returns null state while billing is loading", () => {
    mockUseOrgBilling.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { result } = renderHook(() => usePaywall());
    expect(result.current.state).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("derives a paywall state from billing data", () => {
    const trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    mockUseOrgBilling.mockReturnValue({
      data: { status: "trialing", trialEndsAt, planTier: "starter", subscriptionId: "sub_test" },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => usePaywall());
    expect(result.current.state?.allowed).toBe(true);
  });

  it("flags an error from the billing query", () => {
    mockUseOrgBilling.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { result } = renderHook(() => usePaywall({ enabled: true }));
    expect(result.current.isError).toBe(true);
    expect(result.current.state).toBeNull();
  });

  it("passes enabled: false to useOrgBilling when called with { enabled: false }", () => {
    mockUseOrgBilling.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    renderHook(() => usePaywall({ enabled: false }));
    expect(mockUseOrgBilling).toHaveBeenCalledWith({ enabled: false });
  });

  it("passes enabled: undefined to useOrgBilling when called with no options", () => {
    mockUseOrgBilling.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    renderHook(() => usePaywall());
    expect(mockUseOrgBilling).toHaveBeenCalledWith({ enabled: undefined });
  });

  it("returns state from paywallState when billing.data has null trialEndsAt", () => {
    mockUseOrgBilling.mockReturnValue({
      data: { status: "active", trialEndsAt: null, planTier: "starter" },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => usePaywall());
    expect(result.current.state).not.toBeNull();
    expect(result.current.state?.allowed).toBe(true);
  });

  it("falls back to session orgSubscription when billing has not loaded yet", () => {
    mockUseSession.mockReturnValue({
      orgSubscription: {
        subscriptionStatus: "active",
        trialEndsAt: null,
        planTier: "growth",
        stripeSubscriptionId: "sub_from_session",
      },
      hasLoadedContext: true,
      contextError: null,
      memberRole: "editor",
    });
    mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const { result } = renderHook(() => usePaywall());
    const state = result.current.state;

    expect(state?.allowed).toBe(true);
    expect(state && state.allowed ? state.status : null).toBe("active");
  });

  it("falls back to billing data when session context loads without subscription details", () => {
    mockUseSession.mockReturnValue({
      orgSubscription: null,
      hasLoadedContext: true,
      contextError: null,
      memberRole: "editor",
    });
    mockUseOrgBilling.mockReturnValue({
      data: {
        status: "canceled",
        trialEndsAt: null,
        planTier: "starter",
        subscriptionId: null,
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => usePaywall());
    const state = result.current.state;

    expect(state?.allowed).toBe(false);
    expect(state && !state.allowed ? state.reason : null).toBe("subscription_canceled");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});

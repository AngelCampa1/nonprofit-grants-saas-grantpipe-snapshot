import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../lib/auth-client", () => ({
  signIn: {
    email: vi.fn(),
    social: vi.fn(),
  },
  signUp: {
    email: vi.fn(),
  },
  signOut: vi.fn(),
}));

const mockCaptureEvent = vi.fn();
const mockCreateAnonymousPersonProfile = vi.fn();
const mockStorePaidAttribution = vi.fn();
const mockStorePendingAnalyticsEvents = vi.fn();
const mockClearPendingAnalyticsEvents = vi.fn();
const mockFetch = vi.fn();
vi.mock("../lib/analytics", () => ({
  POSTHOG_PENDING_EVENT_KEY: "posthog_pending_event",
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
  createAnonymousPersonProfile: (...args: unknown[]) => mockCreateAnonymousPersonProfile(...args),
  storePendingAnalyticsEvents: (...args: unknown[]) => mockStorePendingAnalyticsEvents(...args),
  clearPendingAnalyticsEvents: (...args: unknown[]) => mockClearPendingAnalyticsEvents(...args),
  appendPendingEventMarker: (callbackURL: string) =>
    callbackURL.includes("?") ? `${callbackURL}&ph_pending=1` : `${callbackURL}?ph_pending=1`,
}));

vi.mock("../lib/paid-attribution", () => ({
  storePaidAttribution: (...args: unknown[]) => mockStorePaidAttribution(...args),
}));

const mockCaptureAppException = vi.fn();
vi.mock("../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

// Mock TanStack Router
const { mockNavigate, mockRouteUseSearch } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRouteUseSearch: vi.fn().mockReturnValue({}),
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
    search,
    children,
    className,
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => {
    const params = search ? `?${new URLSearchParams(search).toString()}` : "";
    return React.createElement("a", { href: `${to}${params}`, className }, children);
  },
  useNavigate: () => mockNavigate,
}));

import { signIn, signUp } from "../lib/auth-client";
import {
  SignupPage,
  signupSearchSchema,
  readPendingPlan,
  clearPendingPlan,
  PENDING_PLAN_STORAGE_KEY,
} from "./signup";

const mockSignUp = vi.mocked(signUp);
const mockSignIn = vi.mocked(signIn);
const signupSource = readFileSync(join(process.cwd(), "src/routes/signup.tsx"), "utf8");

function renderSignup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <SignupPage />
      </QueryClientProvider>,
    ),
  };
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Angel Campa" } });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "angel@grantpipe.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "supersecret" } });
  fireEvent.click(screen.getByRole("button", { name: "Start your free trial" }));
}

describe("signup pricing source contract", () => {
  it("derives accepted pending plan and billing values from shared constants", () => {
    expect(signupSource).toContain("PLAN_TIERS");
    expect(signupSource).toContain("BILLING_CYCLES");
    expect(signupSource).not.toContain(
      'const allowedPlans = ["starter", "growth", "audit_ready", "enterprise"] as const;',
    );
    expect(signupSource).not.toContain('const allowedCycles = ["monthly", "annual"] as const;');
  });
});

describe("SignupPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetch);
    Object.defineProperty(window.navigator, "sendBeacon", {
      value: undefined,
      configurable: true,
    });
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    window.sessionStorage.clear();
    mockSignIn.email.mockResolvedValue({ data: null, error: null });
    mockRouteUseSearch.mockReturnValue({});
    mockCreateAnonymousPersonProfile.mockClear();
    mockStorePaidAttribution.mockClear();
    mockCaptureAppException.mockClear();
  });

  it("renders name, email, and password input fields", () => {
    renderSignup();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders Start your free trial submit button", () => {
    renderSignup();

    expect(screen.getByRole("button", { name: "Start your free trial" })).toBeInTheDocument();
  });

  it("renders H1 heading Start a 1-month GrantPipe trial", () => {
    renderSignup();

    expect(
      screen.getByRole("heading", { name: "Start a 1-month GrantPipe trial", level: 1 }),
    ).toBeInTheDocument();
  });

  it("shows the trial subtitle", () => {
    renderSignup();

    expect(
      screen.getByText("Track your grants, funds, and donors in one place."),
    ).toBeInTheDocument();
  });

  it("renders the concrete trial reassurance strip with all three lines", () => {
    renderSignup();

    expect(screen.getByText("Audit-Ready plan, free for 1 month")).toBeInTheDocument();
    expect(screen.getByText("No credit card at signup")).toBeInTheDocument();
    expect(
      screen.getByText("Bring in your own grants and funds during onboarding"),
    ).toBeInTheDocument();
  });

  it("renders Google signup before the email submit button", () => {
    renderSignup();

    const googleButton = screen.getByRole("button", { name: "Continue with Google" });
    const emailButton = screen.getByRole("button", { name: "Start your free trial" });

    expect(
      googleButton.compareDocumentPosition(emailButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("or use email")).toBeInTheDocument();
  });

  it("shows password helper text before submit", () => {
    renderSignup();

    expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
  });

  it("calls signUp.email on form submit with name, email, and password", async () => {
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockSignUp.email).toHaveBeenCalledWith({
        name: "Angel Campa",
        email: "angel@grantpipe.com",
        password: "supersecret",
        callbackURL: "/app/onboarding",
      });
    });
  });

  it("preserves invite tokens through email signup and returns to the invite page", async () => {
    mockRouteUseSearch.mockReturnValue({ invite: "invite-token-1" });
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockSignUp.email).toHaveBeenCalledWith({
        name: "Angel Campa",
        email: "angel@grantpipe.com",
        password: "supersecret",
        callbackURL: "/app/invite/invite-token-1",
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/invite/invite-token-1" });
    });
  });

  it("trims email before creating the account on invite signup", async () => {
    mockRouteUseSearch.mockReturnValue({ invite: "invite-token-1" });
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });

    renderSignup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Angel Campa " } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: " angel@grantpipe.com " },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "supersecret" } });
    fireEvent.click(screen.getByRole("button", { name: "Start your free trial" }));

    await waitFor(() => {
      expect(mockSignUp.email).toHaveBeenCalledWith({
        name: "Angel Campa",
        email: "angel@grantpipe.com",
        password: "supersecret",
        callbackURL: "/app/invite/invite-token-1",
      });
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/invite/invite-token-1" });
    });
    expect(mockSignIn.email).not.toHaveBeenCalled();
  });

  it("after successful signup, navigates to /onboarding", async () => {
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
    });
  });

  it("relies on Better Auth autoSignIn and does not make a second signIn.email call after signUp", async () => {
    // Better Auth signs the user in automatically on sign-up (autoSignIn defaults to
    // true), so a second explicit signIn.email is redundant: it double-hits the
    // sign-in rate limiter and, when throttled, dead-ends an already-authenticated
    // user at "Sign in to continue." The signup flow must navigate straight into
    // onboarding without a second sign-in request.
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
    });
    expect(mockSignIn.email).not.toHaveBeenCalled();
  });

  it("does not navigate to /onboarding when signUp fails", async () => {
    mockSignUp.email.mockResolvedValue({
      data: null,
      error: { message: "Email already in use" },
    });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email already in use");
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows fallback error message when signUp.email error has no message", async () => {
    mockSignUp.email.mockResolvedValue({
      data: null,
      error: { message: undefined },
    });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Sign up failed. Please try again.");
    });
  });

  it("shows unexpected error message when signUp.email throws", async () => {
    mockSignUp.email.mockRejectedValue(new Error("Network error"));

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
    });
  });

  it("shows the 'account is ready' message when navigate throws after signUp succeeded", async () => {
    mockSignUp.email.mockResolvedValue({ data: { token: "tok" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });
    mockNavigate.mockRejectedValue(new Error("route missing"));

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your account is ready. Sign in to continue.",
      );
    });
    expect(screen.getByRole("alert")).not.toHaveTextContent("Sign up failed");
  });

  it("blocks submit with empty email and surfaces a validation error", async () => {
    renderSignup();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Angel" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "supersecret" } });
    fireEvent.click(screen.getByRole("button", { name: "Start your free trial" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please enter your email address.");
    expect(mockSignUp.email).not.toHaveBeenCalled();
  });

  it("blocks submit with short password and surfaces a validation error", async () => {
    renderSignup();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Angel" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Start your free trial" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must be at least 8 characters.",
    );
    expect(mockSignUp.email).not.toHaveBeenCalled();
  });

  it("blocks submit with empty name and surfaces a validation error", async () => {
    renderSignup();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "supersecret" } });
    fireEvent.click(screen.getByRole("button", { name: "Start your free trial" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please enter your full name.");
    expect(mockSignUp.email).not.toHaveBeenCalled();
  });

  it("shows the USER_ALREADY_EXISTS message when the signUp returns that code", async () => {
    mockSignUp.email.mockResolvedValue({
      data: null,
      error: { code: "USER_ALREADY_EXISTS", message: "whatever" },
    });

    renderSignup();
    fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("An account with that email already exists.");
    expect(screen.getByRole("link", { name: "Sign in instead" })).toHaveAttribute("href", "/login");
  });

  it("reports thrown post-account-create failures while keeping the success fallback", async () => {
    const error = new Error("navigation failed for jane@example.com token=secret-token");
    mockSignUp.email.mockResolvedValue({ data: { token: "tok" }, error: null });
    mockNavigate.mockRejectedValue(error);

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your account is ready. Sign in to continue.",
      );
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      error,
      {
        tags: {
          source: "signup",
          feature: "email-signup",
          stage: "post_account_create",
        },
      },
      { sanitize: true },
    );
  });

  it("reports non-Error post-account-create failures with a safe fallback error", async () => {
    mockSignUp.email.mockResolvedValue({ data: { token: "tok" }, error: null });
    mockNavigate.mockRejectedValue("navigation transport failed");

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your account is ready. Sign in to continue.",
      );
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Post-signup setup failed" }),
      {
        tags: {
          source: "signup",
          feature: "email-signup",
          stage: "post_account_create",
        },
      },
      { sanitize: true },
    );
  });

  it("reports non-Error signup submission failures with a safe fallback error", async () => {
    mockSignUp.email.mockRejectedValue("signup transport failed");

    renderSignup();
    fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An unexpected error occurred. Please try again.",
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith("signup_failed", {
      method: "email",
      has_invite: false,
      reason_code: "unexpected_error",
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Signup submission failed" }),
      {
        tags: { source: "signup", feature: "email-signup" },
      },
      { sanitize: true },
    );
  });

  it("invalidates the auth-session-context query before navigating to onboarding", async () => {
    mockSignUp.email.mockResolvedValue({ data: { token: "tok" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    const { client } = renderSignup();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    fillAndSubmit();

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["auth-session-context"] });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
    });

    const invalidateOrder = invalidateSpy.mock.invocationCallOrder[0] ?? Infinity;
    const navigateOrder = mockNavigate.mock.invocationCallOrder[0] ?? 0;
    expect(invalidateOrder).toBeLessThan(navigateOrder);
  });

  it("calls captureEvent with signup_completed and method email after successful signup", async () => {
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("signup_started", {
        method: "email",
        has_invite: false,
      });
      expect(mockCaptureEvent).toHaveBeenCalledWith("signup_completed", {
        method: "email",
        has_invite: false,
        auto_signin: true,
      });
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "outbound_signup_completed",
      expect.anything(),
    );
  });

  it("includes ref in captureEvent when ref search param is present", async () => {
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });
    mockRouteUseSearch.mockReturnValue({ ref: "campaign1" });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("signup_completed", {
        method: "email",
        ref: "campaign1",
        has_invite: false,
        auto_signin: true,
      });
    });
  });

  it("does not double count signup_completed when navigation throws after sign-up", async () => {
    mockSignUp.email.mockResolvedValue({ data: { token: "tok" }, error: null });
    mockNavigate.mockRejectedValue(new Error("route missing"));

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your account is ready. Sign in to continue.",
      );
    });

    const completedCalls = mockCaptureEvent.mock.calls.filter(
      (call) => call[0] === "signup_completed",
    );
    expect(completedCalls).toHaveLength(1);
    expect(completedCalls[0]![1]).toMatchObject({ auto_signin: true });
  });

  it("includes public CTA journey params in signup analytics", async () => {
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });
    mockRouteUseSearch.mockReturnValue({
      landing_page: "/pricing",
      source_section: "hero",
      cta_page_family: "pricing",
      cta_buyer_stage: "bofu",
      cta_placement: "hero-primary",
      cta_intent: "start-trial",
    });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("signup_completed", {
        method: "email",
        has_invite: false,
        landing_path: "/pricing",
        source_section: "hero",
        cta_page_family: "pricing",
        cta_buyer_stage: "bofu",
        cta_placement: "hero-primary",
        cta_intent: "start-trial",
        auto_signin: true,
      });
    });
  });

  it("fires signup_submitted for email with campaign, plan, promo, and invite properties", async () => {
    mockRouteUseSearch.mockReturnValue({
      ref: "campaign1",
      utm_source: "bing",
      utm_medium: "cpc",
      utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
      utm_content: "deadline-evidence",
      utm_term: "grant compliance software",
      msclkid: "ms-click-123",
      gclid: "google-click-456",
      ve_product: "grantpipe",
      ve_icp: "gp_grants_compliance_operators",
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: "7",
      ve_offer: "compliance_calendar_trial",
      ve_instantly_campaign_id: "inst-campaign-1",
      ve_lead_list_id: "lead-list-1",
      ve_sender_pool: "grantpipe-warm-15",
      ve_sequence_day: "7",
      ve_branding: "plain",
      plan: "growth",
      cycle: "annual",
      promo: "y80off",
      invite: "invite-token-1",
    });
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("signup_submitted", {
        method: "email",
        ref: "campaign1",
        utm_source: "bing",
        utm_medium: "cpc",
        utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
        utm_content: "deadline-evidence",
        utm_term: "grant compliance software",
        msclkid: "ms-click-123",
        gclid: "google-click-456",
        ve_product: "grantpipe",
        ve_icp: "gp_grants_compliance_operators",
        ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
        ve_variant: "plain_founder",
        ve_step: "7",
        ve_offer: "compliance_calendar_trial",
        ve_instantly_campaign_id: "inst-campaign-1",
        ve_lead_list_id: "lead-list-1",
        ve_sender_pool: "grantpipe-warm-15",
        ve_sequence_day: "7",
        ve_branding: "plain",
        plan_tier: "growth",
        billing_cycle: "annual",
        promo_code: "Y80OFF",
        has_invite: true,
      });
    });
    const submittedOrder = mockCaptureEvent.mock.invocationCallOrder.find((_, index) => {
      return mockCaptureEvent.mock.calls[index]?.[0] === "signup_submitted";
    });
    const signUpOrder = mockSignUp.email.mock.invocationCallOrder[0] ?? 0;
    expect(submittedOrder ?? Infinity).toBeLessThan(signUpOrder);
  });

  it("accepts numeric outbound step params without rewriting them and tracks them as strings", async () => {
    const parsed = signupSearchSchema.parse({
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: 1,
      ve_sequence_day: 1,
    });

    expect(parsed).toMatchObject({
      ve_step: 1,
      ve_sequence_day: 1,
    });

    mockRouteUseSearch.mockReturnValue({
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: parsed.ve_step,
      ve_sequence_day: parsed.ve_sequence_day,
    });
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("signup_submitted", {
        method: "email",
        has_invite: false,
        ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
        ve_variant: "plain_founder",
        ve_step: "1",
        ve_sequence_day: "1",
      });
    });
  });

  it("captures signup_completed and sends outbound completion through the API backstop", async () => {
    mockRouteUseSearch.mockReturnValue({
      utm_source: "instantly",
      utm_medium: "cold_email",
      utm_campaign: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: 1,
      ve_sequence_day: 1,
      ve_sender_pool: "grantpipe_public_2026_06",
    });
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      const expectedProperties = {
        method: "email",
        has_invite: false,
        utm_source: "instantly",
        utm_medium: "cold_email",
        utm_campaign: "grantpipe-grants-deadline-drift-2026_06-01",
        ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
        ve_variant: "plain_founder",
        ve_step: "1",
        ve_sequence_day: "1",
        ve_sender_pool: "grantpipe_public_2026_06",
        auto_signin: true,
      };
      expect(mockCaptureEvent).toHaveBeenCalledWith("signup_completed", expectedProperties);
    });

    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "outbound_signup_completed",
      expect.anything(),
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/public/marketing/analytics",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fires outbound_landing_viewed when an outbound campaign lands on signup", () => {
    mockRouteUseSearch.mockReturnValue({
      utm_source: "instantly",
      utm_medium: "cold_email",
      utm_campaign: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: 1,
      ve_sequence_day: 1,
      ve_sender_pool: "grantpipe_public_2026_06",
    });

    renderSignup();

    expect(mockCreateAnonymousPersonProfile).toHaveBeenCalledTimes(1);
    expect(mockCaptureEvent).toHaveBeenCalledWith("outbound_landing_viewed", {
      method: "email",
      has_invite: false,
      utm_source: "instantly",
      utm_medium: "cold_email",
      utm_campaign: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: "1",
      ve_sequence_day: "1",
      ve_sender_pool: "grantpipe_public_2026_06",
    });
  });

  it("fires outbound signup completion through the API backstop without double-counting client capture", async () => {
    mockRouteUseSearch.mockReturnValue({
      utm_source: "instantly",
      utm_medium: "cold_email",
      utm_campaign: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_product: "grantpipe",
      ve_icp: "gp_grants_compliance_operators",
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: 1,
      ve_sequence_day: 1,
      ve_instantly_campaign_id: "inst-campaign-1",
      ve_lead_list_id: "lead-list-1",
      ve_sender_pool: "grantpipe_public_2026_06",
    });
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/public/marketing/analytics",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }),
      );
    });

    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "outbound_signup_completed",
      expect.anything(),
      expect.anything(),
    );
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body).toMatchObject({
      event: "outbound_signup_completed",
      properties: {
        auto_signin: true,
        ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
        ve_variant: "plain_founder",
      },
    });
    expect(JSON.stringify(body)).not.toContain("angel@grantpipe.com");
  });

  it("does not block successful signup navigation when the analytics backstop hangs", async () => {
    mockRouteUseSearch.mockReturnValue({
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
    });
    mockFetch.mockReturnValue(new Promise(() => undefined));
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/public/marketing/analytics",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("reports outbound signup analytics fallback rejection without blocking signup", async () => {
    const analyticsError = new Error("analytics backstop down");
    mockRouteUseSearch.mockReturnValue({
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      utm_source: "instantly",
    });
    Object.defineProperty(window.navigator, "sendBeacon", {
      value: vi.fn(() => false),
      configurable: true,
    });
    mockFetch.mockRejectedValue(analyticsError);
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
    });
    await waitFor(() => {
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        analyticsError,
        {
          tags: { source: "signup", feature: "outbound-signup-analytics" },
        },
        { sanitize: true },
      );
    });
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("angel@grantpipe.com");
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("instantly");
  });

  it("uses sendBeacon for outbound signup analytics when available", async () => {
    const sendBeacon = vi.fn(() => true);
    mockRouteUseSearch.mockReturnValue({
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
    });
    Object.defineProperty(window.navigator, "sendBeacon", {
      value: sendBeacon,
      configurable: true,
    });
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
    });
    expect(sendBeacon).toHaveBeenCalledWith("/api/public/marketing/analytics", expect.any(Blob));
    expect(mockFetch).not.toHaveBeenCalledWith(
      "/api/public/marketing/analytics",
      expect.anything(),
    );
  });

  it("reports outbound signup analytics sendBeacon exceptions without blocking signup", async () => {
    const analyticsError = new Error("sendBeacon failed");
    mockRouteUseSearch.mockReturnValue({
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
    });
    Object.defineProperty(window.navigator, "sendBeacon", {
      value: vi.fn(() => {
        throw analyticsError;
      }),
      configurable: true,
    });
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      analyticsError,
      {
        tags: { source: "signup", feature: "outbound-signup-analytics" },
      },
      { sanitize: true },
    );
  });

  it("reports outbound signup analytics non-ok responses without blocking signup", async () => {
    mockRouteUseSearch.mockReturnValue({
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      utm_source: "instantly",
    });
    Object.defineProperty(window.navigator, "sendBeacon", {
      value: vi.fn(() => false),
      configurable: true,
    });
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
    });
    await waitFor(() => {
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        expect.any(Error),
        {
          tags: { source: "signup", feature: "outbound-signup-analytics" },
          extra: { status: 503 },
        },
        { sanitize: true },
      );
    });
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("angel@grantpipe.com");
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("instantly");
  });

  it("stores paid attribution from signup search params for post-signup app events", () => {
    mockRouteUseSearch.mockReturnValue({
      utm_source: "bing",
      utm_medium: "cpc",
      utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
      utm_content: "deadline-evidence",
      utm_term: "grant compliance software",
      msclkid: "ms-click-123",
      gclid: "google-click-456",
      ve_product: "grantpipe",
      ve_icp: "gp_grants_compliance_operators",
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "product_branded",
      ve_step: "11",
      ve_offer: "compliance_calendar_trial",
      ve_branding: "branded",
    });

    renderSignup();

    expect(mockStorePaidAttribution).toHaveBeenCalledWith({
      utm_source: "bing",
      utm_medium: "cpc",
      utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
      utm_content: "deadline-evidence",
      utm_term: "grant compliance software",
      msclkid: "ms-click-123",
      gclid: "google-click-456",
      ve_product: "grantpipe",
      ve_icp: "gp_grants_compliance_operators",
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "product_branded",
      ve_step: "11",
      ve_offer: "compliance_calendar_trial",
      ve_branding: "branded",
    });
  });

  it("trims and bounds paid attribution fields before tracking signup events", async () => {
    mockRouteUseSearch.mockReturnValue({
      utm_source: "  bing  ",
      utm_medium: "  cpc  ",
      utm_campaign: "x".repeat(300),
      utm_content: "",
      utm_term: "grant compliance software",
      msclkid: "m".repeat(300),
      gclid: "g".repeat(300),
    });
    mockSignUp.email.mockResolvedValue({ data: { token: "tok-456" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok" }, error: null });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("signup_completed", {
        method: "email",
        has_invite: false,
        utm_source: "bing",
        utm_medium: "cpc",
        utm_campaign: "x".repeat(200),
        utm_term: "grant compliance software",
        msclkid: "m".repeat(200),
        gclid: "g".repeat(200),
        auto_signin: true,
      });
    });
  });

  it("fires signup_failed when signup fails", async () => {
    mockSignUp.email.mockResolvedValue({
      data: null,
      error: { message: "Email already in use" },
    });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email already in use");
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("signup_started", {
      method: "email",
      has_invite: false,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("signup_failed", {
      method: "email",
      has_invite: false,
      reason_code: "provider_error",
    });
  });

  it("stores the pending completion event before Google sign-up and tracks submission", async () => {
    mockRouteUseSearch.mockReturnValue({
      ref: "campaign1",
      utm_source: "bing",
      utm_medium: "cpc",
      utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
      msclkid: "ms-click-123",
      plan: "starter",
      cycle: "monthly",
      promo: "y80off",
    });
    mockSignIn.social.mockResolvedValue({ data: null, error: null });

    renderSignup();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mockSignIn.social).toHaveBeenCalled();
    });

    expect(mockStorePendingAnalyticsEvents).toHaveBeenCalledWith({
      event: "signup_completed",
      properties: {
        method: "google",
        ref: "campaign1",
        utm_source: "bing",
        utm_medium: "cpc",
        utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
        msclkid: "ms-click-123",
        plan_tier: "starter",
        billing_cycle: "monthly",
        promo_code: "Y80OFF",
        has_invite: false,
      },
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("signup_started", {
      method: "google",
      ref: "campaign1",
      utm_source: "bing",
      utm_medium: "cpc",
      utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
      msclkid: "ms-click-123",
      plan_tier: "starter",
      billing_cycle: "monthly",
      promo_code: "Y80OFF",
      has_invite: false,
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("signup_submitted", {
      method: "google",
      ref: "campaign1",
      utm_source: "bing",
      utm_medium: "cpc",
      utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
      msclkid: "ms-click-123",
      plan_tier: "starter",
      billing_cycle: "monthly",
      promo_code: "Y80OFF",
      has_invite: false,
    });
    const submittedOrder = mockCaptureEvent.mock.invocationCallOrder.find((_, index) => {
      return mockCaptureEvent.mock.calls[index]?.[0] === "signup_submitted";
    });
    const socialOrder = mockSignIn.social.mock.invocationCallOrder[0] ?? 0;
    expect(submittedOrder ?? Infinity).toBeLessThan(socialOrder);
  });

  it("sets both pending completion events for outbound Google sign-up", async () => {
    mockRouteUseSearch.mockReturnValue({
      ve_campaign_id: "cmp_123",
      ve_step: "4",
      ve_sequence_day: "2",
    });
    mockSignIn.social.mockResolvedValue({ data: null, error: null });

    renderSignup();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mockSignIn.social).toHaveBeenCalled();
    });

    const expectedProperties = {
      method: "google",
      has_invite: false,
      ve_campaign_id: "cmp_123",
      ve_step: "4",
      ve_sequence_day: "2",
    };
    expect(mockStorePendingAnalyticsEvents).toHaveBeenCalledWith({
      events: [
        { event: "signup_completed", properties: expectedProperties },
        { event: "outbound_signup_completed", properties: expectedProperties },
      ],
    });
  });

  it("clears pending Google completion and tracks failure when social signup returns an error", async () => {
    mockSignIn.social.mockResolvedValue({
      data: null,
      error: { message: "Google unavailable" },
    });

    renderSignup();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Google unavailable");
    expect(mockClearPendingAnalyticsEvents).toHaveBeenCalled();
    expect(mockCaptureEvent).toHaveBeenCalledWith("signup_failed", {
      method: "google",
      has_invite: false,
      reason_code: "provider_error",
    });
  });

  it("uses fallback copy when Google signup returns an error without a message", async () => {
    mockSignIn.social.mockResolvedValue({
      data: null,
      error: {},
    });

    renderSignup();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google sign up failed. Please try again.",
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith("signup_failed", {
      method: "google",
      has_invite: false,
      reason_code: "unexpected_error",
    });
  });

  it("clears pending Google completion and tracks failure when social signup throws", async () => {
    const error = new Error("network for jane@example.com token=secret-token");
    mockSignIn.social.mockRejectedValue(error);

    renderSignup();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google sign up failed. Please try again.",
    );
    expect(mockClearPendingAnalyticsEvents).toHaveBeenCalled();
    expect(mockCaptureEvent).toHaveBeenCalledWith("signup_failed", {
      method: "google",
      has_invite: false,
      reason_code: "unexpected_error",
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      error,
      { tags: { source: "signup", feature: "google-signup" } },
      { sanitize: true },
    );
  });

  it("reports non-Error Google signup throws with a safe fallback error", async () => {
    mockSignIn.social.mockRejectedValue("google transport failed");

    renderSignup();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google sign up failed. Please try again.",
    );
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Google signup failed" }),
      { tags: { source: "signup", feature: "google-signup" } },
      { sanitize: true },
    );
  });

  it("renders link to login page", () => {
    renderSignup();

    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
  });

  it("renders Continue with Google button", () => {
    renderSignup();

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("calls signIn.social with google provider when Google button clicked", async () => {
    mockSignIn.social.mockResolvedValue({ data: null, error: null });

    renderSignup();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mockSignIn.social).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/app/onboarding?ph_pending=1",
      });
    });
  });

  it("preserves invite tokens through Google signup", async () => {
    mockRouteUseSearch.mockReturnValue({ invite: "invite-token-1" });
    mockSignIn.social.mockResolvedValue({ data: null, error: null });

    renderSignup();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mockSignIn.social).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/app/invite/invite-token-1?ph_pending=1",
      });
    });
  });

  it("success message does not render inside a destructive Sign up failed alert", async () => {
    mockSignUp.email.mockResolvedValue({ data: { token: "tok" }, error: null });
    mockSignIn.email.mockResolvedValue({ data: null, error: { message: "session missing" } });

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your account is ready. Sign in to continue.",
      );
    });
    // The alert title must not be the destructive error title
    expect(screen.getByRole("alert")).not.toHaveTextContent("Sign up failed");
  });

  it("calls captureAppException when signup.email throws an unexpected error", async () => {
    const boom = new Error("Network error for jane@example.com token=secret-token");
    mockSignUp.email.mockRejectedValue(boom);

    renderSignup();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      boom,
      {
        tags: { source: "signup", feature: "email-signup" },
      },
      { sanitize: true },
    );
  });

  it("password show/hide toggle changes input type between password and text", async () => {
    renderSignup();

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");

    const toggleButton = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggleButton);

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("shows inline email error on blur when email format is invalid", async () => {
    renderSignup();

    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "notanemail" } });
    fireEvent.blur(emailInput);

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("shows inline password error on blur when password is too short", async () => {
    renderSignup();

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "abc" } });
    fireEvent.blur(passwordInput);

    expect(await screen.findAllByText("Password must be at least 8 characters.")).not.toHaveLength(
      0,
    );
  });

  it("clears the inline email error on blur once the email becomes valid", async () => {
    renderSignup();

    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "notanemail" } });
    fireEvent.blur(emailInput);
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();

    fireEvent.change(emailInput, { target: { value: "founder@example.org" } });
    fireEvent.blur(emailInput);

    await waitFor(() =>
      expect(screen.queryByText("Enter a valid email address.")).not.toBeInTheDocument(),
    );
  });

  it("clears the inline password error on blur once the password is long enough", async () => {
    renderSignup();

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "abc" } });
    fireEvent.blur(passwordInput);
    expect(await screen.findAllByText("Password must be at least 8 characters.")).not.toHaveLength(
      0,
    );

    fireEvent.change(passwordInput, { target: { value: "longenoughpassword" } });
    fireEvent.blur(passwordInput);

    await waitFor(() =>
      expect(screen.queryByText("Password must be at least 8 characters.")).not.toBeInTheDocument(),
    );
  });
});

describe("signup pending plan helpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockRouteUseSearch.mockReturnValue({});
  });

  it("readPendingPlan returns null when nothing is stored", () => {
    expect(readPendingPlan()).toBeNull();
  });

  it("readPendingPlan parses the stored plan JSON", () => {
    window.sessionStorage.setItem(
      PENDING_PLAN_STORAGE_KEY,
      JSON.stringify({ planTier: "growth", billingCycle: "annual" }),
    );

    expect(readPendingPlan()).toEqual({
      planTier: "growth",
      billingCycle: "annual",
    });
  });

  it("readPendingPlan returns null when stored JSON is malformed", () => {
    window.sessionStorage.setItem(PENDING_PLAN_STORAGE_KEY, "{not json");
    expect(readPendingPlan()).toBeNull();
  });

  it("clearPendingPlan removes the stored plan", () => {
    window.sessionStorage.setItem(
      PENDING_PLAN_STORAGE_KEY,
      JSON.stringify({ planTier: "starter" }),
    );
    clearPendingPlan();
    expect(window.sessionStorage.getItem(PENDING_PLAN_STORAGE_KEY)).toBeNull();
  });

  it("pending plan helpers no-op when window is unavailable", () => {
    const originalWindow = globalThis.window;
    vi.stubGlobal("window", undefined);

    try {
      expect(readPendingPlan()).toBeNull();
      expect(() => clearPendingPlan()).not.toThrow();
    } finally {
      vi.stubGlobal("window", originalWindow);
    }
  });

  it("persists pending plan details from Route.useSearch() on mount", () => {
    mockRouteUseSearch.mockReturnValue({
      plan: "growth",
      cycle: "annual",
      promo: "launch",
      ref: "jane",
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SignupPage />
      </QueryClientProvider>,
    );

    const stored = window.sessionStorage.getItem(PENDING_PLAN_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? "{}")).toEqual({
      planTier: "growth",
      billingCycle: "annual",
      promoCode: "LAUNCH",
    });
  });

  it("ignores plan values outside the allowed set", () => {
    mockRouteUseSearch.mockReturnValue({ plan: "bogus", cycle: "weekly" });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SignupPage />
      </QueryClientProvider>,
    );
    expect(window.sessionStorage.getItem(PENDING_PLAN_STORAGE_KEY)).toBeNull();
  });

  it("clears a stale pending plan when signup loads without pricing params", () => {
    window.sessionStorage.setItem(
      PENDING_PLAN_STORAGE_KEY,
      JSON.stringify({ planTier: "growth", billingCycle: "annual", promoCode: "Y80OFF" }),
    );
    mockRouteUseSearch.mockReturnValue({});

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SignupPage />
      </QueryClientProvider>,
    );

    expect(window.sessionStorage.getItem(PENDING_PLAN_STORAGE_KEY)).toBeNull();
  });

  it("swallows sessionStorage failures silently when persisting", () => {
    mockRouteUseSearch.mockReturnValue({ plan: "starter" });
    const setItemSpy = vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      expect(() =>
        render(
          <QueryClientProvider client={client}>
            <SignupPage />
          </QueryClientProvider>,
        ),
      ).not.toThrow();
    } finally {
      setItemSpy.mockRestore();
    }
  });
});

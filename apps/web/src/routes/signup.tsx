import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Alert, Button, Input, Label } from "@grantpipe/ui";
import { BILLING_CYCLES, PLAN_TIERS, type BillingCycle, type PlanTier } from "@grantpipe/shared";
import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "../components/shell/auth-layout";
import { signIn, signUp } from "../lib/auth-client";
import {
  appendPendingEventMarker,
  captureEvent,
  clearPendingAnalyticsEvents,
  createAnonymousPersonProfile,
  storePendingAnalyticsEvents,
} from "../lib/analytics";
import { captureAppException } from "../lib/sentry";
import { buildInvitePath, buildInviteRoutePath } from "../lib/invite-links";
import { storePaidAttribution } from "../lib/paid-attribution";

export const PENDING_PLAN_STORAGE_KEY = "grantpipe-pending-plan";

type PendingPlan = {
  planTier?: PlanTier;
  billingCycle?: BillingCycle;
  promoCode?: string;
};

export function readPendingPlan(): PendingPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_PLAN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingPlan;
  } catch {
    return null;
  }
}

export function clearPendingPlan() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PENDING_PLAN_STORAGE_KEY);
}

type SignupSearch = {
  plan?: string;
  cycle?: string;
  promo?: string;
  ref?: string;
  invite?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  msclkid?: string;
  gclid?: string;
  landing_page?: string;
  source_section?: string;
  cta_page_family?: string;
  cta_buyer_stage?: string;
  cta_placement?: string;
  cta_intent?: string;
  ve_product?: string;
  ve_icp?: string;
  ve_campaign_id?: string;
  ve_variant?: string;
  ve_step?: string | number;
  ve_offer?: string;
  ve_instantly_campaign_id?: string;
  ve_lead_list_id?: string;
  ve_sender_pool?: string;
  ve_sequence_day?: string | number;
  ve_branding?: string;
};

type SignupMethod = "email" | "google";

type SignupEventProperties = {
  method: SignupMethod;
  ref?: string;
  plan_tier?: string;
  billing_cycle?: string;
  promo_code?: string;
  has_invite: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  msclkid?: string;
  gclid?: string;
  landing_path?: string;
  source_section?: string;
  cta_page_family?: string;
  cta_buyer_stage?: string;
  cta_placement?: string;
  cta_intent?: string;
  ve_product?: string;
  ve_icp?: string;
  ve_campaign_id?: string;
  ve_variant?: string;
  ve_step?: string;
  ve_offer?: string;
  ve_instantly_campaign_id?: string;
  ve_lead_list_id?: string;
  ve_sender_pool?: string;
  ve_sequence_day?: string;
  ve_branding?: string;
};

const MAX_ATTRIBUTION_VALUE_LENGTH = 200;

export const signupSearchSchema = z.object({
  plan: z.string().optional(),
  cycle: z.string().optional(),
  promo: z.string().optional(),
  ref: z.string().optional(),
  invite: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  msclkid: z.string().optional(),
  gclid: z.string().optional(),
  landing_page: z.string().optional(),
  source_section: z.string().optional(),
  cta_page_family: z.string().optional(),
  cta_buyer_stage: z.string().optional(),
  cta_placement: z.string().optional(),
  cta_intent: z.string().optional(),
  ve_product: z.string().optional(),
  ve_icp: z.string().optional(),
  ve_campaign_id: z.string().optional(),
  ve_variant: z.string().optional(),
  ve_step: z.union([z.string(), z.number()]).optional(),
  ve_offer: z.string().optional(),
  ve_instantly_campaign_id: z.string().optional(),
  ve_lead_list_id: z.string().optional(),
  ve_sender_pool: z.string().optional(),
  ve_sequence_day: z.union([z.string(), z.number()]).optional(),
  ve_branding: z.string().optional(),
});

function normalizeAttributionValue(value: string | number | undefined) {
  const trimmed = value === undefined ? undefined : String(value).trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_ATTRIBUTION_VALUE_LENGTH);
}

function syncPendingPlan(search: SignupSearch) {
  const { plan, cycle, promo } = search;
  const pending: PendingPlan = {};
  if (plan && (PLAN_TIERS as readonly string[]).includes(plan)) {
    pending.planTier = plan as PendingPlan["planTier"];
  }
  if (cycle && (BILLING_CYCLES as readonly string[]).includes(cycle)) {
    pending.billingCycle = cycle as PendingPlan["billingCycle"];
  }
  if (promo?.trim()) {
    pending.promoCode = promo.trim().toUpperCase();
  }
  if (Object.keys(pending).length === 0) {
    clearPendingPlan();
    return;
  }
  try {
    window.sessionStorage.setItem(PENDING_PLAN_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    /* ignore */
  }
}

function buildSignupEventProperties(
  method: SignupMethod,
  search: SignupSearch,
): SignupEventProperties {
  const properties: SignupEventProperties = {
    method,
    has_invite: Boolean(search.invite),
  };
  const ref = normalizeAttributionValue(search.ref);
  const utmSource = normalizeAttributionValue(search.utm_source);
  const utmMedium = normalizeAttributionValue(search.utm_medium);
  const utmCampaign = normalizeAttributionValue(search.utm_campaign);
  const utmContent = normalizeAttributionValue(search.utm_content);
  const utmTerm = normalizeAttributionValue(search.utm_term);
  const msclkid = normalizeAttributionValue(search.msclkid);
  const gclid = normalizeAttributionValue(search.gclid);
  const landingPath = normalizeAttributionValue(search.landing_page);
  const sourceSection = normalizeAttributionValue(search.source_section);
  const ctaPageFamily = normalizeAttributionValue(search.cta_page_family);
  const ctaBuyerStage = normalizeAttributionValue(search.cta_buyer_stage);
  const ctaPlacement = normalizeAttributionValue(search.cta_placement);
  const ctaIntent = normalizeAttributionValue(search.cta_intent);
  const veProduct = normalizeAttributionValue(search.ve_product);
  const veIcp = normalizeAttributionValue(search.ve_icp);
  const veCampaignId = normalizeAttributionValue(search.ve_campaign_id);
  const veVariant = normalizeAttributionValue(search.ve_variant);
  const veStep = normalizeAttributionValue(search.ve_step);
  const veOffer = normalizeAttributionValue(search.ve_offer);
  const veInstantlyCampaignId = normalizeAttributionValue(search.ve_instantly_campaign_id);
  const veLeadListId = normalizeAttributionValue(search.ve_lead_list_id);
  const veSenderPool = normalizeAttributionValue(search.ve_sender_pool);
  const veSequenceDay = normalizeAttributionValue(search.ve_sequence_day);
  const veBranding = normalizeAttributionValue(search.ve_branding);

  if (ref !== undefined) {
    properties.ref = ref;
  }
  if (search.plan !== undefined) {
    properties.plan_tier = search.plan;
  }
  if (search.cycle !== undefined) {
    properties.billing_cycle = search.cycle;
  }
  if (search.promo?.trim()) {
    properties.promo_code = search.promo.trim().toUpperCase();
  }
  if (utmSource !== undefined) {
    properties.utm_source = utmSource;
  }
  if (utmMedium !== undefined) {
    properties.utm_medium = utmMedium;
  }
  if (utmCampaign !== undefined) {
    properties.utm_campaign = utmCampaign;
  }
  if (utmContent !== undefined) {
    properties.utm_content = utmContent;
  }
  if (utmTerm !== undefined) {
    properties.utm_term = utmTerm;
  }
  if (msclkid !== undefined) {
    properties.msclkid = msclkid;
  }
  if (gclid !== undefined) {
    properties.gclid = gclid;
  }
  if (landingPath !== undefined) {
    properties.landing_path = landingPath;
  }
  if (sourceSection !== undefined) {
    properties.source_section = sourceSection;
  }
  if (ctaPageFamily !== undefined) {
    properties.cta_page_family = ctaPageFamily;
  }
  if (ctaBuyerStage !== undefined) {
    properties.cta_buyer_stage = ctaBuyerStage;
  }
  if (ctaPlacement !== undefined) {
    properties.cta_placement = ctaPlacement;
  }
  if (ctaIntent !== undefined) {
    properties.cta_intent = ctaIntent;
  }
  if (veProduct !== undefined) {
    properties.ve_product = veProduct;
  }
  if (veIcp !== undefined) {
    properties.ve_icp = veIcp;
  }
  if (veCampaignId !== undefined) {
    properties.ve_campaign_id = veCampaignId;
  }
  if (veVariant !== undefined) {
    properties.ve_variant = veVariant;
  }
  if (veStep !== undefined) {
    properties.ve_step = veStep;
  }
  if (veOffer !== undefined) {
    properties.ve_offer = veOffer;
  }
  if (veInstantlyCampaignId !== undefined) {
    properties.ve_instantly_campaign_id = veInstantlyCampaignId;
  }
  if (veLeadListId !== undefined) {
    properties.ve_lead_list_id = veLeadListId;
  }
  if (veSenderPool !== undefined) {
    properties.ve_sender_pool = veSenderPool;
  }
  if (veSequenceDay !== undefined) {
    properties.ve_sequence_day = veSequenceDay;
  }
  if (veBranding !== undefined) {
    properties.ve_branding = veBranding;
  }

  return properties;
}

function getSignupFailureReasonCode(
  code: string | undefined,
  message: string | undefined,
): "account_exists" | "provider_error" | "unexpected_error" {
  if (code === "USER_ALREADY_EXISTS") return "account_exists";
  if (message) return "provider_error";
  return "unexpected_error";
}

function isOutboundSignup(properties: SignupEventProperties): boolean {
  return Boolean(properties.ve_campaign_id);
}

function captureOutboundSignupCompleted(
  properties: SignupEventProperties & { auto_signin: boolean },
): void {
  if (!isOutboundSignup(properties)) return;

  const body = JSON.stringify({
    event: "outbound_signup_completed",
    properties,
  });

  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/public/marketing/analytics", blob)) {
        return;
      }
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 1500);
    void fetch("/api/public/marketing/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      signal: controller.signal,
      body,
    })
      .then((response) => {
        if (response.ok) return;
        captureAppException(
          new Error("Outbound signup analytics request failed"),
          {
            tags: { source: "signup", feature: "outbound-signup-analytics" },
            extra: { status: response.status },
          },
          { sanitize: true },
        );
      })
      .catch((error) => {
        captureAppException(
          error,
          {
            tags: { source: "signup", feature: "outbound-signup-analytics" },
          },
          { sanitize: true },
        );
      })
      .finally(() => window.clearTimeout(timeoutId));
  } catch (error) {
    captureAppException(
      error,
      {
        tags: { source: "signup", feature: "outbound-signup-analytics" },
      },
      { sanitize: true },
    );
  }
}

function buildPendingSignupCompletedEvent(properties: SignupEventProperties) {
  const signupCompleted = { event: "signup_completed", properties };
  if (!properties.ve_campaign_id) {
    return signupCompleted;
  }

  return {
    events: [signupCompleted, { event: "outbound_signup_completed", properties }],
  };
}

function captureSignupCompleted(properties: SignupEventProperties & { auto_signin: boolean }) {
  captureEvent("signup_completed", properties);
  captureOutboundSignupCompleted(properties);
}

export const Route = createFileRoute("/signup")({
  validateSearch: signupSearchSchema,
  component: SignupPage,
});

export function SignupPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const inviteCallback = buildInvitePath(search.invite);
  const inviteRoutePath = buildInviteRoutePath(search.invite);
  const callbackURL = inviteCallback ?? "/app/onboarding";
  const signInSearch = search.invite ? { invite: search.invite } : undefined;
  const emailEventProperties = useMemo(() => buildSignupEventProperties("email", search), [search]);
  const googleEventProperties = useMemo(
    () => buildSignupEventProperties("google", search),
    [search],
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formMessage, setFormMessage] = useState<{
    kind: "error" | "success";
    content: React.ReactNode;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailBlurError, setEmailBlurError] = useState<string | null>(null);
  const [passwordBlurError, setPasswordBlurError] = useState<string | null>(null);

  useEffect(() => {
    syncPendingPlan(search);
    storePaidAttribution(search);
    if (emailEventProperties.ve_campaign_id) {
      createAnonymousPersonProfile();
      captureEvent("outbound_landing_viewed", emailEventProperties);
    }
  }, [emailEventProperties, search]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormMessage(null);

    if (name.trim().length === 0) {
      setFormMessage({ kind: "error", content: "Please enter your full name." });
      return;
    }
    if (email.trim().length === 0) {
      setFormMessage({ kind: "error", content: "Please enter your email address." });
      return;
    }
    if (password.length < 8) {
      setFormMessage({ kind: "error", content: "Password must be at least 8 characters." });
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    captureEvent("signup_started", emailEventProperties);
    captureEvent("signup_submitted", emailEventProperties);
    setIsSubmitting(true);
    let accountCreated = false;

    try {
      const result = await signUp.email({
        name: trimmedName,
        email: trimmedEmail,
        password,
        callbackURL,
      });

      if (result.error) {
        const code = result.error.code ?? "";
        let message: React.ReactNode;
        if (code === "USER_ALREADY_EXISTS") {
          message = (
            <>
              An account with that email already exists.{" "}
              <Link
                to="/login"
                search={signInSearch}
                className="font-medium underline underline-offset-4"
              >
                Sign in instead
              </Link>
              .
            </>
          );
        } else if (result.error.message) {
          message = result.error.message;
        } else {
          message = "Sign up failed. Please try again.";
        }
        setFormMessage({ kind: "error", content: message });
        captureEvent("signup_failed", {
          ...emailEventProperties,
          reason_code: getSignupFailureReasonCode(code, result.error.message),
        });
      } else {
        accountCreated = true;
        // Better Auth signs the user in automatically on sign-up (autoSignIn is
        // enabled by default), so the session already exists at this point. A second
        // explicit signIn.email call is redundant: it double-hits the sign-in rate
        // limiter and, when that throttled it, dead-ended an already authenticated
        // user at a "Sign in to continue" message. Navigate straight into onboarding
        // on the session the sign-up created.
        captureSignupCompleted({ ...emailEventProperties, auto_signin: true });
        await queryClient.invalidateQueries({ queryKey: ["auth-session-context"] });
        await navigate({ to: inviteRoutePath ?? "/onboarding" });
        return;
      }
    } catch (err) {
      if (accountCreated) {
        setFormMessage({ kind: "success", content: "Your account is ready. Sign in to continue." });
        captureAppException(
          err instanceof Error ? err : new Error("Post-signup setup failed"),
          {
            tags: {
              source: "signup",
              feature: "email-signup",
              stage: "post_account_create",
            },
          },
          { sanitize: true },
        );
      } else {
        setFormMessage({
          kind: "error",
          content: "An unexpected error occurred. Please try again.",
        });
        captureEvent("signup_failed", {
          ...emailEventProperties,
          reason_code: "unexpected_error",
        });
        captureAppException(
          err instanceof Error ? err : new Error("Signup submission failed"),
          {
            tags: { source: "signup", feature: "email-signup" },
          },
          { sanitize: true },
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEmailBlur() {
    if (email.trim().length > 0 && !email.includes("@")) {
      setEmailBlurError("Enter a valid email address.");
    } else {
      setEmailBlurError(null);
    }
  }

  function handlePasswordBlur() {
    if (password.length > 0 && password.length < 8) {
      setPasswordBlurError("Password must be at least 8 characters.");
    } else {
      setPasswordBlurError(null);
    }
  }

  async function handleGoogleSignUp() {
    captureEvent("signup_started", googleEventProperties);
    captureEvent("signup_submitted", googleEventProperties);
    storePendingAnalyticsEvents(buildPendingSignupCompletedEvent(googleEventProperties));
    try {
      // Mark the OAuth return so the pending-event drain in _authenticated fires
      // only on this genuine return — never on an incidental authenticated load
      // in another tab that shares localStorage.
      const result = await signIn.social({
        provider: "google",
        callbackURL: appendPendingEventMarker(callbackURL),
      });
      if (result.error) {
        clearPendingAnalyticsEvents();
        setFormMessage({
          kind: "error",
          content: result.error.message ?? "Google sign up failed. Please try again.",
        });
        captureEvent("signup_failed", {
          ...googleEventProperties,
          reason_code: getSignupFailureReasonCode(undefined, result.error.message),
        });
      }
    } catch (error) {
      clearPendingAnalyticsEvents();
      setFormMessage({ kind: "error", content: "Google sign up failed. Please try again." });
      captureEvent("signup_failed", {
        ...googleEventProperties,
        reason_code: "unexpected_error",
      });
      captureAppException(
        error instanceof Error ? error : new Error("Google signup failed"),
        { tags: { source: "signup", feature: "google-signup" } },
        { sanitize: true },
      );
    }
  }

  return (
    <AuthLayout
      title="Start a 1-month GrantPipe trial"
      subtitle="Track your grants, funds, and donors in one place."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            search={signInSearch}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {formMessage !== null && (
          <Alert
            variant={formMessage.kind === "success" ? "default" : "destructive"}
            title={formMessage.kind === "success" ? "Account created" : "Sign up failed"}
          >
            {formMessage.content}
          </Alert>
        )}

        <Button type="button" variant="outline" onClick={handleGoogleSignUp} className="w-full">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-2 h-4 w-4" fill="none">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wider">
            <span className="bg-background px-3 text-muted-foreground">or use email</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={handleEmailBlur}
            placeholder="you@example.com"
            aria-invalid={emailBlurError !== null ? true : undefined}
            aria-describedby={emailBlurError ? "email-blur-error" : undefined}
          />
          {emailBlurError && (
            <p id="email-blur-error" role="alert" className="text-xs text-destructive leading-5">
              {emailBlurError}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={handlePasswordBlur}
              aria-invalid={passwordBlurError !== null ? true : undefined}
              aria-describedby={passwordBlurError ? "password-blur-error" : "password-hint"}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-full p-0.5"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Eye aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>
          {passwordBlurError ? (
            <p id="password-blur-error" role="alert" className="text-xs text-destructive leading-5">
              {passwordBlurError}
            </p>
          ) : (
            <p id="password-hint" className="text-xs leading-5 text-muted-foreground">
              Use at least 8 characters.
            </p>
          )}
        </div>

        <ul className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          {[
            "Audit-Ready plan, free for 1 month",
            "No credit card at signup",
            "Bring in your own grants and funds during onboarding",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <span className="leading-5">{line}</span>
            </li>
          ))}
        </ul>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Starting your free trial…" : "Start your free trial"}
        </Button>
      </form>
    </AuthLayout>
  );
}

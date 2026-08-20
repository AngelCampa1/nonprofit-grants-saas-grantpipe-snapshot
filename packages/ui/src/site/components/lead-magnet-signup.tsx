import { useEffect, useId, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import type { LeadMagnetOffer } from "../types";
import type { LeadMagnetSlug } from "@grantpipe/shared";
import { EMAIL_REGEX } from "../lib/email-validation";
import { trackEvent } from "../lib/analytics";
import { captureSiteFetchFailure } from "../lib/sentry-client";
import { getLeadMagnetDelivery, setLeadMagnetDelivered } from "../lib/exit-popup-utils";
import { persistSignupAttribution, resolveSignupAttribution } from "../lib/signup-attribution";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget";
import { getPublicTurnstileSiteKey } from "../lib/public-turnstile";

type SubmitStatus = "idle" | "loading" | "success" | "error-validation" | "error-generic";
type ResendStatus = "idle" | "sending" | "accepted" | "error";

function leadMagnetAnalyticsProperties(sourcePage: string, slug: LeadMagnetSlug) {
  return {
    source_page: sourcePage,
    slug,
  };
}

interface LeadMagnetSignupProps {
  apiUrl: string;
  sourcePage: string;
  leadMagnet: LeadMagnetOffer & { slug: LeadMagnetSlug };
  privacyNote?: string;
  trialCtaHref: string;
  trialCtaText: string;
  turnstileSiteKey?: string;
}

export function LeadMagnetSignup({
  apiUrl,
  sourcePage,
  leadMagnet,
  privacyNote = "Get the resource in your inbox.",
  turnstileSiteKey,
}: LeadMagnetSignupProps) {
  const siteKey = turnstileSiteKey ?? getPublicTurnstileSiteKey();
  const [activeLeadMagnet, setActiveLeadMagnet] = useState(leadMagnet);
  // Reset the active magnet when the parent supplies a different primary
  // offer. User-driven switches to alternatives stay intact because we
  // only sync when the prop slug changes from the value stored as last
  // primary slug. See React docs on "Storing information from previous
  // renders":
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders.
  const [lastPrimarySlug, setLastPrimarySlug] = useState<LeadMagnetSlug>(leadMagnet.slug);
  if (lastPrimarySlug !== leadMagnet.slug) {
    setLastPrimarySlug(leadMagnet.slug);
    setActiveLeadMagnet(leadMagnet);
  }
  const storedDelivery = getLeadMagnetDelivery(activeLeadMagnet.slug);
  const [email, setEmail] = useState(storedDelivery?.email ?? "");
  const [submittedEmail, setSubmittedEmail] = useState(storedDelivery?.email ?? "");
  const [status, setStatus] = useState<SubmitStatus>(storedDelivery ? "success" : "idle");
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const leadMagnetOptions = useMemo(
    () => [leadMagnet, ...(leadMagnet.alternatives ?? [])],
    [leadMagnet],
  );
  const initialOfferShownRef = useRef(false);
  const lastTrackedSlugRef = useRef<LeadMagnetSlug>(leadMagnet.slug);
  const errorId = useId();

  useEffect(() => {
    // Skip if we have already tracked an offer-shown event for this slug.
    if (lastTrackedSlugRef.current === activeLeadMagnet.slug && initialOfferShownRef.current) {
      return;
    }
    persistSignupAttribution();
    trackEvent("lead_magnet_offer_shown", {
      source_page: sourcePage,
      primary_slug: activeLeadMagnet.slug,
      alternative_slugs: leadMagnetOptions
        .filter((option) => option.slug !== activeLeadMagnet.slug)
        .map((option) => option.slug),
    });
    initialOfferShownRef.current = true;
    lastTrackedSlugRef.current = activeLeadMagnet.slug;
  }, [activeLeadMagnet.slug, activeLeadMagnet.title, leadMagnetOptions, sourcePage]);

  function resetTurnstile() {
    if (!siteKey) return;
    setTurnstileToken("");
    turnstileRef.current?.reset();
  }

  async function submitLead(emailAddress: string, options?: { resendDelivery?: boolean }) {
    const attribution = resolveSignupAttribution();

    return fetch(`${apiUrl}/api/public/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailAddress,
        sourcePage,
        magnetSlug: activeLeadMagnet.slug,
        resendDelivery: options?.resendDelivery ?? false,
        utm: {
          utmSource: attribution.utmSource ?? undefined,
          utmMedium: attribution.utmMedium ?? undefined,
          utmCampaign: attribution.utmCampaign ?? undefined,
          referredBy: attribution.referredBy ?? undefined,
        },
        companyWebsite,
        turnstileToken,
      }),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      setStatus("error-validation");
      trackEvent("lead_magnet_submission_failed", {
        ...leadMagnetAnalyticsProperties(sourcePage, activeLeadMagnet.slug),
        failure_type: "validation",
      });
      return;
    }

    if (siteKey && !turnstileToken) {
      // Turnstile is configured but the user hasn't completed the challenge yet.
      // Surface a generic error rather than submitting a known-invalid token.
      setStatus("error-generic");
      trackEvent("lead_magnet_submission_failed", {
        ...leadMagnetAnalyticsProperties(sourcePage, activeLeadMagnet.slug),
        failure_type: "turnstile_required",
      });
      return;
    }

    setStatus("loading");

    try {
      const res = await submitLead(email);
      if (!res.ok) {
        captureSiteFetchFailure(null, {
          source: "lead-magnet-signup",
          status: res.status,
        });
        setStatus("error-generic");
        trackEvent("lead_magnet_submission_failed", {
          ...leadMagnetAnalyticsProperties(sourcePage, activeLeadMagnet.slug),
          failure_type: "api_error",
          status: res.status,
        });
        return;
      }

      setLeadMagnetDelivered(activeLeadMagnet.slug, email);
      setSubmittedEmail(email);
      setStatus("success");
      trackEvent("lead_magnet_unlocked", {
        slug: activeLeadMagnet.slug,
        source_page: sourcePage,
      });
      trackEvent("signup_submitted", {
        source: "lead_magnet_inline",
        source_page: sourcePage,
        magnet_slug: activeLeadMagnet.slug,
      });
    } catch (err) {
      captureSiteFetchFailure(err, {
        source: "lead-magnet-signup",
        status: undefined,
      });
      setStatus("error-generic");
      trackEvent("lead_magnet_submission_failed", {
        ...leadMagnetAnalyticsProperties(sourcePage, activeLeadMagnet.slug),
        failure_type: "network_error",
      });
    } finally {
      resetTurnstile();
    }
  }

  async function handleResend() {
    if (!submittedEmail) {
      return;
    }

    if (siteKey && !turnstileToken) {
      setResendStatus("error");
      return;
    }

    setResendStatus("sending");
    trackEvent("lead_magnet_resend_requested", {
      ...leadMagnetAnalyticsProperties(sourcePage, activeLeadMagnet.slug),
    });

    try {
      const res = await submitLead(submittedEmail, { resendDelivery: true });
      if (!res.ok) {
        captureSiteFetchFailure(null, {
          source: "lead-magnet-resend",
          status: res.status,
        });
        trackEvent("lead_magnet_resend_failed", {
          ...leadMagnetAnalyticsProperties(sourcePage, activeLeadMagnet.slug),
          failure_type: "api_error",
          status: res.status,
        });
      }
      if (res.ok) {
        trackEvent(
          "lead_magnet_resend_queued",
          leadMagnetAnalyticsProperties(sourcePage, activeLeadMagnet.slug),
        );
        setResendStatus("accepted");
      } else {
        setResendStatus("error");
      }
    } catch (err) {
      captureSiteFetchFailure(err, {
        source: "lead-magnet-resend",
        status: undefined,
      });
      trackEvent("lead_magnet_resend_failed", {
        ...leadMagnetAnalyticsProperties(sourcePage, activeLeadMagnet.slug),
        failure_type: "network_error",
      });
      setResendStatus("error");
    } finally {
      resetTurnstile();
    }
  }

  const isError = status === "error-validation" || status === "error-generic";

  function selectLeadMagnet(nextLeadMagnet: typeof activeLeadMagnet) {
    if (nextLeadMagnet.slug === activeLeadMagnet.slug) {
      return;
    }

    const nextStoredDelivery = getLeadMagnetDelivery(nextLeadMagnet.slug);
    setActiveLeadMagnet(nextLeadMagnet);
    setEmail(nextStoredDelivery?.email ?? "");
    setSubmittedEmail(nextStoredDelivery?.email ?? "");
    setStatus(nextStoredDelivery ? "success" : "idle");
    setResendStatus("idle");
    resetTurnstile();
    trackEvent("lead_magnet_alternative_selected", {
      source_page: sourcePage,
      original_slug: leadMagnet.slug,
      selected_slug: nextLeadMagnet.slug,
    });
  }

  return (
    <section className="editorial-panel my-8 p-6 md:p-7">
      <p className="editorial-kicker">Free resource</p>
      <h2 className="mt-4 font-heading text-[length:var(--text-subheading)] font-bold text-brand-text">
        {activeLeadMagnet.headline ?? `Get the ${activeLeadMagnet.title}`}
      </h2>
      <p className="mt-3 text-[length:var(--text-caption)] leading-6 text-brand-muted">
        {activeLeadMagnet.description}
      </p>
      {leadMagnetOptions.length > 1 ? (
        <div className="mt-4">
          <p className="text-[length:var(--text-caption)] font-medium text-brand-text">
            Looking for something else?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {leadMagnetOptions.map((option) => {
              const isSelected = option.slug === activeLeadMagnet.slug;

              return (
                <button
                  key={option.slug}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => selectLeadMagnet(option)}
                  className={clsx(
                    "min-h-12 rounded-full border px-3 py-2 text-left text-[length:var(--text-caption)] font-medium transition",
                    isSelected
                      ? "border-primary-500 bg-primary-50 text-primary-700"
                      : "border-neutral-300 bg-surface text-brand-muted hover:border-primary-300 hover:text-primary-700",
                  )}
                >
                  {option.title}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {status === "success" ? (
        <div className="mt-5 rounded-[1rem] border border-primary-200 bg-primary-50 p-5">
          <>
            <p className="font-semibold text-brand-text">Request received</p>
            <p className="mt-2 text-[length:var(--text-caption)] text-brand-muted">
              If this address is eligible, we’ll send the file soon.
            </p>
            <p className="mt-3 text-[length:var(--text-caption)] text-brand-muted">
              {resendStatus === "accepted" ? (
                "Request received."
              ) : (
                <>
                  {resendStatus === "error" ? "Resend failed. " : "Didn't get it? "}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendStatus === "sending" || (siteKey ? !turnstileToken : false)}
                    className="rounded-full underline text-primary-700 disabled:opacity-50"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    {resendStatus === "sending" ? "Sending..." : "Resend the email"}
                  </button>
                  {resendStatus === "error"
                    ? ` or email ${marketingKnowledge.contact.publicEmail}.`
                    : "."}
                </>
              )}
            </p>
            <p className="mt-5 text-[length:var(--text-caption)] text-brand-muted">
              The resource is delivered by email.
            </p>
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={siteKey}
              onToken={setTurnstileToken}
              onExpire={() => setTurnstileToken("")}
            />
          </>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3 md:max-w-xl">
          {/* Honeypot: hidden from real users, visible to bots */}
          <input
            name="company_website"
            type="text"
            value={companyWebsite}
            onChange={(e) => setCompanyWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (status.startsWith("error")) {
                  setStatus("idle");
                }
              }}
              placeholder="you@company.com"
              aria-label="Email address"
              aria-invalid={isError ? "true" : "false"}
              aria-describedby={isError ? errorId : undefined}
              className={clsx(
                "flex-1 rounded-md border px-4 py-3 text-[length:var(--text-caption)]",
                "bg-surface-sunken focus:outline-none focus:border-primary-500 focus:border-2",
                isError ? "border-error-500" : "border-neutral-300",
              )}
              disabled={status === "loading"}
            />
            <button
              type="submit"
              disabled={status === "loading" || (!!siteKey && !turnstileToken)}
              className={clsx(
                "btn-primary btn-shimmer whitespace-nowrap px-6",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {status === "loading"
                ? "Sending..."
                : (activeLeadMagnet.ctaText ?? "Email Me the PDF")}
            </button>
          </div>
          <p
            id={errorId}
            aria-live="polite"
            className={isError ? "text-error-500" : "sr-only"}
            style={isError ? { fontSize: "var(--text-caption)" } : undefined}
          >
            {status === "error-validation"
              ? "Please enter a valid email address."
              : status === "error-generic"
                ? "Something went wrong. Please try again."
                : ""}
          </p>
          <TurnstileWidget
            ref={turnstileRef}
            siteKey={siteKey}
            onToken={setTurnstileToken}
            onExpire={() => setTurnstileToken("")}
          />
          <p className="text-[length:var(--text-caption)] text-brand-muted">{privacyNote}</p>
          <p className="text-[length:var(--text-caption)] text-brand-muted">
            Email is required because the download link is delivered by email, not on-page.
          </p>
        </form>
      )}
    </section>
  );
}

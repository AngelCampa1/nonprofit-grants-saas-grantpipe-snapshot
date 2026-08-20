import { useRef, useState } from "react";
import { clsx } from "clsx";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import type { LeadDeliveryState } from "@grantpipe/shared";
import {
  getLeadMagnetDelivery,
  isSignedUp,
  setLeadMagnetDelivered,
  setSignedUp,
} from "../lib/exit-popup-utils";
import { EMAIL_REGEX } from "../lib/email-validation";
import { trackEvent } from "../lib/analytics";
import { captureSiteFetchFailure } from "../lib/sentry-client";
import { sanitizeHtml } from "../lib/sanitize";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget";
import { getPublicTurnstileSiteKey } from "../lib/public-turnstile";
import { trackLeadMagnetDeliverySuppressed } from "../lib/lead-magnet-analytics";

type SubmitStatus =
  | "idle"
  | "loading"
  | "success"
  | "unsubscribed"
  | "error-validation"
  | "error-turnstile"
  | "error-generic";
type ResendStatus =
  | "idle"
  | "sending"
  | "sent"
  | "in_progress"
  | "ambiguous"
  | "unavailable"
  | "error";

interface LeadSignupResponse {
  deliveryState?: LeadDeliveryState;
}

async function readLeadSignupResponse(res: Response): Promise<LeadSignupResponse> {
  if (typeof res.json !== "function") {
    return {};
  }
  return (await res.json().catch(() => ({}))) as LeadSignupResponse;
}

function gatedContentAnalyticsProperties(sourcePage: string, magnetSlug?: string) {
  return {
    source_page: sourcePage,
    ...(magnetSlug ? { magnet_slug: magnetSlug } : {}),
  };
}

interface GatedContentProps {
  apiUrl: string;
  leadMagnetTitle: string;
  description: string;
  ctaText: string;
  teaserHtml: string;
  gatedHtml: string;
  privacyNote?: string;
  sourcePage?: string;
  magnetSlug?: string;
  turnstileSiteKey?: string;
}

export function GatedContent({
  apiUrl,
  leadMagnetTitle,
  description,
  ctaText,
  teaserHtml,
  gatedHtml,
  privacyNote = "Get the resource in your inbox.",
  sourcePage,
  magnetSlug,
  turnstileSiteKey,
}: GatedContentProps) {
  const siteKey = turnstileSiteKey ?? getPublicTurnstileSiteKey();
  const storedDelivery = getLeadMagnetDelivery(magnetSlug);
  const [unlocked, setUnlocked] = useState(() => storedDelivery !== null || isSignedUp());
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState(() => storedDelivery?.email ?? "");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");
  const [deliveryState, setDeliveryState] = useState<LeadDeliveryState>("queued");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [resendTurnstileToken, setResendTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const resendTurnstileRef = useRef<TurnstileWidgetHandle>(null);
  const showDeliveryConfirmation = submittedEmail.length > 0;
  const resolvedSourcePage = sourcePage ?? "lead-magnet";

  function resetTurnstile() {
    if (!siteKey) return;
    setTurnstileToken("");
    turnstileRef.current?.reset();
  }

  function resetResendTurnstile() {
    if (!siteKey) return;
    setResendTurnstileToken("");
    resendTurnstileRef.current?.reset();
  }

  if (unlocked) {
    return (
      <div className="prose prose-lg max-w-none">
        {showDeliveryConfirmation && (
          <div
            role="status"
            aria-live="polite"
            className="mb-6 p-5 rounded-lg border border-primary-200 bg-primary-50"
          >
            <p
              className="font-semibold text-brand-text mb-1"
              style={{ fontSize: "var(--text-body, 1rem)" }}
            >
              {deliveryState === "sent" ? "Check your email" : "Email queued"}
            </p>
            <p
              style={{
                fontSize: "var(--text-caption, 0.875rem)",
                color: "var(--color-brand-muted)",
              }}
            >
              {deliveryState === "sent"
                ? `We sent your ${leadMagnetTitle} to ${submittedEmail}.`
                : `We will send ${leadMagnetTitle} to ${submittedEmail}.`}
            </p>
            <p
              className="mt-2"
              style={{
                fontSize: "var(--text-caption, 0.875rem)",
                color: "var(--color-brand-muted)",
              }}
            >
              It comes from <strong>{marketingKnowledge.contact.publicEmail}</strong>. Check spam if
              you do not see it.
            </p>
            <p
              className="mt-3"
              style={{
                fontSize: "var(--text-caption, 0.875rem)",
                color: "var(--color-brand-muted)",
              }}
            >
              {resendStatus === "sent" ? (
                "Email sent. Check your inbox."
              ) : resendStatus === "in_progress" ? (
                "Your email is queued."
              ) : resendStatus === "ambiguous" ? (
                "We got your request. Delivery may still be in progress."
              ) : resendStatus === "unavailable" ? (
                "We could not send it again. Try another email."
              ) : resendStatus === "error" ? (
                <>
                  Something went wrong.{" "}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={siteKey ? !resendTurnstileToken : false}
                    className="rounded-full underline text-primary-600 disabled:opacity-50"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: "inherit",
                    }}
                  >
                    Try again
                  </button>{" "}
                  or email {marketingKnowledge.contact.publicEmail}.
                </>
              ) : (
                <>
                  Didn&apos;t get it?{" "}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={
                      resendStatus === "sending" || (siteKey ? !resendTurnstileToken : false)
                    }
                    className="rounded-full underline text-primary-600 disabled:opacity-50"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: "inherit",
                    }}
                  >
                    {resendStatus === "sending" ? "Sending\u2026" : "Resend the email"}
                  </button>
                  .
                </>
              )}
            </p>
            <TurnstileWidget
              ref={resendTurnstileRef}
              siteKey={siteKey}
              onToken={setResendTurnstileToken}
              onExpire={() => setResendTurnstileToken("")}
            />
          </div>
        )}
        <div
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(teaserHtml + gatedHtml),
          }}
        />
      </div>
    );
  }

  const isError =
    status === "error-validation" ||
    status === "error-turnstile" ||
    status === "error-generic" ||
    status === "unsubscribed";

  const errorMessage =
    status === "unsubscribed"
      ? "We could not send to this address"
      : status === "error-validation"
        ? "Please enter a valid email address."
        : status === "error-turnstile"
          ? "Please complete the verification challenge."
          : status === "error-generic"
            ? "Something went wrong. Please try again."
            : "";

  async function handleResend() {
    if (!submittedEmail) return;
    if (siteKey && !resendTurnstileToken) {
      setResendStatus("error");
      return;
    }

    setResendStatus("sending");
    trackEvent("gated_content_resend_requested", {
      ...gatedContentAnalyticsProperties(resolvedSourcePage, magnetSlug),
    });

    try {
      const res = await fetch(`${apiUrl}/api/public/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: submittedEmail,
          magnetSlug: magnetSlug ?? undefined,
          sourcePage: resolvedSourcePage,
          resendDelivery: true,
          companyWebsite,
          turnstileToken: resendTurnstileToken,
        }),
      });

      if (res.ok) {
        const data = await readLeadSignupResponse(res);
        trackEvent(
          data.deliveryState === "sent"
            ? "gated_content_resend_completed"
            : "gated_content_resend_queued",
          gatedContentAnalyticsProperties(resolvedSourcePage, magnetSlug),
        );
        setResendStatus(
          data.deliveryState === "sent"
            ? "sent"
            : data.deliveryState === "ambiguous"
              ? "ambiguous"
              : data.deliveryState === "in_progress" || data.deliveryState === "queued"
                ? "in_progress"
                : data.deliveryState === "resend_unavailable"
                  ? "unavailable"
                  : "in_progress",
        );
      } else {
        captureSiteFetchFailure(null, {
          source: "gated-content-resend",
          status: res.status,
        });
        trackEvent("gated_content_resend_failed", {
          ...gatedContentAnalyticsProperties(resolvedSourcePage, magnetSlug),
          failure_type: "api_error",
          status: res.status,
        });
        setResendStatus("error");
      }
    } catch (err) {
      captureSiteFetchFailure(err, {
        source: "gated-content-resend",
        status: undefined,
      });
      trackEvent("gated_content_resend_failed", {
        ...gatedContentAnalyticsProperties(resolvedSourcePage, magnetSlug),
        failure_type: "network_error",
      });
      setResendStatus("error");
    } finally {
      resetResendTurnstile();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      setStatus("error-validation");
      trackEvent("gated_content_submission_failed", {
        ...gatedContentAnalyticsProperties(resolvedSourcePage, magnetSlug),
        failure_type: "validation",
      });
      return;
    }

    if (siteKey && !turnstileToken) {
      setStatus("error-turnstile");
      return;
    }

    setStatus("loading");

    try {
      const res = await fetch(`${apiUrl}/api/public/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          magnetSlug: magnetSlug ?? undefined,
          sourcePage: resolvedSourcePage,
          companyWebsite,
          turnstileToken,
        }),
      });

      if (res.ok) {
        const data = await readLeadSignupResponse(res);
        if (data.deliveryState === "unsubscribed") {
          setSubmittedEmail(email);
          setStatus("unsubscribed");
          trackLeadMagnetDeliverySuppressed({
            source: "gated_content",
            sourcePage: resolvedSourcePage,
            magnetSlug,
          });
          return;
        }

        setSignedUp();
        setDeliveryState(data.deliveryState ?? "queued");
        setLeadMagnetDelivered(magnetSlug, email);
        setSubmittedEmail(email);
        setUnlocked(true);
        trackEvent("lead_magnet_unlocked", {
          ...(magnetSlug ? { slug: magnetSlug } : {}),
          source_page: resolvedSourcePage,
        });
        trackEvent("signup_submitted", {
          source: "gated_content",
          source_page: resolvedSourcePage,
          ...(magnetSlug ? { magnet_slug: magnetSlug } : {}),
        });
      } else {
        captureSiteFetchFailure(null, {
          source: "gated-content",
          status: res.status,
        });
        trackEvent("gated_content_submission_failed", {
          ...gatedContentAnalyticsProperties(resolvedSourcePage, magnetSlug),
          failure_type: "api_error",
          status: res.status,
        });
        setStatus("error-generic");
      }
    } catch (err) {
      captureSiteFetchFailure(err, {
        source: "gated-content",
        status: undefined,
      });
      trackEvent("gated_content_submission_failed", {
        ...gatedContentAnalyticsProperties(resolvedSourcePage, magnetSlug),
        failure_type: "network_error",
      });
      setStatus("error-generic");
    } finally {
      resetTurnstile();
    }
  }

  return (
    <div>
      {/* Teaser content */}
      <div
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(teaserHtml) }}
      />

      {/* Gate overlay with gradient fade */}
      <div className="lead-magnet-gate relative">
        {/* Gradient fade effect */}
        <div
          className="pointer-events-none h-24 -mt-24 relative z-10"
          style={{
            background: "linear-gradient(to bottom, transparent, var(--surface-sunken))",
          }}
        />

        {/* Email gate form */}
        <div
          className="relative z-20 rounded-lg border border-neutral-200 p-6 sm:p-8 text-center"
          style={{ background: "var(--surface-sunken)" }}
        >
          <h3
            className="font-heading font-bold mb-2"
            style={{
              fontSize: "var(--text-heading, 1.25rem)",
              color: "var(--color-brand-text)",
            }}
          >
            {leadMagnetTitle}
          </h3>
          <p
            className="mb-6"
            style={{
              fontSize: "var(--text-caption, 0.875rem)",
              color: "var(--color-brand-muted)",
            }}
          >
            {description}
          </p>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
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
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status.startsWith("error") || status === "unsubscribed") setStatus("idle");
              }}
              placeholder="you@company.com"
              aria-label="Email address"
              aria-invalid={isError}
              aria-describedby="gated-content-error"
              className={clsx(
                "flex-1 px-4 py-2.5 rounded-md border text-[length:var(--text-caption,0.875rem)]",
                "bg-surface-sunken",
                "focus:outline-none focus:border-primary-500 focus:border-2",
                "transition-[border-color] duration-[var(--transition-fast,150ms)]",
                isError ? "border-error-500" : "border-neutral-300",
              )}
              disabled={status === "loading"}
            />

            <button
              type="submit"
              disabled={status === "loading"}
              className={clsx(
                "btn-primary btn-shimmer",
                "whitespace-nowrap px-6",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                status === "loading" && "cursor-wait",
              )}
            >
              {status === "loading" ? "Sending\u2026" : ctaText}
            </button>
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={siteKey}
              onToken={setTurnstileToken}
              onExpire={() => setTurnstileToken("")}
            />
          </form>

          <p
            id="gated-content-error"
            aria-live="polite"
            className={isError ? "text-error-500 mt-2" : "sr-only"}
            style={isError ? { fontSize: "var(--text-caption, 0.875rem)" } : undefined}
          >
            {isError ? errorMessage : ""}
          </p>

          {status === "unsubscribed" ? (
            <p
              className="mt-2"
              style={{
                fontSize: "var(--text-caption, 0.875rem)",
                color: "var(--color-brand-muted)",
              }}
            >
              We could not deliver the resource to {submittedEmail}. Use another email, or contact{" "}
              {marketingKnowledge.contact.publicEmail} if you want this address restored.
            </p>
          ) : null}

          <p
            className="mt-4"
            style={{
              fontSize: "var(--text-caption, 0.875rem)",
              color: "var(--color-brand-muted)",
            }}
          >
            {privacyNote}
          </p>
        </div>
      </div>
    </div>
  );
}

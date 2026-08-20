import { useState, useEffect, useRef, useCallback } from "react";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import type { LeadDeliveryState } from "@grantpipe/shared";
import { useFocusTrap } from "../lib/focus-trap";
import { clsx } from "clsx";
import {
  isSignedUp,
  isWithinSuppressWindow,
  setSuppressed,
  setSignedUp,
  setLeadMagnetDelivered,
  detectScrollBack,
  SUPPRESS_DAYS,
} from "../lib/exit-popup-utils";
import { EXIT_POPUP_DEFAULTS } from "../lib/exit-popup-defaults";
import type { LeadMagnetOffer } from "../types";
import { EMAIL_REGEX } from "../lib/email-validation";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { trackEvent } from "../lib/analytics";
import { captureSiteFetchFailure } from "../lib/sentry-client";
import { persistSignupAttribution, resolveSignupAttribution } from "../lib/signup-attribution";
import { trackLeadMagnetDeliverySuppressed } from "../lib/lead-magnet-analytics";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget";
import { getPublicTurnstileSiteKey } from "../lib/public-turnstile";

type SubmitStatus =
  | "idle"
  | "loading"
  | "success"
  | "unsubscribed"
  | "error-validation"
  | "error-duplicate"
  | "error-generic"
  | "error-turnstile";
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

function exitPopupAnalyticsProperties(sourcePage: string, magnetSlug?: string) {
  return {
    source_page: sourcePage,
    ...(magnetSlug ? { magnet_slug: magnetSlug } : {}),
  };
}

interface ExitIntentPopupProps {
  apiUrl: string;
  leadMagnet?: LeadMagnetOffer;
  headline: string;
  description: string;
  ctaText: string;
  leftPanelLabel: string;
  successSubMessage: string;
  showLeadMagnetContent?: boolean;
  declineText?: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  errorTurnstile?: string;
  successMessage?: string;
  loadingText?: string;
  turnstileSiteKey?: string;
}

export function ExitIntentPopup({
  apiUrl,
  leadMagnet,
  headline,
  description,
  ctaText,
  leftPanelLabel,
  successSubMessage,
  showLeadMagnetContent = true,
  declineText = EXIT_POPUP_DEFAULTS.declineText,
  privacyNote = EXIT_POPUP_DEFAULTS.privacyNote,
  errorInvalidEmail = EXIT_POPUP_DEFAULTS.errorInvalidEmail,
  errorDuplicate = EXIT_POPUP_DEFAULTS.errorDuplicate,
  errorGeneric = EXIT_POPUP_DEFAULTS.errorGeneric,
  errorTurnstile = EXIT_POPUP_DEFAULTS.errorTurnstile,
  successMessage = EXIT_POPUP_DEFAULTS.successMessage,
  loadingText,
  turnstileSiteKey,
}: ExitIntentPopupProps) {
  const siteKey = turnstileSiteKey ?? getPublicTurnstileSiteKey();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");
  const [deliveryState, setDeliveryState] = useState<LeadDeliveryState>("queued");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const triggeredRef = useRef(false);
  const dismissedRef = useRef(false);
  // Tracks whether the shown analytics event has fired within this popup
  // lifecycle. Resets naturally on component unmount/remount if re-show is
  // ever needed; there is no runtime path that resets it while dismissed.
  const shownTrackedRef = useRef(false);
  const peakScrollYRef = useRef(0);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showResolvedLeadMagnetContent = showLeadMagnetContent && Boolean(leadMagnet?.slug);
  const resolvedHeadline =
    showResolvedLeadMagnetContent && leadMagnet?.headline ? leadMagnet.headline : headline;
  const resolvedDescription =
    showResolvedLeadMagnetContent && leadMagnet?.description ? leadMagnet.description : description;
  const resolvedCtaText =
    showResolvedLeadMagnetContent && leadMagnet?.ctaText ? leadMagnet.ctaText : ctaText;
  const resolvedSuccessMessage =
    showResolvedLeadMagnetContent && leadMagnet?.successMessage
      ? leadMagnet.successMessage
      : successMessage;
  const resolvedSuccessSubMessage =
    showResolvedLeadMagnetContent && leadMagnet?.successSubMessage
      ? submittedEmail
        ? `${leadMagnet.successSubMessage} Delivery address: ${submittedEmail}.`
        : leadMagnet.successSubMessage
      : successSubMessage;
  const panelTitle =
    showResolvedLeadMagnetContent && leadMagnet?.title ? leadMagnet.title : undefined;
  const selectedMagnetSlug =
    showResolvedLeadMagnetContent && leadMagnet?.slug ? leadMagnet.slug : undefined;
  const sourcePage =
    typeof window === "undefined" ? "exit-popup" : window.location.pathname || "exit-popup";

  const dismiss = useCallback(() => {
    setSuppressed();
    dismissedRef.current = true;
    triggeredRef.current = false;
    setVisible(false);
    trackEvent("exit_popup_dismissed");
  }, []);

  // Focus email input when popup opens
  useEffect(() => {
    if (visible && emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, [visible]);

  // Esc key handler — only active when visible
  useEffect(() => {
    if (!visible) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dismiss();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, dismiss]);

  useFocusTrap(dialogRef, visible);

  // Body scroll lock when visible
  useEffect(() => {
    if (!visible) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [visible]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Mount: attach exit-intent triggers
  useEffect(() => {
    persistSignupAttribution();

    if (isSignedUp() || isWithinSuppressWindow(SUPPRESS_DAYS)) {
      return;
    }

    const timer = setTimeout(() => {
      triggeredRef.current = true;
    }, 5000);

    function handleMouseLeave(e: MouseEvent) {
      if (triggeredRef.current && !dismissedRef.current && e.clientY < 5) {
        setVisible(true);
        if (!shownTrackedRef.current) {
          shownTrackedRef.current = true;
          trackEvent("exit_popup_shown", { trigger: "mouseleave" });
        }
      }
    }

    document.addEventListener("mouseleave", handleMouseLeave);

    let scrollHandler: (() => void) | null = null;

    if ("ontouchstart" in window) {
      scrollHandler = () => {
        const currentY = window.scrollY;
        if (currentY > peakScrollYRef.current) {
          peakScrollYRef.current = currentY;
        }
        if (
          triggeredRef.current &&
          !dismissedRef.current &&
          detectScrollBack(currentY, peakScrollYRef.current, 300, 200)
        ) {
          setVisible(true);
          if (!shownTrackedRef.current) {
            shownTrackedRef.current = true;
            trackEvent("exit_popup_shown", { trigger: "scroll_back" });
          }
        }
      };
      window.addEventListener("scroll", scrollHandler, { passive: true });
    }

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseleave", handleMouseLeave);
      if (scrollHandler) {
        window.removeEventListener("scroll", scrollHandler);
      }
    };
  }, []);

  // Turnstile tokens are single-use. After every POST that spends one, clear it
  // and re-run the challenge so the next request (retry or resend) carries a
  // fresh token instead of a spent one the server would reject with a 403.
  function resetTurnstile() {
    if (!siteKey) return;
    setTurnstileToken("");
    turnstileRef.current?.reset();
  }

  // When the challenge mints a fresh token, the verification gate is satisfied
  // again — clear a lingering turnstile error so the user isn't shown "complete
  // the verification" next to a solved widget.
  function handleTurnstileToken(token: string) {
    setTurnstileToken(token);
    if (token) {
      setStatus((prev) => (prev === "error-turnstile" ? "idle" : prev));
    }
  }

  async function submitLead(emailAddress: string, options?: { resendDelivery?: boolean }) {
    const attribution = resolveSignupAttribution();

    return fetch(`${apiUrl}/api/public/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailAddress,
        sourcePage,
        magnetSlug: selectedMagnetSlug,
        resendDelivery: options?.resendDelivery ?? false,
        utm: {
          utmSource: attribution.utmSource ?? undefined,
          utmMedium: attribution.utmMedium ?? undefined,
          utmCampaign: attribution.utmCampaign ?? undefined,
          referredBy: attribution.referredBy ?? undefined,
        },
        turnstileToken,
      }),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      setStatus("error-validation");
      trackEvent("exit_popup_submission_failed", {
        ...exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
        failure_type: "validation",
      });
      return;
    }

    if (siteKey && !turnstileToken) {
      setStatus("error-turnstile");
      trackEvent("exit_popup_submission_failed", {
        ...exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
        failure_type: "turnstile",
      });
      return;
    }

    setStatus("loading");

    try {
      const res = await submitLead(email);
      if (res.ok) {
        const data = await readLeadSignupResponse(res);
        if (data.deliveryState === "unsubscribed") {
          dismissedRef.current = true;
          setSubmittedEmail(email);
          setStatus("unsubscribed");
          trackLeadMagnetDeliverySuppressed({
            source: "exit_popup",
            sourcePage,
            magnetSlug: selectedMagnetSlug,
          });
          return;
        }

        setSignedUp();
        if (selectedMagnetSlug) {
          setLeadMagnetDelivered(selectedMagnetSlug, email);
        }
        dismissedRef.current = true;
        setSubmittedEmail(email);
        setDeliveryState(data.deliveryState ?? "queued");
        // The token was spent on this submit. Clear it so the resend control
        // waits for the success-state widget to mint a fresh one.
        setTurnstileToken("");
        setStatus("success");
        trackEvent("exit_popup_converted");
        trackEvent("signup_submitted", {
          source: "exit_popup",
          source_page: sourcePage,
        });
        timerRef.current = setTimeout(() => {
          setVisible(false);
        }, 2000);
      } else if (res.status === 409) {
        setStatus("error-duplicate");
        trackEvent("exit_popup_submission_failed", {
          ...exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
          failure_type: "duplicate",
          status: res.status,
        });
        // Single-use Turnstile token was spent on this request; mint a fresh
        // one so a retry isn't rejected as a stale/forged token.
        resetTurnstile();
      } else if (res.status === 403) {
        // Server rejected the Turnstile token (expired, forged, or already
        // spent). This is an expected verification failure — surface it as a
        // turnstile error and re-run the challenge instead of logging to Sentry.
        setStatus("error-turnstile");
        trackEvent("exit_popup_submission_failed", {
          ...exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
          failure_type: "turnstile",
          status: res.status,
        });
        resetTurnstile();
      } else {
        captureSiteFetchFailure(null, {
          source: "exit-intent-popup",
          status: res.status,
        });
        setStatus("error-generic");
        trackEvent("exit_popup_submission_failed", {
          ...exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
          failure_type: "api_error",
          status: res.status,
        });
        resetTurnstile();
      }
    } catch (err) {
      captureSiteFetchFailure(err, {
        source: "exit-intent-popup",
        status: undefined,
      });
      setStatus("error-generic");
      trackEvent("exit_popup_submission_failed", {
        ...exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
        failure_type: "network_error",
      });
      resetTurnstile();
    }
  }

  async function handleResend() {
    if (!submittedEmail || !selectedMagnetSlug) {
      return;
    }

    // The server verifies Turnstile on every lead POST, including resends. If
    // the challenge hasn't produced a fresh token yet, don't fire a request the
    // server would reject — surface the retry affordance instead.
    if (siteKey && !turnstileToken) {
      setResendStatus("error");
      return;
    }

    setResendStatus("sending");
    trackEvent("exit_popup_resend_requested", {
      ...exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
    });

    try {
      const res = await submitLead(submittedEmail, { resendDelivery: true });
      if (res.ok) {
        const data = await readLeadSignupResponse(res);
        trackEvent(
          data.deliveryState === "sent"
            ? "exit_popup_resend_completed"
            : "exit_popup_resend_queued",
          exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
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
      } else if (res.status === 403) {
        // Expected Turnstile rejection (token spent/expired). Don't log to
        // Sentry — re-running the challenge below mints a fresh token to retry.
        trackEvent("exit_popup_resend_failed", {
          ...exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
          failure_type: "turnstile",
          status: res.status,
        });
      } else {
        captureSiteFetchFailure(null, {
          source: "exit-intent-resend",
          status: res.status,
        });
        trackEvent("exit_popup_resend_failed", {
          ...exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
          failure_type: "api_error",
          status: res.status,
        });
      }
      // Spent the token on this resend; mint a fresh one for any further resend.
      resetTurnstile();
      if (!res.ok) setResendStatus("error");
    } catch (err) {
      captureSiteFetchFailure(err, {
        source: "exit-intent-resend",
        status: undefined,
      });
      trackEvent("exit_popup_resend_failed", {
        ...exitPopupAnalyticsProperties(sourcePage, selectedMagnetSlug),
        failure_type: "network_error",
      });
      resetTurnstile();
      setResendStatus("error");
    }
  }

  if (!visible) {
    return null;
  }

  const isError =
    status === "error-validation" ||
    status === "error-duplicate" ||
    status === "error-generic" ||
    status === "error-turnstile";

  const currentErrorMessage =
    status === "error-validation"
      ? errorInvalidEmail
      : status === "error-duplicate"
        ? errorDuplicate
        : status === "error-generic"
          ? errorGeneric
          : status === "error-turnstile"
            ? errorTurnstile
            : "";

  return (
    <div
      data-backdrop
      onClick={dismiss}
      className="fixed inset-0 flex items-center justify-center z-[80]"
      style={{ background: "var(--exit-popup-overlay-bg)" }}
    >
      {/* Dialog — stop propagation so clicks inside don't dismiss */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-popup-heading"
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col sm:flex-row w-full max-w-[540px] mx-4 rounded-lg overflow-hidden shadow-ambient"
      >
        {/* Left panel (subtle primary tint) */}
        <div className="flex flex-col items-center justify-center gap-3 p-6 sm:w-44 sm:shrink-0 bg-primary-50 border-r border-neutral-200">
          {/* Document SVG icon */}
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect
              x="8"
              y="4"
              width="28"
              height="36"
              rx="3"
              style={{ fill: "var(--color-primary-700)" }}
              fillOpacity="0.25"
            />
            <rect
              x="10"
              y="6"
              width="24"
              height="32"
              rx="2"
              style={{ fill: "var(--color-primary-700)" }}
              fillOpacity="0.9"
            />
            <rect x="14" y="13" width="16" height="2" rx="1" fill="var(--color-primary-50)" />
            <rect x="14" y="18" width="16" height="2" rx="1" fill="var(--color-primary-50)" />
            <rect x="14" y="23" width="10" height="2" rx="1" fill="var(--color-primary-50)" />
          </svg>
          <span
            className="text-[length:var(--text-caption)] font-bold tracking-widest uppercase"
            style={{ color: "var(--color-primary-700)" }}
          >
            {leftPanelLabel}
          </span>
          {panelTitle ? (
            <p
              className="text-[length:var(--text-caption)] font-semibold text-center leading-snug"
              style={{ color: "var(--color-primary-700)" }}
            >
              {panelTitle}
            </p>
          ) : null}
        </div>

        {/* Right panel (white/surface) */}
        <div
          className="flex flex-col gap-4 p-6 flex-1"
          style={{ background: "var(--surface-sunken)" }}
        >
          {/* Close button */}
          <button
            type="button"
            aria-label="Close"
            onClick={dismiss}
            className={clsx(
              "absolute top-3 right-3",
              "w-11 h-11 flex items-center justify-center",
              "rounded-full text-neutral-500",
              "hover:bg-neutral-100",
              "transition-colors",
            )}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {status === "success" || status === "unsubscribed" ? (
            /* Success state */
            <div className="flex flex-col gap-2 pt-2">
              <h2
                id="exit-popup-heading"
                className="font-heading font-bold text-brand-text"
                style={{ fontSize: "var(--text-heading)" }}
              >
                {status === "unsubscribed"
                  ? "We could not send to this address"
                  : deliveryState === "sent" || !selectedMagnetSlug
                    ? resolvedSuccessMessage
                    : "Email queued"}
              </h2>
              <p className="text-[length:var(--text-caption)] text-brand-muted">
                {status === "unsubscribed"
                  ? `We could not deliver the resource to ${submittedEmail}.`
                  : deliveryState === "sent" || !selectedMagnetSlug
                    ? resolvedSuccessSubMessage
                    : `We will send the resource to ${submittedEmail}.`}
              </p>
              {status === "unsubscribed" ? (
                <>
                  <p className="text-[length:var(--text-caption)] text-brand-muted">
                    Use another email, or contact {marketingKnowledge.contact.publicEmail} if you
                    want this address restored.
                  </p>
                  <button
                    type="button"
                    className="mt-2 inline-flex w-fit items-center justify-center rounded-full border border-primary-200 px-4 py-2 font-medium text-primary-700 transition hover:border-primary-300 hover:bg-primary-50"
                    onClick={() => {
                      dismissedRef.current = false;
                      setEmail("");
                      setSubmittedEmail("");
                      setStatus("idle");
                    }}
                  >
                    Use another email
                  </button>
                </>
              ) : selectedMagnetSlug ? (
                <>
                  <p className="text-[length:var(--text-caption)] text-brand-muted">
                    {resendStatus === "sent" ? (
                      "Email sent. Check your inbox."
                    ) : resendStatus === "in_progress" ? (
                      "Your email is queued."
                    ) : resendStatus === "ambiguous" ? (
                      "We got your request. Delivery may still be in progress."
                    ) : resendStatus === "unavailable" ? (
                      "We could not send it again. Try another email."
                    ) : (
                      <>
                        {resendStatus === "error" ? "Resend failed. " : "Didn't get it? "}
                        <button
                          type="button"
                          onClick={handleResend}
                          disabled={resendStatus === "sending"}
                          className="underline text-primary-700 disabled:opacity-50"
                          style={{ background: "none", border: "none", padding: 0 }}
                        >
                          {resendStatus === "sending" ? "Sending..." : "Resend the email"}
                        </button>
                        {resendStatus === "error"
                          ? ` or email ${marketingKnowledge.contact.publicEmail}.`
                          : "."}
                      </>
                    )}
                  </p>
                  {/* Resend re-verifies Turnstile server-side. Keep a widget
                      mounted here so it mints a fresh single-use token for the
                      resend request after the form's widget unmounted. */}
                  <TurnstileWidget
                    ref={turnstileRef}
                    siteKey={siteKey}
                    onToken={setTurnstileToken}
                    onExpire={() => setTurnstileToken("")}
                  />
                </>
              ) : null}
            </div>
          ) : (
            /* Form state */
            <>
              <h2
                id="exit-popup-heading"
                className="font-heading font-bold text-brand-text pr-8 leading-snug"
                style={{ fontSize: "var(--text-heading)" }}
              >
                {resolvedHeadline}
              </h2>
              <p className="text-[length:var(--text-caption)] text-brand-muted">
                {resolvedDescription}
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input
                  ref={emailInputRef}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status.startsWith("error") && status !== "error-turnstile")
                      setStatus("idle");
                  }}
                  placeholder="you@company.com"
                  aria-label="Email address"
                  aria-invalid={isError}
                  aria-describedby="exit-popup-error"
                  className={clsx(
                    "w-full px-4 py-2.5 rounded-md border text-[length:var(--text-caption)]",
                    "bg-surface-sunken",
                    "focus:outline-none focus:border-primary-500 focus:border-2",
                    "transition-[border-color] duration-[var(--transition-fast)]",
                    isError ? "border-error-500" : "border-neutral-300",
                  )}
                  disabled={status === "loading"}
                />

                <TurnstileWidget
                  ref={turnstileRef}
                  siteKey={siteKey}
                  onToken={handleTurnstileToken}
                  onExpire={() => setTurnstileToken("")}
                />

                <button
                  type="submit"
                  disabled={status === "loading"}
                  className={clsx(
                    "btn-primary",
                    "w-full",
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100",
                    status === "loading" && "cursor-wait",
                  )}
                >
                  {status === "loading" ? (loadingText ?? "Sending\u2026") : resolvedCtaText}
                </button>
              </form>

              <p
                id="exit-popup-error"
                aria-live="polite"
                className={isError ? "text-error-500" : "sr-only"}
                style={isError ? { fontSize: "var(--text-caption)" } : undefined}
              >
                {isError ? currentErrorMessage : ""}
              </p>

              <p className="text-brand-muted" style={{ fontSize: "var(--text-caption)" }}>
                {privacyNote}
              </p>

              <button
                type="button"
                onClick={dismiss}
                className="transition-colors text-brand-muted underline underline-offset-2 hover:text-brand-text text-left"
                style={{ fontSize: "var(--text-caption)" }}
              >
                {declineText}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

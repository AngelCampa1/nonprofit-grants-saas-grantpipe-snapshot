import { useState, useEffect, useCallback, useEffectEvent, useId, useRef } from "react";
import { clsx } from "clsx";
import { PostSignupSurvey } from "./post-signup-survey";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget";
import type { SurveyQuestion, SurveyQualificationConfig } from "../types";
import { EMAIL_REGEX } from "../lib/email-validation";
import { trackEvent } from "../lib/analytics";
import { captureSiteFetchFailure } from "../lib/sentry-client";
import { trackEmailFocus, trackEmailBlurWithoutSubmit } from "../lib/form-interaction-tracker";
import { persistSignupAttribution, resolveSignupAttribution } from "../lib/signup-attribution";
import type { PublicSignupFlowConfig } from "../lib/public-signup-flow";
import { getPublicTurnstileSiteKey } from "../lib/public-turnstile";
import type { LeadDeliveryState } from "@grantpipe/shared";

interface SignupResponse {
  surveyToken?: string;
  deliveryState?: LeadDeliveryState;
}

type SubmitStatus =
  | "idle"
  | "loading"
  | "success"
  | "unsubscribed"
  | "error-validation"
  | "error-turnstile"
  | "error-generic";

const PRE_SUBMIT_QUESTION_COPY_PATTERN = /\b(question|questions|survey|questionnaire)\b/i;

interface EmailCaptureProps {
  apiUrl: string;
  sourcePage: string;
  buttonText?: string;
  placeholder?: string;
  emailLabel?: string;
  inputId?: string;
  signupFlowConfigUrl?: string;
  surveyQuestions?: SurveyQuestion[];
  surveyQualification?: SurveyQualificationConfig;
  qualification?: SurveyQualificationConfig;
  discoveryCallUrl?: string;
  subtitle?: string;
  whatHappensNext?: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  successMessage?: string;
  surveyPreview?: string;
  qualifiedHeading?: string;
  qualifiedBody?: string;
  qualifiedCtaText?: string;
  qualifiedCtaTarget?: string;
  unqualifiedHeading?: string;
  unqualifiedBody?: string;
  unqualifiedCtaText?: string;
  unqualifiedCtaTarget?: string;
  qualifiedDismissText?: string;
  unqualifiedDismissText?: string;
  ariaLabel?: string;
  loadingText?: string;
  turnstileSiteKey?: string;
}

export function EmailCapture({
  apiUrl,
  sourcePage,
  buttonText = "Continue",
  placeholder,
  emailLabel = "Email address",
  inputId,
  signupFlowConfigUrl,
  surveyQuestions,
  surveyQualification,
  qualification,
  discoveryCallUrl,
  subtitle,
  whatHappensNext,
  privacyNote,
  errorInvalidEmail = "Please enter a valid email address",
  errorDuplicate,
  errorGeneric = "Something went wrong. Please try again.",
  successMessage = "You're in!",
  surveyPreview,
  qualifiedHeading,
  qualifiedBody,
  qualifiedCtaText,
  qualifiedCtaTarget,
  unqualifiedHeading,
  unqualifiedBody,
  unqualifiedCtaText,
  unqualifiedCtaTarget,
  qualifiedDismissText,
  unqualifiedDismissText,
  ariaLabel = "Continue with your email",
  loadingText = "Sending…",
  turnstileSiteKey,
}: EmailCaptureProps) {
  const siteKey = turnstileSiteKey ?? getPublicTurnstileSiteKey();
  const generatedInputId = useId().replace(/:/g, "");
  const resolvedInputId = inputId ?? `email-capture-${generatedInputId}`;
  const errorId = `${resolvedInputId}-error`;
  const [loadedSignupFlowConfig, setLoadedSignupFlowConfig] =
    useState<PublicSignupFlowConfig | null>(null);
  const [isLoadingSignupFlowConfig, setIsLoadingSignupFlowConfig] = useState(
    Boolean(signupFlowConfigUrl),
  );
  const [signupFlowLoadError, setSignupFlowLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyToken, setSurveyToken] = useState<string | undefined>();
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signupFlowRequestRef = useRef<Promise<PublicSignupFlowConfig | null> | null>(null);
  const inlineSignupFlowConfig =
    surveyQuestions && discoveryCallUrl
      ? ({
          surveyQuestions,
          surveyQualification,
          qualification: qualification ?? surveyQualification,
          discoveryCallUrl,
          subtitle,
          whatHappensNext,
          privacyNote,
          errorInvalidEmail,
          errorDuplicate,
          errorGeneric,
          successMessage,
          surveyPreview,
          qualifiedHeading,
          qualifiedBody,
          qualifiedCtaText,
          qualifiedCtaTarget,
          unqualifiedHeading,
          unqualifiedBody,
          unqualifiedCtaText,
          unqualifiedCtaTarget,
          qualifiedDismissText,
          unqualifiedDismissText,
        } satisfies PublicSignupFlowConfig)
      : null;
  const resolvedSignupFlowConfig = loadedSignupFlowConfig ?? inlineSignupFlowConfig;
  const resolvedQualification =
    resolvedSignupFlowConfig?.qualification ?? resolvedSignupFlowConfig?.surveyQualification;
  const resolvedSubtitle = subtitle ?? resolvedSignupFlowConfig?.subtitle;
  const visibleWhatHappensNext =
    (whatHappensNext ?? resolvedSignupFlowConfig?.whatHappensNext) &&
    !PRE_SUBMIT_QUESTION_COPY_PATTERN.test(
      whatHappensNext ?? resolvedSignupFlowConfig?.whatHappensNext ?? "",
    )
      ? (whatHappensNext ?? resolvedSignupFlowConfig?.whatHappensNext)
      : undefined;

  function trackSignupFailed(properties: {
    failure_type: "api" | "network" | "validation";
    status?: number;
  }) {
    trackEvent("signup_failed", {
      source: "email_capture",
      source_page: sourcePage,
      ...properties,
    });
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    persistSignupAttribution();
  }, []);

  const loadSignupFlowConfig = useCallback(async (): Promise<PublicSignupFlowConfig | null> => {
    if (inlineSignupFlowConfig) {
      setSignupFlowLoadError(null);
      setIsLoadingSignupFlowConfig(false);
      return inlineSignupFlowConfig;
    }

    if (loadedSignupFlowConfig) {
      setSignupFlowLoadError(null);
      setIsLoadingSignupFlowConfig(false);
      return loadedSignupFlowConfig;
    }

    if (!signupFlowConfigUrl) {
      setIsLoadingSignupFlowConfig(false);
      return null;
    }

    if (!signupFlowRequestRef.current) {
      setIsLoadingSignupFlowConfig(true);
      setSignupFlowLoadError(null);
      signupFlowRequestRef.current = (async () => {
        const response = await fetch(signupFlowConfigUrl);
        if (!response.ok) {
          captureSiteFetchFailure(null, {
            source: "email-capture-config",
            status: response.status,
          });
          signupFlowRequestRef.current = null;
          setIsLoadingSignupFlowConfig(false);
          setSignupFlowLoadError("We couldn't load the signup form. Please try again.");
          return null;
        }

        const config = (await response.json()) as PublicSignupFlowConfig;
        setLoadedSignupFlowConfig(config);
        setIsLoadingSignupFlowConfig(false);
        return config;
      })().catch((error) => {
        signupFlowRequestRef.current = null;
        setIsLoadingSignupFlowConfig(false);
        setSignupFlowLoadError("We couldn't load the signup form. Please try again.");
        captureSiteFetchFailure(error, {
          source: "email-capture-config",
          status: undefined,
        });
        return null;
      });
    }

    return signupFlowRequestRef.current;
  }, [inlineSignupFlowConfig, loadedSignupFlowConfig, signupFlowConfigUrl]);

  const loadSignupFlowConfigInEffect = useEffectEvent(() => {
    void loadSignupFlowConfig();
  });

  useEffect(() => {
    loadSignupFlowConfigInEffect();
  }, [signupFlowConfigUrl]);

  const openSurveyFromSearch = useEffectEvent((search: string) => {
    const params = new URLSearchParams(search);
    if (params.get("survey") === "open") {
      const encoded = params.get("e");
      if (encoded) {
        try {
          const decodedEmail = atob(encoded);
          if (EMAIL_REGEX.test(decodedEmail)) {
            setEmail(decodedEmail);
            setStatus("success");
            setShowSurvey(true);
          }
        } catch {
          // ignore malformed base64
        }
      }
      const token = params.get("t");
      if (token) {
        setSurveyToken(token);
      }
    }
  });

  useEffect(() => {
    openSurveyFromSearch(window.location.search);
  }, []);

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmail(e.target.value);
    if (status.startsWith("error")) {
      setStatus("idle");
    }
  }

  function resetTurnstile() {
    if (!siteKey) return;
    setTurnstileToken("");
    turnstileRef.current?.reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      setStatus("error-validation");
      trackSignupFailed({ failure_type: "validation" });
      return;
    }

    if (siteKey && !turnstileToken) {
      setStatus("error-turnstile");
      return;
    }

    setStatus("loading");

    try {
      const attribution = resolveSignupAttribution();
      const res = await fetch(`${apiUrl}/api/public/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sourcePage,
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

      if (res.ok) {
        let data: SignupResponse = {};
        try {
          data = (await res.json()) as SignupResponse;
          if (data.surveyToken) {
            setSurveyToken(data.surveyToken);
          }
        } catch {
          // Response may not be JSON; continue with the default post-submit flow.
        }
        if (data.deliveryState === "unsubscribed") {
          setStatus("unsubscribed");
          return;
        }
        const utmProps: Record<string, string> = {};
        const utmSource = attribution.utmSource;
        const utmMedium = attribution.utmMedium;
        const utmCampaign = attribution.utmCampaign;
        if (utmSource) utmProps.utm_source = utmSource;
        if (utmMedium) utmProps.utm_medium = utmMedium;
        if (utmCampaign) utmProps.utm_campaign = utmCampaign;
        trackEvent("signup_completed", {
          source_page: sourcePage,
          ...utmProps,
        });
        trackEvent("signup_submitted", {
          source: "email_capture",
          source_page: sourcePage,
          ...utmProps,
        });
        setStatus("success");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setShowSurvey(true);
        }, 1500);
      } else {
        captureSiteFetchFailure(null, {
          source: "email-capture",
          status: res.status,
        });
        trackSignupFailed({ failure_type: "api", status: res.status });
        setStatus("error-generic");
      }
    } catch (err) {
      captureSiteFetchFailure(err, {
        source: "email-capture",
        status: undefined,
      });
      trackSignupFailed({ failure_type: "network" });
      setStatus("error-generic");
    } finally {
      resetTurnstile();
    }
  }

  if (showSurvey) {
    return (
      <PostSignupSurvey
        apiUrl={apiUrl}
        surveyToken={surveyToken}
        questions={resolvedSignupFlowConfig?.surveyQuestions ?? []}
        qualificationConfig={resolvedQualification}
        qualification={resolvedQualification}
        discoveryCallUrl={resolvedSignupFlowConfig?.discoveryCallUrl ?? ""}
        onComplete={() => setShowSurvey(false)}
        qualifiedHeading={qualifiedHeading ?? resolvedSignupFlowConfig?.qualifiedHeading}
        qualifiedBody={qualifiedBody ?? resolvedSignupFlowConfig?.qualifiedBody}
        qualifiedCtaText={qualifiedCtaText ?? resolvedSignupFlowConfig?.qualifiedCtaText}
        qualifiedCtaTarget={qualifiedCtaTarget ?? resolvedSignupFlowConfig?.qualifiedCtaTarget}
        unqualifiedHeading={unqualifiedHeading ?? resolvedSignupFlowConfig?.unqualifiedHeading}
        unqualifiedBody={unqualifiedBody ?? resolvedSignupFlowConfig?.unqualifiedBody}
        unqualifiedCtaText={unqualifiedCtaText ?? resolvedSignupFlowConfig?.unqualifiedCtaText}
        unqualifiedCtaTarget={
          unqualifiedCtaTarget ?? resolvedSignupFlowConfig?.unqualifiedCtaTarget
        }
        qualifiedDismissText={
          qualifiedDismissText ?? resolvedSignupFlowConfig?.qualifiedDismissText
        }
        unqualifiedDismissText={
          unqualifiedDismissText ?? resolvedSignupFlowConfig?.unqualifiedDismissText
        }
        sourcePage={sourcePage}
      />
    );
  }

  const isError =
    status === "error-validation" ||
    status === "error-turnstile" ||
    status === "error-generic" ||
    status === "unsubscribed";

  const currentErrorMessage =
    status === "error-validation"
      ? errorInvalidEmail
      : status === "unsubscribed"
        ? "You asked us to stop. Try a new email."
        : status === "error-turnstile"
          ? "Please complete the verification challenge."
          : status === "error-generic"
            ? errorGeneric
            : "";

  if (!resolvedSignupFlowConfig) {
    if (signupFlowLoadError) {
      return (
        <div
          className="max-w-md mx-auto space-y-4 text-center"
          style={{ gap: "var(--component-gap-sm)" }}
        >
          <h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-brand-text">
            We couldn't load the signup form.
          </h3>
          <p className="text-[length:var(--text-body)] leading-7 text-brand-muted">
            {signupFlowLoadError}
          </p>
          <button
            type="button"
            className="btn-primary mx-auto"
            onClick={() => void loadSignupFlowConfig()}
          >
            Try again
          </button>
        </div>
      );
    }

    return (
      <div
        className="max-w-md mx-auto space-y-4 text-center"
        style={{ gap: "var(--component-gap-sm)" }}
      >
        <h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-brand-text">
          Loading signup form…
        </h3>
        <p className="text-[length:var(--text-body)] leading-7 text-brand-muted">
          We&apos;re preparing the next step for you.
        </p>
        {isLoadingSignupFlowConfig ? (
          <div
            className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-accent-500"
            aria-hidden="true"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="max-w-md mx-auto"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--component-gap-sm)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        aria-label={ariaLabel}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--component-gap-sm)",
        }}
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
        <div
          className="flex flex-col sm:flex-row items-end"
          style={{ gap: "var(--component-gap-sm)" }}
        >
          <div className="flex flex-col gap-1 flex-1">
            <label
              htmlFor={resolvedInputId}
              className="font-medium text-brand-text"
              style={{ fontSize: "var(--text-caption)" }}
            >
              {emailLabel}
            </label>
            <input
              id={resolvedInputId}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={handleEmailChange}
              onFocus={() => trackEmailFocus(sourcePage)}
              onBlur={() => {
                if (status !== "success" && status !== "loading") {
                  trackEmailBlurWithoutSubmit(sourcePage, email.length > 0);
                }
              }}
              placeholder={placeholder ?? "your@email.com"}
              aria-invalid={isError}
              aria-describedby={errorId}
              className={clsx(
                "w-full px-4 py-3 rounded-md border",
                "bg-surface-sunken",
                "font-mono",
                "focus:outline-none focus:border-primary-500 focus:border-2 focus:shadow-card",
                "transition-[border-color] duration-[var(--transition-fast)]",
                isError
                  ? "border-error-500 animate-[shake_0.4s_ease-in-out]"
                  : "border-neutral-300",
              )}
              disabled={status === "loading"}
              style={{
                caretColor: "var(--color-primary-500)",
                fontSize: "var(--text-body)",
                boxShadow: "var(--shadow-md)",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={status === "loading" || status === "success"}
            className={clsx(
              "btn-primary",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100",
              "flex items-center justify-center gap-2 min-w-[140px]",
              status === "loading" && "cursor-wait",
            )}
          >
            {status === "loading" ? (
              <>
                <span
                  className="w-4 h-4 rounded-full border-2 border-accent-950 border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                <span>{loadingText}</span>
              </>
            ) : status === "success" ? (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="8" fill="currentColor" opacity="0.2" />
                  <path
                    d="M4.5 8l2.5 2.5 4.5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {successMessage && <span>{successMessage}</span>}
              </>
            ) : (
              buttonText
            )}
          </button>
        </div>
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={siteKey}
          onToken={setTurnstileToken}
          onExpire={() => setTurnstileToken("")}
        />
      </form>

      {status === "success" && (surveyPreview ?? resolvedSignupFlowConfig?.surveyPreview) ? (
        <p className="text-brand-muted text-center" style={{ fontSize: "var(--text-caption)" }}>
          {surveyPreview ?? resolvedSignupFlowConfig?.surveyPreview}
        </p>
      ) : null}

      <p
        id={errorId}
        aria-live="polite"
        className={isError && !!currentErrorMessage ? "text-error-500" : "sr-only"}
        style={isError && !!currentErrorMessage ? { fontSize: "var(--text-caption)" } : undefined}
      >
        {isError ? currentErrorMessage : ""}
      </p>

      {resolvedSubtitle ? (
        <p
          className="font-semibold text-brand-text text-center"
          style={{ fontSize: "var(--text-caption)" }}
        >
          {resolvedSubtitle}
        </p>
      ) : null}

      {(privacyNote ?? resolvedSignupFlowConfig?.privacyNote) ? (
        <p className="text-brand-muted" style={{ fontSize: "var(--text-caption)" }}>
          {privacyNote ?? resolvedSignupFlowConfig?.privacyNote}
        </p>
      ) : null}

      {status === "idle" && visibleWhatHappensNext ? (
        <p className="text-brand-muted text-center" style={{ fontSize: "var(--text-caption)" }}>
          {visibleWhatHappensNext}
        </p>
      ) : null}
    </div>
  );
}

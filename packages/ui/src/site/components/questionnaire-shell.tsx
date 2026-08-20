import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import type { LeadDeliveryState, LeadMagnetSlug } from "@grantpipe/shared";
import { setSignedUp } from "../lib/exit-popup-utils";
import { resolveSignupAttribution } from "../lib/signup-attribution";
import { captureSiteFetchFailure } from "../lib/sentry-client";
import { MobileFormFooter } from "./mobile-form-footer";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget";
import { getPublicTurnstileSiteKey } from "../lib/public-turnstile";
import { trackEvent } from "../lib/analytics";
import { destinationPathFromHref } from "../lib/analytics-destination";

async function readLeadDeliveryState(res: Response): Promise<LeadDeliveryState | undefined> {
  if (typeof res.json !== "function") return undefined;
  const data = (await res.json().catch(() => ({}))) as { deliveryState?: LeadDeliveryState };
  return data.deliveryState;
}

export interface QuestionnaireOption {
  label: string;
  score: number;
}

export interface QuestionnaireQuestion {
  id: string;
  prompt: string;
  helper?: string;
  options: QuestionnaireOption[];
}

export interface QuestionnaireResult {
  heading: string;
  summary: string;
  links: { title: string; href: string }[];
}

export interface QuestionnaireShellProps {
  introTitle: string;
  introBlurb: string;
  questions: QuestionnaireQuestion[];
  resolveResult: (totalScore: number, max: number) => QuestionnaireResult;
  apiUrl: string;
  magnetSlug: LeadMagnetSlug;
  sourcePage: string;
  appUrl?: string;
  turnstileSiteKey?: string;
}

interface LeadCapture {
  email: string;
  orgName: string;
}

interface AssessmentAbandonmentState {
  started: boolean;
  allAnswered: boolean;
  answeredCount: number;
  questionCount: number;
  step: number;
  magnetSlug: LeadMagnetSlug;
  sourcePage: string;
}

function getResultScoreBand(totalScore: number, maxScore: number) {
  if (maxScore <= 0) return "unknown";
  const ratio = totalScore / maxScore;
  if (ratio < 0.34) return "low";
  if (ratio < 0.67) return "medium";
  return "high";
}

export function QuestionnaireShell({
  introTitle,
  introBlurb,
  questions,
  resolveResult,
  apiUrl,
  magnetSlug,
  sourcePage,
  appUrl,
  turnstileSiteKey,
}: QuestionnaireShellProps) {
  const siteKey = turnstileSiteKey ?? getPublicTurnstileSiteKey();
  const [step, setStep] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  // started: user clicked Begin and is in the questions flow
  const [started, setStarted] = useState<boolean>(false);
  // captured: user submitted the lead form at the result screen
  const [captured, setCaptured] = useState<boolean>(false);
  const [reportDeliveryState, setReportDeliveryState] = useState<LeadDeliveryState>("queued");
  const [lead, setLead] = useState<LeadCapture>({ email: "", orgName: "" });
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const max = useMemo(
    () => questions.reduce((sum, q) => sum + Math.max(0, ...q.options.map((o) => o.score)), 0),
    [questions],
  );
  const allAnswered = questions.every((q) => Object.prototype.hasOwnProperty.call(answers, q.id));
  const totalScore = useMemo(
    () => questions.reduce((sum, q) => sum + (answers[q.id] ?? 0), 0),
    [answers, questions],
  );
  const result = useMemo(() => resolveResult(totalScore, max), [totalScore, max, resolveResult]);
  const baseAnalyticsProperties = {
    magnet_slug: magnetSlug,
    source_page: sourcePage,
  };
  const abandonmentStateRef = useRef<AssessmentAbandonmentState>({
    started: false,
    allAnswered: false,
    answeredCount: 0,
    questionCount: questions.length,
    step: 0,
    magnetSlug,
    sourcePage,
  });
  const abandonmentTrackedRef = useRef(false);

  abandonmentStateRef.current = {
    started,
    allAnswered,
    answeredCount: Object.keys(answers).length,
    questionCount: questions.length,
    step,
    magnetSlug,
    sourcePage,
  };

  useEffect(() => {
    function trackAbandonment(abandonmentTrigger: "pagehide" | "unmount"): void {
      const state = abandonmentStateRef.current;
      // Track abandonment only if user started answering but hasn't finished
      if (!state.started || state.allAnswered || abandonmentTrackedRef.current) return;

      abandonmentTrackedRef.current = true;
      trackEvent("assessment_abandoned", {
        magnet_slug: state.magnetSlug,
        source_page: state.sourcePage,
        answered_count: state.answeredCount,
        question_count: state.questionCount,
        progress_percent:
          state.questionCount > 0
            ? Math.round((state.answeredCount / state.questionCount) * 100)
            : 0,
        last_question_index: state.step,
        abandonment_trigger: abandonmentTrigger,
      });
    }

    function onPageHide(): void {
      trackAbandonment("pagehide");
    }

    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      trackAbandonment("unmount");
    };
  }, []);

  // --- Intro screen ---
  if (!started) {
    return (
      <section className="mt-8 rounded-lg border border-neutral-200 p-6 sm:p-8 bg-surface-sunken">
        <h2
          className="font-heading font-bold text-brand-text mb-3"
          style={{ fontSize: "var(--text-heading, 1.5rem)" }}
        >
          {introTitle}
        </h2>
        <p className="text-brand-text mb-6 text-sm">{introBlurb}</p>
        <button
          type="button"
          onClick={() => {
            trackEvent("assessment_started", {
              ...baseAnalyticsProperties,
              question_count: questions.length,
            });
            setStarted(true);
          }}
          className="btn-primary rounded-full px-6 py-2.5 text-sm font-medium min-h-12 flex items-center justify-center"
        >
          Begin
        </button>
      </section>
    );
  }

  // --- Questions screen ---
  if (!allAnswered) {
    const q = questions[step];
    const isAnswered = Object.prototype.hasOwnProperty.call(answers, q.id);
    const progressPct = Math.min(((step + 1) / questions.length) * 100, 100);
    const handleAnswer = (score: number) => {
      const nextAnswers = { ...answers, [q.id]: score };
      const nextTotalScore = questions.reduce(
        (sum, question) => sum + (nextAnswers[question.id] ?? 0),
        0,
      );
      const nextAllAnswered = questions.every((question) =>
        Object.prototype.hasOwnProperty.call(nextAnswers, question.id),
      );
      trackEvent("assessment_question_answered", {
        ...baseAnalyticsProperties,
        question_id: q.id,
        question_index: step,
        answer_score: score,
        progress_percent: Math.round(((step + 1) / questions.length) * 100),
      });
      if (nextAllAnswered) {
        trackEvent("assessment_completed", {
          ...baseAnalyticsProperties,
          total_score: nextTotalScore,
          max_score: max,
          question_count: questions.length,
          result_score_band: getResultScoreBand(nextTotalScore, max),
        });
      }
      setAnswers(nextAnswers);
      if (step < questions.length - 1) setStep(step + 1);
    };
    return (
      <section className="mt-8 rounded-lg border border-neutral-200 bg-surface-sunken">
        {/* Sticky progress bar — always visible at top while form is in progress */}
        <div className="sticky top-0 z-10 rounded-t-lg bg-surface-sunken border-b border-neutral-200 px-6 sm:px-8 py-3">
          <div className="flex items-center justify-between text-xs text-brand-text mb-2">
            <span>
              Question {step + 1} of {questions.length}
            </span>
            <span>{Math.round(progressPct)}% complete</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(progressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Assessment progress"
            className="h-1.5 w-full rounded-full bg-neutral-200"
          >
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Question body — pb reserves space above mobile sticky footer */}
        <div className="p-6 sm:p-8 pb-24 sm:pb-8">
          <h3 className="font-heading font-semibold text-brand-text mb-2 text-lg">{q.prompt}</h3>
          {q.helper ? <p className="text-sm text-brand-text mb-4 opacity-80">{q.helper}</p> : null}
          <div className="grid gap-2">
            {q.options.map((opt) => {
              const selected = answers[q.id] === opt.score;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => handleAnswer(opt.score)}
                  className={clsx(
                    "w-full text-left rounded-full border px-4 py-3 text-sm min-h-12 flex items-center",
                    selected
                      ? "border-primary-500 bg-primary-50 text-brand-text"
                      : "border-neutral-300 text-brand-text",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Inline prev/next — visible on sm+ only; mobile uses MobileFormFooter */}
          <div className="mt-6 hidden sm:flex justify-between">
            <button
              type="button"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="inline-flex min-h-12 items-center rounded-full px-3 py-2 text-sm text-brand-text underline disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(Math.min(questions.length - 1, step + 1))}
              disabled={!isAnswered}
              className="btn-primary rounded-full px-4 py-2 text-sm font-medium disabled:opacity-40 min-h-12 flex items-center"
            >
              Next
            </button>
          </div>
        </div>

        {/* Mobile sticky footer for Back / Next */}
        <MobileFormFooter
          primaryLabel="Next"
          primaryDisabled={!isAnswered}
          onPrimary={() => setStep(Math.min(questions.length - 1, step + 1))}
          secondaryLabel="Back"
          secondaryDisabled={step === 0}
          onSecondary={() => setStep(Math.max(0, step - 1))}
        />
      </section>
    );
  }

  // --- Result screen ---
  const onSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead.email || !lead.orgName) return;
    if (siteKey && !turnstileToken) {
      setErrorMessage("Please finish the check first.");
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const attribution = resolveSignupAttribution();
      const res = await fetch(`${apiUrl}/api/public/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: lead.email,
          firstName: lead.orgName,
          magnetSlug,
          sourcePage,
          resendDelivery: true,
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
        const deliveryState = await readLeadDeliveryState(res);
        if (deliveryState === "unsubscribed") {
          setErrorMessage("You asked us to stop. Try a new email.");
          return;
        }
        if (deliveryState === "resend_unavailable") {
          setErrorMessage("We could not send the report. Use another email.");
          return;
        }
        setSignedUp();
        setReportDeliveryState(deliveryState ?? "queued");
        trackEvent("assessment_report_requested", {
          ...baseAnalyticsProperties,
          result_score_band: getResultScoreBand(totalScore, max),
        });
        setCaptured(true);
      } else {
        captureSiteFetchFailure(null, {
          source: "questionnaire-shell",
          status: res.status,
        });
        trackEvent("assessment_submission_failed", {
          ...baseAnalyticsProperties,
          failure_type: "api",
          status: res.status,
        });
        setErrorMessage("Something went wrong. Please try again.");
      }
    } catch (err) {
      captureSiteFetchFailure(err, {
        source: "questionnaire-shell",
        status: undefined,
      });
      trackEvent("assessment_submission_failed", {
        ...baseAnalyticsProperties,
        failure_type: "network",
      });
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
      if (siteKey) {
        setTurnstileToken("");
        turnstileRef.current?.reset();
      }
    }
  };

  return (
    <section className="mt-8 rounded-lg border border-neutral-200 p-6 sm:p-8 bg-surface-sunken">
      <p className="text-xs uppercase tracking-wide text-brand-text mb-2 opacity-70">Your result</p>
      <h2
        className="font-heading font-bold text-brand-text mb-2"
        style={{ fontSize: "var(--text-heading, 1.75rem)" }}
      >
        {result.heading}
      </h2>
      <p className="text-brand-text mb-6">{result.summary}</p>
      <h3 className="font-heading font-semibold text-brand-text mb-3 text-lg">
        Recommended next steps
      </h3>
      <ul className="grid gap-2 mb-8">
        {result.links.map((r, index) => (
          <li key={r.href}>
            <a
              className="text-primary-600 underline"
              href={r.href}
              onClick={() => {
                trackEvent("assessment_result_link_clicked", {
                  ...baseAnalyticsProperties,
                  result_score_band: getResultScoreBand(totalScore, max),
                  destination_path: destinationPathFromHref(r.href),
                  link_position: index,
                });
              }}
            >
              {r.title}
            </a>
          </li>
        ))}
      </ul>

      {/* Trial CTA */}
      {appUrl ? (
        <a
          href={appUrl}
          onClick={() => {
            trackEvent("assessment_result_cta_clicked", {
              ...baseAnalyticsProperties,
              result_score_band: getResultScoreBand(totalScore, max),
              destination_path: destinationPathFromHref(appUrl),
            });
          }}
          className="btn-primary rounded-full px-6 py-2.5 text-sm font-medium min-h-12 inline-flex items-center justify-center mb-8"
        >
          Start your free trial
        </a>
      ) : null}

      {/* Lead capture for emailed report */}
      {!captured ? (
        <div className="border-t border-neutral-200 pt-6">
          <p className="text-sm font-medium text-brand-text mb-4">Get your full report by email</p>
          {/* pb-20 sm:pb-0 reserves space above the mobile sticky footer */}
          <form
            data-questionnaire-form
            onSubmit={onSubmitLead}
            className="grid gap-4 max-w-md pb-20 sm:pb-0"
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
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-brand-text">Nonprofit name</span>
              <input
                required
                value={lead.orgName}
                onChange={(e) => setLead({ ...lead, orgName: e.target.value })}
                className="rounded-md border border-neutral-300 px-3 py-2 bg-surface-sunken text-brand-text min-h-12 text-base w-full"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-brand-text">Work email</span>
              <input
                required
                type="email"
                value={lead.email}
                onChange={(e) => setLead({ ...lead, email: e.target.value })}
                className="rounded-md border border-neutral-300 px-3 py-2 bg-surface-sunken text-brand-text min-h-12 text-base w-full"
              />
            </label>
            {/* Inline submit on sm+; hidden on mobile (MobileFormFooter handles it) */}
            <button
              type="submit"
              disabled={submitting || (!!siteKey && !turnstileToken)}
              className="hidden sm:flex btn-primary rounded-full px-4 py-2 text-sm font-medium disabled:opacity-60 min-h-12 items-center justify-center"
            >
              {submitting ? "Sending…" : "Email my report"}
            </button>
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={siteKey}
              onToken={setTurnstileToken}
              onExpire={() => setTurnstileToken("")}
            />
            {errorMessage ? (
              <p role="alert" className="text-sm text-error-500">
                {errorMessage}
              </p>
            ) : null}
          </form>
          {/* Mobile-only sticky footer with Email my report button */}
          <MobileFormFooter
            primaryLabel={submitting ? "Sending…" : "Email my report"}
            primaryDisabled={submitting || (!!siteKey && !turnstileToken)}
            onPrimary={() => {
              const form = document.querySelector(
                "[data-questionnaire-form]",
              ) as HTMLFormElement | null;
              if (form) {
                form.requestSubmit();
              }
            }}
          />
        </div>
      ) : (
        <p className="text-sm text-brand-text border-t border-neutral-200 pt-6">
          {reportDeliveryState === "sent"
            ? "Report sent. Check your inbox."
            : reportDeliveryState === "ambiguous"
              ? "We got your request. Delivery may still be in progress."
              : "Report queued. Check your inbox soon."}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          trackEvent("assessment_retake_clicked", {
            ...baseAnalyticsProperties,
            total_score: totalScore,
            max_score: max,
          });
          setAnswers({});
          setStep(0);
          setStarted(false);
        }}
        className="mt-8 rounded-full px-3 py-2 text-sm text-brand-text underline"
      >
        Retake
      </button>
    </section>
  );
}

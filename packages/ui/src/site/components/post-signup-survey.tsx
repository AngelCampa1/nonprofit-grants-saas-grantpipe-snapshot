import { useState, useEffect, useRef } from "react";
import { clsx } from "clsx";
import type { SurveyQuestion, SurveyQualificationConfig } from "../types";
import { useFocusTrap } from "../lib/focus-trap";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import { isQualifiedSurveyResponse } from "../lib/survey-qualification";

interface PostSignupSurveyProps {
  apiUrl: string;
  surveyToken?: string;
  questions: SurveyQuestion[];
  discoveryCallUrl: string;
  onComplete: () => void;
  qualifyCriteria?: (answers: Record<string, string>) => boolean;
  qualificationConfig?: SurveyQualificationConfig;
  qualification?: SurveyQualificationConfig;
  qualifiedHeading?: string;
  qualifiedBody?: string;
  qualifiedCtaText?: string;
  /** Override the link target for the qualified CTA. Falls back to discoveryCallUrl. */
  qualifiedCtaTarget?: string;
  unqualifiedHeading?: string;
  unqualifiedBody?: string;
  qualifiedDismissText?: string;
  unqualifiedCtaText?: string;
  unqualifiedCtaTarget?: string;
  unqualifiedDismissText?: string;
  sourcePage?: string;
}

interface SurveyDoneDialogProps {
  dialogRef: React.RefObject<HTMLDivElement | null>;
  onComplete: () => void;
  heading?: string;
  body?: string;
  primaryCta?: { text: string; href: string; external?: boolean };
  dismissText?: string;
}

function SurveyDoneDialog({
  dialogRef,
  onComplete,
  heading,
  body,
  primaryCta,
  dismissText,
}: SurveyDoneDialogProps) {
  return (
    <div className="fixed inset-0 bg-surface-overlay backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Survey complete"
        tabIndex={-1}
        className="bg-surface-elevated rounded-2xl shadow-xl max-w-md w-full text-center overflow-hidden animate-scale-in focus:outline-none"
      >
        <div className="w-full h-1 bg-neutral-200">
          <div className="h-full bg-accent-400 w-full origin-left scale-x-100 transition-[transform] duration-500" />
        </div>
        <div className="p-8 relative">
          <button
            onClick={onComplete}
            aria-label="Close"
            className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-full text-neutral-400 hover:text-brand-text hover:bg-surface-secondary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {heading && (
            <h3
              className="font-heading font-bold mb-3"
              style={{
                fontSize: "var(--text-heading)",
              }}
            >
              {heading}
            </h3>
          )}
          {body && <p className="text-brand-muted mb-6">{body}</p>}
          {primaryCta && (
            <a
              href={primaryCta.href}
              {...(primaryCta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="btn-primary btn-shimmer inline-block"
            >
              {primaryCta.text}
            </a>
          )}
          {dismissText && (
            <button onClick={onComplete} className="btn-secondary block mx-auto mt-4">
              {dismissText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PostSignupSurvey({
  apiUrl,
  surveyToken,
  questions,
  discoveryCallUrl,
  onComplete,
  qualifyCriteria = () => true,
  qualificationConfig,
  qualification,
  qualifiedHeading,
  qualifiedBody,
  qualifiedCtaText,
  qualifiedCtaTarget,
  unqualifiedHeading,
  unqualifiedBody,
  qualifiedDismissText,
  unqualifiedCtaText,
  unqualifiedCtaTarget,
  unqualifiedDismissText,
  sourcePage,
}: PostSignupSurveyProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"answering" | "submitting" | "done" | "error">("answering");
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, string> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, questions.length > 0);

  useEffect(() => {
    if (status === "done") {
      dialogRef.current?.focus();
    }
  }, [status]);

  async function selectAnswer(questionId: string, answer: string) {
    const newAnswers = { ...answers, [questionId]: answer };
    setAnswers(newAnswers);

    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1);
      return;
    }

    setStatus("submitting");
    setPendingAnswers(newAnswers);
    if (surveyToken) {
      try {
        const res = await fetch(`${apiUrl}/api/survey`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            surveyToken,
            answers: Object.entries(newAnswers).map(([questionId, answer]) => ({
              questionId,
              answer,
            })),
          }),
        });
        // 409 means answers were already saved — treat as success
        if (!res.ok && res.status !== 409) throw new Error("Survey submission failed");
      } catch (err) {
        captureException(err);
        setStatus("error");
        return;
      }
    }
    trackEvent("survey_completed", {
      question_count: questions.length,
      ...(sourcePage !== undefined ? { source_page: sourcePage } : {}),
      qualification_segment: getQualificationSegment(newAnswers),
    });
    setStatus("done");
  }

  async function retrySubmission() {
    if (!pendingAnswers) return;
    setStatus("submitting");
    if (surveyToken) {
      try {
        const res = await fetch(`${apiUrl}/api/survey`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            surveyToken,
            answers: Object.entries(pendingAnswers).map(([questionId, answer]) => ({
              questionId,
              answer,
            })),
          }),
        });
        // 409 means answers were already saved — treat as success
        if (!res.ok && res.status !== 409) throw new Error("Survey submission failed");
      } catch (err) {
        captureException(err);
        setStatus("error");
        return;
      }
    }
    trackEvent("survey_completed", {
      question_count: questions.length,
      ...(sourcePage !== undefined ? { source_page: sourcePage } : {}),
      qualification_segment: getQualificationSegment(pendingAnswers),
    });
    setStatus("done");
  }

  const progressPct = status === "done" ? 100 : Math.round((currentStep / questions.length) * 100);

  useEffect(() => {
    if (questions.length === 0) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [questions.length]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onComplete();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onComplete]);

  function isQualifiedAnswerSet(answerSet: Record<string, string>) {
    const resolvedQualification = qualification ?? qualificationConfig;

    if (resolvedQualification) {
      return isQualifiedSurveyResponse(answerSet, resolvedQualification);
    }

    return qualifyCriteria(answerSet);
  }

  function getQualificationSegment(answerSet: Record<string, string>) {
    return isQualifiedAnswerSet(answerSet) ? "qualified" : "unqualified";
  }

  if (questions.length === 0) return null;

  if (status === "error") {
    return (
      <div className="fixed inset-0 bg-surface-overlay backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Survey error"
          tabIndex={-1}
          className="bg-surface-elevated rounded-2xl shadow-xl max-w-md w-full text-center overflow-hidden focus:outline-none"
        >
          <div className="p-8">
            <h3
              className="font-heading font-bold mb-3"
              style={{
                fontSize: "var(--text-heading)",
              }}
            >
              Something went wrong
            </h3>
            <p className="text-brand-muted mb-6">
              We couldn&apos;t save your answers. Please try again.
            </p>
            <button onClick={retrySubmission} className="btn-primary btn-shimmer">
              Try Again
            </button>
            <button onClick={onComplete} className="btn-secondary block mx-auto mt-4">
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "done") {
    const isQualified = isQualifiedAnswerSet(answers);

    return (
      <SurveyDoneDialog
        dialogRef={dialogRef}
        onComplete={onComplete}
        heading={isQualified ? qualifiedHeading : unqualifiedHeading}
        body={isQualified ? qualifiedBody : unqualifiedBody}
        primaryCta={
          isQualified
            ? qualifiedCtaText
              ? {
                  text: qualifiedCtaText,
                  href: qualifiedCtaTarget ?? discoveryCallUrl,
                  external: true,
                }
              : undefined
            : unqualifiedCtaText && unqualifiedCtaTarget
              ? { text: unqualifiedCtaText, href: unqualifiedCtaTarget }
              : undefined
        }
        dismissText={isQualified ? qualifiedDismissText : unqualifiedDismissText}
      />
    );
  }

  const question = questions[currentStep];

  return (
    <div className="fixed inset-0 bg-surface-overlay backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quick survey"
        tabIndex={-1}
        className="bg-surface-elevated rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-scale-in focus:outline-none"
      >
        <div className="w-full h-1 bg-neutral-200">
          <div
            className="h-full bg-accent-400 w-full origin-left transition-[transform] duration-500 ease-out"
            style={{ transform: `scaleX(${progressPct / 100})` }}
          />
        </div>

        <div className="p-8 relative">
          <button
            onClick={onComplete}
            aria-label="Close survey"
            className="transition-colors absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-full text-neutral-400 hover:text-brand-text hover:bg-surface-secondary"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <p aria-live="polite" className="sr-only">
            {status === "submitting" ? "Submitting your answers..." : ""}
          </p>

          <p
            className="font-mono font-bold uppercase tracking-widest text-accent-600 mb-3"
            style={{
              fontSize: "var(--text-caption)",
            }}
          >
            Question {currentStep + 1} of {questions.length}
          </p>

          <h3
            className="font-heading font-bold mb-6 pr-8 text-brand-text"
            style={{
              fontSize: "var(--text-heading)",
            }}
          >
            {question.text}
          </h3>

          <div className="space-y-3">
            {question.options.map((option) => (
              <button
                key={option}
                onClick={() => selectAnswer(question.id, option)}
                disabled={status === "submitting"}
                className={clsx(
                  "transition-colors",
                  "w-full text-left px-4 py-3.5 rounded-full",
                  "bg-surface-secondary border border-neutral-200",
                  "text-brand-text text-[length:var(--text-caption)]",
                  "hover:bg-neutral-100",
                  "hover:shadow-sm",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  answers[question.id] === option &&
                    "bg-accent-500 text-surface-primary border-accent-500",
                )}
              >
                {status === "submitting" && answers[question.id] === option ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray="31.4 31.4"
                        strokeLinecap="round"
                      />
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  option
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useEffectEvent, useRef, type MouseEvent } from "react";
import type { PricingTier } from "../types";
import { EmailCapture } from "./email-capture";
import { useFocusTrap } from "../lib/focus-trap";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { trackEvent } from "../lib/analytics";
import { captureSiteFetchFailure } from "../lib/sentry-client";
import { formatAnnualPrice, formatAnnualMonthlyEquivalent } from "../lib/pricing-utils";
import { trackBillingToggle } from "../lib/billing-toggle-tracker";
import { findPricingIntentTierFromSearch } from "../lib/pricing-intent";
import { sanitizePublicSignupMessage } from "../lib/public-signup-cta";
import type { PublicSignupFlowConfig } from "../lib/public-signup-flow";

export interface FakeDoorEmailCaptureProps extends PublicSignupFlowConfig {
  apiUrl?: string;
  sourcePage?: string;
  ariaLabel?: string;
  buttonText?: string;
  placeholder?: string;
}

interface FakeDoorPricingProps {
  apiUrl: string;
  sourcePage: string;
  tiers: PricingTier[];
  onTierClick?: () => void;
  confirmationMessage?: string;
  buttonPrefix?: string;
  heading?: string;
  popularTier?: string;
  popularBadgeText?: string;
  selectedBadgeText?: string;
  recommendedBadgeText?: string;
  socialProofText?: string;
  selectedMessages?: Record<string, string>;
  emailCapture?: FakeDoorEmailCaptureProps;
  emailCaptureConfigUrl?: string;
  clearButtonText?: string;
  modalAriaLabel?: string;
  trialBannerText?: string;
  annualSavingsText?: string;
  monthlyToggleLabel?: string;
  annualToggleLabel?: string;
  showBillingToggle?: boolean;
}

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getAnnualPriceDisplay(tier: PricingTier): string {
  if (tier.annualPriceOverride) return tier.annualPriceOverride;
  if (tier.monthlyPriceCents !== undefined) {
    return formatAnnualPrice(tier.monthlyPriceCents, tier.unitLabel);
  }
  return tier.price;
}

export function FakeDoorPricing({
  apiUrl,
  sourcePage,
  tiers,
  onTierClick,
  confirmationMessage,
  buttonPrefix,
  heading,
  popularTier,
  popularBadgeText = "Most Popular",
  selectedBadgeText = "Selected",
  recommendedBadgeText = "RECOMMENDED",
  socialProofText,
  selectedMessages,
  emailCapture,
  emailCaptureConfigUrl,
  clearButtonText = "Clear",
  modalAriaLabel = "Choose your plan and continue",
  trialBannerText,
  annualSavingsText,
  monthlyToggleLabel,
  annualToggleLabel,
  showBillingToggle,
}: FakeDoorPricingProps) {
  const [sessionId] = useState(() => (typeof window === "undefined" ? "" : generateSessionId()));
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set());
  const [lastSelectedTier, setLastSelectedTier] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadedEmailCapture, setLoadedEmailCapture] = useState<FakeDoorEmailCaptureProps | null>(
    null,
  );
  const [isLoadingEmailCapture, setIsLoadingEmailCapture] = useState(false);
  const [emailCaptureLoadError, setEmailCaptureLoadError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const hasHandledUrlIntentRef = useRef(false);
  const emailCaptureRequestRef = useRef<Promise<FakeDoorEmailCaptureProps | null> | null>(null);

  const resolvedEmailCapture = emailCapture ?? loadedEmailCapture;
  const hasEmailCaptureFlow = Boolean(emailCapture || emailCaptureConfigUrl);
  const resolvedQualification =
    resolvedEmailCapture?.qualification ?? resolvedEmailCapture?.surveyQualification;

  const canShowToggle =
    showBillingToggle !== false &&
    tiers.some((t) => t.monthlyPriceCents !== undefined) &&
    !tiers.every((t) => t.pricingModel === "one-time");

  function closeModal() {
    setModalOpen(false);
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }

  function clearSelection() {
    setSelectedTiers(new Set());
    setLastSelectedTier(null);
    setModalOpen(false);
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }

  const loadEmailCaptureConfig =
    useCallback(async (): Promise<FakeDoorEmailCaptureProps | null> => {
      if (emailCapture) {
        setEmailCaptureLoadError(null);
        return emailCapture;
      }
      if (loadedEmailCapture) {
        setEmailCaptureLoadError(null);
        return loadedEmailCapture;
      }
      if (!emailCaptureConfigUrl) {
        return null;
      }
      if (!emailCaptureRequestRef.current) {
        setIsLoadingEmailCapture(true);
        setEmailCaptureLoadError(null);
        emailCaptureRequestRef.current = (async () => {
          const response = await fetch(emailCaptureConfigUrl);
          if (!response.ok) {
            captureSiteFetchFailure(null, {
              source: "fake-door-email-capture-config",
              status: response.status,
            });
            emailCaptureRequestRef.current = null;
            setIsLoadingEmailCapture(false);
            setEmailCaptureLoadError("We couldn't load the next step. Please try again.");
            return null;
          }
          const config = (await response.json()) as FakeDoorEmailCaptureProps;
          setLoadedEmailCapture(config);
          setIsLoadingEmailCapture(false);
          return config;
        })().catch((error) => {
          emailCaptureRequestRef.current = null;
          setIsLoadingEmailCapture(false);
          setEmailCaptureLoadError("We couldn't load the next step. Please try again.");
          captureSiteFetchFailure(error, {
            source: "fake-door-email-capture-config",
            status: undefined,
          });
          return null;
        });
      }
      return emailCaptureRequestRef.current;
    }, [emailCapture, loadedEmailCapture, emailCaptureConfigUrl]);

  const loadEmailCaptureConfigInEffect = useEffectEvent(() => {
    void loadEmailCaptureConfig();
  });

  useFocusTrap(dialogRef, modalOpen);

  useEffect(() => {
    if (modalOpen) {
      closeBtnRef.current?.focus();
    }
  }, [modalOpen]);

  // Body scroll lock when modal is open
  useEffect(() => {
    if (!modalOpen) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeModal();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen]);

  useEffect(() => {
    if (!hasEmailCaptureFlow || tiers.length === 0) return;
    document.documentElement.dataset.fakeDoorPricingReady = "true";
    document.dispatchEvent(new CustomEvent("fake-door-pricing-ready"));
    loadEmailCaptureConfigInEffect();

    return () => {
      delete document.documentElement.dataset.fakeDoorPricingReady;
    };
  }, [hasEmailCaptureFlow, tiers]);

  async function handleTierSelection(tierName: string) {
    if (!selectedTiers.has(tierName)) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
    setSelectedTiers((prev) => new Set([...prev, tierName]));
    setLastSelectedTier(tierName);

    if (hasEmailCaptureFlow) {
      setModalOpen(true);
      void loadEmailCaptureConfig();
    }

    try {
      const response = await fetch(`${apiUrl}/api/pricing-click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: tierName.toLowerCase(),
          sourcePage,
          sessionId,
          billingPeriod,
        }),
      });
      if (!response.ok) {
        captureSiteFetchFailure(null, {
          source: "fake-door-pricing-click",
          status: response.status,
        });
        return;
      }
      trackEvent("pricing_tier_clicked", {
        tier_name: tierName,
        source_page: sourcePage,
        billing_period: billingPeriod,
      });
    } catch (err) {
      captureSiteFetchFailure(err, {
        source: "fake-door-pricing-click",
        status: undefined,
      });
    }

    onTierClick?.();
  }

  const resolveTierName = useCallback(
    (targetTierName?: string): string | undefined => {
      if (!targetTierName) {
        return tiers[0]?.name;
      }

      return tiers.find((tier) => tier.name.toLowerCase() === targetTierName.toLowerCase())?.name;
    },
    [tiers],
  );

  const handleOpenPricingTier = useEffectEvent((tierName: string) => {
    void handleTierSelection(tierName);
  });

  // Listen for external open-pricing-modal event (from sticky CTA)
  useEffect(() => {
    if (!hasEmailCaptureFlow || tiers.length === 0) return;
    function handleOpenModal(event: Event) {
      const customEvent = event as CustomEvent<{ tierName?: string }>;
      const tierName = resolveTierName(customEvent.detail?.tierName);
      if (!tierName) return;
      handleOpenPricingTier(tierName);
    }
    document.addEventListener("open-pricing-modal", handleOpenModal);
    return () => document.removeEventListener("open-pricing-modal", handleOpenModal);
  }, [
    apiUrl,
    billingPeriod,
    hasEmailCaptureFlow,
    onTierClick,
    resolveTierName,
    sessionId,
    sourcePage,
    tiers,
  ]);

  useEffect(() => {
    if (
      hasHandledUrlIntentRef.current ||
      !hasEmailCaptureFlow ||
      tiers.length === 0 ||
      sessionId.length === 0
    ) {
      return;
    }

    const tierName = findPricingIntentTierFromSearch(window.location.search, tiers);
    if (!tierName) return;

    hasHandledUrlIntentRef.current = true;
    handleOpenPricingTier(tierName);
  }, [apiUrl, billingPeriod, hasEmailCaptureFlow, onTierClick, sessionId, sourcePage, tiers]);

  const hasSelection = selectedTiers.size > 0;
  const visibleTrialBannerText = sanitizePublicSignupMessage(trialBannerText);

  return (
    <>
      <section
        data-fake-door-pricing
        className="px-4 py-[var(--section-py)]"
        style={{ background: "var(--surface-primary)" }}
      >
        <div className="max-w-5xl mx-auto">
          {visibleTrialBannerText && (
            <p className="text-center mb-4 text-[length:var(--text-caption)] font-medium text-accent-600">
              {visibleTrialBannerText}
            </p>
          )}
          {heading && (
            <div className="flex items-baseline justify-between mb-10">
              <h2 className="text-[length:var(--text-heading)] font-bold font-heading">
                {heading}
              </h2>
              {hasSelection && (
                <button
                  onClick={clearSelection}
                  className="transition-colors text-[length:var(--text-caption)] underline text-neutral-500 hover:text-brand-text"
                >
                  {clearButtonText}
                </button>
              )}
            </div>
          )}
          {!heading && hasSelection && (
            <div className="flex justify-end mb-4">
              <button
                onClick={clearSelection}
                className="transition-colors text-[length:var(--text-caption)] underline text-neutral-500 hover:text-brand-text"
              >
                {clearButtonText}
              </button>
            </div>
          )}
          {canShowToggle && (
            <div role="radiogroup" aria-label="Billing period" className="flex justify-center mb-8">
              <div className="inline-flex rounded-full border border-neutral-300 p-1 bg-surface-secondary">
                <button
                  role="radio"
                  aria-checked={billingPeriod === "monthly"}
                  onClick={() => {
                    setBillingPeriod("monthly");
                    trackBillingToggle("monthly", sourcePage);
                  }}
                  className={[
                    "inline-flex min-h-11 items-center rounded-full px-5 py-2 text-[length:var(--text-caption)] font-medium transition-[background-color,color] duration-[var(--transition-base)]",
                    billingPeriod === "monthly"
                      ? "bg-accent-500 text-accent-950"
                      : "text-brand-muted hover:text-brand-text",
                  ].join(" ")}
                >
                  {monthlyToggleLabel ?? "Monthly"}
                </button>
                <button
                  role="radio"
                  aria-checked={billingPeriod === "annual"}
                  onClick={() => {
                    setBillingPeriod("annual");
                    trackBillingToggle("annual", sourcePage);
                  }}
                  className={[
                    "inline-flex min-h-11 items-center rounded-full px-5 py-2 text-[length:var(--text-caption)] font-medium transition-[background-color,color] duration-[var(--transition-base)]",
                    billingPeriod === "annual"
                      ? "bg-accent-500 text-accent-950"
                      : "text-brand-muted hover:text-brand-text",
                  ].join(" ")}
                >
                  {annualToggleLabel ?? "Annual"}
                </button>
              </div>
            </div>
          )}
          <div
            className={`grid gap-6 ${tiers.length === 1 ? "max-w-lg mx-auto" : tiers.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}
          >
            {tiers.map((tier) => {
              const isSelected = selectedTiers.has(tier.name);
              const isPopular =
                popularTier !== undefined && tier.name.toLowerCase() === popularTier.toLowerCase();
              return (
                <div
                  key={tier.name}
                  className={[
                    "relative rounded-md p-8",
                    tiers.length === 1 && "md:p-10",
                    "bg-surface-primary shadow-card border-neutral-200",
                    "hover:-translate-y-[var(--card-hover-lift)] hover:scale-[var(--card-hover-scale)] hover:shadow-lg",
                    "transition-[transform,box-shadow,border-color] duration-[var(--transition-base)]",
                    isPopular ? "mt-3" : "",
                    isSelected
                      ? "border-2 border-accent-400 bg-accent-50"
                      : tier.highlighted
                        ? "border-2 border-accent-400 bg-accent-50 shadow-lg"
                        : "border border-neutral-300",
                  ].join(" ")}
                >
                  {isPopular && !isSelected && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-[length:var(--text-caption)] font-bold rounded-full bg-accent-500 text-accent-950">
                      {popularBadgeText}
                    </span>
                  )}
                  {isSelected && (
                    <span className="font-mono absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-accent-100 text-accent-700">
                      {selectedBadgeText}
                    </span>
                  )}
                  {!isSelected && tier.highlighted && (
                    <span className="font-mono absolute top-3 right-3 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-widest bg-accent-100 text-accent-700 shadow-sm">
                      {recommendedBadgeText}
                    </span>
                  )}
                  {billingPeriod === "annual" && annualSavingsText && (
                    <span className="font-mono inline-block mb-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-accent-100 text-accent-700">
                      {annualSavingsText}
                    </span>
                  )}
                  <h3
                    className="font-bold font-heading"
                    style={{ fontSize: "var(--text-subheading)" }}
                  >
                    {tier.name}
                  </h3>
                  <p className="mt-3">
                    {billingPeriod === "annual" ? (
                      <>
                        <span className="font-mono text-[length:var(--text-hero)] font-bold leading-none">
                          {getAnnualPriceDisplay(tier)}
                        </span>
                        {tier.monthlyPriceCents !== undefined && (
                          <span className="block text-[length:var(--text-caption)] text-brand-muted mt-0.5">
                            {formatAnnualMonthlyEquivalent(tier.monthlyPriceCents, tier.unitLabel)}
                          </span>
                        )}
                        {tier.monthlyPriceCents !== undefined && (
                          <span className="block text-[length:var(--text-caption)] text-brand-muted line-through">
                            {tier.price}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="font-mono text-[length:var(--text-hero)] font-bold leading-none">
                        {tier.price}
                      </span>
                    )}
                  </p>
                  {tier.description && (
                    <p className="text-[length:var(--text-caption)] text-brand-muted mt-1">
                      {tier.description}
                    </p>
                  )}
                  <ul className="mt-6 space-y-3">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-accent-500 text-surface-primary flex items-center justify-center">
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M2 5l2 2 4-4"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span className="text-[length:var(--text-caption)] text-brand-text">
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => void handleTierSelection(tier.name)}
                    className={[
                      "mt-8 w-full",
                      isSelected
                        ? "btn-secondary bg-accent-100 text-accent-700 border-2 border-accent-400"
                        : tier.highlighted
                          ? "btn-primary btn-primary--pulse btn-shimmer"
                          : "btn-primary btn-shimmer",
                    ].join(" ")}
                  >
                    {isSelected ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M2 7l3.5 3.5L12 3.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {selectedBadgeText}
                      </span>
                    ) : tier.ctaText ? (
                      tier.ctaText
                    ) : buttonPrefix ? (
                      `${buttonPrefix} ${tier.name}`
                    ) : (
                      tier.name
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          {socialProofText && (
            <p className="mx-auto mt-5 max-w-2xl text-center text-[length:var(--text-body)] leading-7 text-brand-muted">
              {socialProofText}
            </p>
          )}
          {hasSelection &&
            !resolvedEmailCapture &&
            (() => {
              const tierKey = lastSelectedTier?.toLowerCase() ?? "";
              const normalizedMessages = selectedMessages
                ? Object.fromEntries(
                    Object.entries(selectedMessages).map(([k, v]) => [k.toLowerCase(), v]),
                  )
                : undefined;
              const message =
                tierKey && normalizedMessages?.[tierKey]
                  ? normalizedMessages[tierKey]
                  : confirmationMessage;
              return message ? (
                <p className="text-center mt-6 text-brand-muted">{message}</p>
              ) : null;
            })()}
        </div>
      </section>

      {/* Email capture modal mounts outside the section so it overlays everything */}
      {modalOpen && hasEmailCaptureFlow && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: "var(--surface-overlay)" }}
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={modalAriaLabel}
        >
          <div
            className="relative w-full max-w-lg mx-4 rounded-lg shadow-ambient overflow-hidden"
            style={{ background: "var(--surface-elevated)" }}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <button
              ref={closeBtnRef}
              type="button"
              aria-label="Close"
              onClick={closeModal}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-neutral-500 hover:bg-surface-secondary transition-colors"
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
            <div className="p-6 pt-8">
              {resolvedEmailCapture ? (
                <EmailCapture
                  apiUrl={resolvedEmailCapture.apiUrl ?? apiUrl}
                  sourcePage={resolvedEmailCapture.sourcePage ?? sourcePage}
                  surveyQuestions={resolvedEmailCapture.surveyQuestions}
                  surveyQualification={resolvedQualification}
                  qualification={resolvedQualification}
                  discoveryCallUrl={resolvedEmailCapture.discoveryCallUrl}
                  signupFlowConfigUrl={undefined}
                  privacyNote={resolvedEmailCapture.privacyNote}
                  errorInvalidEmail={resolvedEmailCapture.errorInvalidEmail}
                  errorDuplicate={resolvedEmailCapture.errorDuplicate}
                  errorGeneric={resolvedEmailCapture.errorGeneric}
                  successMessage={resolvedEmailCapture.successMessage}
                  surveyPreview={resolvedEmailCapture.surveyPreview}
                  whatHappensNext={resolvedEmailCapture.whatHappensNext}
                  qualifiedHeading={resolvedEmailCapture.qualifiedHeading}
                  qualifiedBody={resolvedEmailCapture.qualifiedBody}
                  qualifiedCtaText={resolvedEmailCapture.qualifiedCtaText}
                  qualifiedDismissText={resolvedEmailCapture.qualifiedDismissText}
                  unqualifiedHeading={resolvedEmailCapture.unqualifiedHeading}
                  unqualifiedBody={resolvedEmailCapture.unqualifiedBody}
                  unqualifiedCtaText={resolvedEmailCapture.unqualifiedCtaText}
                  unqualifiedCtaTarget={resolvedEmailCapture.unqualifiedCtaTarget}
                  unqualifiedDismissText={resolvedEmailCapture.unqualifiedDismissText}
                  buttonText={resolvedEmailCapture.buttonText ?? "Join launch access"}
                  placeholder={resolvedEmailCapture.placeholder}
                  subtitle={
                    resolvedEmailCapture.subtitle ??
                    (resolvedEmailCapture.productName
                      ? `You picked a plan. Enter your email to join launch access for ${resolvedEmailCapture.productName}.`
                      : "You picked a plan. Enter your email to join launch access.")
                  }
                  ariaLabel={resolvedEmailCapture.ariaLabel ?? modalAriaLabel}
                />
              ) : emailCaptureLoadError ? (
                <div className="space-y-4 text-center">
                  <h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-brand-text">
                    We couldn't load the signup form.
                  </h3>
                  <p className="text-[length:var(--text-body)] leading-7 text-brand-muted">
                    {emailCaptureLoadError}
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void loadEmailCaptureConfig()}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <div className="space-y-4 text-center">
                  <h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-brand-text">
                    Loading next step…
                  </h3>
                  <p className="text-[length:var(--text-body)] leading-7 text-brand-muted">
                    We&apos;re preparing the signup form for your selected plan.
                  </p>
                  {isLoadingEmailCapture ? (
                    <div
                      className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-accent-500"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

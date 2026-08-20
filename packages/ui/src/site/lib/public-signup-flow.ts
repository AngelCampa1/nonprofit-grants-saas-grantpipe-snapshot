import type { SiteConfig } from "../types";

type SurveyCopy = NonNullable<NonNullable<SiteConfig["copy"]>["survey"]>;
type EmailCaptureCopy = NonNullable<NonNullable<SiteConfig["copy"]>["emailCapture"]>;

export interface PublicSignupFlowConfig {
  surveyQuestions: SiteConfig["survey"]["questions"];
  surveyQualification?: SiteConfig["survey"]["qualification"];
  qualification?: SiteConfig["survey"]["qualification"];
  discoveryCallUrl: string;
  subtitle?: string;
  whatHappensNext?: string;
  surveyPreview?: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  successMessage?: string;
  productName?: string;
  productDomain?: string;
  qualifiedHeading?: string;
  qualifiedBody?: string;
  qualifiedCtaText?: string;
  /** Override URL for the qualified CTA. When set, takes precedence over discoveryCallUrl for that button. */
  qualifiedCtaTarget?: string;
  qualifiedDismissText?: string;
  unqualifiedHeading?: string;
  unqualifiedBody?: string;
  unqualifiedCtaText?: string;
  unqualifiedCtaTarget?: string;
  unqualifiedDismissText?: string;
}

export function buildPublicSignupFlowConfig(config: SiteConfig): PublicSignupFlowConfig {
  const surveyCopy = config.copy?.survey as SurveyCopy | undefined;
  const emailCaptureCopy = config.copy?.emailCapture as EmailCaptureCopy | undefined;

  return {
    surveyQuestions: config.survey.questions,
    surveyQualification: config.survey.qualification,
    qualification: config.survey.qualification,
    discoveryCallUrl: config.discoveryCallUrl,
    subtitle: emailCaptureCopy?.subtitle,
    whatHappensNext: emailCaptureCopy?.whatHappensNext ?? "Unsubscribe any time.",
    surveyPreview: emailCaptureCopy?.surveyPreview ?? "Quick 3-question survey. Takes 30 seconds.",
    privacyNote: emailCaptureCopy?.privacyNote,
    errorInvalidEmail: emailCaptureCopy?.errorInvalidEmail,
    errorDuplicate: emailCaptureCopy?.errorDuplicate,
    errorGeneric: emailCaptureCopy?.errorGeneric,
    successMessage: emailCaptureCopy?.successMessage,
    productName: config.name,
    productDomain: config.domain,
    qualifiedHeading: surveyCopy?.qualifiedHeading,
    qualifiedBody: surveyCopy?.qualifiedBody,
    qualifiedCtaText: surveyCopy?.qualifiedCtaText,
    qualifiedCtaTarget: surveyCopy?.qualifiedCtaTarget,
    qualifiedDismissText: surveyCopy?.qualifiedDismissText,
    unqualifiedHeading: surveyCopy?.unqualifiedHeading,
    unqualifiedBody: surveyCopy?.unqualifiedBody,
    unqualifiedCtaText: surveyCopy?.unqualifiedCtaText,
    unqualifiedCtaTarget: surveyCopy?.unqualifiedCtaTarget,
    unqualifiedDismissText: surveyCopy?.unqualifiedDismissText,
  };
}

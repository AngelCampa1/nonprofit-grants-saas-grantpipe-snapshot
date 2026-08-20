import { describe, expect, it } from "vitest";

import type { SiteConfig } from "../types";
import { buildPublicSignupFlowConfig } from "./public-signup-flow";

const siteConfig = {
  name: "Floriva",
  domain: "floriva.app",
  tagline: "Private period tracking",
  theme: {
    primary: "#000000",
    accent: "#111111",
    fonts: {
      heading: "Test Heading",
      body: "Test Body",
    },
  },
  product: {
    category: "Health",
    price: "$5/mo",
    targetAudience: "People",
    trustSignals: [],
  },
  competitors: [],
  funnel: {
    tofu: { ctaMode: "educate", ctaText: "Learn", ctaTarget: "/guides" },
    mofu: { ctaMode: "evaluate", ctaText: "Compare", ctaTarget: "/compare" },
    bofu: { ctaMode: "convert", ctaText: "Start", ctaTarget: "/signup" },
    ctaSubtitle: "Private by default",
  },
  survey: {
    questions: [{ id: "role", text: "Role?", options: ["User"] }],
    qualification: {
      logic: "all",
      rules: [{ questionId: "role", answers: ["User"] }],
    },
  },
  faqs: [],
  discoveryCallUrl: "https://cal.test/floriva",
  discoveryCallIncentive: "Free consult",
  problemAgitation: {
    heading: "Problem",
    closingLine: "Solution",
    painPoints: [],
  },
  copy: {
    emailCapture: {
      subtitle: "Stored on your device.",
      whatHappensNext: "Unsubscribe any time.",
      surveyPreview: "Quick 3-question survey. Takes 30 seconds.",
      privacyNote: "Private by default.",
      errorInvalidEmail: "Bad email",
      errorDuplicate: "Already on the list",
      errorGeneric: "Try again",
      successMessage: "You're in",
    },
    survey: {
      qualifiedHeading: "Qualified",
      qualifiedBody: "Book time",
      qualifiedCtaText: "Book now",
      qualifiedDismissText: "Later",
      unqualifiedHeading: "Not qualified",
      unqualifiedBody: "Read guide",
      unqualifiedCtaText: "Read more",
      unqualifiedCtaTarget: "/guide",
      unqualifiedDismissText: "Close",
    },
  },
} satisfies SiteConfig;

describe("buildPublicSignupFlowConfig", () => {
  it("returns only reusable public signup-flow fields", () => {
    expect(buildPublicSignupFlowConfig(siteConfig)).toEqual({
      surveyQuestions: siteConfig.survey.questions,
      surveyQualification: siteConfig.survey.qualification,
      qualification: siteConfig.survey.qualification,
      discoveryCallUrl: siteConfig.discoveryCallUrl,
      subtitle: siteConfig.copy?.emailCapture?.subtitle,
      whatHappensNext: siteConfig.copy?.emailCapture?.whatHappensNext,
      surveyPreview: siteConfig.copy?.emailCapture?.surveyPreview,
      privacyNote: siteConfig.copy?.emailCapture?.privacyNote,
      errorInvalidEmail: siteConfig.copy?.emailCapture?.errorInvalidEmail,
      errorDuplicate: siteConfig.copy?.emailCapture?.errorDuplicate,
      errorGeneric: siteConfig.copy?.emailCapture?.errorGeneric,
      successMessage: siteConfig.copy?.emailCapture?.successMessage,
      productName: siteConfig.name,
      productDomain: siteConfig.domain,
      qualifiedHeading: siteConfig.copy?.survey?.qualifiedHeading,
      qualifiedBody: siteConfig.copy?.survey?.qualifiedBody,
      qualifiedCtaText: siteConfig.copy?.survey?.qualifiedCtaText,
      qualifiedDismissText: siteConfig.copy?.survey?.qualifiedDismissText,
      unqualifiedHeading: siteConfig.copy?.survey?.unqualifiedHeading,
      unqualifiedBody: siteConfig.copy?.survey?.unqualifiedBody,
      unqualifiedCtaText: siteConfig.copy?.survey?.unqualifiedCtaText,
      unqualifiedCtaTarget: siteConfig.copy?.survey?.unqualifiedCtaTarget,
      unqualifiedDismissText: siteConfig.copy?.survey?.unqualifiedDismissText,
    });
  });

  it("does not include request-specific fields like apiUrl or sourcePage", () => {
    expect(buildPublicSignupFlowConfig(siteConfig)).not.toHaveProperty("apiUrl");
    expect(buildPublicSignupFlowConfig(siteConfig)).not.toHaveProperty("sourcePage");
  });

  it("falls back to the default email-capture copy when optional copy blocks are missing", () => {
    const configWithoutCopy = {
      ...siteConfig,
      copy: undefined,
    } satisfies SiteConfig;

    expect(buildPublicSignupFlowConfig(configWithoutCopy)).toEqual(
      expect.objectContaining({
        whatHappensNext: "Unsubscribe any time.",
        surveyPreview: "Quick 3-question survey. Takes 30 seconds.",
        qualifiedHeading: undefined,
        unqualifiedCtaTarget: undefined,
      }),
    );
  });

  it("preserves survey data even when email capture copy is omitted", () => {
    const configWithoutEmailCopy = {
      ...siteConfig,
      copy: {
        survey: siteConfig.copy?.survey,
      },
    } satisfies SiteConfig;

    expect(buildPublicSignupFlowConfig(configWithoutEmailCopy)).toEqual(
      expect.objectContaining({
        surveyQuestions: siteConfig.survey.questions,
        qualification: siteConfig.survey.qualification,
        qualifiedHeading: siteConfig.copy?.survey?.qualifiedHeading,
        whatHappensNext: "Unsubscribe any time.",
        surveyPreview: "Quick 3-question survey. Takes 30 seconds.",
      }),
    );
  });
});

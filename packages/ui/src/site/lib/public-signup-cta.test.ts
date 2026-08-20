import { describe, expect, it } from "vitest";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";

import {
  DEFAULT_PUBLIC_SIGNUP_CTA_TARGET,
  DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
  DEFAULT_PUBLIC_SIGNUP_MESSAGE,
  resolvePublicSignupCta,
  sanitizePublicSignupCtaText,
  sanitizePublicSignupMessage,
} from "./public-signup-cta";

describe("resolvePublicSignupCta", () => {
  it("uses the product signup entrypoint for homepage inline CTAs", () => {
    expect(DEFAULT_PUBLIC_SIGNUP_CTA_TEXT).toBe(marketingKnowledge.ctas.trial.label);
    expect(DEFAULT_PUBLIC_SIGNUP_MESSAGE).toBe(marketingKnowledge.ctas.trial.message);

    expect(resolvePublicSignupCta({})).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: DEFAULT_PUBLIC_SIGNUP_CTA_TARGET,
    });
  });

  it("uses the product signup entrypoint for non-home pages by default", () => {
    expect(resolvePublicSignupCta({})).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: DEFAULT_PUBLIC_SIGNUP_CTA_TARGET,
    });
  });

  it("preserves an explicit fake-door target when provided", () => {
    expect(
      resolvePublicSignupCta({
        explicitTarget: "/?plan=center#pricing",
        explicitText: "See PebbleDesk pricing",
      }),
    ).toEqual({
      text: "See PebbleDesk pricing",
      target: "/?plan=center#pricing",
    });
  });

  it("keeps explicit pricing targets while falling back to the neutral default copy", () => {
    expect(
      resolvePublicSignupCta({
        explicitTarget: "/?plan=center#pricing",
      }),
    ).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: "/?plan=center#pricing",
    });
  });

  it("preserves free-trial CTA copy", () => {
    expect(
      resolvePublicSignupCta({
        explicitText: "Start your free trial",
      }),
    ).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: DEFAULT_PUBLIC_SIGNUP_CTA_TARGET,
    });
  });

  it("preserves free-trial CTA copy when the target is the pricing section", () => {
    expect(
      resolvePublicSignupCta({
        explicitTarget: "/#pricing",
        explicitText: "Start Your 1-Month Free Trial",
      }),
    ).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: "/#pricing",
    });
  });

  it("uses the default CTA copy when a pricing anchor target is provided without explicit text", () => {
    expect(
      resolvePublicSignupCta({
        explicitTarget: "/#pricing",
      }),
    ).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: "/#pricing",
    });
  });

  it("treats malformed pricing-target checks as non-pricing fallbacks", () => {
    const malformedTarget = {
      includes: () => undefined,
      toString: () => "/#pricing",
    } as unknown as string;

    expect(
      resolvePublicSignupCta({
        explicitTarget: malformedTarget,
        explicitText: "Start your free trial",
      }),
    ).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: malformedTarget,
    });
  });
});

describe("sanitizePublicSignupCtaText", () => {
  it("falls back to the default CTA copy when text is missing", () => {
    expect(sanitizePublicSignupCtaText()).toBe(DEFAULT_PUBLIC_SIGNUP_CTA_TEXT);
  });

  it("replaces waitlist CTA copy with neutral pricing copy", () => {
    expect(sanitizePublicSignupCtaText("Join the waitlist")).toBe(DEFAULT_PUBLIC_SIGNUP_CTA_TEXT);
  });

  it("preserves safe CTA copy", () => {
    expect(sanitizePublicSignupCtaText("See pricing")).toBe("See pricing");
  });
});

describe("sanitizePublicSignupMessage", () => {
  it("preserves an undefined helper message when no copy is provided", () => {
    expect(sanitizePublicSignupMessage(undefined)).toBeUndefined();
  });

  it("preserves no-card trial messaging for direct GrantPipe signup flows", () => {
    expect(sanitizePublicSignupMessage("1-month free trial - no credit card required")).toBe(
      "1-month free trial - no credit card required",
    );
  });

  it("replaces follow-up message copy with neutral fake-door copy", () => {
    expect(
      sanitizePublicSignupMessage("Quick follow-up, then a free trial with no credit card"),
    ).toBe(DEFAULT_PUBLIC_SIGNUP_MESSAGE);
  });

  it("replaces signup-oriented helper copy with neutral fake-door copy", () => {
    expect(
      sanitizePublicSignupMessage(
        "Mutra is built for the admin paralysis no timer or tracker can fix. Sign up free.",
      ),
    ).toBe(DEFAULT_PUBLIC_SIGNUP_MESSAGE);
  });

  it("preserves safe helper copy", () => {
    expect(sanitizePublicSignupMessage("Pick a plan to see pricing details and next steps.")).toBe(
      "Pick a plan to see pricing details and next steps.",
    );
  });

  it("uses the supplied fallback when signup-oriented helper copy is sanitized", () => {
    expect(sanitizePublicSignupMessage("Start signup today", "Use custom fallback")).toBe(
      "Use custom fallback",
    );
  });
});

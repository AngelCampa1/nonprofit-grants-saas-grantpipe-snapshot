import { marketingKnowledge } from "@grantpipe/shared/public-kb";

export const DEFAULT_PUBLIC_SIGNUP_CTA_TEXT = marketingKnowledge.ctas.trial.label;
export const DEFAULT_PUBLIC_SIGNUP_MESSAGE = marketingKnowledge.ctas.trial.message;
export const DEFAULT_PUBLIC_SIGNUP_CTA_TARGET = marketingKnowledge.ctas.trial.href;
const DISALLOWED_PUBLIC_CTA_TEXT_PATTERN =
  /\b(waitlist|launch access|questionnaire|survey|follow-?up|free trial)\b/i;
const DISALLOWED_PUBLIC_MESSAGE_PATTERN =
  /\b(waitlist|launch access|questionnaire|survey|follow-?up|sign[ -]?up|signup|try it free)\b/i;

interface ResolvePublicSignupCtaOptions {
  explicitTarget?: string;
  explicitText?: string;
}

export interface PublicSignupCta {
  text: string;
  target: string;
}

export function sanitizePublicSignupCtaText(text?: string): string {
  if (!text) {
    return DEFAULT_PUBLIC_SIGNUP_CTA_TEXT;
  }

  return DISALLOWED_PUBLIC_CTA_TEXT_PATTERN.test(text) ? DEFAULT_PUBLIC_SIGNUP_CTA_TEXT : text;
}

export function sanitizePublicSignupMessage(
  text: string | undefined,
  fallback = DEFAULT_PUBLIC_SIGNUP_MESSAGE,
): string | undefined {
  if (!text) {
    return text;
  }

  return DISALLOWED_PUBLIC_MESSAGE_PATTERN.test(text) ? fallback : text;
}

export function resolvePublicSignupCta({
  explicitTarget,
  explicitText,
}: ResolvePublicSignupCtaOptions): PublicSignupCta {
  const target = explicitTarget ?? DEFAULT_PUBLIC_SIGNUP_CTA_TARGET;

  return {
    text: sanitizePublicSignupCtaText(explicitText),
    target,
  };
}

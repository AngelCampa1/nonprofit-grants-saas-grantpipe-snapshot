import type { BuyerStage, CtaAnalyticsContext } from "../types";

export type CtaClickEventProperties = Record<string, unknown> & {
  cta_id: string;
  destination_path: string;
  section: string;
  page_path: string;
  page_family?: string;
  buyer_stage?: BuyerStage;
  placement?: string;
  intent?: string;
};

interface CtaClickEventPropertyInput {
  buttonText: string;
  href: string;
  section: string;
  pagePath: string;
  index?: number;
}

const CTA_ANALYTICS_ATTRIBUTE_MAP = {
  id: "data-cta-id",
  pageFamily: "data-cta-page-family",
  buyerStage: "data-cta-buyer-stage",
  placement: "data-cta-placement",
  intent: "data-cta-intent",
  target: "data-cta-target",
} as const;

type CtaAnalyticsAttributeKey = keyof typeof CTA_ANALYTICS_ATTRIBUTE_MAP;

export function buildCtaAnalyticsAttributes(context?: CtaAnalyticsContext): Record<string, string> {
  const attributes: Record<string, string> = {
    "data-cta-button": "",
  };

  if (!context) {
    return attributes;
  }

  for (const [key, attributeName] of Object.entries(CTA_ANALYTICS_ATTRIBUTE_MAP) as Array<
    [CtaAnalyticsAttributeKey, string]
  >) {
    const value = context[key];
    if (value) {
      attributes[attributeName] = value;
    }
  }

  return attributes;
}

function readCtaAnalyticsAttribute(
  element: HTMLElement,
  attributeName: string,
): string | undefined {
  const ownValue = element.getAttribute(attributeName);
  if (ownValue) {
    return ownValue;
  }

  const parentWithValue = element.closest(`[${attributeName}]`);
  const inheritedValue = parentWithValue?.getAttribute(attributeName);
  return inheritedValue || undefined;
}

function destinationPathFromHref(href: string): string {
  if (!href) return "";
  if (href.startsWith("#")) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:\/\//i.test(href)) {
    return "non_http";
  }

  try {
    return new URL(href, "https://grantpipe.invalid").pathname;
  } catch {
    return "invalid";
  }
}

export function getCtaAnalyticsContext(element: HTMLElement): CtaAnalyticsContext {
  return {
    id: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.id),
    pageFamily: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.pageFamily),
    buyerStage: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.buyerStage) as
      | BuyerStage
      | undefined,
    placement: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.placement),
    intent: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.intent),
    target: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.target),
  };
}

export function buildCtaClickEventProperties(
  element: HTMLElement,
  input: CtaClickEventPropertyInput,
): CtaClickEventProperties {
  const context = getCtaAnalyticsContext(element);
  const destinationPath = destinationPathFromHref(input.href || context.target || "");
  const fallbackPosition = typeof input.index === "number" ? input.index : 0;
  const ctaId = context.id ?? `${input.section}:cta-${Math.max(fallbackPosition, 0)}`;

  return {
    cta_id: ctaId,
    destination_path: destinationPath,
    section: input.section,
    page_path: input.pagePath,
    ...(context.pageFamily ? { page_family: context.pageFamily } : {}),
    ...(context.buyerStage ? { buyer_stage: context.buyerStage } : {}),
    ...(context.placement ? { placement: context.placement } : {}),
    ...(context.intent ? { intent: context.intent } : {}),
  };
}

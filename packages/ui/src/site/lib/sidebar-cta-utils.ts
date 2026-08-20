import type { BuyerStage, CtaAnalyticsContext, CtaLinkConfig, SiteConfig } from "../types";

export interface SidebarCtaProps {
  ctaText: string;
  ctaTarget: string;
  subtitle?: string;
  bullets?: string[];
  trustNote?: string;
  analytics: CtaAnalyticsContext;
}

export interface BottomCtaProps {
  kicker: string;
  heading: string;
  subtext: string;
  primaryCta: CtaLinkConfig;
  secondaryCta?: CtaLinkConfig;
  analytics: CtaAnalyticsContext;
  secondaryAnalytics?: CtaAnalyticsContext;
}

export type BottomCtaPageFamily =
  | "comparison"
  | "pricing-breakdown"
  | "resource-article"
  | "resource-listicle";

export function buildSidebarCtaProps(config: SiteConfig, stage: BuyerStage): SidebarCtaProps {
  const funnelStage = config.funnel[stage];
  return {
    ctaText: funnelStage.ctaText,
    ctaTarget: funnelStage.ctaTarget,
    subtitle: config.copy?.funnelCta?.subtitle,
    bullets: config.copy?.funnelCta?.benefitBullets,
    trustNote: config.copy?.funnelCta?.trustNote,
    analytics: {
      buyerStage: stage,
      intent: funnelStage.ctaMode,
      placement: "sidebar",
    },
  };
}

const bottomCtaCopyByStage: Record<
  BuyerStage,
  Pick<BottomCtaProps, "heading" | "kicker" | "subtext">
> = {
  tofu: {
    kicker: "Next step",
    heading: "Pick the next guide.",
    subtext: "Use the resource hub to find the next page to read.",
  },
  mofu: {
    kicker: "Next step",
    heading: "Compare fit and cost.",
    subtext: "See how GrantPipe fits your team before you start a trial.",
  },
  bofu: {
    kicker: "Next step",
    heading: "Test the workflow.",
    subtext: "Start a trial. Check grant, fund, and compliance work in one place.",
  },
};

const secondaryStageByStage: Partial<Record<BuyerStage, BuyerStage>> = {
  tofu: "mofu",
  mofu: "bofu",
};

export function buildBottomCtaProps(
  config: SiteConfig,
  stage: BuyerStage,
  pageFamily: BottomCtaPageFamily,
): BottomCtaProps {
  const funnelStage = config.funnel[stage];
  const secondaryStage = secondaryStageByStage[stage];
  const secondaryFunnelStage = secondaryStage ? config.funnel[secondaryStage] : undefined;

  return {
    ...bottomCtaCopyByStage[stage],
    primaryCta: {
      text: funnelStage.ctaText,
      target: funnelStage.ctaTarget,
    },
    secondaryCta: secondaryFunnelStage
      ? {
          text: secondaryFunnelStage.ctaText,
          target: secondaryFunnelStage.ctaTarget,
        }
      : undefined,
    analytics: {
      buyerStage: stage,
      intent: funnelStage.ctaMode,
      pageFamily,
      placement: "bottom-primary",
      target: funnelStage.ctaTarget,
    },
    secondaryAnalytics:
      secondaryStage && secondaryFunnelStage
        ? {
            buyerStage: secondaryStage,
            intent: secondaryFunnelStage.ctaMode,
            pageFamily,
            placement: "bottom-secondary",
            target: secondaryFunnelStage.ctaTarget,
          }
        : undefined,
  };
}

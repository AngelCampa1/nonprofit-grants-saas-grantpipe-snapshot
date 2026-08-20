import { marketingKnowledge } from "../knowledge/marketing";
import {
  CAPABILITY_CLAIMS,
  getCapabilityClaimByFeatureSlug,
  type CapabilityClaim,
} from "../capabilities";
import type { MarketingKnowledge } from "../knowledge/types";

type PublicKnowledgeConsumerJson = "marketing_ai_sdr";
export {
  buildGrantPipeAiSdrProductContext,
  GRANTPIPE_AI_SDR_PRODUCT_ID,
  type AiSdrMeetingLink,
  type AiSdrProductContext,
  type AiSdrProductPlan,
  type AiSdrProductSource,
} from "./ai-sdr-context";
export {
  competitorProfiles,
  directCompetitorSlugs,
  getCompetitorProfile,
  getDirectCompetitorBattlecards,
  grantPipeMarketPosition,
  type CompetitorProfile,
} from "../knowledge/marketing/market-facts";

export { marketingKnowledge } from "../knowledge/marketing";
export type {
  CompetitorBattlecard,
  MarketingCtaKnowledge,
  MarketingContentCollection,
  MarketingKnowledge,
  MarketingPlanKnowledge,
  SourceReference,
} from "../knowledge/types";
export { MARKETING_CONTENT_COLLECTIONS } from "../knowledge/types";
export {
  getMarketingContentCollectionBase,
  getMarketingContentRepositoryRoot,
} from "../knowledge/marketing";

export {
  ALLOWED_CITATION_HOSTS,
  isAllowedCitationHost,
  type AllowedCitationHost,
} from "../knowledge/marketing/allowed-citation-hosts";
export {
  FORBIDDEN_PATTERNS,
  type ForbiddenPattern,
} from "../knowledge/marketing/forbidden-patterns";

function normalizeCapabilityLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

const capabilityClaimsByPublicName = new Map<string, CapabilityClaim>(
  CAPABILITY_CLAIMS.flatMap((claim) => [
    [normalizeCapabilityLookupValue(claim.label), claim],
    ...claim.aliases.map((alias) => [normalizeCapabilityLookupValue(alias), claim] as const),
  ]),
);

function isPublicAiSafePlanFeature(feature: string): boolean {
  const claim = capabilityClaimsByPublicName.get(normalizeCapabilityLookupValue(feature));
  if (claim === undefined) {
    return true;
  }

  return isPublicAiSafeCapabilityClaim(claim);
}

function isPublicAiSafeCapabilityClaim(claim: CapabilityClaim): boolean {
  return (
    claim.status === "shipped" &&
    claim.allowedPublicSurfaces.includes("public-kb") &&
    claim.allowedPublicSurfaces.includes("ai-sdr")
  );
}

function isPublicAiSafeContentEntry(
  entry: MarketingKnowledge["content"]["entries"][number],
): boolean {
  if (entry.collection !== "features") {
    return true;
  }

  const claim = getCapabilityClaimByFeatureSlug(entry.slug);
  return claim === undefined || isPublicAiSafeCapabilityClaim(claim);
}

function buildPublicAiMarketingKnowledge(): MarketingKnowledge {
  return {
    ...marketingKnowledge,
    plans: marketingKnowledge.plans.map((plan) => ({
      ...plan,
      features: plan.features.filter(isPublicAiSafePlanFeature),
    })),
    content: {
      ...marketingKnowledge.content,
      entries: marketingKnowledge.content.entries.filter(isPublicAiSafeContentEntry),
    },
  };
}

export function buildPublicKnowledgeJson(consumer: PublicKnowledgeConsumerJson): string {
  if (consumer !== "marketing_ai_sdr") {
    throw new Error(`Public KB cannot build authenticated knowledge payload: ${consumer}`);
  }

  const payload = { consumer, marketing: buildPublicAiMarketingKnowledge() };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function getPublicKnowledgeJsonArtifacts(): Array<{ fileName: string; json: string }> {
  return [
    { fileName: "marketing-ai-sdr.json", json: buildPublicKnowledgeJson("marketing_ai_sdr") },
  ];
}

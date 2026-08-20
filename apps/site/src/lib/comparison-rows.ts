import { getCompetitorProfile, grantPipeMarketPosition } from "../config/market-facts";

export interface ComparisonRow {
  feature: string;
  values: string[];
}

interface VersusCompetitor {
  slug: string;
  name: string;
  pricing: string;
}

interface VersusComparisonTable {
  headers: string[];
  rows: ComparisonRow[];
  highlightColumn: number;
}

type CompetitorProfileField =
  | "pricingSummary"
  | "contractSummary"
  | "setupSummary"
  | "grantSummary"
  | "complianceSummary"
  | "bestFor";

const GRANTPIPE_SLUG = "grantpipe";

function resolveProfileValue(slug: string, fallback: string, field: CompetitorProfileField) {
  return getCompetitorProfile(slug)?.[field] ?? fallback;
}

export function buildAlternativeComparisonRows(
  competitorSlug: string,
  competitorPricing: string,
  competitorSetupFee: string | undefined,
): ComparisonRow[] {
  return [
    {
      feature: "Pricing posture",
      values: [
        resolveProfileValue(competitorSlug, competitorPricing, "pricingSummary"),
        grantPipeMarketPosition.pricingSummary,
      ],
    },
    {
      feature: "Setup profile",
      values: [
        resolveProfileValue(
          competitorSlug,
          competitorSetupFee ?? "Varies by implementation",
          "setupSummary",
        ),
        grantPipeMarketPosition.setupSummary,
      ],
    },
    {
      feature: "Grant workflow depth",
      values: [
        resolveProfileValue(competitorSlug, "Varies", "grantSummary"),
        grantPipeMarketPosition.grantSummary,
      ],
    },
    {
      feature: "Compliance depth",
      values: [
        resolveProfileValue(competitorSlug, "Varies", "complianceSummary"),
        grantPipeMarketPosition.complianceSummary,
      ],
    },
    {
      feature: "Best fit",
      values: [
        resolveProfileValue(competitorSlug, "General nonprofit software buyers", "bestFor"),
        grantPipeMarketPosition.bestFor,
      ],
    },
  ];
}

export function buildVersusComparisonRows(
  slugA: string,
  pricingA: string,
  slugB: string,
  pricingB: string,
): ComparisonRow[] {
  return [
    {
      feature: "Pricing posture",
      values: [
        resolveProfileValue(slugA, pricingA, "pricingSummary"),
        resolveProfileValue(slugB, pricingB, "pricingSummary"),
        grantPipeMarketPosition.pricingSummary,
      ],
    },
    {
      feature: "Setup profile",
      values: [
        resolveProfileValue(slugA, "Varies", "setupSummary"),
        resolveProfileValue(slugB, "Varies", "setupSummary"),
        grantPipeMarketPosition.setupSummary,
      ],
    },
    {
      feature: "Grant workflow depth",
      values: [
        resolveProfileValue(slugA, "Varies", "grantSummary"),
        resolveProfileValue(slugB, "Varies", "grantSummary"),
        grantPipeMarketPosition.grantSummary,
      ],
    },
    {
      feature: "Compliance depth",
      values: [
        resolveProfileValue(slugA, "Varies", "complianceSummary"),
        resolveProfileValue(slugB, "Varies", "complianceSummary"),
        grantPipeMarketPosition.complianceSummary,
      ],
    },
  ];
}

function buildGrantPipeHeadToHeadRows(
  otherCompetitorSlug: string,
  otherCompetitorPricing: string,
): ComparisonRow[] {
  return [
    {
      feature: "Pricing posture",
      values: [
        grantPipeMarketPosition.pricingSummary,
        resolveProfileValue(otherCompetitorSlug, otherCompetitorPricing, "pricingSummary"),
      ],
    },
    {
      feature: "Setup profile",
      values: [
        grantPipeMarketPosition.setupSummary,
        resolveProfileValue(otherCompetitorSlug, "Varies", "setupSummary"),
      ],
    },
    {
      feature: "Grant workflow depth",
      values: [
        grantPipeMarketPosition.grantSummary,
        resolveProfileValue(otherCompetitorSlug, "Varies", "grantSummary"),
      ],
    },
    {
      feature: "Compliance depth",
      values: [
        grantPipeMarketPosition.complianceSummary,
        resolveProfileValue(otherCompetitorSlug, "Varies", "complianceSummary"),
      ],
    },
  ];
}

export function buildVersusComparisonTable(
  competitorA: VersusCompetitor,
  competitorB: VersusCompetitor,
  grantPipeName = "GrantPipe",
): VersusComparisonTable {
  if (competitorA.slug === GRANTPIPE_SLUG || competitorB.slug === GRANTPIPE_SLUG) {
    const otherCompetitor = competitorA.slug === GRANTPIPE_SLUG ? competitorB : competitorA;

    return {
      headers: ["Feature", grantPipeName, otherCompetitor.name],
      rows: buildGrantPipeHeadToHeadRows(otherCompetitor.slug, otherCompetitor.pricing),
      highlightColumn: 1,
    };
  }

  return {
    headers: ["Feature", competitorA.name, competitorB.name, grantPipeName],
    rows: buildVersusComparisonRows(
      competitorA.slug,
      competitorA.pricing,
      competitorB.slug,
      competitorB.pricing,
    ),
    highlightColumn: 3,
  };
}

export function buildPricingComparisonRows(
  competitorSlug: string,
  competitorPricing: string,
): ComparisonRow[] {
  return [
    {
      feature: "Pricing posture",
      values: [
        resolveProfileValue(competitorSlug, competitorPricing, "pricingSummary"),
        grantPipeMarketPosition.pricingSummary,
      ],
    },
    {
      feature: "Contract posture",
      values: [
        resolveProfileValue(competitorSlug, "Varies", "contractSummary"),
        grantPipeMarketPosition.contractSummary,
      ],
    },
    {
      feature: "Setup profile",
      values: [
        resolveProfileValue(competitorSlug, "Varies", "setupSummary"),
        grantPipeMarketPosition.setupSummary,
      ],
    },
  ];
}

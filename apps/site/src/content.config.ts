import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import {
  getMarketingContentCollectionBase,
  type MarketingContentCollection,
} from "@grantpipe/shared/public-kb";
import {
  alternativeSchema,
  comparisonSchema,
  pricingBreakdownSchema,
  listicleSchema,
  guideSchema,
  statePageSchema,
  cityPageSchema,
  verticalPageSchema,
  leadMagnetSchema,
  personaSchema,
  workflowSchema,
  glossarySchema,
  featureSchema,
  integrationSchema,
  faqHubSchema,
  benchmarkSchema,
} from "@grantpipe/ui/site/content/schemas";

function contentBase(collection: MarketingContentCollection): string {
  return getMarketingContentCollectionBase(collection);
}

const alternatives = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("alternatives") }),
  schema: alternativeSchema,
});

const comparisons = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("comparisons") }),
  schema: comparisonSchema,
});

const pricingBreakdowns = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: contentBase("pricing-breakdowns"),
  }),
  schema: pricingBreakdownSchema,
});

const listicles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("listicles") }),
  schema: listicleSchema,
});

const guides = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("guides") }),
  schema: guideSchema,
});

const statePages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("state-pages") }),
  schema: statePageSchema,
});

const cityPages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("city-pages") }),
  schema: cityPageSchema,
});

const verticalPages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("vertical-pages") }),
  schema: verticalPageSchema,
});

const leadMagnets = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("lead-magnets") }),
  schema: leadMagnetSchema,
});

const personas = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("personas") }),
  schema: personaSchema,
});

const workflows = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("workflows") }),
  schema: workflowSchema,
});

const glossary = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("glossary") }),
  schema: glossarySchema,
});

const features = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("features") }),
  schema: featureSchema,
});

const integrations = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("integrations") }),
  schema: integrationSchema,
});

const faqHubs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("faq-hubs") }),
  schema: faqHubSchema,
});

const benchmarks = defineCollection({
  loader: glob({ pattern: "**/*.md", base: contentBase("benchmarks") }),
  schema: benchmarkSchema,
});

export const collections = {
  alternatives,
  comparisons,
  "pricing-breakdowns": pricingBreakdowns,
  listicles,
  guides,
  "state-pages": statePages,
  "city-pages": cityPages,
  "vertical-pages": verticalPages,
  "lead-magnets": leadMagnets,
  personas,
  workflows,
  glossary,
  features,
  integrations,
  "faq-hubs": faqHubs,
  benchmarks,
};

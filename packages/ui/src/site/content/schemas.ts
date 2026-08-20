import { z } from "astro:content";
import { LEAD_MAGNET_SLUGS } from "../../../../shared/src/constants/lead-magnets";

const answerSchema = z
  .array(
    z.union([
      z.object({ q: z.string(), a: z.string() }),
      z
        .object({ question: z.string(), answer: z.string() })
        .transform(({ question, answer }) => ({ q: question, a: answer })),
    ]),
  )
  .optional();
const prosConsSchema = z
  .array(
    z.object({
      subject: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
    }),
  )
  .optional();
const pricingStatSchema = z
  .array(
    z.object({
      stat: z.string(),
      source: z.string(),
      sourceUrl: z.string().optional(),
    }),
  )
  .optional();
const tableDataSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  })
  .optional();

const topicClusterSchema = z
  .enum([
    "nonprofit-crm",
    "grant-management",
    "grant-compliance",
    "restricted-fund-accounting",
    "donor-operations",
  ])
  .optional();

export const baseContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  lastReviewedAt: z.string().optional(),
  verifiedAt: z.string().optional(),
  buyerStage: z.enum(["tofu", "mofu", "bofu"]),
  ctaMode: z.enum(["educate", "evaluate", "convert"]).optional(),
  primaryCta: z.enum(["trial", "lead-magnet", "compare", "pricing", "contact"]).optional(),
  contentIntent: z
    .enum([
      "category",
      "comparison",
      "pricing",
      "workflow",
      "vertical",
      "geographic",
      "lead-magnet",
    ])
    .optional(),
  topicCluster: topicClusterSchema,
  refreshCadenceMonths: z.number().int().positive().max(24).optional(),
  targetKeyword: z.string().optional(),
  schema: z
    .enum([
      "Article",
      "FAQPage",
      "HowTo",
      "Product",
      "ItemList",
      "SoftwareApplication",
      "DefinedTerm",
    ])
    .default("Article"),
  bluf: z.string(),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  relatedPages: z.array(z.string()).min(1),
  sourceUrls: z.array(z.string().url()).default([]),
  statistics: z
    .array(
      z.object({
        stat: z.string(),
        source: z.string(),
        sourceUrl: z.string().optional(),
      }),
    )
    .default([]),
  noindex: z.boolean().default(false),
  ogImage: z.string().optional(),
  tags: z.array(z.string()).default([]),
  targetPersona: z.array(z.string()).optional(),
  leadMagnetSlug: z.enum(LEAD_MAGNET_SLUGS).optional(),
  exitMagnetSlug: z.enum(LEAD_MAGNET_SLUGS).optional(),
});

export const alternativeSchema = baseContentSchema.extend({
  competitor: z.object({
    name: z.string(),
    slug: z.string(),
    url: z.string().optional(),
    pricing: z.string(),
    weakness: z.string(),
    setupFee: z.string().optional(),
    pros: z.array(z.string()).default([]),
    cons: z.array(z.string()).default([]),
  }),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  proscons: prosConsSchema,
  answers: answerSchema,
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const comparisonSchema = baseContentSchema.extend({
  competitorA: z.object({
    name: z.string(),
    slug: z.string(),
    pricing: z.string(),
    pros: z.array(z.string()).default([]),
    cons: z.array(z.string()).default([]),
  }),
  competitorB: z.object({
    name: z.string(),
    slug: z.string(),
    pricing: z.string(),
    pros: z.array(z.string()).default([]),
    cons: z.array(z.string()).default([]),
  }),
  verdict: z.string(),
  disableProsConsSchema: z.boolean().default(false),
  tableData: tableDataSchema,
  pricingStats: pricingStatSchema,
  proscons: prosConsSchema,
  answers: answerSchema,
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const pricingBreakdownSchema = baseContentSchema.extend({
  competitor: z.object({
    name: z.string(),
    slug: z.string(),
    pricing: z.string(),
  }),
  tiers: z.array(
    z.object({
      name: z.string(),
      price: z.string(),
      features: z.array(z.string()),
    }),
  ),
  hiddenCosts: z.array(z.string()),
  tableData: tableDataSchema,
  pricingStats: pricingStatSchema,
  answers: answerSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const listicleSchema = baseContentSchema.extend({
  category: z.string(),
  qualifier: z.string(),
  tools: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
      pricing: z.string(),
      verdict: z.string(),
    }),
  ),
  tableData: tableDataSchema,
  answers: answerSchema,
  pricingStats: pricingStatSchema,
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
  proscons: prosConsSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const guideSchema = baseContentSchema.extend({
  steps: z.array(z.object({ title: z.string(), content: z.string() })).optional(),
  timeEstimate: z.string().optional(),
  difficulty: z.string().optional(),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  answers: answerSchema,
  proscons: prosConsSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
  tableData: tableDataSchema,
  pricingStats: pricingStatSchema,
});

export const statePageSchema = baseContentSchema.extend({
  state: z.string(),
  stateCode: z.string(),
  // Generic fields (both verticals)
  marketSize: z.number().optional(),
  topMarkets: z
    .array(
      z.object({
        name: z.string(),
        count: z.number(),
        label: z.string().optional(),
      }),
    )
    .default([]),
  regulations: z
    .array(
      z.object({
        heading: z.string(),
        content: z.string(),
        variant: z.enum(["info", "warning", "success"]).default("info"),
      }),
    )
    .default([]),
  // Legacy fields (optional for backward compat)
  establishmentCount: z.number().optional(),
  topMetros: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
  licensingNotes: z.string().optional(),
  seasonalNotes: z.string().optional(),
  // SEO blocks
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  answers: answerSchema,
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const cityPageSchema = baseContentSchema.extend({
  city: z.string(),
  citySlug: z.string(),
  state: z.string(),
  stateCode: z.string(),
  stateSlug: z.string(),
  metroAreaName: z.string().optional(),
  nonprofitCount: z.number().optional(),
  populationServed: z.number().optional(),
  topFunders: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum([
          "community-foundation",
          "private-foundation",
          "corporate-foundation",
          "government",
          "united-way",
          "family-foundation",
        ]),
        annualGiving: z.string().optional(),
        url: z.string().url().optional(),
      }),
    )
    .default([]),
  localRegulations: z
    .array(
      z.object({
        heading: z.string(),
        content: z.string(),
        variant: z.enum(["info", "warning", "success"]).default("info"),
      }),
    )
    .default([]),
  topMetros: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
  fiscalCalendarNotes: z.string().optional(),
  registrationNotes: z.string().optional(),
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  answers: answerSchema,
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export type CityPageEntry = z.infer<typeof cityPageSchema>;

export const verticalPageSchema = baseContentSchema.extend({
  verticalType: z.string(),
  keyPainPoints: z.array(z.string()),
  commonGrantTypes: z.array(z.string()),
  complianceNotes: z.string(),
  estimatedOrgCount: z.number().optional(),
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  answers: answerSchema,
  entitlement: z.enum(PLAN_ENTITLEMENT_KEYS).optional(),
  recommendedTier: z.enum(PLAN_TIERS).optional(),
});

export const orgTypePageSchema = baseContentSchema.extend({
  orgType: z.string(),
  orgTypeSlug: z.string(),
  estimatedCount: z.number().optional(),
  uniqueNeeds: z.array(z.string()),
  complianceNotes: z.string().optional(),
  answers: answerSchema,
});

import { PLAN_ENTITLEMENT_KEYS } from "../../../../shared/src/pricing";
import { PLAN_TIERS } from "../../../../shared/src/constants";

export { PLAN_ENTITLEMENT_KEYS };

export const featureSchema = baseContentSchema.extend({
  tableData: tableDataSchema,
  proscons: prosConsSchema,
  answers: answerSchema,
  pricingStats: pricingStatSchema,
  entitlement: z.enum(PLAN_ENTITLEMENT_KEYS).optional(),
});

export const reviewSchema = baseContentSchema.extend({
  competitor: z.object({
    name: z.string(),
    slug: z.string(),
    url: z.string().optional(),
    pricing: z.string(),
  }),
  verdict: z.string(),
  tableData: tableDataSchema,
  proscons: prosConsSchema,
  answers: answerSchema,
  pricingStats: pricingStatSchema,
});

export const phasePageSchema = baseContentSchema.extend({
  phase: z.enum(["follicular", "ovulatory", "luteal", "menstrual", "hormone", "cycle"]),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  answers: answerSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export type PhasePageEntry = z.infer<typeof phasePageSchema>;

export const goalPageSchema = baseContentSchema.extend({
  audience: z.enum([
    "perimenopause",
    "menopause",
    "over-40",
    "active-recovery",
    "beginners",
    "lifters",
    "general",
  ]),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  answers: answerSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
  statisticCitations: pricingStatSchema,
  tableData: tableDataSchema,
});

export type GoalPageEntry = z.infer<typeof goalPageSchema>;

export const symptomsSchema = guideSchema;

export const leadMagnetSchema = z.object({
  title: z.string(),
  description: z.string(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  lastReviewedAt: z.string(),
  verifiedAt: z.string(),
  bluf: z.string(),
  freePreviewSections: z.number().default(2),
  ogImage: z.string().optional(),
  tags: z.array(z.string()).default([]),
  relatedPages: z.array(z.string()).min(1),
  noindex: z.boolean().default(false),
  sourceUrls: z.array(z.string().url()).min(1),
  primaryCta: z.enum(["trial", "lead-magnet", "compare", "pricing", "contact"]).optional(),
  contentIntent: z
    .enum([
      "category",
      "comparison",
      "pricing",
      "workflow",
      "vertical",
      "geographic",
      "lead-magnet",
    ])
    .optional(),
  topicCluster: topicClusterSchema,
  targetKeyword: z.string().optional(),
  answers: answerSchema,
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  buyerStage: z.enum(["tofu", "mofu", "bofu"]).default("tofu"),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  schema: z
    .enum([
      "Article",
      "FAQPage",
      "HowTo",
      "Product",
      "ItemList",
      "SoftwareApplication",
      "DefinedTerm",
    ])
    .default("Article"),
  deliverableType: z.enum(["pdf", "calculator", "sheet", "article"]).default("article"),
  leadMagnetSlug: z.enum(LEAD_MAGNET_SLUGS).optional(),
  exitMagnetSlug: z.enum(LEAD_MAGNET_SLUGS).optional(),
});

const expertQuotesSchema = z
  .array(
    z.object({
      quote: z.string(),
      personName: z.string(),
      jobTitle: z.string().optional(),
      organization: z.string().optional(),
    }),
  )
  .optional();

export const personaSchema = baseContentSchema.extend({
  role: z.string(),
  roleSlug: z.string(),
  painPoints: z.array(z.string()),
  jobsToBeDone: z.array(z.string()),
  featureMap: z.array(z.object({ feature: z.string(), benefit: z.string() })),
  answers: answerSchema,
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  proscons: prosConsSchema,
  expertQuotes: expertQuotesSchema,
  entitlement: z.enum(PLAN_ENTITLEMENT_KEYS).optional(),
  recommendedTier: z.enum(PLAN_TIERS).optional(),
});

export const workflowSchema = baseContentSchema.extend({
  steps: z.array(z.object({ title: z.string(), content: z.string() })),
  timeEstimate: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  prerequisites: z.array(z.string()),
  outputs: z.array(z.string()),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
  answers: answerSchema,
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  expertQuotes: expertQuotesSchema,
  entitlement: z.enum(PLAN_ENTITLEMENT_KEYS).optional(),
  schema: z
    .enum([
      "Article",
      "FAQPage",
      "HowTo",
      "Product",
      "ItemList",
      "SoftwareApplication",
      "DefinedTerm",
    ])
    .default("HowTo"),
});

export const glossarySchema = baseContentSchema.extend({
  term: z.string(),
  shortDefinition: z.string(),
  longDefinition: z.string(),
  relatedTerms: z.array(z.string()),
  examples: z.array(z.string()),
  answers: answerSchema,
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
  pricingStats: pricingStatSchema,
  expertQuotes: expertQuotesSchema,
});

export const integrationSchema = baseContentSchema.extend({
  partner: z.object({
    name: z.string(),
    slug: z.string(),
    url: z.string().optional(),
    logo: z.string().optional(),
  }),
  category: z.enum(["accounting", "email", "payments", "automation", "other"]),
  setupSteps: z.array(z.object({ title: z.string(), content: z.string() })),
  supportedFeatures: z.array(z.string()),
  useCases: z.array(z.string()),
  tableData: tableDataSchema,
  answers: answerSchema,
  pricingStats: pricingStatSchema,
  proscons: prosConsSchema,
  expertQuotes: expertQuotesSchema,
  entitlement: z.enum(PLAN_ENTITLEMENT_KEYS).optional(),
  schema: z
    .enum([
      "Article",
      "FAQPage",
      "HowTo",
      "Product",
      "ItemList",
      "SoftwareApplication",
      "DefinedTerm",
    ])
    .default("SoftwareApplication"),
});

export const faqHubSchema = baseContentSchema.extend({
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).min(1),
  answers: answerSchema,
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  expertQuotes: expertQuotesSchema,
  schema: z
    .enum([
      "Article",
      "FAQPage",
      "HowTo",
      "Product",
      "ItemList",
      "SoftwareApplication",
      "DefinedTerm",
    ])
    .default("FAQPage"),
});

export const benchmarkSchema = baseContentSchema.extend({
  steps: z.array(z.object({ title: z.string(), content: z.string() })).optional(),
  timeEstimate: z.string().optional(),
  difficulty: z.string().optional(),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  answers: answerSchema,
  proscons: prosConsSchema,
  expertQuotes: expertQuotesSchema,
  tableData: tableDataSchema,
  pricingStats: pricingStatSchema,
});

export type PersonaEntry = z.infer<typeof personaSchema>;
export type WorkflowEntry = z.infer<typeof workflowSchema>;
export type GlossaryEntry = z.infer<typeof glossarySchema>;
export type IntegrationEntry = z.infer<typeof integrationSchema>;
export type FaqHubEntry = z.infer<typeof faqHubSchema>;
export type BenchmarkEntry = z.infer<typeof benchmarkSchema>;

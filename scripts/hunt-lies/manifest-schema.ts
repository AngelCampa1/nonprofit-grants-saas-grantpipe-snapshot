import { z } from "zod";

export const claimKindSchema = z.enum([
  "frontmatter-stat",
  "key-statistic",
  "market-fact",
  "hub-faq",
  "inline-regulatory",
  "inline-numeric",
  "email-template",
  "config-claim",
  "page-copy",
]);

export const claimSchema = z.object({
  id: z.string(),
  filepath: z.string(),
  collection: z.string(),
  kind: claimKindSchema,
  stat: z.string(),
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
  lineNumber: z.number().int().nonnegative(),
  context: z.string(),
});

export type ClaimKind = z.infer<typeof claimKindSchema>;
export type Claim = z.infer<typeof claimSchema>;

export const claimManifestSchema = z.object({
  generatedAt: z.string(),
  claimCount: z.number(),
  claims: z.array(claimSchema),
});

export type ClaimManifest = z.infer<typeof claimManifestSchema>;

export const patchActionSchema = z.enum(["verified", "replace", "rephrase", "delete"]);

export const patchSchema = z.object({
  claimId: z.string(),
  filepath: z.string(),
  action: patchActionSchema,
  before: z.object({
    stat: z.string(),
    source: z.string().optional(),
    sourceUrl: z.string().optional(),
  }),
  after: z
    .object({
      stat: z.string(),
      source: z.string(),
      sourceUrl: z.string().url(),
    })
    .optional(),
  evidence: z.object({
    url: z.string().url(),
    quote: z.string().max(400),
    fetchedAt: z.string(),
  }),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().optional(),
});

export type Patch = z.infer<typeof patchSchema>;

export const patchFileSchema = z.object({
  shardId: z.string(),
  generatedAt: z.string(),
  patches: z.array(patchSchema),
});

export type PatchFile = z.infer<typeof patchFileSchema>;

export const founderRuleHitSchema = z.object({
  filepath: z.string(),
  lineNumber: z.number(),
  patternName: z.string(),
  matchText: z.string(),
  context: z.string(),
  reason: z.string(),
});

export type FounderRuleHit = z.infer<typeof founderRuleHitSchema>;

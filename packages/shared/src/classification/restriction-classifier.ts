/**
 * Restriction Auto-Classifier (pure, deterministic, no LLM)
 *
 * Priority order (highest to lowest):
 *  1. Linked fund type
 *  2. Linked grant (implies purpose restriction)
 *  3. Existing restriction term on the fund/grant (inherit its fields)
 *  4. Donor designation keyword match
 *  5. Default fallback → unrestricted
 */
import { z } from "zod";
import type { FundType, RestrictionLifecycleType } from "../constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClassificationSignal = {
  source: string;
  detail: string;
};

export type ClassificationResult = {
  netAssetClass: "unrestricted" | "temporarily_restricted" | "permanently_restricted";
  donationRestriction: "unrestricted" | "restricted";
  restrictionType: RestrictionLifecycleType;
  suggestedReleaseRule?: string;
  suggestedStartDate?: string;
  suggestedEndDate?: string;
  confidence: "high" | "medium" | "low";
  signals: ClassificationSignal[];
};

export type ClassifyRestrictionInput = {
  fundType?: FundType | null;
  hasLinkedGrant?: boolean | null;
  existingTerm?: {
    restrictionType: RestrictionLifecycleType;
    releaseRule?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  } | null;
  designation?: string | null;
  date?: string | null;
};

export const classifyRestrictionInputSchema: z.ZodType<ClassifyRestrictionInput> = z.object({
  fundType: z
    .enum(["temporarily_restricted", "permanently_restricted", "unrestricted"])
    .nullable()
    .optional(),
  hasLinkedGrant: z.boolean().nullable().optional(),
  existingTerm: z
    .object({
      restrictionType: z.enum([
        "purpose",
        "time",
        "purpose_and_time",
        "board_designated",
        "unrestricted",
      ]),
      releaseRule: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  designation: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Designation keyword rules (deterministic phrase table)
// ---------------------------------------------------------------------------

export type DesignationKeywordFamily = "permanent" | "temporary";

export type DesignationKeywordRule = {
  patterns: RegExp[];
  family: DesignationKeywordFamily;
  detail: string;
};

export const DESIGNATION_KEYWORD_RULES: DesignationKeywordRule[] = [
  {
    patterns: [/\bendowment\b/i, /\bin perpetuity\b/i, /\bpermanent(ly)?\b/i],
    family: "permanent",
    detail:
      'Designation contains permanent-restriction keyword (e.g. "endowment", "in perpetuity")',
  },
  {
    patterns: [
      /\brestricted to\b/i,
      // Require an explicit "for the benefit of" phrase rather than a bare
      // "for <anything>", which over-matched incidental prose ("thank you for").
      /\bfor\s+(?:the\s+)?benefit\s+of\b/i,
      /\bfor\s+(?:the\s+)?(?:[a-z]+\s+)?(?:program|project|fund|scholarship|initiative|campaign)\b/i,
      /\buntil\b/i,
      /\bprogram\b/i,
      /\bpurpose\b/i,
      /\bscholarship\b/i,
      /\bproject\b/i,
    ],
    family: "temporary",
    detail:
      'Designation contains temporary-restriction keyword (e.g. "restricted to", "for program", "until")',
  },
];

function matchDesignation(designation: string): DesignationKeywordRule | null {
  for (const rule of DESIGNATION_KEYWORD_RULES) {
    if (rule.patterns.some((p) => p.test(designation))) {
      return rule;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export function classifyRestriction(input: ClassifyRestrictionInput): ClassificationResult {
  const signals: ClassificationSignal[] = [];

  // --- Signal 1: Fund type (highest priority) ---
  if (input.fundType != null && input.fundType !== "unrestricted") {
    signals.push({
      source: "fund_type",
      detail: `Linked fund is ${input.fundType.replace(/_/g, " ")}`,
    });

    const netAssetClass =
      input.fundType === "permanently_restricted"
        ? "permanently_restricted"
        : "temporarily_restricted";

    // --- Signal 3: Existing term (inherit fields when fund is restricted) ---
    const termResult = input.existingTerm
      ? applyExistingTerm(input.existingTerm, signals)
      : undefined;

    // A restricted fund implies a restricted gift. Never inherit a term type
    // that contradicts that (board_designated / unrestricted are unrestricted
    // net-asset classes under FASB ASC 958) — fall back to "purpose".
    const restrictionType: RestrictionLifecycleType = isRestrictedTermType(
      termResult?.restrictionType,
    )
      ? termResult!.restrictionType
      : "purpose";

    return {
      netAssetClass,
      donationRestriction: "restricted",
      restrictionType,
      suggestedReleaseRule: termResult?.suggestedReleaseRule,
      suggestedStartDate: termResult?.suggestedStartDate,
      suggestedEndDate: termResult?.suggestedEndDate,
      confidence: "high",
      signals,
    };
  }

  if (input.fundType === "unrestricted") {
    signals.push({
      source: "fund_type",
      detail: "Linked fund is unrestricted",
    });
    // Still check lower-priority signals — a grant or designation can override.
  }

  // --- Signal 2: Linked grant ---
  if (input.hasLinkedGrant) {
    signals.push({
      source: "grant",
      detail: "Gift is linked to a grant — implies purpose restriction",
    });

    const termResult = input.existingTerm
      ? applyExistingTerm(input.existingTerm, signals)
      : undefined;

    return {
      netAssetClass: "temporarily_restricted",
      donationRestriction: "restricted",
      restrictionType: isRestrictedTermType(termResult?.restrictionType)
        ? termResult!.restrictionType
        : "purpose",
      suggestedReleaseRule: termResult?.suggestedReleaseRule,
      suggestedStartDate: termResult?.suggestedStartDate,
      suggestedEndDate: termResult?.suggestedEndDate,
      confidence: "high",
      signals,
    };
  }

  // --- Signal 3: Existing restriction term (no fund/grant override found yet) ---
  if (input.existingTerm) {
    const termResult = applyExistingTerm(input.existingTerm, signals);
    // board_designated and unrestricted terms are unrestricted net assets
    // under FASB ASC 958; purpose/time/purpose_and_time are restricted.
    const restricted = isRestrictedTermType(termResult.restrictionType);

    return {
      netAssetClass: restricted ? "temporarily_restricted" : "unrestricted",
      donationRestriction: restricted ? "restricted" : "unrestricted",
      restrictionType: termResult.restrictionType,
      suggestedReleaseRule: termResult.suggestedReleaseRule,
      suggestedStartDate: termResult.suggestedStartDate,
      suggestedEndDate: termResult.suggestedEndDate,
      confidence: "medium",
      signals,
    };
  }

  // --- Signal 4: Designation keyword match ---
  if (input.designation) {
    const match = matchDesignation(input.designation);
    if (match) {
      signals.push({
        source: "designation",
        detail: match.detail,
      });

      if (match.family === "permanent") {
        return {
          netAssetClass: "permanently_restricted",
          donationRestriction: "restricted",
          restrictionType: "purpose",
          confidence: "medium",
          signals,
        };
      }

      return {
        netAssetClass: "temporarily_restricted",
        donationRestriction: "restricted",
        restrictionType: "purpose",
        confidence: "low",
        signals,
      };
    }
  }

  // --- Signal 5: Default fallback ---
  signals.push({
    source: "internal",
    detail: "No restriction signals found — defaulting to unrestricted",
  });

  return {
    netAssetClass: "unrestricted",
    donationRestriction: "unrestricted",
    restrictionType: "unrestricted",
    confidence: "low",
    signals,
  };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Returns true when a restriction-term type maps to a restricted net-asset
 * class under FASB ASC 958. board_designated and unrestricted are unrestricted.
 */
function isRestrictedTermType(type: RestrictionLifecycleType | undefined): boolean {
  return type === "purpose" || type === "time" || type === "purpose_and_time";
}

type TermClassification = {
  restrictionType: RestrictionLifecycleType;
  suggestedReleaseRule?: string;
  suggestedStartDate?: string;
  suggestedEndDate?: string;
};

function applyExistingTerm(
  term: NonNullable<ClassifyRestrictionInput["existingTerm"]>,
  signals: ClassificationSignal[],
): TermClassification {
  signals.push({
    source: "existing_term",
    detail: `Existing restriction term has type "${term.restrictionType}"${term.releaseRule ? `, release rule "${term.releaseRule}"` : ""}`,
  });

  return {
    restrictionType: term.restrictionType,
    suggestedReleaseRule: term.releaseRule ?? undefined,
    suggestedStartDate: term.startDate ?? undefined,
    suggestedEndDate: term.endDate ?? undefined,
  };
}

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { marketingContentDirectory } from "../lib/marketing-content-root";

const WAVE = [
  ["guides", "grant-prospect-research-scorecard-nonprofits"],
  ["guides", "foundation-fit-checklist-for-nonprofit-grants"],
  ["guides", "grant-renewal-risk-review-guide"],
  ["guides", "nonprofit-grant-calendar-quarterly-planning-guide"],
  ["guides", "grant-report-narrative-evidence-binder-guide"],
  ["guides", "program-outcome-metrics-for-grant-reporting"],
  ["guides", "logic-model-to-grant-reporting-guide"],
  ["guides", "grant-proposal-budget-review-checklist"],
  ["guides", "matching-gift-vs-matching-grant-guide"],
  ["guides", "in-kind-match-documentation-nonprofits"],
  ["workflows", "screen-foundation-grant-fit-before-writing"],
  ["workflows", "prepare-grant-renewal-risk-brief"],
  ["workflows", "build-quarterly-grant-report-calendar"],
  ["workflows", "assemble-program-outcome-evidence"],
  ["workflows", "review-grant-proposal-budget-before-submit"],
  ["guides", "nonprofit-donor-restriction-intake-form-guide"],
  ["guides", "restricted-gift-agreement-review-checklist"],
  ["guides", "capital-campaign-restricted-funds-accounting-guide"],
  ["guides", "endowment-vs-board-designated-funds-guide"],
  ["guides", "temporarily-restricted-donation-thank-you-receipt-guide"],
  ["guides", "pledge-allowance-restricted-funds-guide"],
  ["guides", "donor-advised-fund-grant-restriction-guide"],
  ["guides", "restricted-fund-release-board-report-template-guide"],
  ["guides", "nonprofit-fund-accounting-month-end-tieout-guide"],
  ["guides", "grant-funded-program-shared-cost-allocation-guide"],
  ["workflows", "intake-donor-restriction-before-deposit"],
  ["workflows", "review-restricted-gift-agreement"],
  ["workflows", "tie-out-restricted-funds-at-month-end"],
  ["workflows", "prepare-restriction-release-board-schedule"],
  ["workflows", "document-shared-cost-allocation-for-grants"],
  ["guides", "nonprofit-audit-request-list-response-guide"],
  ["guides", "single-audit-pbc-request-checklist"],
  ["guides", "management-letter-response-tracker-guide"],
  ["guides", "nonprofit-audit-sample-selection-prep-guide"],
  ["guides", "grant-compliance-file-index-template-guide"],
  ["guides", "auditor-confirmation-request-nonprofit-guide"],
  ["guides", "bank-reconciliation-audit-evidence-guide"],
  ["guides", "nonprofit-journal-entry-approval-evidence-guide"],
  ["guides", "year-end-restricted-fund-rollforward-guide"],
  ["guides", "audit-ready-grant-expense-sampling-guide"],
] as const;

function readContent(collection: string, slug: string): string {
  return readFileSync(join(marketingContentDirectory, collection, `${slug}.md`), "utf-8");
}

function splitFrontmatterAndBody(source: string): {
  frontmatter: string;
  body: string;
} {
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  expect(match, "content entry must have YAML frontmatter").not.toBeNull();
  return { frontmatter: match![1]!, body: match![2]! };
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function countBlockItems(frontmatter: string, field: string): number {
  const match = frontmatter.match(
    new RegExp(`^${field}:\\s*\\n((?:[ \\t]+.*\\n?)+?)(?=^\\S|$)`, "m"),
  );
  if (!match) return 0;
  return match[1]!.split(/\r?\n/).filter((line) => /^\s+-\s/.test(line)).length;
}

describe("ICP SEO expansion wave 3 2026-06-29", () => {
  test("wave contains 40 net-new content contracts", () => {
    expect(WAVE).toHaveLength(40);
  });

  for (const [collection, slug] of WAVE) {
    test(`${collection}/${slug} is source-backed and ICP-scoped`, () => {
      const { frontmatter, body } = splitFrontmatterAndBody(readContent(collection, slug));

      expect(frontmatter).toContain('publishedAt: "2026-06-29"');
      expect(frontmatter).toContain('updatedAt: "2026-06-29"');
      expect(frontmatter).toContain('buyerStage: "tofu"');
      expect(frontmatter).toContain('primaryCta: "lead-magnet"');
      expect(frontmatter).toMatch(
        /topicCluster: "(grant-management|grant-compliance|restricted-fund-accounting)"/,
      );
      expect(countBlockItems(frontmatter, "sourceUrls")).toBeGreaterThanOrEqual(3);
      expect(countBlockItems(frontmatter, "relatedPages")).toBeGreaterThanOrEqual(5);
      expect(countBlockItems(frontmatter, "faqs")).toBeGreaterThanOrEqual(3);
      expect(countBlockItems(frontmatter, "answers")).toBeGreaterThanOrEqual(2);
      expect(wordCount(body)).toBeGreaterThanOrEqual(700);
      expect(body).toMatch(/GrantPipe/);
      expect(body).not.toMatch(/TODO|TBD|placeholder/i);
      expect(body).not.toMatch(/\bTOFU\b|\bMOFU\b|\bBOFU\b|lead magnet|soft plug/i);
      expect(body).not.toMatch(/[\u2014\u2013]/);
    });
  }
});

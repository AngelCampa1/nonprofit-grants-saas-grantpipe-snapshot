import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { marketingContentDirectory } from "../lib/marketing-content-root";

const WAVE = [
  ["guides", "federal-grant-drawdown-controls-checklist"],
  ["guides", "sf-425-line-item-review-guide"],
  ["guides", "sefa-footnote-disclosure-checklist"],
  ["guides", "single-audit-findings-corrective-action-plan"],
  ["guides", "federal-award-closeout-document-retention-guide"],
  ["guides", "subrecipient-risk-assessment-scoring-guide"],
  ["guides", "2-cfr-200-procurement-file-checklist"],
  ["guides", "micro-purchase-documentation-nonprofits"],
  ["guides", "federal-grant-equipment-tagging-inventory-guide"],
  ["guides", "prior-approval-federal-grants-guide"],
  ["workflows", "review-federal-drawdown-before-request"],
  ["workflows", "prepare-sf-425-quarterly-report"],
  ["workflows", "build-sefa-support-binder"],
  ["workflows", "document-subrecipient-risk-review"],
  ["workflows", "reconcile-restricted-grant-cash"],
  ["workflows", "approve-grant-budget-revision"],
  ["workflows", "close-federal-award-file"],
  ["workflows", "create-grant-document-retention-schedule"],
  ["workflows", "test-procurement-file-before-audit"],
  ["workflows", "prepare-corrective-action-plan-response"],
  ["guides", "restricted-net-assets-board-report-guide"],
  ["guides", "donor-restriction-release-policy-guide"],
  ["guides", "grant-spenddown-dashboard-guide"],
  ["guides", "nonprofit-temporarily-restricted-funds-close-guide"],
  ["guides", "nonprofit-net-asset-rollforward-guide"],
  ["guides", "donor-restricted-grant-reconciliation-guide"],
  ["guides", "functional-expense-tieout-checklist"],
  ["guides", "nonprofit-chart-of-accounts-grants-funds-guide"],
  ["guides", "board-designated-funds-policy-guide"],
  ["guides", "release-from-restriction-journal-entry-guide"],
  ["guides", "nonprofit-board-finance-dashboard-template-guide"],
  ["guides", "nonprofit-audit-committee-calendar-guide"],
  ["guides", "finance-committee-grant-oversight-checklist"],
  ["guides", "nonprofit-board-treasurer-transition-checklist"],
  ["guides", "executive-director-grant-risk-briefing-guide"],
  ["guides", "board-packet-restricted-funds-section-guide"],
  ["guides", "nonprofit-cash-reserve-policy-grant-funded"],
  ["guides", "nonprofit-financial-policy-review-calendar"],
  ["guides", "nonprofit-board-compensation-review-file-guide"],
  ["guides", "nonprofit-conflict-of-interest-annual-disclosure-guide"],
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

describe("ICP SEO expansion wave 1 2026-06-29", () => {
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
      expect(frontmatter).toMatch(/topicCluster: "(grant-compliance|restricted-fund-accounting)"/);
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

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { marketingContentDirectory } from "../lib/marketing-content-root";

const WAVE = [
  ["guides", "nonprofit-grant-readiness-self-assessment"],
  ["guides", "grant-application-go-no-go-checklist"],
  ["guides", "funder-reporting-requirements-matrix-guide"],
  ["guides", "grant-award-letter-intake-checklist"],
  ["guides", "grant-contract-review-finance-checklist"],
  ["guides", "grant-reimbursement-backup-documentation-guide"],
  ["guides", "cost-sharing-commitment-tracker-nonprofits"],
  ["guides", "nonprofit-program-budget-template-guide"],
  ["guides", "grant-cash-advance-vs-reimbursement-guide"],
  ["guides", "grant-amendment-request-template-guide"],
  ["workflows", "run-grant-readiness-self-assessment"],
  ["workflows", "decide-grant-go-no-go"],
  ["workflows", "intake-new-grant-award-letter"],
  ["workflows", "prepare-grant-reimbursement-backup"],
  ["workflows", "submit-grant-amendment-request"],
  ["guides", "nonprofit-data-dictionary-for-grant-reporting"],
  ["guides", "grant-reporting-kpi-dashboard-guide"],
  ["guides", "nonprofit-client-counting-rules-guide"],
  ["guides", "unduplicated-client-count-grant-reporting-guide"],
  ["guides", "demographic-data-collection-grant-reporting-guide"],
  ["guides", "survey-consent-language-grant-reporting-guide"],
  ["guides", "program-attendance-records-grant-evidence-guide"],
  ["guides", "case-note-quality-checklist-for-grants"],
  ["guides", "outcome-verification-file-guide-nonprofits"],
  ["guides", "data-quality-review-before-grant-report-guide"],
  ["workflows", "define-grant-reporting-kpis"],
  ["workflows", "clean-client-counts-before-reporting"],
  ["workflows", "review-program-attendance-evidence"],
  ["workflows", "verify-outcome-data-before-submission"],
  ["workflows", "lock-quarterly-grant-report-data"],
  ["guides", "nonprofit-board-grant-risk-register-guide"],
  ["guides", "executive-director-grant-pipeline-review-guide"],
  ["guides", "development-finance-weekly-grant-handoff-guide"],
  ["guides", "grant-team-roles-and-responsibilities-matrix"],
  ["guides", "nonprofit-grants-meeting-agenda-template-guide"],
  ["guides", "grant-deadline-escalation-policy-guide"],
  ["guides", "grant-file-owner-transition-checklist"],
  ["guides", "nonprofit-grant-policy-manual-outline"],
  ["guides", "grant-compliance-training-plan-small-team"],
  ["guides", "grant-closeout-retrospective-template-guide"],
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

describe("ICP SEO expansion wave 4 2026-06-29", () => {
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

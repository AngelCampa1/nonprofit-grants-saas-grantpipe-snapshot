import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { marketingContentDirectory } from "../lib/marketing-content-root";

const WAVE = [
  ["guides", "nonprofit-crm-data-cleanup-before-grant-season"],
  ["guides", "donor-restriction-coding-in-crm-guide"],
  ["guides", "grant-deadline-calendar-software-requirements"],
  ["guides", "nonprofit-document-permission-model-guide"],
  ["guides", "spreadsheet-to-grant-management-migration-plan"],
  ["guides", "nonprofit-software-implementation-risk-register"],
  ["guides", "grant-management-user-acceptance-test-plan"],
  ["guides", "nonprofit-system-of-record-decision-guide"],
  ["guides", "audit-trail-requirements-for-grant-software"],
  ["guides", "grant-reporting-workflow-automation-checklist"],
  ["workflows", "clean-crm-restriction-codes-before-import"],
  ["workflows", "map-spreadsheet-grants-to-system-fields"],
  ["workflows", "test-grant-management-user-permissions"],
  ["workflows", "run-grant-software-user-acceptance-test"],
  ["workflows", "archive-old-grant-spreadsheets-after-migration"],
  ["guides", "nonprofit-grant-report-cover-letter-guide"],
  ["guides", "funder-site-visit-preparation-checklist"],
  ["guides", "grant-compliance-calendar-board-summary-guide"],
  ["guides", "restricted-fund-dashboard-for-executive-directors"],
  ["guides", "grant-expense-approval-workflow-guide"],
  ["guides", "nonprofit-cost-allocation-policy-sample-outline"],
  ["guides", "subaward-invoice-review-checklist"],
  ["guides", "grant-closeout-lessons-learned-template-guide"],
  ["guides", "grant-funded-staff-time-certification-guide"],
  ["workflows", "prepare-funder-site-visit-file"],
  ["workflows", "approve-grant-expense-before-payment"],
  ["workflows", "review-subaward-invoice-before-payment"],
  ["workflows", "certify-grant-funded-staff-time"],
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

describe("ICP SEO expansion wave 5 2026-06-29", () => {
  test("wave contains 28 net-new content contracts", () => {
    expect(WAVE).toHaveLength(28);
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

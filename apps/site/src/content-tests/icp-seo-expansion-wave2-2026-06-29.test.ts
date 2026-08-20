import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { marketingContentDirectory } from "../lib/marketing-content-root";

const WAVE = [
  ["guides", "hrsa-health-center-grant-drawdown-guide"],
  ["guides", "hud-coc-match-documentation-guide"],
  ["guides", "doj-vawa-grant-financial-file-guide"],
  ["guides", "americorps-member-timekeeping-guide"],
  ["guides", "usda-community-facilities-grant-closeout-guide"],
  ["guides", "cdbg-reimbursement-request-checklist"],
  ["guides", "head-start-non-federal-share-guide"],
  ["guides", "liheap-subrecipient-monitoring-guide"],
  ["guides", "fema-nonprofit-security-grant-file-guide"],
  ["guides", "epa-environmental-education-grant-reporting-guide"],
  ["workflows", "prepare-hrsa-drawdown-support"],
  ["workflows", "review-hud-coc-match-before-reporting"],
  ["workflows", "assemble-doj-vawa-financial-report-file"],
  ["workflows", "reconcile-americorps-member-timesheets"],
  ["workflows", "close-usda-community-facilities-grant"],
  ["workflows", "submit-cdbg-reimbursement-package"],
  ["workflows", "test-head-start-non-federal-share-file"],
  ["workflows", "monitor-liheap-subrecipient-file"],
  ["workflows", "prepare-fema-nsgp-equipment-records"],
  ["workflows", "build-epa-grant-reporting-calendar"],
  ["guides", "nonprofit-monthly-close-grant-checklist"],
  ["guides", "restricted-fund-reconciliation-template-guide"],
  ["guides", "grant-budget-to-actual-review-guide"],
  ["guides", "nonprofit-accounts-receivable-grant-reimbursement-guide"],
  ["guides", "deferred-revenue-vs-conditional-grants-guide"],
  ["guides", "grant-receivable-aging-report-guide"],
  ["guides", "nonprofit-cash-flow-warning-signs-grants"],
  ["guides", "restricted-fund-error-correction-guide"],
  ["guides", "grant-funded-payroll-allocation-guide"],
  ["guides", "nonprofit-indirect-cost-recovery-board-guide"],
  ["guides", "nonprofit-crm-grant-tracking-requirements"],
  ["guides", "donor-crm-vs-grant-management-system"],
  ["guides", "grant-management-spreadsheet-risk-checklist"],
  ["guides", "nonprofit-software-selection-committee-guide"],
  ["guides", "grant-management-demo-script-for-nonprofits"],
  ["guides", "nonprofit-data-migration-cleanup-checklist"],
  ["guides", "grant-calendar-system-requirements-guide"],
  ["guides", "auditor-read-only-access-software-guide"],
  ["guides", "grant-document-management-system-requirements"],
  ["guides", "nonprofit-software-board-approval-business-case"],
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

describe("ICP SEO expansion wave 2 2026-06-29", () => {
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
        /topicCluster: "(grant-compliance|restricted-fund-accounting|grant-management)"/,
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

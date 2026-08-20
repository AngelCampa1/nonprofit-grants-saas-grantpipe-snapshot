import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { marketingContentDirectory } from "../lib/marketing-content-root";

const BATCH = [
  {
    collection: "guides",
    slug: "nonprofit-board-minutes-grant-approvals-checklist",
    persona: "board-treasurer",
    topicCluster: "grant-compliance",
  },
  {
    collection: "guides",
    slug: "cash-flow-forecast-reimbursement-grants",
    persona: "executive-director",
    topicCluster: "restricted-fund-accounting",
  },
  {
    collection: "guides",
    slug: "grant-document-naming-convention",
    persona: "grants-manager",
    topicCluster: "grant-compliance",
  },
  {
    collection: "guides",
    slug: "nonprofit-internal-controls-small-finance-team",
    persona: "finance-operations-staff",
    topicCluster: "restricted-fund-accounting",
  },
] as const;

function readContent(collection: string, slug: string): string {
  return readFileSync(
    join(marketingContentDirectory, collection, `${slug}.md`),
    "utf-8",
  );
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

describe("ICP SEO expansion batch 2 2026-06-29", () => {
  for (const entry of BATCH) {
    test(`${entry.collection}/${entry.slug} is source-backed and ICP-scoped`, () => {
      const { frontmatter, body } = splitFrontmatterAndBody(
        readContent(entry.collection, entry.slug),
      );

      expect(frontmatter).toContain(`topicCluster: "${entry.topicCluster}"`);
      expect(frontmatter).toContain(`- "${entry.persona}"`);
      expect(frontmatter).toContain('buyerStage: "tofu"');
      expect(frontmatter).toContain('primaryCta: "lead-magnet"');
      expect(frontmatter).toContain('schema: "Article"');
      expect(countBlockItems(frontmatter, "sourceUrls")).toBeGreaterThanOrEqual(2);
      expect(countBlockItems(frontmatter, "relatedPages")).toBeGreaterThanOrEqual(4);
      expect(countBlockItems(frontmatter, "faqs")).toBeGreaterThanOrEqual(3);
      expect(countBlockItems(frontmatter, "answers")).toBeGreaterThanOrEqual(2);
      expect(wordCount(body)).toBeGreaterThanOrEqual(650);
      expect(body).toMatch(/GrantPipe/);
      expect(body).not.toMatch(/TODO|TBD|placeholder/i);
    });
  }
});

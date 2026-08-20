import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { marketingContentDirectory } from "./lib/marketing-content-root";

function readContent(relativePath: string) {
  return readFileSync(join(marketingContentDirectory, relativePath), "utf8");
}

function frontmatterDate(file: string, field: string) {
  const match = file.match(new RegExp(`^${field}:\\s*"?(\\d{4}-\\d{2}-\\d{2})"?`, "m"));
  return match?.[1] ?? "";
}

describe("priority commercial content", () => {
  const priorityFiles = [
    "comparisons/bloomerang-vs-salesforce-nonprofit.md",
    "comparisons/blackbaud-vs-bloomerang.md",
    "comparisons/grantpipe-vs-instrumentl.md",
    "guides/salesforce-nonprofit-cost.md",
    "guides/nonprofit-grant-compliance-guide.md",
    "guides/grant-management-software-vs-grant-compliance-software.md",
    "pricing-breakdowns/instrumentl-pricing.md",
    "listicles/best-grant-compliance-software.md",
  ].map(readContent);

  it("keeps freshness and sourcing metadata on priority pages", () => {
    for (const file of priorityFiles) {
      expect(frontmatterDate(file, "lastReviewedAt") >= "2026-04-24").toBe(true);
      expect(frontmatterDate(file, "verifiedAt")).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(file).toContain("sourceUrls:");
    }
  });

  it("removes stale pricing promises and roadmap filler from commercial copy", () => {
    for (const file of priorityFiles) {
      expect(file).not.toContain("QuickBooks sync (coming soon)");
      expect(file).not.toContain("starting at $20");
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  ALLOWED_CITATION_HOSTS,
  isAllowedCitationHost,
  marketingKnowledge,
} from "@grantpipe/shared/public-kb";
import { KEY_STATISTICS, renderKeyStatsMarkdown, ABOUT_GRANTPIPE_MARKDOWN } from "./key-statistics";

describe("KEY_STATISTICS", () => {
  it("contains at least one item", () => {
    expect(KEY_STATISTICS.length).toBeGreaterThan(0);
  });

  it("every item has a non-empty stat", () => {
    for (const item of KEY_STATISTICS) {
      expect(item.stat.trim().length).toBeGreaterThan(0);
    }
  });

  it("every item has a non-empty source", () => {
    for (const item of KEY_STATISTICS) {
      expect(item.source.trim().length).toBeGreaterThan(0);
    }
  });

  it("every item has an https sourceUrl", () => {
    for (const item of KEY_STATISTICS) {
      expect(item.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("every sourceUrl host is on the allowlist", () => {
    for (const item of KEY_STATISTICS) {
      expect(isAllowedCitationHost(item.sourceUrl)).toBe(true);
    }
    // sanity: allowlist itself must be non-empty
    expect(ALLOWED_CITATION_HOSTS.length).toBeGreaterThan(0);
  });

  it("contains no folklore citations (multiple sources, research synthesis)", () => {
    for (const item of KEY_STATISTICS) {
      expect(item.source.toLowerCase()).not.toContain("multiple sources");
      expect(item.source.toLowerCase()).not.toContain("research synthesis");
    }
  });
});

describe("renderKeyStatsMarkdown", () => {
  it("starts with the correct heading", () => {
    const output = renderKeyStatsMarkdown();
    expect(output.startsWith("## Key Statistics (with sources)\n")).toBe(true);
  });

  it("contains a bullet for each stat", () => {
    const output = renderKeyStatsMarkdown();
    for (const item of KEY_STATISTICS) {
      expect(output).toContain(item.stat);
    }
  });

  it("contains source attribution for each stat", () => {
    const output = renderKeyStatsMarkdown();
    for (const item of KEY_STATISTICS) {
      expect(output).toContain(item.source);
    }
  });

  it("formats one markdown list item per stat", () => {
    const output = renderKeyStatsMarkdown();
    const lines = output.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(KEY_STATISTICS.length);
  });
});

describe("ABOUT_GRANTPIPE_MARKDOWN", () => {
  it("starts with the About GrantPipe heading", () => {
    expect(ABOUT_GRANTPIPE_MARKDOWN.startsWith("## About GrantPipe")).toBe(true);
  });

  it("includes grant compliance reference", () => {
    expect(ABOUT_GRANTPIPE_MARKDOWN).toContain("grant compliance");
  });

  it("includes the budget range", () => {
    expect(ABOUT_GRANTPIPE_MARKDOWN).toContain(marketingKnowledge.icp.primaryAudience);
  });

  it("includes pricing reference", () => {
    expect(ABOUT_GRANTPIPE_MARKDOWN).toContain("starting at $49/mo");
    expect(ABOUT_GRANTPIPE_MARKDOWN).toContain("Growth at $99/mo");
    expect(ABOUT_GRANTPIPE_MARKDOWN).toContain("direct founder contact path");
    expect(ABOUT_GRANTPIPE_MARKDOWN).not.toContain("Enterprise anchored");
  });
});

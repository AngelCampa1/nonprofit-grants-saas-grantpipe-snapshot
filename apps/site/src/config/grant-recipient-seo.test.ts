import { describe, expect, it } from "vitest";

import {
  getGrantCategoryPage,
  getGrantCategoryPagesForHub,
  grantCategoryPages,
} from "./grant-recipient-seo";

describe("grant recipient SEO registry", () => {
  it("publishes all category landing pages", () => {
    expect(grantCategoryPages.map((page) => page.href)).toEqual([
      "/grant-management-software",
      "/grant-compliance-software",
      "/grant-tracking-software",
      "/restricted-fund-tracking-software",
      "/grant-reporting-software",
      "/auditor-funder-portal-software",
      "/subrecipient-monitoring-software",
    ]);
  });

  it("keeps paths and target keywords unique", () => {
    const hrefs = new Set(grantCategoryPages.map((page) => page.href));
    const keywords = new Set(grantCategoryPages.map((page) => page.targetKeyword));

    expect(hrefs.size).toBe(grantCategoryPages.length);
    expect(keywords.size).toBe(grantCategoryPages.length);
  });

  it("lets callers fetch a page by slug", () => {
    const page = getGrantCategoryPage("grant-management-software");

    expect(page.href).toBe("/grant-management-software");
    expect(page.topicCluster).toBe("grant-management");
  });

  it("throws when asked for an unknown slug", () => {
    expect(() =>
      getGrantCategoryPage("nonexistent-slug" as Parameters<typeof getGrantCategoryPage>[0]),
    ).toThrow("Unknown grant category page: nonexistent-slug");
  });

  it("positions GrantPipe as multi-source opportunity tracking plus post-award workflow", () => {
    const page = getGrantCategoryPage("grant-management-software");
    const flattened = [
      page.description,
      page.seoDescription,
      ...page.sections.flatMap((section) => section.body),
    ]
      .join(" ")
      .toLowerCase();

    expect(flattened).toContain("grants.gov");
    expect(flattened).toContain("manual/imported non-federal opportunities");
    expect(flattened).not.toContain("not positioned as a grant discovery database first");
  });

  it("groups pages by topic hub", () => {
    expect(getGrantCategoryPagesForHub("grant-management").map((page) => page.slug)).toEqual([
      "grant-management-software",
      "grant-tracking-software",
    ]);
    expect(getGrantCategoryPagesForHub("grant-compliance").map((page) => page.slug)).toEqual([
      "grant-compliance-software",
      "grant-reporting-software",
      "auditor-funder-portal-software",
      "subrecipient-monitoring-software",
    ]);
    expect(
      getGrantCategoryPagesForHub("restricted-fund-accounting").map((page) => page.slug),
    ).toEqual(["restricted-fund-tracking-software"]);
  });

  it("requires freshness, sourcing, and related routes on every page", () => {
    for (const page of grantCategoryPages) {
      expect(page.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(page.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(page.sourceUrls.length).toBeGreaterThan(0);
      expect(page.relatedPages.length).toBeGreaterThan(0);
      expect(page.answers.length).toBeGreaterThan(0);
      expect(page.faqs.length).toBeGreaterThan(0);
    }
  });

  it("includes subrecipient monitoring software category coverage", () => {
    const page = getGrantCategoryPage("subrecipient-monitoring-software");

    expect(page.href).toBe("/subrecipient-monitoring-software");
    expect(page.targetKeyword).toBe("subrecipient monitoring software");
    expect(page.sourceUrls).toEqual(
      expect.arrayContaining([
        "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/section-200.332",
        "https://www.ojp.gov/funding/financialguidedoj/iii-postaward-requirements",
      ]),
    );
  });
});

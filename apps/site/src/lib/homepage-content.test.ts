import { describe, expect, it } from "vitest";
import { siteConfig } from "../config/site";
import { buildGrantPipeHomepageContent } from "./homepage-content";

describe("buildGrantPipeHomepageContent", () => {
  it("builds a clarity-first homepage sequence around buyer questions", () => {
    const content = buildGrantPipeHomepageContent(siteConfig);

    expect(content.proofPoints).toHaveLength(4);
    expect(content.proofPoints.map((point) => point.label)).toEqual([
      "What breaks",
      "How GrantPipe fixes it",
      "Who it is for",
      "What teams can test",
    ]);
    expect(content.proofPoints[0]?.value).toBe("Answers split across tools");
    expect(content.proofPoints[1]?.detail).toContain("same record");
    expect(content.proofPoints[2]?.detail).toContain("finance");
    expect(content.proofPoints[3]?.detail).toContain("starting at $49/month");
    expect(content.intro).toContain("same answer");
    expect(content.intro).toContain("grant-funded nonprofits");
    expect(content.intro).toContain("board");
    expect(content.intro).toContain("audit");
  });

  it("adds editorial support sections that point buyers into the product hub", () => {
    const content = buildGrantPipeHomepageContent(siteConfig);

    expect(content.editorialSections).toHaveLength(3);
    expect(content.editorialSections.map((section) => section.title)).toEqual([
      "What GrantPipe solves",
      "How the workflow stays connected",
      "Who should evaluate it",
    ]);
    expect(
      content.editorialSections.every(
        (section) =>
          section.body.length > 40 && !section.body.toLowerCase().includes("book a demo"),
      ),
    ).toBe(true);

    expect(content.resourceLinks).toEqual([
      {
        title: "Explore the full product overview",
        href: "/product",
        description:
          "See how donor records, grant work, deadlines, funds, and reports stay connected.",
      },
      {
        title: "See pricing through the product lens",
        href: "/pricing",
        description:
          "Match each tier to the amount of reporting, deadline, and audit pressure your team carries.",
      },
      {
        title: "Read the evaluation guides",
        href: "/resources",
        description:
          "Compare grant, compliance, and restricted-fund workflows before moving live data.",
      },
    ]);
  });

  it("maps the homepage proof sequence to the four shipped product narratives", () => {
    const content = buildGrantPipeHomepageContent(siteConfig);

    expect(content.productProof).toHaveLength(4);
    expect(content.productProof.map((section) => section.title)).toEqual([
      "Keep deadlines, evidence, and activity history ready for review",
      "Keep restricted funds, grants, and donor records connected",
      "Show finance the fund trail behind each record",
      "Move onto GrantPipe with a bounded rollout",
    ]);
    expect(
      content.productProof.every(
        (section) =>
          section.body.length > 20 && !section.body.toLowerCase().includes("discovery call"),
      ),
    ).toBe(true);
    expect(content.productProof[0]?.body.toLowerCase()).toContain("audit question");
    expect(content.productProof[1]?.body.toLowerCase()).toContain("fundraising work");
    expect(content.productProof[1]?.body.toLowerCase()).toContain("grants.gov");
    expect(content.productProof[1]?.body.toLowerCase()).toContain("grantpipe pipeline");
    expect(content.productProof[2]?.body.toLowerCase()).toContain("record trail");
    expect(content.productProof[3]?.body.toLowerCase()).toContain("team you already have");
    expect(content.productProof[1]?.body.toLowerCase()).not.toContain("ai funder matching");
    expect(content.productProof[3]?.body).not.toContain("coming soon");
  });

  it("avoids the older inflated homepage wording and roadmap-only feature claims", () => {
    const content = buildGrantPipeHomepageContent(siteConfig);

    expect(content.intro.toLowerCase()).not.toContain("operating system");
    expect(content.proofPoints[3]?.detail.toLowerCase()).not.toContain("consultant");
    expect(content.productProof[1]?.body.toLowerCase()).not.toContain("external auditor portal");
    expect(content.productProof[3]?.body.toLowerCase()).not.toContain("multi-program allocation");
  });

  it("falls back to a price-derived proof point when pricing tiers are unavailable", () => {
    const content = buildGrantPipeHomepageContent({
      ...siteConfig,
      pricingTiers: undefined,
      product: {
        ...siteConfig.product,
        price: "$39/mo",
      },
    });

    expect(content.proofPoints[3]?.detail).toContain("$39/month");
  });

  it("uses the tier list price when stale promo fields are present", () => {
    const [firstTier, ...restTiers] = siteConfig.pricingTiers ?? [];
    if (!firstTier) throw new Error("pricingTiers should be defined");

    const content = buildGrantPipeHomepageContent({
      ...siteConfig,
      pricingTiers: [{ ...firstTier, monthlyPromoPrice: "$22/mo", price: "$79/mo" }, ...restTiers],
    });

    expect(content.proofPoints[3]?.detail).toContain("$79/month");
    expect(content.proofPoints[3]?.detail).not.toContain("$22/month");
  });
});

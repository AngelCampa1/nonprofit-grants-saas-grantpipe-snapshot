import { describe, expect, it } from "vitest";
import type { LeadMagnetSlug } from "../../../../packages/shared/src/constants/lead-magnets";
import {
  getLeadMagnetEntrySlug,
  resolveLeadMagnetOffer,
  resolveLeadMagnetSlug,
  resolveFeaturedLeadMagnetSlugs,
  resolveExitLeadMagnetOffer,
  resolveTopicAwareLeadMagnetSlug,
  type LeadMagnetRouteFamily,
} from "./lead-magnet-routing";
import { siteConfig } from "../config/site";

describe("lead magnet routing", () => {
  it("uses the explicit frontmatter override when present", () => {
    const slug = resolveLeadMagnetSlug(siteConfig, {
      family: "guide",
      explicitSlug: "donor-retention-playbook",
      relatedPages: ["/free/grant-compliance-checklist"],
    });

    expect(slug).toBe("donor-retention-playbook");
  });

  it("uses the first related free resource when frontmatter has no explicit slug", () => {
    const slug = resolveLeadMagnetSlug(siteConfig, {
      family: "state-page",
      relatedPages: [
        "/resources/guides/grant-compliance-101-for-nonprofits",
        "/free/georgia-compliance-checklist",
        "/free/grant-compliance-checklist",
      ],
    });

    expect(slug).toBe("georgia-compliance-checklist");
  });

  it.each([
    ["guide", "grant-compliance-checklist"],
    ["state-page", "grant-compliance-checklist"],
    ["solution", "grant-compliance-checklist"],
    ["comparison", "crm-migration-data-map-template"],
    ["pricing-breakdown", "grant-software-roi-calculator"],
    ["listicle", "grant-software-roi-calculator"],
  ] satisfies Array<[LeadMagnetRouteFamily, LeadMagnetSlug]>)(
    "falls back to the configured %s magnet",
    (family, expectedSlug) => {
      expect(resolveLeadMagnetSlug(siteConfig, { family })).toBe(expectedSlug);
    },
  );

  it("returns the configured featured hub magnets in order", () => {
    expect(resolveFeaturedLeadMagnetSlugs(siteConfig)).toEqual([
      "nonprofit-crm-cost-calculator",
      "grant-compliance-checklist",
      "audit-prep-week-by-week-checklist",
    ]);
  });

  it("normalizes Astro content ids to lead magnet slugs", () => {
    expect(getLeadMagnetEntrySlug({ id: "grant-compliance-checklist.md" } as never)).toBe(
      "grant-compliance-checklist",
    );
  });

  it("builds offer copy from the matching content entry", () => {
    const offer = resolveLeadMagnetOffer(
      siteConfig,
      [
        {
          id: "grant-compliance-checklist.md",
          data: {
            title: "Grant Compliance Checklist",
            description: "A practical compliance worksheet.",
          },
        } as never,
      ],
      {
        family: "guide",
        explicitSlug: "grant-compliance-checklist",
      },
    );

    expect(offer).toMatchObject({
      slug: "grant-compliance-checklist",
      title: "Grant Compliance Checklist",
      description: "A practical compliance worksheet. Delivered by email.",
      ctaText: "Email Me the Grant Compliance Checklist",
      alternatives: [
        expect.objectContaining({
          slug: "nonprofit-crm-cost-calculator",
          title: "Nonprofit CRM Cost Calculator",
        }),
        expect.objectContaining({
          slug: "audit-prep-week-by-week-checklist",
          title: "4-Week Audit Preparation Checklist",
        }),
      ],
    });
  });

  it("uses the page-specific magnet as the primary recommendation and excludes it from alternates", () => {
    const offer = resolveLeadMagnetOffer(
      siteConfig,
      [
        {
          id: "grant-compliance-checklist.md",
          data: {
            title: "Grant Compliance Checklist",
            description: "A practical compliance worksheet.",
          },
        } as never,
        {
          id: "audit-prep-week-by-week-checklist.md",
          data: {
            title: "4-Week Audit Preparation Checklist",
            description: "An audit prep plan.",
          },
        } as never,
        {
          id: "nonprofit-crm-cost-calculator.md",
          data: {
            title: "Nonprofit CRM Cost Calculator",
            description: "A CRM cost calculator.",
          },
        } as never,
      ],
      {
        family: "guide",
        explicitSlug: "audit-prep-week-by-week-checklist",
      },
    );

    expect(offer.slug).toBe("audit-prep-week-by-week-checklist");
    expect(offer.alternatives?.map((alternative) => alternative.slug)).toEqual([
      "nonprofit-crm-cost-calculator",
      "grant-compliance-checklist",
    ]);
  });

  it("uses polished fallback copy when Astro provides an empty collection", () => {
    const offer = resolveLeadMagnetOffer(siteConfig, [], {
      family: "comparison",
    });

    expect(offer).toMatchObject({
      slug: "crm-migration-data-map-template",
      title: "CRM Migration Data Map Template",
      ctaText: "Email Me the CRM Migration Data Map Template",
    });
  });
});

describe("resolveTopicAwareLeadMagnetSlug", () => {
  it("maps donor-retention tags to donor-retention-playbook", () => {
    expect(resolveTopicAwareLeadMagnetSlug(["guide", "donor retention", "stewardship"])).toBe(
      "donor-retention-playbook",
    );
  });

  it("maps CRM tags to nonprofit-crm-evaluation-scorecard", () => {
    expect(resolveTopicAwareLeadMagnetSlug(["nonprofit-crm", "software evaluation"])).toBe(
      "nonprofit-crm-evaluation-scorecard",
    );
  });

  it("maps restricted fund tags to restricted-fund-tracking-spreadsheet", () => {
    expect(
      resolveTopicAwareLeadMagnetSlug(["guide", "restricted fund accounting", "FASB ASU 2018-08"]),
    ).toBe("restricted-fund-tracking-spreadsheet");
  });

  it("maps audit-prep tags to audit-prep-week-by-week-checklist", () => {
    expect(resolveTopicAwareLeadMagnetSlug(["guide", "single audit", "federal-compliance"])).toBe(
      "audit-prep-week-by-week-checklist",
    );
  });

  it("maps grant-reporting tags to grant-reporting-calendar-template", () => {
    expect(resolveTopicAwareLeadMagnetSlug(["grant-reporting", "federal-grants"])).toBe(
      "grant-reporting-calendar-template",
    );
  });

  it("maps cost-allocation tags to cost-allocation-plan-worksheet", () => {
    expect(resolveTopicAwareLeadMagnetSlug(["guide", "indirect cost", "cost allocation"])).toBe(
      "cost-allocation-plan-worksheet",
    );
  });

  it("returns undefined for unrecognized tags", () => {
    expect(
      resolveTopicAwareLeadMagnetSlug(["guide", "state-compliance", "charitable-registration"]),
    ).toBeUndefined();
  });

  it("returns undefined for an empty tag array", () => {
    expect(resolveTopicAwareLeadMagnetSlug([])).toBeUndefined();
  });
});

describe("resolveLeadMagnetSlug — topic-aware fallback via tags", () => {
  it("uses topic-matched slug from tags when no explicit slug or related-page match", () => {
    const slug = resolveLeadMagnetSlug(siteConfig, {
      family: "guide",
      relatedPages: ["/resources/guides/some-guide"],
      tags: ["guide", "donor retention", "annual-fund"],
    });

    expect(slug).toBe("donor-retention-playbook");
  });

  it("tags-based match loses to an explicit slug", () => {
    const slug = resolveLeadMagnetSlug(siteConfig, {
      family: "guide",
      explicitSlug: "grant-compliance-checklist",
      relatedPages: [],
      tags: ["donor retention"],
    });

    expect(slug).toBe("grant-compliance-checklist");
  });

  it("tags-based match loses to a /free/ related page", () => {
    const slug = resolveLeadMagnetSlug(siteConfig, {
      family: "guide",
      relatedPages: ["/free/grant-budget-template"],
      tags: ["donor retention"],
    });

    expect(slug).toBe("grant-budget-template");
  });

  it("falls back to family default when tags produce no match", () => {
    const slug = resolveLeadMagnetSlug(siteConfig, {
      family: "guide",
      relatedPages: [],
      tags: ["guide", "state-compliance"],
    });

    expect(slug).toBe("grant-compliance-checklist");
  });
});

describe("resolveExitLeadMagnetOffer", () => {
  const entries = [
    {
      id: "grant-compliance-checklist.md",
      data: {
        title: "Grant Compliance Checklist",
        description: "A practical compliance worksheet.",
      },
    } as never,
    {
      id: "audit-prep-week-by-week-checklist.md",
      data: {
        title: "4-Week Audit Preparation Checklist",
        description: "An audit prep plan.",
      },
    } as never,
    {
      id: "nonprofit-crm-evaluation-scorecard.md",
      data: {
        title: "CRM Evaluation Scorecard",
        description: "A CRM decision worksheet.",
      },
    } as never,
  ];

  it("exitSlug present — overrides leadMagnetSlug and uses exitSlug for the offer", () => {
    const offer = resolveExitLeadMagnetOffer(siteConfig, entries, {
      family: "guide",
      exitSlug: "audit-prep-week-by-week-checklist",
      leadMagnetSlug: "grant-compliance-checklist",
    });

    expect(offer.slug).toBe("audit-prep-week-by-week-checklist");
  });

  it("exitSlug absent, leadMagnetSlug present — uses leadMagnetSlug for the offer", () => {
    const offer = resolveExitLeadMagnetOffer(siteConfig, entries, {
      family: "guide",
      leadMagnetSlug: "grant-compliance-checklist",
    });

    expect(offer.slug).toBe("grant-compliance-checklist");
  });

  it("both absent — falls back to config.leadMagnets.fallbackByFamily[family]", () => {
    const offer = resolveExitLeadMagnetOffer(siteConfig, entries, {
      family: "comparison",
    });

    expect(offer.slug).toBe(siteConfig.leadMagnets.fallbackByFamily["comparison"]);
  });

  it("synthesizes headline, ctaText, and description from the resolved slug's entry", () => {
    const offer = resolveExitLeadMagnetOffer(siteConfig, entries, {
      family: "guide",
      exitSlug: "grant-compliance-checklist",
    });

    expect(offer.headline).toBe("Get the Grant Compliance Checklist");
    expect(offer.ctaText).toBe("Email Me the Grant Compliance Checklist");
    expect(offer.description).toBe("A practical compliance worksheet. Delivered by email.");
  });
});

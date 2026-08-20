import { describe, expect, it } from "vitest";

import type { ContentItem } from "@grantpipe/ui/site/types";
import {
  buildBenchmarkPathSections,
  buildFaqPathSections,
  buildFeaturePathSections,
  buildIntegrationPathSections,
  buildPathwaySections,
} from "./hub-path-sections";

function item(overrides: Partial<ContentItem> & Pick<ContentItem, "title" | "href">): ContentItem {
  return {
    title: overrides.title,
    description: overrides.description ?? overrides.title,
    href: overrides.href,
    buyerStage: overrides.buyerStage ?? "mofu",
    publishedAt: overrides.publishedAt ?? "2026-01-01",
    updatedAt: overrides.updatedAt ?? "2026-01-01",
    relatedPages: overrides.relatedPages ?? [],
    metadata: overrides.metadata,
    featured: overrides.featured,
    canonical: overrides.canonical,
    noindex: overrides.noindex,
    targetPersona: overrides.targetPersona,
  };
}

describe("hub path sections", () => {
  it("keeps matched items in their configured path section", () => {
    const sections = buildPathwaySections(
      [
        item({ title: "Grant deadline alerts", href: "/features/grant-deadlines" }),
        item({ title: "Donor retention report", href: "/features/donor-retention" }),
      ],
      [
        {
          id: "grant-work",
          title: "Grant work",
          description: "Grant pages.",
          ctaLabel: "See grant work",
          ctaHref: "/features/#grant-work",
          matches: (candidate) => candidate.title.includes("Grant"),
        },
        {
          id: "donor-work",
          title: "Donor work",
          description: "Donor pages.",
          ctaLabel: "See donor work",
          ctaHref: "/features/#donor-work",
          matches: (candidate) => candidate.title.includes("Donor"),
        },
      ],
    );

    expect(sections).toEqual([
      expect.objectContaining({
        id: "grant-work",
        items: [expect.objectContaining({ href: "/features/grant-deadlines" })],
      }),
      expect.objectContaining({
        id: "donor-work",
        items: [expect.objectContaining({ href: "/features/donor-retention" })],
      }),
    ]);
  });

  it("adds unmatched items to the last configured path section", () => {
    const sections = buildPathwaySections(
      [
        item({ title: "Board packet composer", href: "/features/board-packet" }),
        item({ title: "Unknown page", href: "/features/unknown" }),
      ],
      [
        {
          id: "board-work",
          title: "Board work",
          description: "Board pages.",
          ctaLabel: "See board work",
          ctaHref: "/features/#board-work",
          matches: (candidate) => candidate.title.includes("Board"),
        },
      ],
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.items.map((sectionItem) => sectionItem.href)).toEqual([
      "/features/board-packet",
      "/features/unknown",
    ]);
  });

  it("assigns items to the first matching section only", () => {
    const sections = buildPathwaySections(
      [item({ title: "Grant audit report", href: "/features/grant-audit-report" })],
      [
        {
          id: "grant-work",
          title: "Grant work",
          description: "Grant pages.",
          ctaLabel: "See grant work",
          ctaHref: "/features/#grant-work",
          matches: (candidate) => candidate.title.includes("Grant"),
        },
        {
          id: "audit-work",
          title: "Audit work",
          description: "Audit pages.",
          ctaLabel: "See audit work",
          ctaHref: "/features/#audit-work",
          matches: (candidate) => candidate.title.includes("audit"),
        },
      ],
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe("grant-work");
    expect(sections[0]?.items).toHaveLength(1);
  });

  it("drops empty sections when no item matches them", () => {
    const sections = buildPathwaySections(
      [item({ title: "Donor segmentation", href: "/features/donor-segmentation" })],
      [
        {
          id: "grant-work",
          title: "Grant work",
          description: "Grant pages.",
          ctaLabel: "See grant work",
          ctaHref: "/features/#grant-work",
          matches: (candidate) => candidate.title.includes("Grant"),
        },
        {
          id: "donor-work",
          title: "Donor work",
          description: "Donor pages.",
          ctaLabel: "See donor work",
          ctaHref: "/features/#donor-work",
          matches: (candidate) => candidate.title.includes("Donor"),
        },
      ],
    );

    expect(sections.map((section) => section.id)).toEqual(["donor-work"]);
  });

  it("returns no sections when no definitions exist", () => {
    expect(
      buildPathwaySections([item({ title: "Grant page", href: "/features/grant-page" })], []),
    ).toEqual([]);
  });

  it("returns no sections when no items exist", () => {
    expect(
      buildPathwaySections(
        [],
        [
          {
            id: "grant-work",
            title: "Grant work",
            description: "Grant pages.",
            ctaLabel: "See grant work",
            ctaHref: "/features/#grant-work",
            matches: (candidate) => candidate.title.includes("Grant"),
          },
        ],
      ),
    ).toEqual([]);
  });

  it("groups feature and integration pages by user path", () => {
    const featureSections = buildFeaturePathSections([
      item({ title: "Grant pipeline management", href: "/features/grant-pipeline" }),
      item({ title: "Donor segmentation", href: "/features/donor-segmentation" }),
      item({ title: "Audit trail", href: "/features/audit-trail" }),
    ]);
    const integrationSections = buildIntegrationPathSections([
      item({ title: "GrantPipe + Donorbox Integration", href: "/integrations/donorbox" }),
      item({ title: "GrantPipe + Mailchimp Integration", href: "/integrations/mailchimp" }),
      item({ title: "GrantPipe + Zapier Integration", href: "/integrations/zapier" }),
    ]);

    expect(featureSections.map((section) => section.id)).toEqual([
      "run-grants",
      "donor-work",
      "review-work",
    ]);
    expect(integrationSections.map((section) => section.id)).toEqual([
      "gift-tools",
      "email-tools",
      "automation-links",
    ]);
  });

  it("does not treat the GrantPipe brand name as a grant feature match", () => {
    const sections = buildFeaturePathSections([
      item({
        title: "Configurable dashboard role home",
        description: "GrantPipe shows each team a focused home page.",
        href: "/features/configurable-dashboard-role-home",
      }),
      item({
        title: "Grant pipeline management",
        description: "Track grant stages.",
        href: "/features/grant-pipeline-management",
      }),
    ]);

    expect(sections.find((section) => section.id === "run-grants")?.items).toEqual([
      expect.objectContaining({ href: "/features/grant-pipeline-management" }),
    ]);
    expect(sections.find((section) => section.id === "review-work")?.items).toEqual([
      expect.objectContaining({ href: "/features/configurable-dashboard-role-home" }),
    ]);
  });

  it("keeps email and automation integrations out of the gift group", () => {
    const sections = buildIntegrationPathSections([
      item({
        title: "GrantPipe + Donorbox Integration",
        description: "Flow donations into GrantPipe.",
        href: "/integrations/donorbox",
      }),
      item({
        title: "GrantPipe + Mailchimp Integration",
        description: "Sync donor email lists and donation segments.",
        href: "/integrations/mailchimp",
      }),
      item({
        title: "GrantPipe + Zapier Integration",
        description: "Move donation records with automation.",
        href: "/integrations/zapier",
      }),
    ]);

    expect(sections.find((section) => section.id === "gift-tools")?.items).toEqual([
      expect.objectContaining({ href: "/integrations/donorbox" }),
    ]);
    expect(sections.find((section) => section.id === "email-tools")?.items).toEqual([
      expect.objectContaining({ href: "/integrations/mailchimp" }),
    ]);
    expect(sections.find((section) => section.id === "automation-links")?.items).toEqual([
      expect.objectContaining({ href: "/integrations/zapier" }),
    ]);
  });

  it("groups FAQ and benchmark pages by user path", () => {
    const faqSections = buildFaqPathSections([
      item({ title: "California nonprofit FAQ", href: "/resources/faq/california" }),
      item({ title: "Grant compliance FAQ", href: "/resources/faq/grant-compliance" }),
      item({ title: "Donor management FAQ", href: "/resources/faq/donor-management" }),
    ]);
    const benchmarkSections = buildBenchmarkPathSections([
      item({ title: "Nonprofit audit benchmarks", href: "/resources/benchmarks/audit" }),
      item({ title: "Nonprofit CRM adoption benchmarks", href: "/resources/benchmarks/crm" }),
      item({ title: "Memphis sector benchmarks", href: "/resources/benchmarks/memphis" }),
    ]);

    expect(faqSections.map((section) => section.id)).toEqual([
      "state-rules",
      "grant-questions",
      "donor-work",
    ]);
    expect(benchmarkSections.map((section) => section.id)).toEqual([
      "audit-risk",
      "donor-health",
      "local-context",
    ]);
  });
});

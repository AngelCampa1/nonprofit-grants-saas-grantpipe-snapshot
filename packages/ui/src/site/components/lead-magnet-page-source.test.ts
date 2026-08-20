import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "./lead-magnet-page.astro"), "utf8");

describe("lead magnet page source", () => {
  it("keeps magnet-specific delivery state while still honoring the legacy generic signup flag", () => {
    expect(source).toContain("buildLeadMagnetDeliveryKey(entry.slug)");
    expect(source).toContain("SIGNED_UP_KEY");
    expect(source).toContain('localStorage.getItem(signedUpKey) === "true"');
  });

  it("renders shared article metadata trust signals for indexed lead magnets", () => {
    expect(source).toContain('import ArticleMeta from "./article-meta.astro"');
    expect(source).toContain("<ArticleMeta");
    expect(source).toContain("lastReviewedAt={data.lastReviewedAt}");
    expect(source).toContain("verifiedAt={data.verifiedAt}");
    expect(source).toContain("sourceUrls={data.sourceUrls}");
  });

  it("surfaces lead magnet FAQs and related page links declared in frontmatter", () => {
    expect(source).toContain('import FaqSection from "./faq-section.astro"');
    expect(source).toContain('import RelatedPages from "./related-pages.astro"');
    expect(source).toContain("deriveTitleFromHref");
    expect(source).toContain("faqs?: { q: string; a: string }[]");
    expect(source).toContain("relatedPages?:");
    expect(source).toContain("const relatedPageLinks");
    expect(source).toContain("<FaqSection");
    expect(source).toContain("faqs={faqs ?? []}");
    expect(source).toContain("<RelatedPages");
    expect(source).toContain("pages={relatedPageLinks}");
  });
});

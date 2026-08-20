/**
 * Site visual-coherence regressions (fresh-eyes sweep, s16).
 *
 * Two rendering defects found while re-auditing apps/site at 390px:
 *
 *  - Promo banner: the offer message used the bare `truncate` utility, which
 *    applies `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`
 *    at every breakpoint. Below `sm` the whole active offer collapsed to
 *    "Lim...", hiding the July 3 promo on phones. The message must wrap on
 *    mobile instead of truncating.
 *
 *  - Article meta "Sources:" strip: source links are labeled by hostname only.
 *    Content that cites several deep links on one domain (e.g. three
 *    developer.intuit.com docs pages) rendered the same visible label three
 *    times in a row. The strip must de-duplicate by display label so each
 *    source domain shows once.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname);
const PACKAGES_UI_COMPONENTS = resolve(ROOT, "../../../packages/ui/src/site/components");

function readUiComponent(path: string): string {
  return readFileSync(`${PACKAGES_UI_COMPONENTS}/${path}`, "utf8");
}

describe("promo-banner offer message stays readable on mobile", () => {
  const source = readUiComponent("promo-banner.astro");

  it("renders the message span", () => {
    expect(source).toContain(">{message}</span>");
  });

  it("does not clip the offer message with a bare `truncate` on mobile", () => {
    // A `truncate` utility with no responsive prefix on the message span would
    // hide the offer below the `sm` breakpoint.
    expect(source).not.toMatch(/class="[^"]*\btruncate\b[^"]*">\{message\}<\/span>/u);
  });

  it("gives the message its own full-width line on mobile so it wraps as a sentence", () => {
    // In a nowrap flex row the message competes with the eyebrow + countdown
    // chips and collapses to a few px, wrapping one word per line. `basis-full`
    // on mobile puts the message on its own row; `sm:basis-auto` restores the
    // inline single-line layout on desktop.
    expect(source).toMatch(/class="[^"]*basis-full[^"]*sm:basis-auto[^"]*">\{message\}<\/span>/u);
  });

  it("lets the banner content wrap on mobile and stay single-row on desktop", () => {
    expect(source).toContain("flex-wrap");
    expect(source).toContain("sm:flex-nowrap");
  });
});

describe("article-meta Sources strip de-duplicates by display label", () => {
  const source = readUiComponent("article-meta.astro");

  it("does not map the raw sourceUrls array straight into links", () => {
    expect(source).not.toContain("sourceUrls.map((sourceUrl)");
  });

  it("builds a de-duplicated source list before rendering", () => {
    expect(source).toMatch(/uniqueSourceUrls/u);
  });

  it("renders links from the de-duplicated list", () => {
    expect(source).toMatch(/uniqueSourceUrls\.map\(/u);
  });
});

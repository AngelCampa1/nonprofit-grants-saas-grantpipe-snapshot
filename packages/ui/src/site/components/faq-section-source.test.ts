import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("faq section source regressions", () => {
  it("keeps FAQ items collapsed by default unless a page opts in", () => {
    const source = readSource("./faq-section.astro");

    expect(source).toContain("defaultOpenCount = 0");
    expect(source).toContain("open={index < defaultOpenCount || undefined}");
    expect(source).not.toContain("defaultOpenCount = 3");
  });

  it("allows multiple items to be open simultaneously (no exclusive group)", () => {
    const source = readSource("./faq-section.astro");

    // <details name="..."> would make the group exclusive (only one open).
    // We explicitly do NOT want that — comparing answers is a primary use
    // case for marketing FAQs.
    expect(source).not.toMatch(/<details[^>]*\sname=/);
  });

  it("wires aria-expanded and aria-controls onto each summary trigger", () => {
    const source = readSource("./faq-section.astro");

    expect(source).toContain("aria-expanded={isInitiallyOpen");
    expect(source).toContain("aria-controls={panelId}");
  });

  it("includes a script that mirrors the native open state onto aria-expanded", () => {
    const source = readSource("./faq-section.astro");

    expect(source).toContain('details.addEventListener("toggle"');
    expect(source).toContain('setAttribute("aria-expanded"');
  });

  it("uses the gp-mkt-btn primary CTA pattern for the bottom CTA", () => {
    const source = readSource("./faq-section.astro");

    expect(source).toContain("gp-mkt-btn primary");
  });

  it("replaces ad-hoc color-mix borders with token-based neutral borders", () => {
    const source = readSource("./faq-section.astro");

    expect(source).not.toContain("color-mix(in_srgb,var(--color-neutral-200)_82");
    expect(source).not.toContain("rounded-[calc(var(--radius-xl)+2px)]");
  });
});

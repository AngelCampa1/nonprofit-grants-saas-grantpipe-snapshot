import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("site footer source regressions", () => {
  it("uses mobile-safe hit areas for footer navigation links", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain("inline-flex min-h-12");
    expect(source).toContain("items-center");
  });

  it("keeps the flatter editorial footer sections instead of card-wrapped link groups", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain("border-t border-[var(--gp-ink-200)]");
    expect(source).not.toContain("rounded-[1.75rem]");
  });

  it("removes shimmer and mono-uppercase footer navigation language", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain("btn-primary inline-flex");
    expect(source).not.toContain("btn-shimmer");
    expect(source).not.toContain("font-mono text-[length:var(--text-caption)] uppercase");
  });

  it("does not layer an extra top glow inside the footer shell", () => {
    const source = readSource("./site-footer.astro");

    expect(source).not.toContain("radial-gradient(circle_at_top");
    expect(source).not.toContain("pointer-events-none absolute inset-x-0 top-0 h-24");
  });

  it("fails fast when CTA mode is missing the required link fields", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain('emailCapture?.mode === "cta"');
    expect(source).toContain("requires both ctaText and ctaTarget");
  });

  it("reserves bottom clearance so the floating assistant FAB never occludes the legal links", () => {
    const source = readSource("./site-footer.astro");

    // A fixed bottom-right "Ask GrantPipe" assistant FAB lands over the footer's
    // bottom-right corner at max scroll — exactly where the legal links (Privacy,
    // Terms of Service) sit. Split the symmetric vertical padding into an explicit
    // top + a larger bottom so the legal bar clears the FAB on every breakpoint.
    expect(source).toContain("pt-[var(--section-py-sm)]");
    expect(source).toContain("pb-[calc(var(--section-py-sm)_+_5rem)]");
    expect(source).not.toContain("py-[var(--section-py-sm)]");
  });

  it("can mirror the shared header logo lockup when brand logo assets are available", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain("logoLight?: string");
    expect(source).not.toContain(["logo", "Dark"].join(""));
    expect(source).not.toContain("theme-light-only");
    expect(source).not.toContain("theme-dark-only");
  });
});

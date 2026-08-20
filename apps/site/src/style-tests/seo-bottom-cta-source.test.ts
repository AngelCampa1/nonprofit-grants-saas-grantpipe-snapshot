// Wave 1 elevation: the shared end-of-article CTA (`.gp-seo-bottom-cta`) is
// split from `.gp-seo-sidebar-note` so article pages get an emerald closing
// panel matching the comparison-page evaluation CTA, instead of a weak
// bordered light box shared between both.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const GLOBAL_CSS = join(__dirname, "..", "styles", "global.css");

function readCss(): string {
  return readFileSync(GLOBAL_CSS, "utf8");
}

describe("end-of-article CTA source regressions", () => {
  it("keeps .gp-seo-sidebar-note on its own light bordered-box rule", () => {
    const css = readCss();

    expect(css).toMatch(/\.gp-seo-sidebar-note\s*{[^}]*border:\s*1px solid var\(--gp-ink-100\);/s);
  });

  it("gives the base .gp-seo-bottom-cta an emerald closing-panel treatment", () => {
    const css = readCss();

    expect(css).toMatch(
      /\.gp-seo-bottom-cta\s*{[^}]*background:\s*var\(--gp-emerald-900\);[^}]*border:\s*0;[^}]*border-radius:\s*var\(--radius-lg\);/s,
    );
    // The base rule must not still be grouped with the sidebar note under one
    // shared light-box selector list.
    expect(css).not.toMatch(/\.gp-seo-bottom-cta,\s*\n\s*\.gp-seo-sidebar-note\s*{/);
  });

  it("renders the kicker gold, heading white, and body text light on the emerald base panel", () => {
    const css = readCss();

    expect(css).toMatch(
      /\.gp-seo-bottom-cta \.gp-kicker--accent\s*{[^}]*color:\s*var\(--gp-gold-100/s,
    );
    expect(css).toMatch(/\.gp-seo-bottom-cta h2\s*{[^}]*color:\s*(#fff|white);/s);
    expect(css).toMatch(
      /\.gp-seo-bottom-cta p\s*{[^}]*color:\s*color-mix\(in srgb, #ffffff 78%, var\(--gp-emerald-100\)\);/s,
    );
  });

  it("keeps the .gp-mkt-btn gold treatment and adds a legible ghost outline on the emerald panel", () => {
    const css = readCss();

    expect(css).toMatch(
      /\.gp-seo-bottom-cta \.gp-mkt-btn\s*{[^}]*background:\s*var\(--gp-gold-600\);/s,
    );
    expect(css).toMatch(
      /\.gp-seo-bottom-cta \.gp-mkt-btn\.ghost\s*{[^}]*border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.24\);[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.08\);[^}]*color:\s*#fff;/s,
    );
  });

  it("gives the shared .btn-primary inside the CTA panel a gold-on-emerald treatment", () => {
    const css = readCss();

    expect(css).toMatch(
      /\.gp-seo-bottom-cta \.btn-primary\s*{[^}]*background:\s*var\(--gp-gold-600\);[^}]*color:\s*var\(--gp-emerald-900\);/s,
    );
  });

  it("does not break the compare-evaluation flex-row override layered on the new base", () => {
    const css = readCss();

    expect(css).toMatch(/\.gp-compare-evaluation-cta\.gp-seo-bottom-cta\s*{[^}]*display:\s*flex;/s);
  });
});

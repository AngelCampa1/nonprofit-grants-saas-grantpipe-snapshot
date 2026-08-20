import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const uiGlobalsPath = resolve(
  __dirname,
  "../../../packages/ui/src/site/styles/globals.css",
);
const siteGlobalPath = resolve(__dirname, "./styles/global.css");

const uiGlobals = readFileSync(uiGlobalsPath, "utf8");
const siteGlobal = readFileSync(siteGlobalPath, "utf8");
const combined = `${uiGlobals}\n${siteGlobal}`;

/**
 * Parses `color-mix(in srgb, X <pct>%, Y)` and returns the first percentage
 * literal found for a given CSS custom property definition. Used to prove the
 * muted-section tint mixes in a perceptibly larger share of the accent color
 * than the pre-fix ~30% (D6 regression guard).
 */
function firstMixPercentage(source: string, varName: string): number {
  const declRegex = new RegExp(`${varName}:[^;]*color-mix\\([^;]*\\);`, "s");
  const match = source.match(declRegex);
  if (!match) {
    throw new Error(`Could not find color-mix declaration for ${varName}`);
  }
  const pctMatch = match[0].match(/(\d+(?:\.\d+)?)%/);
  if (!pctMatch) {
    throw new Error(`Could not find a percentage inside ${varName} color-mix`);
  }
  return Number(pctMatch[1]);
}

describe("design-system primitives (D6/D7/D8 fixes)", () => {
  it("defines accent primitive classes for emphasis (D7)", () => {
    expect(combined).toMatch(/\.gp-kicker--accent\s*\{/);
    expect(combined).toMatch(/\.gp-icon-chip\s*\{/);
    expect(combined).toMatch(/\.gp-stat-callout\s*\{/);
    expect(combined).toMatch(/\.gp-hairline--accent\s*\{/);
    expect(combined).toMatch(/\.gp-list--accent\s*\{/);
  });

  it("points the accent primitives at the emerald/ochre ramps, not raw hex", () => {
    const kickerMatch = combined.match(/\.gp-kicker--accent\s*\{[^}]*\}/s);
    expect(kickerMatch).not.toBeNull();
    expect(kickerMatch?.[0]).toMatch(/--color-accent-\d{2,3}/);

    const chipMatch = combined.match(/\.gp-icon-chip\s*\{[^}]*\}/s);
    expect(chipMatch).not.toBeNull();
    expect(chipMatch?.[0]).toMatch(/--color-accent-\d{2,3}|--color-primary-\d{2,3}/);
  });

  it("unifies the .gp-card radius onto the canonical --radius-lg token (D8)", () => {
    // Accepts either a direct var(--radius-lg) reference or the
    // var(--card-radius, var(--radius-lg)) alias — both resolve to the same
    // canonical 20px radius value.
    const radiusPattern = /border-radius:\s*var\((?:--radius-lg|--card-radius,\s*var\(--radius-lg\)\))\)?/;

    const cardMatch = combined.match(/(?<!-)\.gp-card\s*\{[^}]*\}/s);
    expect(cardMatch).not.toBeNull();
    expect(cardMatch?.[0]).toMatch(radiusPattern);

    const cardBaseMatch = combined.match(/\.gp-card-base\s*\{[^}]*\}/s);
    expect(cardBaseMatch).not.toBeNull();
    expect(cardBaseMatch?.[0]).toMatch(radiusPattern);
  });

  it("has no remaining hard-coded 14px/18px/20px literal card radii in the site stylesheet", () => {
    const hardCodedRadius = siteGlobal.match(/border-radius:\s*(?:14|18|20)px/g);
    expect(hardCodedRadius).toBeNull();
  });

  it("gives .gp-card a subtle transform/opacity-only hover lift bound to --shadow-card", () => {
    const cardMatch = combined.match(/(?<!-)\.gp-card\s*\{[^}]*\}/s);
    expect(cardMatch?.[0]).toMatch(/box-shadow:\s*var\(--shadow-card\)/);

    const hoverMatch = combined.match(/\.gp-card:hover\s*\{[^}]*\}/s);
    expect(hoverMatch).not.toBeNull();
    expect(hoverMatch?.[0]).toMatch(/transform:\s*translateY\(/);
    expect(hoverMatch?.[0]).not.toMatch(/width|height|margin|padding|top:|left:|right:|bottom:/);
  });

  it("deepens the muted/alternating section tint to a perceptible delta (D6)", () => {
    const pct = firstMixPercentage(uiGlobals, "--section-highlight-bg");
    // Pre-fix value mixed in ~30% accent-50, which measured as an
    // imperceptible ~0.982 vs 1.0 srgb delta. Require a materially larger
    // mix share so the tint reads as an intentional section band.
    expect(pct).toBeGreaterThanOrEqual(55);
  });

  it("adds a global reduced-motion backstop for entrance/ambient animation utilities (2.5)", () => {
    const reducedMotionBlocks = siteGlobal.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{/g,
    );
    expect(reducedMotionBlocks).not.toBeNull();
    expect((reducedMotionBlocks ?? []).length).toBeGreaterThanOrEqual(1);

    const backstopMatch = siteGlobal.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.scroll-in[\s\S]*?\}\s*\}/,
    );
    expect(backstopMatch).not.toBeNull();
    expect(backstopMatch?.[0]).toMatch(/\[data-animate\]/);
    expect(backstopMatch?.[0]).toMatch(/animate-/);
  });
});

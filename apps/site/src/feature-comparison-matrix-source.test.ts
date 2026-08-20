import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Source contract for the pricing/feature comparison matrix mobile scroll
 * affordance (sweep finding M7).
 *
 * The matrix is horizontally scrollable on narrow viewports (the table is wider
 * than a phone). Without a discoverability cue, readers — especially the older,
 * less app-fluent persona — never learn that extra plan columns sit off-screen.
 *
 * These checks lock in the two cues so a future refactor can't silently drop
 * them: a mobile-only swipe hint, and a JS-driven right-edge fade that only
 * shows while more columns remain to the right.
 */
const COMPONENT = resolve(import.meta.dirname, "components/feature-comparison-matrix.astro");
const GLOBAL_CSS = resolve(import.meta.dirname, "styles/global.css");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("feature comparison matrix — mobile scroll affordance (M7)", () => {
  it("renders a swipe hint and tags the scroller for the enhancement script", () => {
    const source = read(COMPONENT);
    expect(source).toContain("data-matrix-swipe-hint");
    expect(source).toContain("data-matrix-scroll");
    expect(source).toMatch(/Swipe to see all plans/i);
  });

  it("wires a progressive-enhancement script that toggles overflow/edge state", () => {
    const source = read(COMPONENT);
    expect(source).toContain("data-matrix-overflowing");
    expect(source).toContain("data-matrix-at-end");
    // Must degrade gracefully — the hint stays visible if the script never runs.
    expect(source).toContain("addEventListener");
  });

  it("defines the hint + right-edge fade styles, mobile-gated", () => {
    const css = read(GLOBAL_CSS);
    expect(css).toContain(".gp-matrix-swipe-hint");
    expect(css).toContain(".gp-matrix-wrap::after");
    // The fade only shows while there is more to scroll and not at the end.
    expect(css).toContain(
      ".gp-matrix-wrap[data-matrix-overflowing]:not([data-matrix-at-end])::after",
    );
    // Hint is hidden by default and only revealed under the mobile breakpoint.
    expect(css).toMatch(/\.gp-matrix-swipe-hint\s*\{\s*display:\s*none;/);
  });
});

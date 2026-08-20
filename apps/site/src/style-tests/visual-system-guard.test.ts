// Active guard: enforces the visual-system unification (see docs/superpowers/plans/2026-07-03-marketing-site-visual-unification.md).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SITE_SRC = join(__dirname, "..");
const GLOBAL_CSS = join(SITE_SRC, "styles/global.css");

function walk(dir: string, exts: string[], acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === "dist") continue;
    if (statSync(p).isDirectory()) walk(p, exts, acc);
    else if (exts.some((e) => name.endsWith(e))) acc.push(p);
  }
  return acc;
}

describe("visual system unification guard", () => {
  const files = walk(SITE_SRC, [".astro", ".tsx", ".ts", ".css"]).filter(
    (f) => !f.endsWith(".test.ts"),
  );

  it("has no era-word class names (`-redesign`)", () => {
    const offenders = files.filter((f) => /-redesign(?![-\w])/.test(readFileSync(f, "utf8")));
    expect(offenders, `files still using -redesign: ${offenders.join(", ")}`).toEqual([]);
  });

  it("does not reference the retired .gp-page-shell container", () => {
    const offenders = files.filter((f) => /gp-page-shell/.test(readFileSync(f, "utf8")));
    expect(offenders, `files still using .gp-page-shell: ${offenders.join(", ")}`).toEqual([]);
  });

  it("does not reference retired old-family card classes", () => {
    const retired =
      /gp-(?:proof-card|directory-card|link-card|band-card|editorial-card|resource-card)(?![-\w])/;
    const offenders = files.filter((f) => retired.test(readFileSync(f, "utf8")));
    expect(offenders, `files still using retired card classes: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });

  it("defines the spacing scale and container tokens", () => {
    const css = readFileSync(GLOBAL_CSS, "utf8");
    expect(css).toMatch(/--gp-space-4:/);
    expect(css).toMatch(/--gp-container-max:/);
  });

  it("defines the Wave 0 signature section-archetype and surface primitives", () => {
    const css = readFileSync(GLOBAL_CSS, "utf8");
    const required = [
      ".gp-feature-split",
      ".gp-step-band",
      ".gp-step",
      ".gp-proof-band",
      ".gp-proof-stat",
      ".gp-surface",
      ".gp-surface-row",
      ".gp-surface-meter",
      ".gp-surface-cal",
      ".gp-section--emerald",
    ];
    for (const selector of required) {
      expect(css, `missing selector: ${selector}`).toContain(selector);
    }
  });

  it("never uses the dark-inked .editorial-kicker inside a dark closing panel", () => {
    // .gp-seo-bottom-cta and .gp-section--emerald are dark (emerald-900) panels.
    // .editorial-kicker is dark-emerald text and disappears on them; the correct
    // kicker there is .gp-kicker--accent (gold). This guards the exact regression
    // where a page kept .editorial-kicker inside the now-dark end-of-page CTA.
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      const hasDarkPanel = /gp-seo-bottom-cta|gp-section--emerald/.test(src);
      return hasDarkPanel && /editorial-kicker/.test(src);
    });
    expect(
      offenders,
      `files use .editorial-kicker inside a dark panel (use .gp-kicker--accent): ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("still defines the widened type-scale tokens in the UI package theme", () => {
    const UI_GLOBALS_CSS = join(SITE_SRC, "../../../packages/ui/src/site/styles/globals.css");
    const css = readFileSync(UI_GLOBALS_CSS, "utf8");
    expect(css).toMatch(/--text-hero:/);
    expect(css).toMatch(/--text-editorial-title:/);
    expect(css).toMatch(/--text-heading:/);
    expect(css).toMatch(/--text-subheading:/);
  });
});
